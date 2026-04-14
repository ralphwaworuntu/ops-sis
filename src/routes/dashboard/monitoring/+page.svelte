<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import SatwilFilter from '$lib/components/SatwilFilter.svelte';

	let { data } = $props();

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('id-ID', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
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
								<th class="px-4 py-2 text-right">Rencana plot</th>
								<th class="px-4 py-2 text-right">Terploting (laporan)</th>
								<th class="px-4 py-2 text-right">Laporan</th>
								<th class="px-4 py-2 text-right">Bukti</th>
								<th class="px-4 py-2 text-right">+GPS</th>
								<th class="px-4 py-2 text-right">Luar radius</th>
								<th class="px-4 py-2">Status</th>
							</tr>
						</thead>
						<tbody>
							{#each data.comparisons as row}
								<tr class="border-b border-border/80 hover:bg-muted/20">
									<td class="px-4 py-2.5 font-medium text-foreground">{row.judul}</td>
									<td class="px-4 py-2.5 text-muted-foreground">{row.polresNama}</td>
									<td class="px-4 py-2.5 text-right tabular-nums">{row.jumlahRencanaPlotting ?? 0}</td>
									<td class="px-4 py-2.5 text-right tabular-nums">{row.sumPlot}</td>
									<td class="px-4 py-2.5 text-right tabular-nums">{row.count}</td>
									<td class="px-4 py-2.5 text-right tabular-nums">{row.buktiCount}</td>
									<td class="px-4 py-2.5 text-right tabular-nums">{row.withGps}</td>
									<td class="px-4 py-2.5 text-right tabular-nums">
										{#if row.outRadiusCount > 0}
											<span
												class="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-900"
												>Di luar radius: {row.outRadiusCount}</span
											>
										{:else}
											0
										{/if}
									</td>
									<td class="px-4 py-2.5">
										{#if row.ok}
											<span
												class="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800"
												>Memenuhi</span
											>
										{:else}
											<span
												class="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
												>Perlu tindak</span
											>
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
									<span class="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800"
										>Bukti lapangan</span
									>
								{/if}
								{#if rep.diLuarRadius}
									<span class="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-900"
										>Di luar radius</span
									>
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
