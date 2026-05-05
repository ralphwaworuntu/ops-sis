<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import SatwilFilter from '$lib/components/SatwilFilter.svelte';

	let { data } = $props();

	let showPointModal = $state<number | null>(null);

	const modalPoint = $derived(
		showPointModal != null ? data.vulnPointsMap?.[showPointModal] ?? null : null
	);

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('id-ID', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function kategoriBadge(kategori: string | null | undefined) {
		const k = kategori ?? 'Rengiat Harian';
		if (k === 'Rengiat Pengamanan Tamu VVIP') return { label: 'VVIP', cls: 'kat-badge-vvip' };
		if (k === 'Rengiat Pengamanan Tamu VIP') return { label: 'VIP', cls: 'bg-red-100 text-red-800' };
		if (k === 'Rengiat Pengamanan Objek Vital') return { label: 'Objek Vital', cls: 'bg-red-100 text-red-800' };
		if (k === 'Rengiat Penanganan Zona Merah') return { label: 'Zona Merah', cls: 'kat-badge-zona-merah' };
		return { label: 'Harian', cls: 'bg-yellow-100 text-yellow-800' };
	}

	onMount(() => {
		if (data.mode !== 'polres') return;
		const t = setInterval(() => void invalidateAll(), 60000);
		return () => clearInterval(t);
	});
</script>

<svelte:head>
	<title>Monitoring — OPS SIS</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-3">
		<div>
			<h1 class="text-xl font-bold tracking-tight text-foreground md:text-2xl">Monitoring</h1>
			{#if data.mode === 'polres'}
				<p class="text-sm text-muted-foreground">
					Kabag Ops: personil POLSEK yang sedang <strong>Mulai Giat</strong> di lapangan — pembaruan via SSE &
					refresh otomatis per menit.
				</p>
			{:else}
				<p class="text-sm text-muted-foreground">
					Bandingkan target plotting Rengiat dengan laporan lapangan (termasuk bukti foto & koordinat GPS).
				</p>
			{/if}
		</div>
		{#if data.mode === 'polda'}
			<SatwilFilter polresList={data.polresList} />
		{/if}
	</div>

	{#if data.mode === 'polres'}
		<div class="rounded-xl border border-primary/25 bg-primary/5 shadow-sm">
			<div class="border-b border-border px-4 py-3">
				<h2 class="text-sm font-semibold text-foreground">Personil aktif di lapangan</h2>
				<p class="text-xs text-muted-foreground">
					Check-in giat (koordinat &amp; waktu mulai). Heartbeat diperbarui dari aplikasi lapangan.
				</p>
			</div>
			{#if data.fieldActive.length === 0}
				<p class="px-4 py-10 text-center text-sm text-muted-foreground">
					Tidak ada personil POLSEK dengan sesi giat aktif.
				</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full min-w-[640px] text-left text-sm">
						<thead class="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
							<tr>
								<th class="px-4 py-2">Personil</th>
								<th class="px-4 py-2">NRP</th>
								<th class="px-4 py-2">POLSEK</th>
								<th class="px-4 py-2">Rengiat</th>
								<th class="px-4 py-2">Mulai</th>
								<th class="px-4 py-2">Heartbeat</th>
								<th class="px-4 py-2">Koordinat awal</th>
							</tr>
						</thead>
						<tbody>
							{#each data.fieldActive as row}
								<tr class="border-b border-border/80 hover:bg-muted/20">
									<td class="px-4 py-2.5 font-medium text-foreground">{row.userNama}</td>
									<td class="px-4 py-2.5 font-mono text-xs text-muted-foreground">{row.userNrp || '—'}</td>
									<td class="px-4 py-2.5 text-muted-foreground">{row.polsekNama}</td>
									<td class="px-4 py-2.5 text-foreground">{row.rengiatJudul}</td>
									<td class="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(row.startedAt)}</td>
									<td class="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(row.lastHeartbeatAt)}</td>
									<td class="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
										{row.startLat.toFixed(5)}, {row.startLng.toFixed(5)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Pending Review — sorted by urgency (HIGH first) -->
		{#if data.pendingReview && data.pendingReview.length > 0}
			<div class="rounded-xl border border-border bg-card shadow-sm">
				<div class="border-b border-border px-4 py-3">
					<h2 class="text-sm font-semibold text-foreground">Menunggu Review</h2>
					<p class="text-xs text-muted-foreground">
						Rengiat dengan <span class="font-medium text-red-700">urgensi tinggi</span> otomatis muncul di atas.
					</p>
				</div>
				<div class="divide-y divide-border">
					{#each data.pendingReview as row}
						{@const kb = kategoriBadge(row.kategori)}
						<div
							class="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20 {row.urgency === 'HIGH' ? 'border-l-4 border-l-red-500 bg-red-50/40' : ''}"
						>
							<div class="min-w-0 flex-1">
								<a href="/dashboard/rengiat/{row.id}" class="text-sm font-semibold text-foreground hover:text-primary hover:underline">
									{row.judul}
								</a>
								<div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
									<span>{row.polresNama}</span>
									<span>&middot;</span>
									<span class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold {kb.cls}">{kb.label}</span>
									{#if row.urgency === 'HIGH'}
										<span class="monitoring-priority-badge inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
											<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
											</svg>
											PRIORITAS POLDA
										</span>
									{/if}
									{#if row.requiresPoldaApproval}
										<span class="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Review POLDA</span>
									{/if}
								</div>
							</div>
							<div class="flex shrink-0 items-center gap-2">
								{#if row.targetPointId != null && data.vulnPointsMap?.[row.targetPointId]}
									<button
										type="button"
										class="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
										onclick={() => { showPointModal = row.targetPointId; }}
									>
										<svg class="h-3.5 w-3.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
											<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
										</svg>
										Lihat Titik Rawan
									</button>
								{/if}
								<a
									href="/dashboard/rengiat/{row.id}"
									class="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
								>
									Review
								</a>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Rencana vs realisasi -->
		<div class="rounded-xl border border-border bg-card shadow-sm">
			<div class="border-b border-border px-4 py-3">
				<h2 class="text-sm font-semibold text-foreground">Rencana vs realisasi (Rengiat disetujui)</h2>
				<p class="text-xs text-muted-foreground">
					Status hijau: realisasi memenuhi target plotting dan minimal satu laporan ditandai sebagai bukti lapangan.
				</p>
			</div>
			<div class="overflow-x-auto">
				{#if data.comparisons.length === 0}
					<p class="px-4 py-8 text-center text-sm text-muted-foreground">
						Tidak ada Rengiat disetujui untuk filter ini.
					</p>
				{:else}
					<table class="w-full min-w-[720px] text-left text-sm">
						<thead class="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
							<tr>
								<th class="px-4 py-2">Rengiat</th>
								<th class="px-4 py-2">POLRES</th>
								<th class="px-4 py-2">Kategori</th>
								<th class="px-4 py-2 text-right">Rencana plot</th>
								<th class="px-4 py-2 text-right">Terploting</th>
								<th class="px-4 py-2 text-right">Laporan</th>
								<th class="px-4 py-2 text-right">Bukti</th>
								<th class="px-4 py-2 text-right">+GPS</th>
								<th class="px-4 py-2 text-right">Luar radius</th>
								<th class="px-4 py-2">Status</th>
							</tr>
						</thead>
						<tbody>
							{#each data.comparisons as row}
								{@const kb = kategoriBadge(row.kategori)}
								<tr class="border-b border-border/80 hover:bg-muted/20 {row.urgency === 'HIGH' ? 'bg-red-50/30' : ''}">
									<td class="px-4 py-2.5">
										<a href="/dashboard/rengiat/{row.id}" class="font-medium text-foreground hover:text-primary hover:underline">{row.judul}</a>
									</td>
									<td class="px-4 py-2.5 text-muted-foreground">{row.polresNama}</td>
									<td class="px-4 py-2.5">
										<span class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold {kb.cls}">{kb.label}</span>
										{#if row.targetPointId != null && data.vulnPointsMap?.[row.targetPointId]}
											<button
												type="button"
												class="ml-1 text-[10px] font-medium text-red-600 underline decoration-dotted hover:text-red-800"
												onclick={() => { showPointModal = row.targetPointId; }}
											>
												Titik Rawan
											</button>
										{/if}
									</td>
									<td class="px-4 py-2.5 text-right tabular-nums">{row.jumlahRencanaPlotting ?? 0}</td>
									<td class="px-4 py-2.5 text-right tabular-nums">{row.sumPlot}</td>
									<td class="px-4 py-2.5 text-right tabular-nums">{row.count}</td>
									<td class="px-4 py-2.5 text-right tabular-nums">{row.buktiCount}</td>
									<td class="px-4 py-2.5 text-right tabular-nums">{row.withGps}</td>
									<td class="px-4 py-2.5 text-right tabular-nums">
										{#if row.outRadiusCount > 0}
											<span class="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-900">Di luar radius: {row.outRadiusCount}</span>
										{:else}
											0
										{/if}
									</td>
									<td class="px-4 py-2.5">
										{#if row.ok}
											<span class="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Memenuhi</span>
										{:else}
											<span class="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Perlu tindak</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>

		<div>
			<h2 class="mb-3 text-sm font-semibold text-foreground">Bukti & laporan lapangan terbaru</h2>
			{#if data.reports.length === 0}
				<div class="rounded-xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
					Belum ada laporan untuk Rengiat yang terfilter.
				</div>
			{:else}
				<div class="grid gap-4 md:grid-cols-2">
					{#each data.reports as rep}
						<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
							<div class="mb-2 flex flex-wrap items-center gap-2">
								<span class="text-xs font-medium text-foreground">{rep.userNama}</span>
								{#if rep.isBuktiLapangan}
									<span class="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">Bukti lapangan</span>
								{/if}
								{#if rep.diLuarRadius}
									<span class="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-900">Di luar radius</span>
								{/if}
								<span class="text-[11px] text-muted-foreground">{formatDate(rep.createdAt)}</span>
							</div>
							<p class="text-sm text-foreground/90">{rep.deskripsi}</p>
							<div class="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
								{#if rep.distanceMeters != null && rep.diLuarRadius}
									<span class="text-rose-800">Jarak ~{Math.round(rep.distanceMeters)} m dari titik acuan</span>
								{/if}
								<span>Terploting: <strong class="text-foreground">{rep.jumlahTerploting ?? 0}</strong></span>
								{#if rep.lat != null && rep.lng != null}
									<a
										href="https://www.openstreetmap.org/?mlat={rep.lat}&mlon={rep.lng}#map=16/{rep.lat}/{rep.lng}"
										target="_blank"
										rel="noopener noreferrer"
										class="font-medium text-primary hover:underline"
									>
										Lihat lokasi (GPS)
									</a>
								{:else}
									<span>Tanpa koordinat</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Titik Rawan Detail Modal -->
{#if showPointModal != null && modalPoint}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
		aria-label="Detail titik rawan"
		onclick={() => { showPointModal = null; }}
		onkeydown={(e) => { if (e.key === 'Escape') showPointModal = null; }}
	>
		<div
			class="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={() => {}}
			role="document"
		>
			<button
				type="button"
				class="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				onclick={() => { showPointModal = null; }}
				aria-label="Tutup"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<div class="flex items-center gap-2">
				<div class="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
					<svg class="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
					</svg>
				</div>
				<h3 class="text-lg font-bold text-foreground">Detail Titik Rawan</h3>
			</div>

			<div class="mt-4 space-y-3">
				<div class="rounded-lg bg-muted/50 p-3">
					<p class="text-xs font-medium text-muted-foreground">Jenis Kejahatan</p>
					<p class="text-sm font-semibold text-foreground">{modalPoint.jenisKejahatan}</p>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="rounded-lg bg-muted/50 p-3">
						<p class="text-xs font-medium text-muted-foreground">Frekuensi</p>
						<p class="text-sm font-semibold text-foreground">{modalPoint.frekuensi}×</p>
					</div>
					<div class="rounded-lg bg-muted/50 p-3">
						<p class="text-xs font-medium text-muted-foreground">Koordinat</p>
						<p class="font-mono text-xs text-foreground">{modalPoint.lat.toFixed(5)}, {modalPoint.lng.toFixed(5)}</p>
					</div>
				</div>
				{#if modalPoint.keterangan}
					<div class="rounded-lg bg-muted/50 p-3">
						<p class="text-xs font-medium text-muted-foreground">Keterangan</p>
						<p class="text-sm text-foreground">{modalPoint.keterangan}</p>
					</div>
				{/if}
				<a
					href="https://www.openstreetmap.org/?mlat={modalPoint.lat}&mlon={modalPoint.lng}#map=16/{modalPoint.lat}/{modalPoint.lng}"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
					</svg>
					Buka di OpenStreetMap
				</a>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(.kat-badge-vvip) {
		background: linear-gradient(135deg, #fef3c7, #fde68a);
		color: #92400e;
		border: 1px solid #f59e0b;
		font-weight: 700;
	}
	:global(.kat-badge-zona-merah) {
		background: #fef2f2;
		color: #991b1b;
		animation: badge-pulse 2s ease-in-out infinite;
	}
	:global(.monitoring-priority-badge) {
		animation: priority-pulse 1.5s ease-in-out infinite;
	}
	@keyframes badge-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}
	@keyframes priority-pulse {
		0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
		50% { opacity: 0.85; box-shadow: 0 0 0 4px rgba(239, 68, 68, 0); }
	}
</style>
