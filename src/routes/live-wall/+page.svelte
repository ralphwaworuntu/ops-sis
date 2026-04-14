<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let { data } = $props();

	type Recent = (typeof data.recent)[number];

	let stream = $state<Recent[]>([]);
	let staleAlerts = $state<
		{
			sessionId: number;
			polresId: number;
			polresNama: string;
			polsekNama: string;
			userNama: string;
			userNrp: string;
			rengiatJudul: string;
			lastHeartbeatAt: string;
			startLat: number;
			startLng: number;
			receivedAt: string;
		}[]
	>([]);
	let mapHost: HTMLDivElement | undefined = $state();
	let pulseId = $state<number | null>(null);

	let mapReady = $state(false);

	const mapCtx: {
		L: typeof import('leaflet') | null;
		map: import('leaflet').Map | null;
		layer: import('leaflet').LayerGroup | null;
		staleLayer: import('leaflet').LayerGroup | null;
	} = { L: null, map: null, layer: null, staleLayer: null };

	$effect(() => {
		stream = [...data.recent];
	});

	const chartMax = $derived(
		Math.max(
			1,
			Math.ceil(data.movingAvg7Prev),
			data.todayCount,
			...data.dailySeries.map((d) => d.count)
		)
	);

	const trendLabel = $derived.by(() => {
		const a = data.movingAvg7Prev;
		if (a <= 0) {
			return data.todayCount > 0
				? 'Hari ini ada aktivitas; belum ada rata-rata 7 hari sebelumnya untuk dibandingkan.'
				: 'Belum ada data cukup untuk indeks tren.';
		}
		const ratio = data.todayCount / a;
		if (ratio > 1.05) return 'Intensitas hari ini di atas rata-rata 7 hari kerja sebelumnya.';
		if (ratio < 0.95) return 'Intensitas hari ini di bawah rata-rata 7 hari kerja sebelumnya.';
		return 'Intensitas hari ini sejalan dengan rata-rata 7 hari kerja sebelumnya.';
	});

	function redrawStaleMarkers(
		alerts: {
			sessionId: number;
			startLat: number;
			startLng: number;
		}[]
	) {
		const { L, map, staleLayer } = mapCtx;
		if (!L || !map || !staleLayer) return;
		staleLayer.clearLayers();
		for (const a of alerts) {
			if (
				a.startLat == null ||
				a.startLng == null ||
				(a.startLat === 0 && a.startLng === 0)
			)
				continue;
			const el = document.createElement('div');
			el.className = 'lhp-wall-dot lhp-wall-dot--stale';
			const icon = L.divIcon({
				html: el,
				className: 'lhp-wall-icon',
				iconSize: [28, 28],
				iconAnchor: [14, 14]
			});
			L.marker([a.startLat, a.startLng], { icon }).addTo(staleLayer);
		}
	}

	function redrawMarkers(list: Recent[], highlightId: number | null) {
		const { L, map, layer } = mapCtx;
		if (!L || !map || !layer) return;
		layer.clearLayers();
		const bounds: [number, number][] = [];
		for (const r of list) {
			if (r.lat == null || r.lng == null) continue;
			const el = document.createElement('div');
			el.className = 'lhp-wall-dot';
			if (highlightId === r.id) el.classList.add('lhp-wall-dot--pulse');
			if (r.diLuarRadius) el.classList.add('lhp-wall-dot--warn');
			const icon = L.divIcon({
				html: el,
				className: 'lhp-wall-icon',
				iconSize: [28, 28],
				iconAnchor: [14, 14]
			});
			L.marker([r.lat, r.lng], { icon }).addTo(layer);
			bounds.push([r.lat, r.lng]);
		}
		if (bounds.length > 0) {
			map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 });
		}
	}

	$effect(() => {
		if (!browser || !mapReady) return;
		void stream;
		void pulseId;
		redrawMarkers(stream, pulseId);
	});

	$effect(() => {
		if (!browser || !mapReady) return;
		void staleAlerts;
		redrawStaleMarkers(staleAlerts);
	});

	onMount(() => {
		if (!mapHost) return;

		let destroyed = false;
		let pulseTimer: ReturnType<typeof setTimeout> | undefined;

		void import('leaflet').then((L) => {
			if (destroyed || !mapHost) return;
			mapCtx.L = L;
			mapCtx.map = L.map(mapHost).setView([-6.2, 106.85], 10);
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; OpenStreetMap',
				maxZoom: 19
			}).addTo(mapCtx.map);
			mapCtx.layer = L.layerGroup().addTo(mapCtx.map);
			mapCtx.staleLayer = L.layerGroup().addTo(mapCtx.map);
			mapReady = true;
		});

		const es = new EventSource('/api/events');
		es.onmessage = (event) => {
			try {
				const payload = JSON.parse(event.data);
				if (payload.type === 'heartbeat_stale') {
					const d = payload.data as {
						sessionId: number;
						polresId: number;
						polresNama?: string;
						polsekNama?: string;
						userNama?: string;
						userNrp?: string;
						rengiatJudul?: string;
						lastHeartbeatAt?: string;
						startLat?: number;
						startLng?: number;
					};
					if (!data.scopedPolresIds.includes(d.polresId)) return;
					const row = {
						sessionId: d.sessionId,
						polresId: d.polresId,
						polresNama: d.polresNama ?? '',
						polsekNama: d.polsekNama ?? '',
						userNama: d.userNama ?? '',
						userNrp: d.userNrp ?? '',
						rengiatJudul: d.rengiatJudul ?? '',
						lastHeartbeatAt: d.lastHeartbeatAt ?? '',
						startLat: d.startLat ?? 0,
						startLng: d.startLng ?? 0,
						receivedAt: new Date().toISOString()
					};
					staleAlerts = [
						row,
						...staleAlerts.filter((x) => x.sessionId !== row.sessionId)
					].slice(0, 40);
					return;
				}
				if (payload.type !== 'lhp_new') return;
				const d = payload.data as {
					id: number;
					rengiatId: number;
					lat?: number;
					lng?: number;
					diLuarRadius?: boolean;
					distanceMeters?: number | null;
					deskripsi?: string;
					judul?: string;
					polresNama?: string;
					userNama?: string;
					createdAt?: string;
				};
				const row: Recent = {
					id: d.id,
					rengiatId: d.rengiatId,
					lat: d.lat ?? null,
					lng: d.lng ?? null,
					deskripsi: d.deskripsi ?? '',
					judul: d.judul ?? '—',
					userNama: d.userNama ?? '—',
					diLuarRadius: Boolean(d.diLuarRadius),
					distanceMeters: d.distanceMeters ?? null,
					createdAt: d.createdAt ?? new Date().toISOString(),
					polresNama: d.polresNama ?? ''
				};
				stream = [row, ...stream.filter((x) => x.id !== row.id)].slice(0, 120);
				if (pulseTimer) clearTimeout(pulseTimer);
				pulseId = row.id;
				pulseTimer = setTimeout(() => {
					pulseId = null;
				}, 2200);
			} catch {
				/* ignore */
			}
		};

		return () => {
			destroyed = true;
			if (pulseTimer) clearTimeout(pulseTimer);
			es.close();
			mapCtx.map?.remove();
			mapCtx.map = null;
			mapCtx.layer = null;
			mapCtx.staleLayer = null;
			mapCtx.L = null;
			mapReady = false;
		};
	});

	function formatTime(iso: string) {
		return new Date(iso).toLocaleString('id-ID', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Live Wall — OPS SIS</title>
	<link
		rel="stylesheet"
		href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
		integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
		crossorigin=""
	/>
</svelte:head>

<div class="flex h-[calc(100vh-2.75rem)] min-h-[420px] flex-col">
	{#if staleAlerts.length > 0}
		<div
			class="pointer-events-auto z-20 flex max-h-[40vh] shrink-0 flex-col gap-2 overflow-y-auto border-b border-amber-700/50 bg-amber-950/95 px-3 py-2.5 lg:max-h-[min(28vh,220px)] lg:w-full"
			role="region"
			aria-label="Peringatan heartbeat personil"
		>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="text-xs font-bold uppercase tracking-wide text-amber-200">
					Heartbeat terhenti (personil aktif)
				</p>
				<button
					type="button"
					class="rounded border border-amber-600/80 px-2 py-0.5 text-[10px] font-medium text-amber-100 hover:bg-amber-900/80"
					onclick={() => (staleAlerts = [])}
				>
					Tutup semua
				</button>
			</div>
			<ul class="space-y-2">
				{#each staleAlerts as a (a.sessionId)}
					<li class="rounded-md border border-amber-800/80 bg-amber-950/80 px-2.5 py-2 text-xs text-amber-50">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="font-semibold text-amber-100">{a.userNama}</p>
								<p class="text-[10px] text-amber-200/90">
									{a.polresNama} · {a.polsekNama} · NRP {a.userNrp || '—'}
								</p>
								<p class="mt-0.5 text-[11px] text-amber-100/95">{a.rengiatJudul}</p>
								<p class="mt-1 text-[10px] text-amber-300/90">
									Terakhir heartbeat: {a.lastHeartbeatAt ? formatTime(a.lastHeartbeatAt) : '—'} · titik awal giat
									dipetakan (oranye)
								</p>
							</div>
							<button
								type="button"
								class="shrink-0 rounded px-1.5 text-[10px] text-amber-300 hover:bg-amber-900/90"
								onclick={() => (staleAlerts = staleAlerts.filter((x) => x.sessionId !== a.sessionId))}
								aria-label="Tutup peringatan"
							>
								✕
							</button>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
	<div class="relative flex min-h-0 flex-1 flex-col lg:flex-row lg:items-stretch">
		<div class="flex min-h-0 min-w-0 flex-1 flex-col">
			<!-- Peta di konteks stacking sendiri; kartu tren di bawah (bukan overlay) agar tidak tertutup tile Leaflet -->
			<div class="relative z-0 min-h-0 flex-1 isolate">
				<div
					bind:this={mapHost}
					class="h-[min(52vh,480px)] min-h-[240px] w-full lg:h-full lg:min-h-[200px]"
				></div>
			</div>
			<div
				class="shrink-0 border-t border-slate-700/90 bg-slate-900/95 px-3 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.35)] lg:border-t lg:px-4"
			>
				<div class="flex flex-wrap items-end gap-3">
					<div class="min-w-0 flex-1">
						<p class="text-[10px] font-medium uppercase text-slate-500">Indeks tren (moving average)</p>
						<p class="text-xs text-slate-200">{trendLabel}</p>
						<p class="mt-1 text-[11px] text-slate-400">
							Hari ini: <strong class="text-white">{data.todayCount}</strong> LHP · Rata-rata 7 hari sebelumnya:
							<strong class="text-white">{data.movingAvg7Prev.toFixed(1)}</strong> /hari
						</p>
					</div>
					<div class="flex h-16 shrink-0 items-end gap-0.5 border-l border-slate-700 pl-3">
						{#each data.dailySeries as day (day.dayKey)}
							<div class="flex w-4 flex-col items-center gap-0.5">
								<div
									class="w-full rounded-t bg-slate-600/80"
									style="height: {Math.max(4, (day.count / chartMax) * 56)}px"
									title="{day.label}: {day.count} LHP"
								></div>
								<span class="max-w-[2rem] truncate text-[8px] text-slate-500">{day.label.split(' ')[0]}</span>
							</div>
						{/each}
						<div class="ml-1 flex w-5 flex-col items-center gap-0.5 border-l border-dashed border-slate-600 pl-1">
							<div
								class="w-full rounded-t bg-sky-500/90"
								style="height: {Math.max(4, (data.todayCount / chartMax) * 56)}px"
								title="Hari ini: {data.todayCount}"
							></div>
							<span class="text-[8px] font-semibold text-sky-400">ini</span>
						</div>
					</div>
				</div>
			</div>
		</div>

	<aside
		class="relative z-10 flex max-h-[min(50vh,420px)] w-full flex-col border-t border-slate-800 bg-slate-900/95 lg:max-h-none lg:w-[min(100%,380px)] lg:min-h-0 lg:shrink-0 lg:border-l lg:border-t-0"
	>
		<div class="border-b border-slate-800 px-3 py-2">
			<h2 class="text-xs font-semibold uppercase tracking-wide text-slate-400">Aliran LHP</h2>
			<p class="text-[10px] text-slate-500">Terbaru di wilayah Anda.</p>
		</div>
		<div class="flex-1 overflow-y-auto">
			{#if stream.length === 0}
				<p class="p-4 text-sm text-slate-500">Belum ada LHP.</p>
			{:else}
				<ul class="divide-y divide-slate-800">
					{#each stream as item (item.id)}
						<li class="px-3 py-2.5">
							<div class="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
								<span class="font-mono text-sky-300/90">#{item.id}</span>
								<span>{formatTime(item.createdAt)}</span>
								{#if item.diLuarRadius}
									<span class="rounded bg-rose-500/20 px-1.5 py-0.5 font-semibold text-rose-300"
										>Di luar radius</span
									>
								{/if}
							</div>
							<p class="mt-0.5 text-sm font-medium text-white">{item.judul}</p>
							<p class="text-[11px] text-slate-400">{item.polresNama} · {item.userNama}</p>
							<p class="mt-1 line-clamp-2 text-xs text-slate-300">{item.deskripsi}</p>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</aside>

	</div>
</div>

<style>
	:global(.leaflet-container) {
		z-index: 0;
	}
	:global(.lhp-wall-icon) {
		background: transparent !important;
		border: none !important;
	}
	:global(.lhp-wall-dot) {
		width: 14px;
		height: 14px;
		border-radius: 9999px;
		background: #38bdf8;
		box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.35);
		margin: 7px;
	}
	:global(.lhp-wall-dot--warn) {
		background: #fb7185;
		box-shadow: 0 0 0 3px rgba(251, 113, 133, 0.4);
	}
	:global(.lhp-wall-dot--stale) {
		background: #f59e0b;
		box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.45);
	}
	:global(.lhp-wall-dot--pulse) {
		animation: lhp-wall-pulse 1s ease-out 2;
	}
	@keyframes lhp-wall-pulse {
		0% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.85);
			opacity: 0.85;
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}
</style>
