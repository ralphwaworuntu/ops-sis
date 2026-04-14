<script lang="ts">
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
</script>

<svelte:head>
	<title>Monitoring Laporan — OPS SIS</title>
</svelte:head>

<div class="space-y-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
		<div>
			<h1 class="text-xl font-bold tracking-tight text-foreground md:text-2xl">Monitoring Laporan</h1>
			<p class="text-sm text-muted-foreground">{data.reports.length} laporan tercatat</p>
			<p class="mt-1 text-xs text-muted-foreground">
				Input lapangan personil POLSEK dilakukan melalui menu <strong>Giat Saya</strong>.
			</p>
		</div>

		{#if data.showSatwilFilter}
			<SatwilFilter polresList={data.polresList} />
		{/if}
	</div>

	{#if data.reports.length === 0}
		<div class="rounded-xl border border-border bg-card px-5 py-16 text-center shadow-sm">
			<svg class="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
				<path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
			</svg>
			<p class="text-sm text-muted-foreground">Belum ada laporan kegiatan.</p>
		</div>
	{:else}
		<div class="grid gap-4 md:grid-cols-2">
			{#each data.reports as report}
				<div class="rounded-xl border border-border bg-card shadow-sm">
					{#if report.fotoPath}
						<div class="aspect-video overflow-hidden rounded-t-xl bg-muted">
							<img
								src="/api/uploads{report.fotoPath}"
								alt="Foto kegiatan"
								class="h-full w-full object-cover"
							/>
						</div>
					{/if}
					<div class="p-4">
						<div class="mb-2 flex flex-wrap items-center gap-2">
							<span class="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
								{report.rengiatJudul}
							</span>
							{#if report.isBuktiLapangan}
								<span class="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800"
									>Bukti lapangan</span
								>
							{/if}
							{#if report.diLuarRadius}
								<span class="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-900"
									>Di luar radius</span
								>
							{/if}
							<span class="text-[10px] font-medium text-foreground"
								>Terploting: {report.jumlahTerploting ?? 0}</span
							>
						</div>
						<p class="text-sm text-foreground">{report.deskripsi}</p>
						<div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
							<span>{report.userNama}</span>
							<span>&middot;</span>
							<span>{report.unitNama}</span>
							<span>&middot;</span>
							<span>{formatDate(report.createdAt)}</span>
							{#if report.lat != null && report.lng != null}
								<span>&middot;</span>
								<a
									href="https://www.openstreetmap.org/?mlat={report.lat}&mlon={report.lng}#map=16/{report.lat}/{report.lng}"
									target="_blank"
									rel="noopener noreferrer"
									class="font-medium text-primary hover:underline"
								>
									Lokasi GPS
								</a>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
