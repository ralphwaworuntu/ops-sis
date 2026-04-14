<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import SatwilFilter from '$lib/components/SatwilFilter.svelte';
	import { POLSEK_MAP_LOCK_RADIUS_M } from '$lib/geo-constants';

	let { data } = $props();

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

	let showRadius = $state(false);
	let radiusMStr = $state('500');
	let showPatrolMandatory = $state(true);

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

	const tacticalPoint = $derived(
		tacticalTargetId == null ? null : (data.points.find((p) => p.id === tacticalTargetId) ?? null)
	);

	const intelList = $derived(data.intelNotes ?? []);

	const crimeTypes = ['C3', 'Narkoba', 'Tawuran', 'Pencurian', 'Penipuan', 'Penganiayaan', 'Kerumunan', 'Lainnya'];

	const crimeColors: Record<string, string> = {
		C3: '#ef4444',
		Narkoba: '#8b5cf6',
		Tawuran: '#f97316',
		Pencurian: '#eab308',
		Penipuan: '#3b82f6',
		Penganiayaan: '#dc2626',
		Kerumunan: '#ca8a04',
		Lainnya: '#6b7280'
	};

	const crimeLegendHq = $derived(
		Object.entries(crimeColors).filter(([k]) => k !== 'Kerumunan') as [string, string][]
	);

	function markerColorForPoint(pt: { jenisKejahatan: string; origin?: string | null }) {
		const base = crimeColors[pt.jenisKejahatan] ?? '#6b7280';
		if (isPolsek && pt.origin === 'polsek') return '#f59e0b';
		if (isPolsek && (pt.origin === 'polres' || !pt.origin)) return '#dc2626';
		return base;
	}

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

		for (const pt of data.points) {
			const color = markerColorForPoint(pt);
			const border = isPolsek && pt.origin === 'polsek' ? '3px solid #fbbf24' : '3px solid white';
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
					tacticalRoute = null;
					tacticalErr = '';
				});
			}
			clusterGroup.addLayer(marker);

			if (!isPolsek && showRadius) {
				const radiusMeters = parseInt(radiusMStr, 10) || 500;
				L.circle([pt.lat, pt.lng], {
					radius: radiusMeters,
					color,
					weight: 1,
					fillColor: color,
					fillOpacity: 0.12
				}).addTo(radiusGroup);
			}
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
			const hqIcon = L.divIcon({
				className: '',
				html: `<div style="width:20px;height:20px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);"></div>`,
				iconSize: [20, 20],
				iconAnchor: [10, 10]
			});
			L.marker([lat, lng], { icon: hqIcon })
				.addTo(hqGroup)
				.bindPopup(
					`<strong>Markas POLSEK</strong><br/><span style="font-size:11px">Radius wajib patroli: 250m–1km</span>`
				);
		}

		if (!isPolsek) {
			for (const hq of data.hqMarkers ?? []) {
				if (hq.lat == null || hq.lng == null) continue;
				const icon = L.divIcon({
					className: '',
					html: `<div style="background:#1e3a8a;width:22px;height:22px;border-radius:4px;border:2px solid #d4af37;box-shadow:0 2px 6px rgba(0,0,0,.35);"></div>`,
					iconSize: [22, 22],
					iconAnchor: [11, 11]
				});
				L.marker([hq.lat, hq.lng], { icon })
					.addTo(hqGroup)
					.bindPopup(
						`<div style="font-family:system-ui,sans-serif;"><strong>${hq.nama}</strong><br/><span style="font-size:11px;color:#64748b">${hq.tipe}</span></div>`
					);
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
				map = L.map(mapContainer).setView([-6.23, 106.83], 12);
			}

			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
				maxZoom: 19
			}).addTo(map);

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
		void showRadius;
		void radiusMStr;
		void showPatrolMandatory;
		void isPolsek;
		if (mapReady) refreshLayers();
	});

	$effect(() => {
		void tacticalPoint;
		void tacticRadiusMStr;
		void tacticalRoute;
		if (mapReady) updateTacticalOverlay();
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

	{#if data.showSatwilFilter}
		<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
			<SatwilFilter polresList={data.polresList} />
			{#if data.polresFilter}
				<p class="mt-2 text-xs text-muted-foreground">
					Menampilkan titik rawan wilayah terpilih. Klaster akan terurai saat zoom-in. Kotak biru-emas = markas.
				</p>
			{/if}
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
			{#if isPolsek}
				<label class="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium">
					<input type="checkbox" bind:checked={showPatrolMandatory} class="rounded border-input" />
					Layer radius patroli (250m–1km)
				</label>
			{:else}
				<label class="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium">
					<input type="checkbox" bind:checked={showRadius} class="rounded border-input" />
					Radius titik rawan
				</label>
				<select
					bind:value={radiusMStr}
					class="h-9 max-w-[11rem] rounded-lg border border-input bg-background px-2 text-xs"
					disabled={!showRadius}
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

	{#if showRadius && !isPolsek}
		<p class="text-xs text-muted-foreground">
			Lingkaran analisis sekitar titik rawan — pilih radius 250 m hingga 5 km (mis. radius 500 m dari titik narkoba).
		</p>
	{/if}

	<div class="flex flex-wrap gap-2">
		{#if isPolsek}
			<div class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
				<span class="h-2.5 w-2.5 rounded-full bg-red-600"></span>
				Resmi POLRES / referensi
			</div>
			<div class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
				<span class="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
				Temuan lapangan POLSEK
			</div>
		{:else}
			{#each crimeLegendHq as [type, color] (type)}
				<div class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
					<span class="h-2.5 w-2.5 rounded-full" style="background:{color}"></span>
					{type}
				</div>
			{/each}
		{/if}
	</div>

	<div class="grid gap-4 lg:grid-cols-3">
		<div class="relative z-0 min-h-0 min-w-0 lg:col-span-2">
			<div class="overflow-hidden rounded-xl border border-border shadow-sm">
				<div
					bind:this={mapContainer}
					class="h-[50vh] w-full md:h-[65vh]"
				></div>
			</div>
		</div>

		<div class="relative z-10 min-w-0 space-y-4 bg-background">
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
								<label for="lat" class="mb-1 block text-xs font-medium text-muted-foreground">Latitude</label>
								<input
									id="lat"
									name="lat"
									type="number"
									step="0.0001"
									bind:value={selectedLat}
									class="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
								/>
							</div>
							<div>
								<label for="lng" class="mb-1 block text-xs font-medium text-muted-foreground">Longitude</label>
								<input
									id="lng"
									name="lng"
									type="number"
									step="0.0001"
									bind:value={selectedLng}
									class="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
								/>
							</div>
						</div>

						<div>
							<label for="jenis_kejahatan" class="mb-1 block text-xs font-medium text-muted-foreground">Jenis Kejahatan</label>
							<select
								id="jenis_kejahatan"
								name="jenis_kejahatan"
								required
								class="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
							>
								{#each crimeTypes.filter((x) => x !== 'Kerumunan') as jenis}
									<option value={jenis}>{jenis}</option>
								{/each}
							</select>
						</div>

						<div>
							<label for="frekuensi" class="mb-1 block text-xs font-medium text-muted-foreground">Frekuensi</label>
							<input
								id="frekuensi"
								name="frekuensi"
								type="number"
								min="1"
								value="1"
								class="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
							/>
						</div>

						<div>
							<label for="keterangan" class="mb-1 block text-xs font-medium text-muted-foreground">Keterangan</label>
							<textarea
								id="keterangan"
								name="keterangan"
								rows="2"
								class="flex w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm"
								placeholder="Deskripsi lokasi..."
							></textarea>
						</div>

						<button
							type="submit"
							class="flex h-9 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground"
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
								<label class="mb-1 block text-xs font-medium text-muted-foreground">Latitude</label>
								<input
									name="lat"
									type="number"
									step="0.0001"
									bind:value={selectedLat}
									class="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
								/>
							</div>
							<div>
								<label class="mb-1 block text-xs font-medium text-muted-foreground">Longitude</label>
								<input
									name="lng"
									type="number"
									step="0.0001"
									bind:value={selectedLng}
									class="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
								/>
							</div>
						</div>

						<div>
							<label class="mb-1 block text-xs font-medium text-muted-foreground">Jenis temuan</label>
							<select name="jenis_kejahatan" required class="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm">
								{#each crimeTypes as type}
									<option value={type}>{type}</option>
								{/each}
							</select>
						</div>

						<div>
							<label class="mb-1 block text-xs font-medium text-muted-foreground">Frekuensi / estimasi</label>
							<input name="frekuensi" type="number" min="1" value="1" class="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm" />
						</div>

						<div>
							<label class="mb-1 block text-xs font-medium text-muted-foreground">Keterangan singkat</label>
							<textarea name="keterangan" rows="2" class="flex w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm"></textarea>
						</div>

						<button type="submit" class="flex h-9 w-full items-center justify-center rounded-lg bg-amber-600 text-sm font-medium text-white">
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
						class="mt-1 h-9 w-full rounded-lg border border-violet-200 bg-white px-2 text-sm"
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
						class="mt-3 h-9 w-full rounded-lg bg-violet-700 text-sm font-semibold text-white disabled:opacity-50"
						disabled={tacticalLoading}
						onclick={() => void fetchTacticalRoute()}
					>
						{tacticalLoading ? 'Menghitung rute…' : 'Rute dari lokasi saya (OSRM)'}
					</button>
					{#if tacticalErr}
						<p class="mt-2 text-xs text-red-700">{tacticalErr}</p>
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
							class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
							placeholder="Contoh: laporan warga — balap liar di Jembatan Liliba sekitar jam 02.00."
						></textarea>
						<button
							type="submit"
							class="h-9 w-full rounded-lg bg-slate-800 text-sm font-medium text-white"
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
								<li class="rounded border border-amber-200/80 bg-white/90 px-3 py-2">
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

			<div class="rounded-xl border border-border bg-card shadow-sm">
				<div class="border-b border-border px-4 py-3">
					<h3 class="text-sm font-semibold text-foreground">Daftar Titik</h3>
				</div>
				<div class="max-h-[40vh] divide-y divide-border overflow-y-auto">
					{#each data.points as pt}
						<div class="px-4 py-3">
							<div class="flex items-start justify-between gap-2">
								<div>
									<div class="flex flex-wrap items-center gap-2">
										<span
											class="inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold text-white"
											style="background:{markerColorForPoint(pt)}"
										>
											{pt.jenisKejahatan}
										</span>
										<span class="text-xs text-muted-foreground">×{pt.frekuensi}</span>
										{#if isPolsek}
											<span class="text-[10px] font-medium {pt.origin === 'polsek' ? 'text-amber-700' : 'text-red-700'}">
												{pt.origin === 'polsek' ? 'POLSEK' : 'POLRES'}
											</span>
										{/if}
									</div>
									{#if pt.keterangan}
										<p class="mt-1 text-xs text-muted-foreground">{pt.keterangan}</p>
									{/if}
									<p class="mt-0.5 text-[10px] text-muted-foreground">
										{pt.lat}, {pt.lng} &middot; {pt.polresNama}
									</p>
								</div>
								{#if data.canEdit}
									<form method="POST" action="?/delete" use:enhance>
										<input type="hidden" name="id" value={pt.id} />
										<button type="submit" class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Hapus titik">
											<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
											</svg>
										</button>
									</form>
								{/if}
								{#if isPolsek && pt.origin === 'polsek' && data.canEditPolsek}
									<form method="POST" action="?/deletePolsek" use:enhance>
										<input type="hidden" name="id" value={pt.id} />
										<button type="submit" class="rounded p-1 text-amber-800 hover:bg-amber-100" aria-label="Hapus temuan">
											<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
											</svg>
										</button>
									</form>
								{/if}
							</div>
						</div>
					{:else}
						<div class="px-4 py-8 text-center text-sm text-muted-foreground">
							Belum ada titik.
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	:global(.leaflet-container) {
		z-index: 0;
	}
</style>
