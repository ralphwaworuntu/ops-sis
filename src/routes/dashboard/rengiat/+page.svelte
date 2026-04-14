<script lang="ts">
	import SatwilFilter from '$lib/components/SatwilFilter.svelte';

	let { data } = $props();

	let filterStatus = $state('all');

	const statusLabels: Record<string, string> = {
		Draft: 'Draf',
		PendingReview: 'Menunggu Review',
		PendingKabo: 'Menunggu ACC KARO OPS',
		Approved: 'Disetujui',
		Rejected: 'Ditolak'
	};

	const statusColors: Record<string, string> = {
		Draft: 'bg-slate-100 text-slate-700',
		PendingReview: 'bg-amber-100 text-amber-800',
		PendingKabo: 'bg-blue-100 text-blue-800',
		Approved: 'bg-emerald-100 text-emerald-800',
		Rejected: 'bg-red-100 text-red-800'
	};

	const filteredList = $derived(
		filterStatus === 'all'
			? data.rengiatList
			: data.rengiatList.filter((r) => r.status === filterStatus)
	);

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('id-ID', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Rengiat — OPS SIS</title>
</svelte:head>

<div class="space-y-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-xl font-bold tracking-tight text-foreground md:text-2xl">
				{#if data.user?.role === 'KARO OPS'}
					Approval Rengiat
				{:else if data.user?.role === 'POLDA'}
					Review Rengiat
				{:else}
					Rengiat
				{/if}
			</h1>
			<p class="text-sm text-muted-foreground">{data.rengiatList.length} total rencana kegiatan</p>
		</div>

		{#if data.showSatwilFilter}
			<div class="w-full sm:w-auto">
				<SatwilFilter polresList={data.polresList} />
			</div>
		{/if}

		{#if data.user?.role === 'POLRES'}
			<a
				href="/dashboard/rengiat/baru"
				class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				Buat Rengiat
			</a>
		{/if}
	</div>

	<!-- Status filter -->
	<div class="flex flex-wrap gap-2">
		<button
			onclick={() => (filterStatus = 'all')}
			class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors {filterStatus === 'all'
				? 'bg-primary text-primary-foreground'
				: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
		>
			Semua
		</button>
		{#each Object.entries(statusLabels) as [key, label]}
			<button
				onclick={() => (filterStatus = key)}
				class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors {filterStatus === key
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
			>
				{label}
			</button>
		{/each}
	</div>

	<!-- List -->
	{#if filteredList.length === 0}
		<div class="rounded-xl border border-border bg-card px-5 py-16 text-center shadow-sm">
			<svg class="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
			</svg>
			<p class="text-sm text-muted-foreground">Tidak ada rengiat ditemukan.</p>
		</div>
	{:else}
		<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			{#each filteredList as item}
				<a
					href="/dashboard/rengiat/{item.id}"
					class="group rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/20 hover:shadow-md"
				>
					<div class="mb-2 flex items-start justify-between gap-2">
						<h3 class="text-sm font-semibold text-foreground group-hover:text-primary">{item.judul}</h3>
						<span class="shrink-0 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold {statusColors[item.status]}">
							{statusLabels[item.status]}
						</span>
					</div>
					<p class="line-clamp-2 text-xs text-muted-foreground">{item.deskripsi}</p>
					<div class="mt-2 text-[11px] text-muted-foreground">
						Rencana plotting: <span class="font-semibold text-foreground">{item.jumlahRencanaPlotting ?? 0}</span>
					</div>
					<div class="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
						<span>{item.polresNama}</span>
						<span>&middot;</span>
						<span>{formatDate(item.createdAt)}</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>
