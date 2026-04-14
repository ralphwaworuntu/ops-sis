<script lang="ts">
	import { onMount } from 'svelte';
	import { POLSEK_MAP_LOCK_RADIUS_M } from '$lib/geo-constants';

	type Hotspot = {
		id: number;
		lat: number;
		lng: number;
		jenisKejahatan: string;
		frekuensi: number;
	};

	let {
		center,
		hotspots,
		label = 'Hotspot referensi POLRES (LP)'
	}: {
		center: { lat: number; lng: number };
		hotspots: Hotspot[];
		label?: string;
	} = $props();

	let el: HTMLDivElement | undefined = $state();
	let mapReady = $state(false);

	function lockBoundsLeaflet(L: typeof import('leaflet'), lat: number, lng: number, radiusM: number) {
		const dLat = radiusM / 111320;
		const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
		return L.latLngBounds([lat - dLat, lng - dLng], [lat + dLat, lng + dLng]);
	}

	onMount(() => {
		let destroyed = false;
		let map: import('leaflet').Map | undefined;
		void (async () => {
			const leaflet = await import('leaflet');
			if (destroyed || !el) return;
			const L = leaflet.default;
			const b = lockBoundsLeaflet(L, center.lat, center.lng, POLSEK_MAP_LOCK_RADIUS_M);
			map = L.map(el, {
				maxBounds: b,
				maxBoundsViscosity: 1,
				minZoom: 13,
				scrollWheelZoom: false,
				dragging: true,
				zoomControl: true,
				attributionControl: true
			}).setView([center.lat, center.lng], 15);

			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; OSM',
				maxZoom: 19
			}).addTo(map);

			const g = L.layerGroup().addTo(map);
			for (const h of hotspots) {
				const icon = L.divIcon({
					className: '',
					html: `<div style="background:#dc2626;width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;"><span style="color:#fff;font-size:9px;font-weight:700">${h.frekuensi}</span></div>`,
					iconSize: [22, 22],
					iconAnchor: [11, 11]
				});
				L.marker([h.lat, h.lng], { icon })
					.bindTooltip(`${h.jenisKejahatan} · ×${h.frekuensi}`, { direction: 'top' })
					.addTo(g);
			}

			L.circleMarker([center.lat, center.lng], {
				radius: 6,
				fillColor: '#f59e0b',
				color: '#fff',
				weight: 2,
				fillOpacity: 1
			})
				.bindTooltip('Markas POLSEK', { direction: 'bottom' })
				.addTo(g);

			mapReady = true;
			setTimeout(() => map?.invalidateSize(), 80);
		});

		return () => {
			destroyed = true;
			map?.remove();
			map = undefined;
			mapReady = false;
		};
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<div class="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
	<div class="border-b border-border px-3 py-2">
		<p class="text-xs font-semibold text-foreground">Peta singkat</p>
		<p class="text-[10px] text-muted-foreground">{label}</p>
	</div>
	<div
		bind:this={el}
		class="h-52 w-full bg-muted/40"
		role="img"
		aria-label="Peta mini hotspot kerawanan wilayah POLSEK"
	></div>
	{#if !mapReady}
		<p class="px-3 py-2 text-[10px] text-muted-foreground">Memuat peta…</p>
	{/if}
	<p class="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
		<a href="/dashboard/peta" class="font-medium text-primary hover:underline">Buka Peta Rawan penuh</a>
		untuk radius taktis &amp; intel lapangan.
	</p>
</div>
