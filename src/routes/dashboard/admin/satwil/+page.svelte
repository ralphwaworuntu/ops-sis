<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { installThemedRasterBaseLayer } from '$lib/client/leaflet-themed-tiles';
	import Button from '$lib/components/ui/Button.svelte';

	let { data, form } = $props();

	// Local reactive copies to keep UI/Leaflet in sync without refresh.
	// Server `data` will still refresh on navigation, but we apply optimistic updates on action success.
	type UnitRow = {
		id: number;
		nama: string;
		tipe: 'POLDA' | 'POLRES' | 'POLSEK';
		parentId?: number | null;
		lat?: number | null;
		lng?: number | null;
	};
	let polresList = $state<UnitRow[]>([]);
	let polsekAllList = $state<UnitRow[]>([]);
	let polsekList = $state<UnitRow[]>([]);

	$effect(() => {
		// Sync from server when load data changes (e.g. after navigation).
		polresList = (data.polresList ?? []) as UnitRow[];
		polsekAllList = (data.polsekAllList ?? []) as UnitRow[];
		polsekList = (data.polsekList ?? []) as UnitRow[];
	});

	let tab = $state<'polres' | 'polsek' | 'personil'>('polres');
	let createPersonilOpen = $state(false);
	let createPersonil = $state({
		username: '',
		password: '',
		nama: '',
		nrp: '',
		pangkat: '',
		role: 'ADMIN POLRES' as
			| 'KABAG OPS'
			| 'ADMIN POLRES'
			| 'KAPOLRES'
			| 'WAKAPOLRES'
			| 'KATIM PATROLI'
			| 'ADMIN POLSEK'
			| 'KAPOLSEK'
			| 'WAKAPOLSEK'
			| 'KANIT SAMAPTA',
		unitId: '' as string | number
	});

	function openCreatePersonil() {
		createPersonil = {
			username: '',
			password: '',
			nama: '',
			nrp: '',
			pangkat: '',
			role: 'ADMIN POLRES',
			unitId: ''
		};
		createPersonilOpen = true;
	}

	function closeCreatePersonil() {
		createPersonilOpen = false;
	}

	type PersonilRow = {
		id: number;
		username: string;
		nama: string;
		nrp: string | null;
		pangkat: string;
		role:
			| 'KABAG OPS'
			| 'ADMIN POLRES'
			| 'KAPOLRES'
			| 'WAKAPOLRES'
			| 'KATIM PATROLI'
			| 'ADMIN POLSEK'
			| 'KAPOLSEK'
			| 'WAKAPOLSEK'
			| 'KANIT SAMAPTA';
		unitId: number | null;
		unitNama: string | null;
	};
	let editPersonilOpen = $state(false);
	let editPersonil = $state<PersonilRow | null>(null);

	function openEditPersonil(pe: PersonilRow) {
		editPersonil = { ...pe };
		editPersonilOpen = true;
	}

	function closeEditPersonil() {
		editPersonilOpen = false;
		editPersonil = null;
	}
	// Default view selaras dengan Live Wall: NTT
	let pickLat = $state(-9.6);
	let pickLng = $state(123.9);
	let mapContainer: HTMLDivElement | undefined = $state();
	let map = $state<import('leaflet').Map | null>(null);
	let Lmod = $state<typeof import('leaflet') | null>(null);
	let markersLayer = $state<import('leaflet').LayerGroup | null>(null);
	let pickLayer = $state<import('leaflet').LayerGroup | null>(null);
	let highlightLayer = $state<import('leaflet').LayerGroup | null>(null);
	let pickMarker: import('leaflet').Marker | null = $state(null);
	let didAutoFit = $state(false);
	let mapReady = $state(false);

	let editingUnitId = $state<number | null>(null);
	let editingUnitLabel = $state<string>('');
	let editingStartLat = $state<number | null>(null);
	let editingStartLng = $state<number | null>(null);
	let savingUnitId = $state<number | null>(null);
	const polresDetailsById = $state<Map<number, HTMLDetailsElement>>(new Map());

	function closePolresDetails(id: number) {
		polresDetailsById.get(id)?.removeAttribute('open');
	}

	function registerPolresDetails(node: HTMLDetailsElement, id: number) {
		polresDetailsById.set(id, node);
		return {
			destroy() {
				polresDetailsById.delete(id);
			}
		};
	}

	// Search lokasi pada peta (untuk mengisi koordinat tanpa klik manual)
	type GeoResult = {
		display_name: string;
		lat: string;
		lon: string;
		type?: string;
		class?: string;
		importance?: number;
	};
	let mapSearch = $state('');
	let mapSearchOpen = $state(false);
	let mapSearchActiveIndex = $state(0);
	let mapSearchSelected: GeoResult | null = $state(null);
	let searchInputEl: HTMLInputElement | null = $state(null);

	let geoResults = $state<GeoResult[]>([]);
	let geoLoading = $state(false);
	let geoError = $state<string | null>(null);
	let geoAbort: AbortController | null = $state(null);
	let geoDebounce: ReturnType<typeof setTimeout> | null = $state(null);

	function normalizeQuery(q: string): string {
		return q.toLowerCase().trim();
	}

	function scheduleGeoSearch(qRaw: string) {
		const q = normalizeQuery(qRaw);
		geoError = null;
		if (geoDebounce) clearTimeout(geoDebounce);
		if (geoAbort) geoAbort.abort();
		if (q.length < 3) {
			geoResults = [];
			geoLoading = false;
			return;
		}
		geoDebounce = setTimeout(async () => {
			geoLoading = true;
			const ac = new AbortController();
			geoAbort = ac;
			try {
				const url = new URL('https://nominatim.openstreetmap.org/search');
				url.searchParams.set('format', 'json');
				url.searchParams.set('q', q);
				url.searchParams.set('limit', '10');
				url.searchParams.set('countrycodes', 'id');
				url.searchParams.set('addressdetails', '0');
				const res = await fetch(url.toString(), {
					signal: ac.signal,
					headers: {
						// Nominatim meminta identitas aplikasi; ini best-effort dari browser.
						'Accept': 'application/json'
					}
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data = (await res.json()) as GeoResult[];
				geoResults = Array.isArray(data) ? data : [];
				mapSearchActiveIndex = 0;
			} catch (e) {
				if (ac.signal.aborted) return;
				geoResults = [];
				geoError = 'Gagal mencari lokasi. Coba lagi.';
			} finally {
				if (!ac.signal.aborted) geoLoading = false;
			}
		}, 450);
	}

	const polresMarkers = $state<Map<number, import('leaflet').Marker>>(new Map());
	const polsekMarkers = $state<Map<number, import('leaflet').Marker>>(new Map());
	let highlightTimeout: ReturnType<typeof setTimeout> | null = $state(null);

	function focusGeoOnMap(item: GeoResult) {
		mapSearchSelected = item;
		mapSearchOpen = false;
		mapSearchActiveIndex = 0;
		if (!map || !Lmod) return;

		const lat = parseFloat(item.lat);
		const lng = parseFloat(item.lon);
		if (Number.isNaN(lat) || Number.isNaN(lng)) return;
		pickLat = lat;
		pickLng = lng;
		const ll: [number, number] = [lat, lng];
		map.flyTo(ll, 12, { duration: 0.9 });

		if (highlightLayer) {
			highlightLayer.clearLayers();
			const ring = Lmod.circleMarker(ll, {
				radius: 16,
				color: '#facc15',
				weight: 3,
				fillColor: '#facc15',
				fillOpacity: 0.15
			});
			ring.addTo(highlightLayer);
			if (highlightTimeout) clearTimeout(highlightTimeout);
			highlightTimeout = setTimeout(() => {
				highlightLayer?.clearLayers();
			}, 2200);
		}

		// Jika sedang edit unit, pin draggable ikut berpindah.
		if (editingUnitId != null && pickMarker) {
			pickMarker.setLatLng(ll);
		}
	}

	function enhanceClosePolresOnSuccess(polresId: number) {
		return async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
			await update();
			if (result.type === 'success') {
				// Jika unit yang sedang diedit terhapus/berubah, tutup mode edit.
				if (editingUnitId === polresId) {
					editingUnitId = null;
					editingUnitLabel = '';
				}
				closePolresDetails(polresId);
			}
		};
	}

	function updateUnitCoordsInLists(unitId: number, lat: number, lng: number) {
		const upd = (arr: UnitRow[]) => {
			const idx = arr.findIndex((x) => x.id === unitId);
			if (idx === -1) return arr;
			const next = arr.slice();
			next[idx] = { ...next[idx], lat, lng };
			return next;
		};
		polresList = upd(polresList);
		polsekAllList = upd(polsekAllList);
		polsekList = upd(polsekList);
	}

	function selectPolres(id: string) {
		const u = new URL($page.url.href);
		if (id) u.searchParams.set('polres', id);
		else u.searchParams.delete('polres');
		void goto(`${u.pathname}${u.search}`, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function padMapToForm({ formData }: { formData: FormData }) {
		formData.set('lat', String(pickLat));
		formData.set('lng', String(pickLng));
	}

	function padMapToUnitMarkerForm({ formData }: { formData: FormData }) {
		if (editingUnitId != null) formData.set('unit_id', String(editingUnitId));
		formData.set('lat', String(pickLat));
		formData.set('lng', String(pickLng));
	}

	onMount(() => {
		let destroyed = false;
		let teardownThemedBase: (() => void) | undefined;
		void import('leaflet').then((L) => {
			if (destroyed || !mapContainer) return;
			Lmod = L;
			map = L.map(mapContainer).setView([pickLat, pickLng], 7);
			// Pane khusus untuk pin edit agar selalu terlihat (di atas marker lain).
			map.createPane('satwil-pin-pane');
			// z-index default marker pane ~600; kita naikkan sedikit.
			const paneEl = map.getPane('satwil-pin-pane');
			if (paneEl) paneEl.style.zIndex = '650';
			teardownThemedBase = installThemedRasterBaseLayer(L, map);
			markersLayer = L.layerGroup().addTo(map);
			pickLayer = L.layerGroup().addTo(map);
			highlightLayer = L.layerGroup().addTo(map);
			map.on('click', (e) => {
				pickLat = e.latlng.lat;
				pickLng = e.latlng.lng;
				// Jika sedang edit, klik peta akan memindahkan pin draggable juga.
				if (editingUnitId != null && pickMarker) {
					pickMarker.setLatLng(e.latlng);
				}
			});

			// Pastikan ukuran terhitung (jika container baru render).
			setTimeout(() => map?.invalidateSize(), 50);
			mapReady = true;
		});
		return () => {
			destroyed = true;
			teardownThemedBase?.();
			map?.remove();
			map = null;
			markersLayer = null;
			pickLayer = null;
			highlightLayer = null;
			Lmod = null;
			pickMarker = null;
			polresMarkers.clear();
			polsekMarkers.clear();
			if (highlightTimeout) clearTimeout(highlightTimeout);
			highlightTimeout = null;
			if (geoDebounce) clearTimeout(geoDebounce);
			geoDebounce = null;
			if (geoAbort) geoAbort.abort();
			geoAbort = null;
			didAutoFit = false;
			mapReady = false;
		};
	});

	function clearPickMarker() {
		pickLayer?.clearLayers();
		pickMarker = null;
	}

	function ensurePickMarker() {
		if (!mapReady || !map || !Lmod || !pickLayer) return;
		clearPickMarker();
		if (editingUnitId == null) return;

		const startLat = editingStartLat ?? pickLat;
		const startLng = editingStartLng ?? pickLng;
		const icon = Lmod.divIcon({
			className: 'satwil-pin',
			html: '<div class="satwil-pin__dot"></div>',
			iconSize: [18, 18],
			iconAnchor: [9, 9]
		});
		pickMarker = Lmod
			.marker([startLat, startLng], { icon, draggable: true, pane: 'satwil-pin-pane' })
			.bindPopup(`<strong>PIN</strong><br/>${editingUnitLabel || 'Lokasi unit'}`)
			.addTo(pickLayer);
		pickMarker.on('dragend', () => {
			const ll = pickMarker?.getLatLng();
			if (!ll) return;
			pickLat = ll.lat;
			pickLng = ll.lng;
		});
	}

	$effect(() => {
		if (!mapReady || !map || !Lmod || !markersLayer) return;
		markersLayer.clearLayers();
		polresMarkers.clear();
		polsekMarkers.clear();

		const polresIcon = Lmod.icon({
			iconUrl: '/markers/polres.png',
			iconSize: [46, 46],
			iconAnchor: [23, 45],
			popupAnchor: [0, -40]
		});
		const polsekIcon = Lmod.icon({
			iconUrl: '/markers/polsek.png',
			iconSize: [46, 46],
			iconAnchor: [23, 45],
			popupAnchor: [0, -40]
		});
		const poldaIcon = Lmod.icon({
			iconUrl: '/markers/polda.png',
			iconSize: [64, 64],
			iconAnchor: [32, 32],
			popupAnchor: [0, -30]
		});

		// POLDA NTT (Kompleks Polda / Lapangan Polda, Kupang) — marker tetap.
		const POLDA_NTT: [number, number] = [-10.1777143, 123.5976401];

		const boundsPts: [number, number][] = [];
		boundsPts.push(POLDA_NTT);
		Lmod
			.marker(POLDA_NTT, { icon: poldaIcon })
			.bindPopup('<strong>POLDA NTT</strong><br/>Kupang')
			.addTo(markersLayer);

		for (const p of polresList) {
			if (p.lat != null && p.lng != null) {
				boundsPts.push([p.lat, p.lng]);
				const m = Lmod
					.marker([p.lat, p.lng], { icon: polresIcon })
					.bindPopup(`<strong>POLRES</strong><br/>${p.nama}`)
					.addTo(markersLayer);
				polresMarkers.set(p.id, m);
			}
		}
		for (const s of polsekAllList) {
			if (s.lat != null && s.lng != null) {
				boundsPts.push([s.lat, s.lng]);
				const m = Lmod
					.marker([s.lat, s.lng], { icon: polsekIcon })
					.bindPopup(`<strong>POLSEK</strong><br/>${s.nama}`)
					.addTo(markersLayer);
				polsekMarkers.set(s.id, m);
			}
		}

		// Auto-jump sekali supaya marker terlihat. Jika tidak ada koordinat, tetap default NTT.
		if (!didAutoFit && boundsPts.length > 0) {
			didAutoFit = true;
			const b = Lmod.latLngBounds(boundsPts);
			map.flyToBounds(b, { padding: [40, 40], maxZoom: 10, duration: 0.9 });
		}
	});

</script>

<svelte:head>
	<title>Admin Satwil — OPS SIS</title>
	<link
		rel="stylesheet"
		href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
		integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
		crossorigin=""
	/>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-bold tracking-tight text-foreground md:text-2xl">Manajemen Satwil</h1>
		<p class="text-sm text-muted-foreground">
			Kelola POLRES, POLSEK, dan akun personil. Klik peta untuk menentukan koordinat markas saat menambah unit baru.
		</p>
	</div>

	{#if form?.error}
		<div class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
			{form.error}
		</div>
	{/if}
	{#if form?.success}
		<div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Perubahan disimpan.</div>
	{/if}

	<div class="flex flex-wrap gap-2 border-b border-border pb-2">
		{#each [{ k: 'polres' as const, l: 'POLRES' }, { k: 'polsek' as const, l: 'POLSEK' }, { k: 'personil' as const, l: 'Personil' }] as t}
			<button
				type="button"
				onclick={() => (tab = t.k)}
				class="min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition-colors {tab === t.k
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
			>
				{t.l}
			</button>
		{/each}
	</div>

	<div class="grid gap-6 {tab === 'personil' ? 'lg:grid-cols-1' : 'lg:grid-cols-2'}">
		<div class="min-w-0 space-y-4">
			{#if tab === 'polres'}
				<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
					<h2 class="mb-3 text-sm font-semibold">Tambah POLRES</h2>
					<form method="POST" action="?/createPolres" class="space-y-3" use:enhance={padMapToForm}>
						<div>
							<label class="text-sm font-medium text-muted-foreground" for="np-nama">Nama POLRES</label>
							<input
								id="np-nama"
								name="nama"
								required
								class="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
							/>
						</div>
						<p class="text-xs text-muted-foreground">
							Koordinat dari peta: <span class="font-mono text-foreground">{pickLat.toFixed(5)}, {pickLng.toFixed(5)}</span>
						</p>
						<Button type="submit" variant="primary" class="w-full sm:w-auto">
							Simpan POLRES
						</Button>
					</form>
				</div>

				<div class="rounded-xl border border-border bg-card shadow-sm">
					<div class="border-b border-border px-4 py-2 text-sm font-semibold">Daftar POLRES</div>
					<ul class="max-h-[50vh] divide-y divide-border overflow-y-auto lg:max-h-none">
						{#each polresList as p}
							<li class="p-4">
								<details
									class="group"
									use:registerPolresDetails={p.id}
								>
									<summary class="cursor-pointer text-sm font-medium text-foreground">
										{p.nama}
										<span class="ml-2 text-xs font-normal text-muted-foreground">
											{p.lat != null && p.lng != null ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : 'tanpa koordinat'}
										</span>
									</summary>
									<div class="mt-3 space-y-3">
										<div class="rounded-lg border border-border bg-muted/30 p-3 text-xs">
											<p class="font-medium text-foreground">Ubah lokasi via pin peta</p>
											<p class="mt-1 text-muted-foreground">
												Klik tombol di bawah, lalu <strong>klik peta</strong> untuk memindahkan pin. Setelah sesuai, simpan.
											</p>
											<div class="mt-2 flex flex-wrap gap-2">
												<button
													type="button"
													class="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
													onclick={() => {
														editingUnitId = p.id;
														editingUnitLabel = p.nama;
														pickLat = p.lat ?? -9.6;
														pickLng = p.lng ?? 123.9;
														editingStartLat = pickLat;
														editingStartLng = pickLng;
														map?.flyTo([pickLat, pickLng], 11, { duration: 0.8 });
														// Kurangi "respond lama" saat pin mulai muncul
														setTimeout(() => map?.invalidateSize(), 50);
														// Buat pin edit segera (hindari loop $effect)
														ensurePickMarker();
													}}
												>
													Ubah lokasi di peta
												</button>
												{#if editingUnitId === p.id}
													<form
														method="POST"
														action="?/setUnitMarker"
														use:enhance={(args) => {
															savingUnitId = p.id;
															padMapToUnitMarkerForm(args);
															return async ({ result, update }) => {
																await update();
																savingUnitId = null;
																if (result.type === 'success') {
																	// Update UI immediately without requiring full refresh.
																	updateUnitCoordsInLists(p.id, pickLat, pickLng);
																	polresMarkers.get(p.id)?.setLatLng([pickLat, pickLng]);
																	editingUnitId = null;
																	editingUnitLabel = '';
																	editingStartLat = null;
																	editingStartLng = null;
																	closePolresDetails(p.id);
																	clearPickMarker();
																}
															};
														}}
													>
														<Button type="submit" variant="danger" size="sm" disabled={savingUnitId === p.id}>
															Simpan lokasi (pin)
														</Button>
													</form>
													<button
														type="button"
														class="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
														disabled={savingUnitId === p.id}
														onclick={(e) => {
															e.preventDefault();
															e.stopPropagation();
															editingUnitId = null;
															editingUnitLabel = '';
															editingStartLat = null;
															editingStartLng = null;
															closePolresDetails(p.id);
															clearPickMarker();
														}}
													>
														Batal
													</button>
												{/if}
											</div>
											{#if editingUnitId === p.id}
												<p class="mt-2 font-mono text-xs text-foreground">
													Pin: {pickLat.toFixed(5)}, {pickLng.toFixed(5)}
												</p>
											{/if}
										</div>

										<form method="POST" action="?/updatePolres" class="space-y-2" use:enhance>
											<input type="hidden" name="id" value={p.id} />
											<input name="nama" value={p.nama} class="flex h-11 w-full rounded border border-input bg-background px-2 text-base" />
											<div class="flex gap-2">
												<input
													name="lat"
													type="number"
													step="any"
													placeholder="lat"
													value={p.lat ?? ''}
													class="h-11 w-full rounded border border-input bg-background px-2 text-base"
												/>
												<input
													name="lng"
													type="number"
													step="any"
													placeholder="lng"
													value={p.lng ?? ''}
													class="h-11 w-full rounded border border-input bg-background px-2 text-base"
												/>
											</div>
											<button type="submit" class="text-sm font-medium text-primary hover:underline">Simpan perubahan</button>
										</form>
										<form
											method="POST"
											action="?/deletePolres"
											use:enhance={() => {
												// Optimistic UI: close panel + remove from list immediately on success.
												return async ({ result, update }) => {
													await update();
													if (result.type === 'success') {
														polresList = polresList.filter((x) => x.id !== p.id);
														// POLSEK di bawahnya seharusnya sudah kosong (server menolak jika masih ada).
														polsekAllList = polsekAllList.filter((x) => x.parentId !== p.id);
														if (data.selectedPolresId === p.id) {
															selectPolres('');
														}
														if (editingUnitId === p.id) {
															editingUnitId = null;
															editingUnitLabel = '';
														}
														closePolresDetails(p.id);
													}
												};
											}}
											onsubmit={(e) => {
												if (!confirm(`Hapus ${p.nama}?`)) e.preventDefault();
											}}
										>
											<input type="hidden" name="id" value={p.id} />
											<button type="submit" class="text-sm text-destructive hover:underline">Hapus POLRES</button>
										</form>
									</div>
								</details>
							</li>
						{/each}
					</ul>
				</div>
			{:else if tab === 'polsek'}
				<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
					<label for="sel-polres" class="text-sm font-medium">POLRES</label>
					<select
						id="sel-polres"
						class="h-11 max-w-md rounded-lg border border-input bg-background px-3 text-base"
						value={data.selectedPolresId != null ? String(data.selectedPolresId) : ''}
						onchange={(e) => selectPolres((e.currentTarget as HTMLSelectElement).value)}
					>
						<option value="">Pilih POLRES…</option>
						{#each polresList as p}
							<option value={String(p.id)}>{p.nama}</option>
						{/each}
					</select>
				</div>

				{#if !data.selectedPolresId}
					<p class="text-sm text-muted-foreground">Pilih POLRES untuk mengelola POLSEK.</p>
				{:else}
					<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
						<h2 class="mb-3 text-sm font-semibold">Tambah POLSEK</h2>
						<form method="POST" action="?/createPolsek" class="space-y-3" use:enhance={padMapToForm}>
							<input type="hidden" name="polres_id" value={data.selectedPolresId} />
							<div>
								<label class="text-sm font-medium" for="ns-nama">Nama POLSEK</label>
								<input
									id="ns-nama"
									name="nama"
									required
									class="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
								/>
							</div>
							<p class="text-xs text-muted-foreground">Koordinat dari peta: {pickLat.toFixed(5)}, {pickLng.toFixed(5)}</p>
							<Button type="submit" variant="primary" class="w-full sm:w-auto">
								Simpan POLSEK
							</Button>
						</form>
					</div>

					<div class="rounded-xl border border-border bg-card shadow-sm">
						<div class="border-b border-border px-4 py-2 text-sm font-semibold">POLSEK</div>
					<ul class="max-h-[40vh] divide-y divide-border overflow-y-auto">
						{#each polsekList as s}
								<li class="p-4">
									<details>
										<summary class="cursor-pointer text-sm font-medium">
											{s.nama}
											<span class="text-xs font-normal text-muted-foreground">
												{s.lat != null && s.lng != null ? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}` : 'tanpa koordinat'}
											</span>
										</summary>
										<div class="mt-3 space-y-3">
											<form method="POST" action="?/updatePolsek" class="space-y-2" use:enhance>
												<input type="hidden" name="id" value={s.id} />
												<input name="nama" value={s.nama} class="flex h-11 w-full rounded border border-input bg-background px-2 text-base" />
												<div class="flex gap-2">
													<input
														name="lat"
														type="number"
														step="any"
														value={s.lat ?? ''}
														class="h-11 w-full rounded border border-input bg-background px-2 text-base"
													/>
													<input
														name="lng"
														type="number"
														step="any"
														value={s.lng ?? ''}
														class="h-11 w-full rounded border border-input bg-background px-2 text-base"
													/>
												</div>
												<button type="submit" class="text-sm font-medium text-primary hover:underline">Simpan</button>
											</form>
											<form
												method="POST"
												action="?/deletePolsek"
												use:enhance
												onsubmit={(e) => {
													if (!confirm(`Hapus ${s.nama}?`)) e.preventDefault();
												}}
											>
												<input type="hidden" name="id" value={s.id} />
												<button type="submit" class="text-sm text-destructive hover:underline">Hapus POLSEK</button>
											</form>
										</div>
									</details>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{:else}
				<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 class="text-sm font-semibold">Personil</h2>
							<p class="mt-0.5 text-xs text-muted-foreground">Tambah akun POLRES/POLSEK di bawah wilayah Anda.</p>
						</div>
						<Button type="button" variant="primary" class="w-full sm:w-auto" onclick={openCreatePersonil}>
							Tambah personil
						</Button>
					</div>
				</div>

				<div class="rounded-xl border border-border bg-card shadow-sm">
					<div class="border-b border-border px-4 py-2 text-sm font-semibold">Personil terdaftar</div>
					<div class="max-h-[50vh] overflow-x-auto overflow-y-auto">
						<table class="w-full min-w-[520px] text-left text-sm">
							<thead class="border-b border-border bg-muted/40 text-xs text-muted-foreground">
								<tr>
									<th class="px-3 py-2">Nama</th>
									<th class="px-3 py-2">NRP</th>
									<th class="px-3 py-2">Username</th>
									<th class="px-3 py-2">Peran</th>
									<th class="px-3 py-2">Unit</th>
									<th class="px-3 py-2"></th>
								</tr>
							</thead>
							<tbody>
								{#each data.personil as pe}
									<tr class="border-b border-border/70">
										<td class="px-3 py-2">{pe.nama}</td>
										<td class="px-3 py-2 font-mono text-xs">{pe.nrp || '—'}</td>
										<td class="px-3 py-2 font-mono text-xs">{pe.username}</td>
										<td class="px-3 py-2">{pe.role}</td>
										<td class="px-3 py-2 text-muted-foreground">{pe.unitNama}</td>
										<td class="px-3 py-2">
											<button
												type="button"
												class="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-primary hover:bg-muted"
												onclick={() => openEditPersonil(pe as PersonilRow)}
											>
												Edit
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>

				{#if editPersonilOpen && editPersonil}
					<div class="fixed inset-0 z-[2000] flex items-center justify-center p-4" role="dialog" aria-modal="true">
						<button
							type="button"
							class="absolute inset-0 cursor-default bg-black/40"
							aria-label="Tutup"
							onclick={closeEditPersonil}
						></button>
						<div class="relative w-full max-w-xl rounded-xl border border-border bg-card shadow-xl">
							<div class="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
								<div class="min-w-0">
									<h3 class="text-sm font-semibold">Edit personil</h3>
									<p class="mt-0.5 text-xs text-muted-foreground font-mono break-words">{editPersonil.username}</p>
								</div>
								<button
									type="button"
									class="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
									onclick={closeEditPersonil}
								>
									Tutup
								</button>
							</div>

							<div class="p-4 space-y-4">
								<form
									method="POST"
									action="?/updateUser"
									id="personil-update-form"
									class="grid gap-3 sm:grid-cols-2"
									use:enhance={() => {
										return async ({ result, update }) => {
											await update();
											if (result.type === 'success') closeEditPersonil();
										};
									}}
								>
									<input type="hidden" name="id" value={editPersonil.id} />

									<div class="sm:col-span-2">
										<label class="text-sm font-medium" for="ep-nama">Nama</label>
										<input
											id="ep-nama"
											name="nama"
											required
											bind:value={editPersonil.nama}
											class="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
										/>
									</div>

									<div>
										<label class="text-sm font-medium" for="ep-nrp">NRP</label>
										<input
											id="ep-nrp"
											name="nrp"
											required
											bind:value={editPersonil.nrp}
											class="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base font-mono"
										/>
									</div>
									<div>
										<label class="text-sm font-medium" for="ep-pangkat">Pangkat</label>
										<input
											id="ep-pangkat"
											name="pangkat"
											required
											bind:value={editPersonil.pangkat}
											class="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
										/>
									</div>

									<div>
										<label class="text-sm font-medium" for="ep-role">Peran</label>
										<select
											id="ep-role"
											name="role"
											required
											bind:value={editPersonil.role}
											class="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
										>
											<option value="KABAG OPS">Kabag OPS</option>
											<option value="ADMIN POLRES">Admin POLRES</option>
											<option value="KAPOLRES">Kapolres</option>
											<option value="WAKAPOLRES">Wakapolres</option>
											<option value="KATIM PATROLI">KATIM Patroli</option>
											<option value="ADMIN POLSEK">Admin POLSEK</option>
											<option value="KAPOLSEK">Kapolsek</option>
											<option value="WAKAPOLSEK">Wakapolsek</option>
											<option value="KANIT SAMAPTA">Kanit Samapta</option>
										</select>
									</div>

									<div>
										<label class="text-sm font-medium" for="ep-unit">Unit</label>
										<select
											id="ep-unit"
											name="unit_id"
											required
											bind:value={editPersonil.unitId}
											class="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
										>
											{#each data.allSatwilUnits as u}
												<option value={u.id}>[{u.tipe}] {u.label}</option>
											{/each}
										</select>
									</div>

									<div class="sm:col-span-2">
										<label class="text-sm font-medium" for="ep-pass">Password baru (opsional)</label>
										<input
											id="ep-pass"
											name="password"
											type="password"
											placeholder="Kosongkan jika tidak diubah"
											class="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
										/>
									</div>

								</form>

								<form
									method="POST"
									action="?/deleteUser"
									id="personil-delete-form"
									class="pt-2"
									use:enhance={() => {
										return async ({ result, update }) => {
											await update();
											if (result.type === 'success') closeEditPersonil();
										};
									}}
									onsubmit={(e) => {
										if (!confirm(`Hapus akun ${editPersonil?.username}?`)) e.preventDefault();
									}}
								>
									<input type="hidden" name="id" value={editPersonil.id} />
									<div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
										<Button type="submit" variant="danger" class="w-full sm:w-auto">Hapus akun</Button>
										<Button type="submit" form="personil-update-form" variant="primary" class="w-full sm:w-auto">
											Simpan
										</Button>
									</div>
								</form>
							</div>
						</div>
					</div>
				{/if}

				{#if createPersonilOpen}
					<div class="fixed inset-0 z-[2000] flex items-center justify-center p-4" role="dialog" aria-modal="true">
						<button
							type="button"
							class="absolute inset-0 cursor-default bg-black/40"
							aria-label="Tutup"
							onclick={closeCreatePersonil}
						></button>
						<div class="relative w-full max-w-xl rounded-xl border border-border bg-card shadow-xl">
							<div class="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
								<div class="min-w-0">
									<h3 class="text-sm font-semibold">Tambah personil</h3>
									<p class="mt-0.5 text-xs text-muted-foreground">Buat akun untuk POLRES/POLSEK.</p>
								</div>
								<button
									type="button"
									class="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
									onclick={closeCreatePersonil}
								>
									Tutup
								</button>
							</div>

							<div class="p-4">
								<form
									method="POST"
									action="?/createUser"
									class="grid gap-3 sm:grid-cols-2"
									use:enhance={() => {
										return async ({ result, update }) => {
											await update();
											if (result.type === 'success') closeCreatePersonil();
										};
									}}
								>
									<div class="sm:col-span-2">
										<label class="text-sm font-medium" for="cu-user">Username</label>
										<input
											id="cu-user"
											name="username"
											required
											bind:value={createPersonil.username}
											class="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
										/>
									</div>
									<div class="sm:col-span-2">
										<label class="text-sm font-medium" for="cu-pass">Password</label>
										<input
											id="cu-pass"
											name="password"
											type="password"
											required
											bind:value={createPersonil.password}
											class="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
										/>
									</div>
									<div class="sm:col-span-2">
										<label class="text-sm font-medium" for="cu-nama">Nama</label>
										<input
											id="cu-nama"
											name="nama"
											required
											bind:value={createPersonil.nama}
											class="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
										/>
									</div>
									<div>
										<label class="text-sm font-medium" for="cu-nrp">NRP</label>
										<input
											id="cu-nrp"
											name="nrp"
											required
											bind:value={createPersonil.nrp}
											class="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base font-mono"
											placeholder="Nomor registrasi personil"
										/>
									</div>
									<div>
										<label class="text-sm font-medium" for="cu-pangkat">Pangkat</label>
										<input
											id="cu-pangkat"
											name="pangkat"
											required
											bind:value={createPersonil.pangkat}
											class="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
										/>
									</div>
									<div>
										<label class="text-sm font-medium" for="cu-role">Peran</label>
										<select
											id="cu-role"
											name="role"
											required
											bind:value={createPersonil.role}
											class="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
										>
											<option value="KABAG OPS">Kabag OPS</option>
											<option value="ADMIN POLRES">Admin POLRES</option>
											<option value="KAPOLRES">Kapolres</option>
											<option value="WAKAPOLRES">Wakapolres</option>
											<option value="KATIM PATROLI">KATIM Patroli</option>
											<option value="ADMIN POLSEK">Admin POLSEK</option>
											<option value="KAPOLSEK">Kapolsek</option>
											<option value="WAKAPOLSEK">Wakapolsek</option>
											<option value="KANIT SAMAPTA">Kanit Samapta</option>
										</select>
									</div>
									<div>
										<label class="text-sm font-medium" for="cu-unit">Unit</label>
										<select
											id="cu-unit"
											name="unit_id"
											required
											bind:value={createPersonil.unitId}
											class="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
										>
											<option value="">Pilih unit…</option>
											{#each data.allSatwilUnits as u}
												<option value={String(u.id)}>[{u.tipe}] {u.label}</option>
											{/each}
										</select>
									</div>

									<div class="sm:col-span-2 flex justify-end pt-1">
										<Button type="submit" variant="primary" class="w-full sm:w-auto">Buat akun</Button>
									</div>
								</form>
							</div>
						</div>
					</div>
				{/if}
			{/if}
		</div>

		<div class="rounded-xl border border-border bg-card p-3 shadow-sm lg:sticky lg:top-4 lg:self-start {tab === 'personil' ? 'hidden' : ''}">
			<h2 class="mb-1 text-sm font-semibold">Peta</h2>
			<p class="mb-2 text-xs text-muted-foreground">
				Klik pada peta untuk mengatur titik koordinat saat menambah POLRES atau POLSEK.
			</p>

					<div class="relative mb-3">
				<label class="sr-only" for="satwil-map-search">Cari POLRES / POLSEK</label>
				<div class="relative">
					<input
						bind:this={searchInputEl}
						id="satwil-map-search"
						type="text"
								placeholder="Cari lokasi (contoh: POLRES Kupang Kota / Kupang / Polsek Oebobo)…"
						class="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
						value={mapSearch}
						oninput={(e) => {
							mapSearch = (e.currentTarget as HTMLInputElement).value;
							mapSearchOpen = true;
									scheduleGeoSearch(mapSearch);
						}}
						onfocus={() => {
							mapSearchOpen = true;
									scheduleGeoSearch(mapSearch);
						}}
						onkeydown={(e) => {
									if (!mapSearchOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
								mapSearchOpen = true;
								return;
							}
							if (!mapSearchOpen) return;
							if (e.key === 'Escape') {
								mapSearchOpen = false;
								return;
							}
							if (e.key === 'ArrowDown') {
								e.preventDefault();
										mapSearchActiveIndex = Math.min(mapSearchActiveIndex + 1, geoResults.length - 1);
								return;
							}
							if (e.key === 'ArrowUp') {
								e.preventDefault();
								mapSearchActiveIndex = Math.max(mapSearchActiveIndex - 1, 0);
								return;
							}
							if (e.key === 'Enter') {
										const selected = geoResults[mapSearchActiveIndex];
								if (selected) {
									e.preventDefault();
											focusGeoOnMap(selected);
								}
							}
						}}
						autocomplete="off"
					/>

							{#if mapSearchOpen && geoResults.length > 0}
						<div
							class="absolute z-[1100] mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg"
										role="listbox"
										aria-label="Hasil pencarian satuan wilayah"
										tabindex="-1"
							onmousedown={(e) => {
								// prevent blur sebelum click handler jalan
								e.preventDefault();
							}}
						>
									{#each geoResults as r, idx (r.display_name + ':' + r.lat + ':' + r.lon)}
								<button
									type="button"
									class="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 {idx === mapSearchActiveIndex ? 'bg-muted/60' : ''}"
											onclick={() => focusGeoOnMap(r)}
								>
									<span class="min-w-0">
												<span class="block truncate font-medium text-foreground">{r.display_name}</span>
												<span class="block truncate text-xs text-muted-foreground">lat {Number(r.lat).toFixed(5)} · lng {Number(r.lon).toFixed(5)}</span>
									</span>
											<span class="ml-auto text-xs text-muted-foreground">pilih</span>
								</button>
							{/each}
						</div>
							{:else if mapSearchOpen && normalizeQuery(mapSearch) && !geoLoading}
						<div class="absolute z-[1100] mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground shadow-lg">
									{geoError ?? 'Tidak ada hasil.'}
						</div>
					{/if}
				</div>

						{#if geoLoading}
							<p class="mt-1 text-xs text-muted-foreground">Mencari…</p>
						{:else if mapSearchSelected}
							<p class="mt-1 text-xs text-muted-foreground">
								Dipilih: <span class="font-medium text-foreground">{mapSearchSelected.display_name}</span>
							</p>
				{/if}
			</div>

			<div bind:this={mapContainer} class="h-[min(420px,50vh)] w-full rounded-lg border border-border"></div>
		</div>
	</div>
</div>

<style>
	:global(.satwil-pin) {
		background: transparent;
		border: none;
	}
	:global(.satwil-pin__dot) {
		width: 18px;
		height: 18px;
		border-radius: 9999px;
		background: #ef4444;
		border: 3px solid #fff;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
	}
	:global(.dark .satwil-pin__dot) {
		border-color: var(--surface);
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.55);
	}
</style>
