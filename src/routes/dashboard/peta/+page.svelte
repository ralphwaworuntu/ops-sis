<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { POLSEK_MAP_LOCK_RADIUS_M } from '$lib/geo-constants';
	import { installThemedRasterBaseLayer } from '$lib/client/leaflet-themed-tiles';

	let { data } = $props();

	let mapShell: HTMLDivElement | undefined = $state();
	let mapFullscreen = $state(false);
	let mapContainer: HTMLDivElement;
	let map: import('leaflet').Map | undefined;
	let Lref: typeof import('leaflet') | undefined;
	let clusterGroup: import('leaflet').LayerGroup | undefined;
	let hqGroup: import('leaflet').LayerGroup | undefined;
	let radiusGroup: import('leaflet').LayerGroup | undefined;
	let patrolRingGroup: import('leaflet').LayerGroup | undefined;
	let tacticalGroup: import('leaflet').LayerGroup | undefined;

	let showForm = $state(false);
	let selectedLat = $state(-6.2);
	let selectedLng = $state(106.8);
	let formMessage = $state('');
	let mapReady = $state(false);

	let showPatrolMandatory = $state(true);

	// Form POLRES: multi-jenis kejahatan per titik
	let polresRadiusM = $state(500);
	let jumlahJenis = $state(1);
	let crimeSectionsOpen = $state<boolean[]>(Array.from({ length: 10 }, (_, i) => i === 0));
	let crimeJenis = $state<string[]>(Array.from({ length: 10 }, () => 'C3'));
	let crimeJenisLainnya = $state<string[]>(Array.from({ length: 10 }, () => ''));
	let crimeFrekuensi = $state<number[]>(Array.from({ length: 10 }, () => 1));
	let crimeKeterangan = $state<string[]>(Array.from({ length: 10 }, () => ''));

	/** Mode taktis POLSEK: klik titik → radius + rute */
	let tacticalTargetId = $state<number | null>(null);
	let tacticRadiusMStr = $state('500');
	let tacticalRoute = $state<{
		coordinates: [number, number][];
		distanceM: number;
		durationS: number;
	} | null>(null);
	let tacticalErr = $state('');
	let tacticalLoading = $state(false);

	const isPolsek = $derived(data.viewMode === 'polsek');

	// Quick search POLRES/POLSEK (markas) pada peta
	type HqSearchItem = { id: number; nama: string; tipe: string; lat: number; lng: number };
	let hqSearch = $state('');
	let hqSearchOpen = $state(false);
	let hqSearchActiveIndex = $state(0);
	let hqSearchSelected: HqSearchItem | null = $state(null);
	let hqSearchInputEl: HTMLInputElement | null = $state(null);
	const hqMarkerById = $state<Map<number, import('leaflet').Marker>>(new Map());

	function normalizeHqQuery(q: string): string {
		return q
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9\s]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	const hqItems = $derived.by((): HqSearchItem[] => {
		const list = (data.hqMarkers ?? []) as { id: number; nama: string; tipe: string; lat: number; lng: number }[];
		return list
			.filter((x) => x.lat != null && x.lng != null)
			.map((x) => ({ id: x.id, nama: x.nama, tipe: x.tipe, lat: x.lat, lng: x.lng }));
	});

	function scoreHq(qRaw: string, it: HqSearchItem): number {
		const q = normalizeHqQuery(qRaw);
		if (!q) return 0;
		const label = normalizeHqQuery(`${it.tipe} ${it.nama}`);
		if (label === q) return 300;
		if (label.startsWith(q)) return 220;
		if (label.includes(` ${q}`)) return 180;
		if (label.includes(q)) return 140;
		const tokens = q.split(' ').filter(Boolean);
		let tokScore = 0;
		for (const t of tokens) {
			if (t.length < 2) continue;
			if (label.includes(t)) tokScore += 28;
		}
		return tokScore;
	}

	const hqResults = $derived.by((): HqSearchItem[] => {
		const q = hqSearch;
		if (!normalizeHqQuery(q)) return [];
		return hqItems
			.map((it) => ({ it, s: scoreHq(q, it) }))
			.filter((x) => x.s > 0)
			.sort((a, b) => b.s - a.s || a.it.nama.localeCompare(b.it.nama))
			.slice(0, 12)
			.map((x) => x.it);
	});

	function focusHqOnMap(it: HqSearchItem) {
		hqSearchSelected = it;
		hqSearchOpen = false;
		hqSearchActiveIndex = 0;
		if (!map) return;
		map.flyTo([it.lat, it.lng], 12, { duration: 0.9 });
		hqMarkerById.get(it.id)?.openPopup();
	}

	const tacticalPoint = $derived(
		tacticalTargetId == null ? null : (data.points.find((p) => p.id === tacticalTargetId) ?? null)
	);

	const intelList = $derived(data.intelNotes ?? []);

	const crimeTypes = ['C3', 'Narkoba', 'Tawuran', 'Pencurian', 'Penipuan', 'Penganiayaan', 'Kerumunan', 'Lainnya'];

	/**
	 * Warna kerawanan (3 level saja) berdasarkan jumlah kasus (frekuensi).
	 * - Hijau: 1
	 * - Kuning: 2–5
	 * - Merah: >5
	 */
	function severityColor(freq: number): string {
		if (freq > 5) return '#dc2626'; // red-600
		if (freq >= 2) return '#f59e0b'; // amber-500
		return '#16a34a'; // green-600
	}

	function markerColorForPoint(pt: { frekuensi: number; origin?: string | null }) {
		return severityColor(pt.frekuensi);
	}

	$effect(() => {
		// Pastikan jumlahJenis dalam range dan section open mengikuti
		jumlahJenis = Math.min(10, Math.max(1, jumlahJenis));
	});

	function lockBoundsLeaflet(L: typeof import('leaflet'), lat: number, lng: number, radiusM: number) {
		const dLat = radiusM / 111320;
		const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
		return L.latLngBounds([lat - dLat, lng - dLng], [lat + dLat, lng + dLng]);
	}

	function updateTacticalOverlay() {
		const L = Lref;
		if (!L || !map || !tacticalGroup) return;
		tacticalGroup.clearLayers();
		const tp = tacticalPoint;
		if (!isPolsek || !tp) return;
		const radiusM = parseInt(tacticRadiusMStr, 10) || 500;
		const color = markerColorForPoint(tp);
		L.circle([tp.lat, tp.lng], {
			radius: radiusM,
			color: '#7c3aed',
			weight: 2,
			dashArray: '5 5',
			fillColor: color,
			fillOpacity: 0.12
		}).addTo(tacticalGroup);
		if (tacticalRoute?.coordinates?.length) {
			L.polyline(
				tacticalRoute.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
				{ color: '#2563eb', weight: 4, opacity: 0.88 }
			).addTo(tacticalGroup);
		}
	}

	function refreshLayers() {
		const L = Lref;
		if (!L || !map || !clusterGroup || !hqGroup || !radiusGroup || !patrolRingGroup) return;

		clusterGroup.clearLayers();
		hqGroup.clearLayers();
		radiusGroup.clearLayers();
		patrolRingGroup.clearLayers();
		hqMarkerById.clear();

		// Ikon satwil (samakan dengan halaman Admin Satwil)
		const polresIcon = L.icon({
			iconUrl: '/markers/polres.png',
			iconSize: [46, 46],
			iconAnchor: [23, 45],
			popupAnchor: [0, -40]
		});
		const polsekIcon = L.icon({
			iconUrl: '/markers/polsek.png',
			iconSize: [46, 46],
			iconAnchor: [23, 45],
			popupAnchor: [0, -40]
		});
		const poldaIcon = L.icon({
			iconUrl: '/markers/polda.png',
			iconSize: [46, 46],
			iconAnchor: [23, 45],
			popupAnchor: [0, -40]
		});

		for (const pt of data.points) {
			const color = markerColorForPoint(pt);
			// Tetap beri border untuk membedakan temuan POLSEK vs referensi (tanpa menambah varian warna).
			const border = isPolsek && pt.origin === 'polsek' ? '3px solid #111827' : '3px solid white';
			const icon = L.divIcon({
				className: '',
				html: `<div style="background:${color};width:28px;height:28px;border-radius:50%;border:${border};box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
					<span style="color:white;font-size:11px;font-weight:700;">${pt.frekuensi}</span>
				</div>`,
				iconSize: [28, 28],
				iconAnchor: [14, 14]
			});

			const label =
				isPolsek && pt.origin === 'polsek'
					? 'Temuan POLSEK (ubah)'
					: isPolsek
						? 'Resmi POLRES/API (baca)'
						: '';
			const marker = L.marker([pt.lat, pt.lng], { icon }).bindPopup(
				`<div style="font-family:system-ui,sans-serif;min-width:160px;">
					<div style="font-weight:600;font-size:13px;margin-bottom:4px;">${pt.jenisKejahatan}</div>
					${label ? `<div style="font-size:10px;color:#b45309;margin-bottom:4px;">${label}</div>` : ''}
					<div style="font-size:12px;color:#64748b;">Frekuensi: ${pt.frekuensi}</div>
					${pt.keterangan ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${pt.keterangan}</div>` : ''}
					<div style="font-size:11px;color:#94a3b8;margin-top:4px;">${pt.polresNama ?? ''}</div>
				</div>`
			);
			if (isPolsek) {
				marker.on('click', () => {
					tacticalTargetId = pt.id;
					tacticRadiusMStr = String((pt.radiusM ?? 500) as number);
					tacticalRoute = null;
					tacticalErr = '';
				});
			}
			clusterGroup.addLayer(marker);

			// Radius titik rawan selalu mengikuti data POLRES (pt.radiusM).
			const radiusMeters = (pt.radiusM ?? 500) as number;
			L.circle([pt.lat, pt.lng], {
				radius: radiusMeters,
				color,
				weight: 1,
				fillColor: color,
				fillOpacity: 0.10
			}).addTo(radiusGroup);
		}

		if (isPolsek && data.viewMode === 'polsek' && showPatrolMandatory) {
			const lat = data.polsekCenter.lat;
			const lng = data.polsekCenter.lng;
			for (const r of [250, 500, 1000]) {
				L.circle([lat, lng], {
					radius: r,
					color: '#0ea5e9',
					weight: 1,
					dashArray: '6 4',
					fillColor: '#0ea5e9',
					fillOpacity: 0.06
				}).addTo(patrolRingGroup);
			}
			L.marker([lat, lng], { icon: polsekIcon })
				.addTo(hqGroup)
				.bindPopup(
					`<strong>Markas POLSEK</strong><br/><span style="font-size:11px">Radius wajib patroli: 250m–1km</span>`
				);
		}

		if (!isPolsek) {
			// Samakan dengan Admin Satwil: marker tetap POLDA NTT (Kupang).
			const POLDA_NTT: [number, number] = [-10.1777143, 123.5976401];
			L.marker(POLDA_NTT, { icon: poldaIcon })
				.addTo(hqGroup)
				.bindPopup('<strong>POLDA NTT</strong><br/>Kupang');

			for (const hq of data.hqMarkers ?? []) {
				if (hq.lat == null || hq.lng == null) continue;
				const icon = hq.tipe === 'POLDA' ? poldaIcon : hq.tipe === 'POLSEK' ? polsekIcon : polresIcon;
				const m = L.marker([hq.lat, hq.lng], { icon })
					.addTo(hqGroup)
					.bindPopup(
						`<div style="font-family:system-ui,sans-serif;"><strong>${hq.nama}</strong><br/><span style="font-size:11px;color:#64748b">${hq.tipe}</span></div>`
					);
				hqMarkerById.set(hq.id, m);
			}
		}

		if (mapReady) updateTacticalOverlay();
	}

	function getGeo(): Promise<GeolocationPosition> {
		return new Promise((resolve, reject) => {
			if (!navigator.geolocation) {
				reject(new Error('Peramban tidak mendukung GPS'));
				return;
			}
			navigator.geolocation.getCurrentPosition(resolve, reject, {
				enableHighAccuracy: true,
				timeout: 20000,
				maximumAge: 0
			});
		});
	}

	async function fetchTacticalRoute() {
		tacticalErr = '';
		const tp = tacticalPoint;
		if (!tp) return;
		tacticalLoading = true;
		tacticalRoute = null;
		try {
			const pos = await getGeo();
			const lat1 = pos.coords.latitude;
			const lng1 = pos.coords.longitude;
			const res = await fetch(
				`/api/osrm-route?lat1=${lat1}&lng1=${lng1}&lat2=${tp.lat}&lng2=${tp.lng}`,
				{ credentials: 'include' }
			);
			const j = (await res.json()) as {
				error?: string;
				coordinates?: [number, number][];
				distanceM?: number;
				durationS?: number;
			};
			if (!res.ok) {
				tacticalErr = j.error ?? 'Gagal memuat rute';
				return;
			}
			if (!j.coordinates) {
				tacticalErr = 'Rute kosong';
				return;
			}
			tacticalRoute = {
				coordinates: j.coordinates,
				distanceM: j.distanceM ?? 0,
				durationS: j.durationS ?? 0
			};
		} catch (e) {
			tacticalErr = e instanceof Error ? e.message : 'GPS / jaringan gagal';
		} finally {
			tacticalLoading = false;
		}
	}

	onMount(() => {
		let destroyed = false;
		let teardownThemedBase: (() => void) | undefined;
		void (async () => {
			const leaflet = await import('leaflet');
			await import('leaflet.markercluster');
			if (destroyed || !mapContainer) return;
			const L = leaflet.default;
			Lref = L;

			if (data.viewMode === 'polsek') {
				const c = data.polsekCenter;
				const b = lockBoundsLeaflet(L, c.lat, c.lng, POLSEK_MAP_LOCK_RADIUS_M);
				map = L.map(mapContainer, {
					maxBounds: b,
					maxBoundsViscosity: 1,
					minZoom: 13
				}).setView([c.lat, c.lng], 16);
			} else {
				// Default view: Provinsi Nusa Tenggara Timur (NTT) (selaras dengan Live Wall)
				map = L.map(mapContainer).setView([-9.6, 123.9], 7);
			}

			teardownThemedBase = installThemedRasterBaseLayer(L, map);

			const mcg = (
				L as unknown as {
					markerClusterGroup: (o?: object) => import('leaflet').LayerGroup & { clearLayers: () => void };
				}
			).markerClusterGroup({
				maxClusterRadius: data.viewMode === 'polsek' ? 42 : 56,
				spiderfyOnMaxZoom: true,
				showCoverageOnHover: false,
				disableClusteringAtZoom: data.viewMode === 'polsek' ? 18 : 17
			});
			mcg.addTo(map);
			clusterGroup = mcg;

			hqGroup = L.layerGroup().addTo(map);
			radiusGroup = L.layerGroup().addTo(map);
			patrolRingGroup = L.layerGroup().addTo(map);
			tacticalGroup = L.layerGroup().addTo(map);

			if (data.canEdit || (data.viewMode === 'polsek' && data.canEditPolsek)) {
				map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
					selectedLat = Math.round(e.latlng.lat * 10000) / 10000;
					selectedLng = Math.round(e.latlng.lng * 10000) / 10000;
					showForm = true;
				});
			}

			mapReady = true;
			refreshLayers();

			setTimeout(() => {
				map?.invalidateSize();
				refreshLayers();
			}, 120);
		})();

		return () => {
			destroyed = true;
			teardownThemedBase?.();
			map?.remove();
			map = undefined;
			Lref = undefined;
			clusterGroup = undefined;
			hqGroup = undefined;
			radiusGroup = undefined;
			patrolRingGroup = undefined;
			tacticalGroup = undefined;
			mapReady = false;
		};
	});

	$effect(() => {
		void data.points;
		void data.hqMarkers;
		void showPatrolMandatory;
		void isPolsek;
		if (mapReady) refreshLayers();
	});

	// Jika filter Satwil (POLRES) dipilih, animasikan jump-in ke wilayah tsb.
	$effect(() => {
		if (!mapReady || !map || !Lref) return;
		if (data.viewMode === 'polsek') return;
		const wid = data.polresFilter as number | null | undefined;
		if (!wid) return;

		// Prioritas: fit bounds ke titik rawan yang sedang terfilter
		const pts = (data.points ?? []).filter((p) => p.lat != null && p.lng != null);
		if (pts.length >= 2) {
			const bounds = Lref.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number]));
			map.flyToBounds(bounds, { padding: [56, 56], maxZoom: 13, duration: 0.9 });
			return;
		}
		if (pts.length === 1) {
			map.flyTo([pts[0].lat, pts[0].lng], 13, { duration: 0.9 });
			return;
		}

		// Fallback: pakai markas POLRES jika tidak ada titik
		const hq = (data.hqMarkers ?? []).find((h) => h.id === wid && h.lat != null && h.lng != null);
		if (hq?.lat != null && hq.lng != null) {
			map.flyTo([hq.lat, hq.lng], 12, { duration: 0.9 });
		}
	});

	$effect(() => {
		void tacticalPoint;
		void tacticRadiusMStr;
		void tacticalRoute;
		if (mapReady) updateTacticalOverlay();
	});

	function isMapShellFullscreen(): boolean {
		if (typeof document === 'undefined' || !mapShell) return false;
		const doc = document as Document & { webkitFullscreenElement?: Element | null };
		return (
			document.fullscreenElement === mapShell || doc.webkitFullscreenElement === mapShell
		);
	}

	function toggleMapFullscreen() {
		const el = mapShell;
		if (!el || typeof document === 'undefined') return;
		const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> };
		const hel = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
		void (async () => {
			try {
				if (!isMapShellFullscreen()) {
					if (el.requestFullscreen) await el.requestFullscreen();
					else if (hel.webkitRequestFullscreen) await hel.webkitRequestFullscreen();
				} else {
					if (document.exitFullscreen) await document.exitFullscreen();
					else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
				}
			} catch {
				/* izin ditolak / tidak didukung */
			} finally {
				bumpMapResize();
			}
		})();
	}

	function bumpMapResize() {
		if (!map) return;
		const inv = () => map?.invalidateSize({ animate: false });
		queueMicrotask(inv);
		requestAnimationFrame(() => {
			inv();
			requestAnimationFrame(inv);
		});
		setTimeout(inv, 50);
		setTimeout(inv, 150);
		setTimeout(inv, 400);
		setTimeout(inv, 800);
	}

	function scheduleMapResize() {
		bumpMapResize();
	}

	$effect(() => {
		if (!browser) return;
		const onFs = () => {
			mapFullscreen = isMapShellFullscreen();
			scheduleMapResize();
		};
		document.addEventListener('fullscreenchange', onFs);
		document.addEventListener('webkitfullscreenchange', onFs as EventListener);
		return () => {
			document.removeEventListener('fullscreenchange', onFs);
			document.removeEventListener('webkitfullscreenchange', onFs as EventListener);
		};
	});

	/** Leaflet perlu invalidateSize saat kontainer fullscreen / resize — hindari peta “putih” (0×0). */
	$effect(() => {
		if (!browser || !mapReady || !mapShell || !map) return;
		const leafletMap = map;
		const ro = new ResizeObserver(() => {
			leafletMap.invalidateSize({ animate: false });
		});
		ro.observe(mapShell);
		return () => ro.disconnect();
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
	<link
		rel="stylesheet"
		href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"
	/>
	<link
		rel="stylesheet"
		href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"
	/>
	<title>Peta Kerawanan — OPS SIS</title>
</svelte:head>

<div class="space-y-4">
	{#if data.viewMode === 'polsek'}
		<div class="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
			<p class="font-semibold">Terhubung ke {data.polresNama ?? 'POLRES'}</p>
			<p class="mt-1 text-xs text-amber-900/90">
				Peta taktis wilayah <strong>{data.polsekNama ?? 'POLSEK'}</strong> — titik merah resmi POLRES/API (baca saja),
				titik oranye temuan lapangan Anda. <strong>Klik titik</strong> untuk radius 250 m–5 km dan rute OSRM dari GPS Anda.
				Intel tekstual hanya terlihat di POLSEK/POLRES Anda (bukan Peta Nasional).
			</p>
		</div>
	{/if}

	<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-xl font-bold tracking-tight text-foreground md:text-2xl">
				{isPolsek ? 'Peta Rawan Taktis (POLSEK)' : 'Peta Kerawanan'}
			</h1>
			<p class="text-sm text-muted-foreground">
				{data.points.length} titik
				{#if isPolsek}
					&middot; zoom tinggi untuk jalan/gang &middot; radius wajib patroli dari markas
				{:else}
					· klaster otomatis · radius patroli opsional
					{#if data.canEdit}
						&middot; Klik peta untuk titik baru
					{/if}
				{/if}
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			{#if !isPolsek}
				<div class="relative w-full sm:w-[420px]">
					<label class="sr-only" for="hq-search">Cari POLRES / POLSEK</label>
					<input
						bind:this={hqSearchInputEl}
						id="hq-search"
						type="text"
						value={hqSearch}
						placeholder="Cari POLRES / POLSEK…"
						class="h-11 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm"
						autocomplete="off"
						oninput={(e) => {
							hqSearch = (e.currentTarget as HTMLInputElement).value;
							hqSearchOpen = true;
							hqSearchActiveIndex = 0;
						}}
						onfocus={() => {
							hqSearchOpen = true;
						}}
						onkeydown={(e) => {
							if (!hqSearchOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
								hqSearchOpen = true;
								return;
							}
							if (!hqSearchOpen) return;
							if (e.key === 'Escape') {
								hqSearchOpen = false;
								return;
							}
							if (e.key === 'ArrowDown') {
								e.preventDefault();
								hqSearchActiveIndex = Math.min(hqSearchActiveIndex + 1, hqResults.length - 1);
								return;
							}
							if (e.key === 'ArrowUp') {
								e.preventDefault();
								hqSearchActiveIndex = Math.max(hqSearchActiveIndex - 1, 0);
								return;
							}
							if (e.key === 'Enter') {
								const selected = hqResults[hqSearchActiveIndex];
								if (selected) {
									e.preventDefault();
									focusHqOnMap(selected);
								}
							}
						}}
					/>

					{#if hqSearchOpen && hqResults.length > 0}
						<div
							class="absolute z-[1200] mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg"
							role="listbox"
							aria-label="Hasil pencarian satwil"
							tabindex="-1"
							onmousedown={(e) => e.preventDefault()}
						>
							{#each hqResults as r, idx (r.id)}
								<button
									type="button"
									class="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 {idx === hqSearchActiveIndex ? 'bg-muted/60' : ''}"
									onclick={() => focusHqOnMap(r)}
								>
									<span class="mt-0.5 inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
										{r.tipe}
									</span>
									<span class="min-w-0">
										<span class="block truncate font-medium text-foreground">{r.nama}</span>
										<span class="block truncate text-xs text-muted-foreground">
											{r.lat.toFixed(4)}, {r.lng.toFixed(4)}
										</span>
									</span>
								</button>
							{/each}
						</div>
					{:else if hqSearchOpen && normalizeHqQuery(hqSearch)}
						<div class="absolute z-[1200] mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground shadow-lg">
							Tidak ada hasil.
						</div>
					{/if}
				</div>
			{/if}
			{#if isPolsek}
				<label class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium">
					<input type="checkbox" bind:checked={showPatrolMandatory} class="rounded border-input" />
					Layer radius patroli (250m–1km)
				</label>
			{/if}
			{#if data.canEdit}
				<button
					type="button"
					onclick={() => (showForm = !showForm)}
					class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
					</svg>
					Tambah Titik
				</button>
			{/if}
			{#if data.viewMode === 'polsek' && data.canEditPolsek}
				<button
					type="button"
					onclick={() => (showForm = !showForm)}
					class="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-amber-600/90 active:scale-[0.98]"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
					</svg>
					Tambah Titik Rawan Lokal
				</button>
			{/if}
		</div>
	</div>

	<div class="grid gap-4 lg:grid-cols-12">
		<div class="relative z-0 min-h-0 min-w-0 lg:col-span-12">
			<div
				bind:this={mapShell}
				class="peta-map-shell relative overflow-hidden rounded-xl border border-border bg-background shadow-sm"
			>
				<div class="pointer-events-none absolute right-2 top-2 z-[1100]">
					<button
						type="button"
						onclick={toggleMapFullscreen}
						class="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-md hover:bg-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
						aria-label={mapFullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
						title={mapFullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
					>
						{#if mapFullscreen}
							<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
							</svg>
						{:else}
							<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
							</svg>
						{/if}
					</button>
				</div>
				<div
					bind:this={mapContainer}
					class="peta-map-canvas w-full min-h-[240px] h-[50vh] md:h-[65vh]"
				></div>
			</div>
		</div>

		<div class="relative z-10 min-w-0 space-y-4 bg-background lg:col-span-12">
			{#if showForm && data.canEdit}
				<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
					<h3 class="mb-3 text-sm font-semibold text-foreground">Tambah Titik Rawan (POLRES)</h3>
					{#if formMessage}
						<div class="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{formMessage}</div>
					{/if}
					<form
						method="POST"
						action="?/add"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									formMessage = 'Titik berhasil ditambahkan!';
									showForm = false;
									setTimeout(() => (formMessage = ''), 3000);
								}
								await update();
							};
						}}
						class="space-y-3"
					>
						<div class="grid grid-cols-2 gap-2">
							<div>
								<label for="lat" class="mb-1 block text-sm font-medium text-muted-foreground">Latitude</label>
								<input
									id="lat"
									name="lat"
									type="number"
									step="0.0001"
									bind:value={selectedLat}
									class="flex h-11 w-full rounded-md border border-input bg-background px-2.5 text-base"
								/>
							</div>
							<div>
								<label for="lng" class="mb-1 block text-sm font-medium text-muted-foreground">Longitude</label>
								<input
									id="lng"
									name="lng"
									type="number"
									step="0.0001"
									bind:value={selectedLng}
									class="flex h-11 w-full rounded-md border border-input bg-background px-2.5 text-base"
								/>
							</div>
						</div>

						<div class="grid grid-cols-2 gap-2">
							<div>
								<label for="radius_m" class="mb-1 block text-sm font-medium text-muted-foreground">Radius (meter)</label>
								<input
									id="radius_m"
									name="radius_m"
									type="number"
									min="50"
									max="5000"
									step="10"
									bind:value={polresRadiusM}
									class="flex h-11 w-full rounded-md border border-input bg-background px-2.5 text-base"
								/>
								<p class="mt-1 text-xs text-muted-foreground">Dipakai otomatis sebagai radius titik rawan (tanpa menu).</p>
							</div>
							<div>
								<label for="jumlah_jenis" class="mb-1 block text-sm font-medium text-muted-foreground">Ada berapa jenis kejahatan</label>
								<select
									id="jumlah_jenis"
									name="jumlah_jenis"
									bind:value={jumlahJenis}
									class="flex h-11 w-full rounded-md border border-input bg-background px-2.5 text-base"
								>
									{#each Array.from({ length: 10 }, (_, i) => i + 1) as n}
										<option value={n}>{n}</option>
									{/each}
								</select>
							</div>
						</div>

						<div class="space-y-2">
							{#each Array.from({ length: jumlahJenis }, (_, i) => i) as idx (idx)}
								<div class="rounded-lg border border-border bg-muted/20">
									<button
										type="button"
										class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-foreground"
										onclick={() => (crimeSectionsOpen[idx] = !crimeSectionsOpen[idx])}
										aria-expanded={crimeSectionsOpen[idx]}
									>
										<span>Jenis kejahatan #{idx + 1}</span>
										<span class="text-muted-foreground">{crimeSectionsOpen[idx] ? '—' : '+'}</span>
									</button>
									{#if crimeSectionsOpen[idx]}
										<div class="space-y-2 border-t border-border px-3 py-3">
											<div>
												<label for={"jenis_" + idx} class="mb-1 block text-xs font-medium text-muted-foreground">Jenis Kejahatan</label>
												<select
													id={"jenis_" + idx}
													name={"jenis_kejahatan_" + (idx + 1)}
													bind:value={crimeJenis[idx]}
													required
													class="flex h-11 w-full rounded-md border border-input bg-background px-2.5 text-base"
												>
													{#each crimeTypes.filter((x) => x !== 'Kerumunan') as jenis}
														<option value={jenis}>{jenis}</option>
													{/each}
												</select>
											</div>

											{#if crimeJenis[idx] === 'Lainnya'}
												<div>
													<label for={"jenis_lainnya_" + idx} class="mb-1 block text-xs font-medium text-muted-foreground">
														Jenis kejahatan (lainnya)
													</label>
													<input
														id={"jenis_lainnya_" + idx}
														name={"jenis_kejahatan_lainnya_" + (idx + 1)}
														type="text"
														required
														bind:value={crimeJenisLainnya[idx]}
														class="flex h-11 w-full rounded-md border border-input bg-background px-2.5 text-base"
														placeholder="Contoh: Pemalakan, Perjudian, dll"
													/>
												</div>
											{/if}

											<div class="grid grid-cols-2 gap-2">
												<div>
													<label for={"frek_" + idx} class="mb-1 block text-xs font-medium text-muted-foreground">Frekuensi</label>
													<input
														id={"frek_" + idx}
														name={"frekuensi_" + (idx + 1)}
														type="number"
														min="1"
														step="1"
														bind:value={crimeFrekuensi[idx]}
														class="flex h-11 w-full rounded-md border border-input bg-background px-2.5 text-base"
													/>
												</div>
												<div class="flex items-end">
													<p class="text-xs text-muted-foreground">
														Estimasi kejadian / periode input.
													</p>
												</div>
											</div>

											<div>
												<label for={"ket_" + idx} class="mb-1 block text-xs font-medium text-muted-foreground">Keterangan</label>
												<textarea
													id={"ket_" + idx}
													name={"keterangan_" + (idx + 1)}
													rows="2"
													bind:value={crimeKeterangan[idx]}
													class="flex w-full rounded-md border border-input bg-background px-2.5 py-2 text-base"
													placeholder="Deskripsi singkat lokasi/kejadian..."
												></textarea>
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>

						<button
							type="submit"
							class="flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground"
						>
							Simpan Titik
						</button>
					</form>
				</div>
			{/if}

			{#if showForm && data.viewMode === 'polsek' && data.canEditPolsek}
				<div class="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
					<h3 class="mb-3 text-sm font-semibold text-foreground">Temuan Lapangan (lokal)</h3>
					<p class="mb-3 text-xs text-muted-foreground">
						Klik peta untuk koordinat, lalu isi jenis temuan (mis. kerumunan miras). Data dapat diubah/dihapus oleh POLSEK ini.
					</p>
					{#if formMessage}
						<div class="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{formMessage}</div>
					{/if}
					<form
						method="POST"
						action="?/addPolsek"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									formMessage = 'Temuan disimpan.';
									showForm = false;
									setTimeout(() => (formMessage = ''), 3000);
								}
								await update();
							};
						}}
						class="space-y-3"
					>
						<div class="grid grid-cols-2 gap-2">
							<div>
								<label for="polsek-lat" class="mb-1 block text-sm font-medium text-muted-foreground">Latitude</label>
								<input
									id="polsek-lat"
									name="lat"
									type="number"
									step="0.0001"
									bind:value={selectedLat}
									class="flex h-11 w-full rounded-md border border-input bg-background px-2.5 text-base"
								/>
							</div>
							<div>
								<label for="polsek-lng" class="mb-1 block text-sm font-medium text-muted-foreground">Longitude</label>
								<input
									id="polsek-lng"
									name="lng"
									type="number"
									step="0.0001"
									bind:value={selectedLng}
									class="flex h-11 w-full rounded-md border border-input bg-background px-2.5 text-base"
								/>
							</div>
						</div>

						<div>
							<label for="polsek-jenis" class="mb-1 block text-sm font-medium text-muted-foreground">Jenis temuan</label>
							<select id="polsek-jenis" name="jenis_kejahatan" required class="flex h-11 w-full rounded-md border border-input bg-background px-2.5 text-base">
								{#each crimeTypes as type}
									<option value={type}>{type}</option>
								{/each}
							</select>
						</div>

						<div>
							<label for="polsek-frek" class="mb-1 block text-sm font-medium text-muted-foreground">Frekuensi / estimasi</label>
							<input id="polsek-frek" name="frekuensi" type="number" min="1" value="1" class="flex h-11 w-full rounded-md border border-input bg-background px-2.5 text-base" />
						</div>

						<div>
							<label for="polsek-ket" class="mb-1 block text-sm font-medium text-muted-foreground">Keterangan singkat</label>
							<textarea id="polsek-ket" name="keterangan" rows="2" class="flex w-full rounded-md border border-input bg-background px-2.5 py-2 text-base"></textarea>
						</div>

						<button type="submit" class="flex min-h-11 w-full items-center justify-center rounded-lg bg-amber-600 px-4 text-base font-medium text-white">
							Simpan temuan
						</button>
					</form>
				</div>
			{/if}

			{#if isPolsek && tacticalPoint}
				<div class="rounded-xl border border-violet-200 bg-violet-50/70 p-4 shadow-sm">
					<div class="flex items-start justify-between gap-2">
						<h3 class="text-sm font-semibold text-violet-950">Radius &amp; rute taktis</h3>
						<button
							type="button"
							class="text-xs font-medium text-violet-800 hover:underline"
							onclick={() => {
								tacticalTargetId = null;
								tacticalRoute = null;
								tacticalErr = '';
							}}
						>
							Tutup
						</button>
					</div>
					<p class="mt-1 text-xs text-violet-900/90">
						<strong>{tacticalPoint.jenisKejahatan}</strong>
						· ×{tacticalPoint.frekuensi}
					</p>
					<label class="mt-3 block text-xs font-medium text-violet-900" for="tactical-radius"
						>Radius</label
					>
					<select
						id="tactical-radius"
						bind:value={tacticRadiusMStr}
						class="mt-1 h-11 w-full rounded-lg border border-violet-200 bg-background px-2 text-base"
					>
						<option value="250">250 m</option>
						<option value="500">500 m</option>
						<option value="750">750 m</option>
						<option value="1000">1 km</option>
						<option value="1500">1,5 km</option>
						<option value="2000">2 km</option>
						<option value="2500">2,5 km</option>
						<option value="3000">3 km</option>
						<option value="4000">4 km</option>
						<option value="5000">5 km</option>
					</select>
					<button
						type="button"
						class="mt-3 min-h-11 w-full rounded-lg bg-violet-700 px-4 text-base font-semibold text-white disabled:opacity-50"
						disabled={tacticalLoading}
						onclick={() => void fetchTacticalRoute()}
					>
						{tacticalLoading ? 'Menghitung rute…' : 'Rute dari lokasi saya (OSRM)'}
					</button>
					{#if tacticalErr}
						<p class="mt-2 text-xs text-red-700 dark:text-red-300">{tacticalErr}</p>
					{/if}
					{#if tacticalRoute}
						<p class="mt-2 text-xs text-violet-900">
							~{(tacticalRoute.distanceM / 1000).toFixed(2)} km · ~{Math.round(tacticalRoute.durationS / 60)} menit
							(perkiraan mengemudi)
						</p>
					{/if}
				</div>
			{/if}

			{#if isPolsek && data.canEditPolsek}
				<div class="rounded-xl border border-slate-200 bg-card p-4 shadow-sm">
					<h3 class="text-sm font-semibold text-foreground">Informasi intel (teks)</h3>
					<p class="mt-1 text-xs text-muted-foreground">
						Hanya POLSEK &amp; POLRES Anda. Bahan Rengiat — tidak ke agregat Polda sampai divalidasi.
					</p>
					<form
						method="POST"
						action="?/addIntel"
						class="mt-3 space-y-2"
						use:enhance={() =>
							async ({ result, update }) => {
								if (result.type === 'success') {
									formMessage = 'Intel disimpan.';
									setTimeout(() => (formMessage = ''), 2500);
								}
								await update();
							}}
					>
						<label class="sr-only" for="intel-teks">Isi intel</label>
						<textarea
							id="intel-teks"
							name="teks"
							rows="3"
							required
							minlength="8"
							class="w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
							placeholder="Contoh: laporan warga — balap liar di Jembatan Liliba sekitar jam 02.00."
						></textarea>
						<button
							type="submit"
							class="min-h-11 w-full rounded-lg bg-slate-800 px-4 text-base font-medium text-white dark:bg-slate-700"
						>
							Simpan intel sementara
						</button>
					</form>
				</div>
				{#if intelList.length > 0}
					<div class="rounded-xl border border-border bg-card shadow-sm">
						<div class="border-b border-border px-4 py-2">
							<h3 class="text-xs font-semibold text-foreground">Arsip intel Anda</h3>
						</div>
						<ul class="max-h-48 divide-y divide-border overflow-y-auto text-xs">
							{#each intelList as note (note.id)}
								<li class="px-4 py-2">
									<p class="text-muted-foreground">{new Date(note.createdAt).toLocaleString('id-ID')}</p>
									<p class="mt-0.5 text-foreground">{note.teks}</p>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}

			{#if !isPolsek && data.canEdit}
				<div class="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
					<h3 class="text-sm font-semibold text-foreground">Intel POLSEK (bahan Rengiat)</h3>
					<p class="mt-1 text-xs text-muted-foreground">
						Masukan tekstual dari anggota — tidak ditampilkan di tingkat Polda.
					</p>
					{#if intelList.length === 0}
						<p class="mt-3 text-xs text-muted-foreground">Belum ada entri intel.</p>
					{:else}
						<ul class="mt-3 max-h-52 space-y-2 overflow-y-auto text-xs">
							{#each intelList as note (note.id)}
								<li class="rounded border border-amber-200/80 bg-card px-3 py-2 dark:border-amber-900/50">
									<p class="font-medium text-foreground">{note.polsekNama ?? 'POLSEK'}</p>
									<p class="text-[10px] text-muted-foreground">
										{new Date(note.createdAt).toLocaleString('id-ID')}
									</p>
									<p class="mt-1 text-foreground">{note.teks}</p>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}

		</div>
	</div>

	<div class="rounded-xl border border-border bg-card shadow-sm">
		<div class="border-b border-border px-4 py-3">
			<h3 class="text-sm font-semibold text-foreground">Daftar Titik</h3>
		</div>
		<div class="max-h-[55vh] overflow-y-auto p-4">
			<div class="grid gap-3 md:grid-cols-2">
				{#each data.points as pt (pt.id)}
					<div class="rounded-lg border border-border bg-background p-3">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<span
										class="inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold text-white"
										style="background:{markerColorForPoint(pt)}"
									>
										{pt.jenisKejahatan}
									</span>
									<span class="text-xs text-muted-foreground">×{pt.frekuensi}</span>
									<span class="text-[10px] font-medium text-muted-foreground">
										Radius: {pt.radiusM ?? 500} m
									</span>
									{#if pt.origin === 'polda'}
										<span class="text-[10px] font-medium text-violet-700">POLDA</span>
									{:else if isPolsek}
										<span class="text-[10px] font-medium {pt.origin === 'polsek' ? 'text-amber-700' : 'text-red-700'}">
											{pt.origin === 'polsek' ? 'POLSEK' : 'POLRES'}
										</span>
									{/if}
								</div>
								{#if pt.keterangan}
									<p class="mt-1 line-clamp-2 text-xs text-muted-foreground">{pt.keterangan}</p>
								{/if}
								<p class="mt-0.5 text-[10px] text-muted-foreground">
									{pt.lat}, {pt.lng} &middot; {pt.polresNama}
								</p>
							</div>
							<div class="flex shrink-0 items-center gap-1">
								{#if data.canEdit}
									<form method="POST" action="?/delete" use:enhance>
										<input type="hidden" name="id" value={pt.id} />
										<button
											type="submit"
											class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
											aria-label="Hapus titik"
											title="Hapus titik"
										>
											<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
											</svg>
										</button>
									</form>
								{/if}
								{#if isPolsek && pt.origin === 'polsek' && data.canEditPolsek}
									<form method="POST" action="?/deletePolsek" use:enhance>
										<input type="hidden" name="id" value={pt.id} />
										<button
											type="submit"
											class="rounded p-1 text-amber-800 hover:bg-amber-100"
											aria-label="Hapus temuan"
											title="Hapus temuan"
										>
											<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
											</svg>
										</button>
									</form>
								{/if}
							</div>
						</div>
					</div>
				{:else}
					<div class="rounded-lg border border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground md:col-span-2">
						Belum ada titik.
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	:global(.leaflet-container) {
		z-index: 0;
	}

	/*
		Fullscreen API: tinggi kontainer harus pasti sebelum Leaflet menggambar tile.
		:fullscreen dipasang langsung oleh browser (tidak tunggu state Svelte) — mencegah layar putih.
	*/
	:global(.peta-map-shell:fullscreen),
	:global(.peta-map-shell:-webkit-full-screen) {
		display: flex;
		flex-direction: column;
		width: 100vw;
		max-width: 100vw;
		height: 100vh;
		height: 100dvh;
		max-height: 100dvh;
		box-sizing: border-box;
		border-radius: 0;
		border-width: 0;
		background: var(--background);
	}
	:global(.peta-map-shell:fullscreen .peta-map-canvas),
	:global(.peta-map-shell:-webkit-full-screen .peta-map-canvas) {
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
		height: auto !important;
	}
	:global(.peta-map-shell:fullscreen .leaflet-container),
	:global(.peta-map-shell:-webkit-full-screen .leaflet-container) {
		height: 100% !important;
		width: 100%;
		background: var(--bg);
	}
</style>
