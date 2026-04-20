<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	let { data, form } = $props();

	let loading = $state('');
	let showRejectForm = $state(false);

	const r = $derived(data.rengiatDetail);
	const kategoriInfo = $derived.by(() => kategoriBadge(r.kategori));

	const statusLabels: Record<string, string> = {
		Draft: 'Draf',
		PendingReview: 'Menunggu Review POLDA',
		PendingKabo: 'Menunggu ACC KARO OPS',
		Approved: 'Disetujui',
		Rejected: 'Ditolak'
	};

	const statusColors: Record<string, string> = {
		Draft: 'bg-slate-100 text-slate-700 border-slate-200',
		PendingReview: 'bg-amber-50 text-amber-800 border-amber-200',
		PendingKabo: 'bg-blue-50 text-blue-800 border-blue-200',
		Approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
		Rejected: 'bg-red-50 text-red-800 border-red-200'
	};

	function kategoriBadge(kategori: string | null | undefined) {
		const k = kategori ?? 'Rengiat Harian';
		if (
			k === 'Rengiat Pengamanan Objek Vital' ||
			k === 'Rengiat Pengamanan Tamu VIP' ||
			k === 'Rengiat Pengamanan Tamu VVIP'
		) {
			return { label: k, cls: 'bg-red-50 text-red-800 border-red-200' };
		}
		if (k === 'Rengiat Penanganan Zona Merah') {
			return { label: k, cls: 'bg-orange-50 text-orange-800 border-orange-200' };
		}
		return { label: k, cls: 'bg-yellow-50 text-yellow-800 border-yellow-200' };
	}

	const workflowSteps = [
		{ key: 'Draft', label: 'Draf' },
		{ key: 'PendingReview', label: 'Review' },
		{ key: 'PendingKabo', label: 'ACC KARO OPS' },
		{ key: 'Approved', label: 'Disetujui' }
	];

	const currentStep = $derived(
		r.status === 'Rejected' ? -1 : workflowSteps.findIndex((s) => s.key === r.status)
	);

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString('id-ID', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function enhanceAction(action: string) {
		return () => {
			loading = action;
			return async ({ update }: { update: () => Promise<void> }) => {
				loading = '';
				await update();
			};
		};
	}
</script>

<svelte:head>
	<title>{r.judul} — OPS SIS</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
	<!-- Back & Header -->
	<div>
		<a href="/dashboard/rengiat" class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Kembali
		</a>
	</div>

	{#if form?.error}
		<div class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
			{form.error}
		</div>
	{/if}

	<!-- Status Card -->
	<div class="rounded-xl border border-border bg-card p-5 shadow-sm">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<h1 class="text-xl font-bold text-foreground md:text-2xl">{r.judul}</h1>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<span>{r.polresNama}</span>
					<span>&middot;</span>
					<span>oleh {r.createdByNama}</span>
					<span>&middot;</span>
					<span>{formatDate(r.createdAt)}</span>
				</div>
				<div class="mt-2">
					<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold {kategoriInfo.cls}">
						{kategoriInfo.label}
					</span>
				</div>
				<p class="mt-2 text-sm text-foreground">
					Target plotting: <strong>{r.jumlahRencanaPlotting ?? 0}</strong>
				</p>
			</div>
			<span class="inline-flex shrink-0 items-center rounded-lg border px-3 py-1.5 text-sm font-semibold {statusColors[r.status]}">
				{statusLabels[r.status]}
			</span>
		</div>

		<!-- Workflow Progress -->
		{#if r.status !== 'Rejected'}
			<div class="mt-5 flex items-center gap-1">
				{#each workflowSteps as step, i}
					<div class="flex flex-1 items-center gap-1">
						<div
							class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold {i <= currentStep
								? 'bg-primary text-primary-foreground'
								: 'bg-muted text-muted-foreground'}"
						>
							{#if i < currentStep}
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
							{:else}
								{i + 1}
							{/if}
						</div>
						{#if i < workflowSteps.length - 1}
							<div class="h-0.5 flex-1 rounded {i < currentStep ? 'bg-primary' : 'bg-muted'}"></div>
						{/if}
					</div>
				{/each}
			</div>
			<div class="mt-1 flex">
				{#each workflowSteps as step, i}
					<div class="flex-1 text-center text-[10px] text-muted-foreground {i <= currentStep ? 'font-medium text-foreground' : ''}">{step.label}</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="grid gap-6 lg:grid-cols-5">
		<!-- Main Content -->
		<div class="space-y-4 lg:col-span-3">
			<!-- Description -->
			<div class="rounded-xl border border-border bg-card p-5 shadow-sm">
				<h2 class="mb-2 text-sm font-semibold text-foreground">Deskripsi Rencana</h2>
				<p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{r.deskripsi}</p>
			</div>

			{#if data.user?.role === 'POLRES' && r.status === 'Draft'}
				<div class="rounded-xl border border-border bg-card p-5 shadow-sm">
					<h2 class="mb-3 text-sm font-semibold text-foreground">Target plotting</h2>
					<form method="POST" action="?/updateDraftMeta" use:enhance={enhanceAction('draftmeta')} class="space-y-3">
						<div class="flex flex-wrap items-end gap-3">
							<div class="min-w-[140px] flex-1">
								<label for="jrp" class="text-xs text-muted-foreground">Jumlah rencana plotting</label>
								<input
									id="jrp"
									name="jumlah_rencana_plotting"
									type="number"
									min="0"
									step="1"
									value={r.jumlahRencanaPlotting ?? 0}
									class="mt-1 flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
								/>
							</div>
							<button
								type="submit"
								disabled={loading === 'draftmeta'}
								class="h-10 rounded-lg border border-border bg-muted px-4 text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
							>
								{loading === 'draftmeta' ? 'Menyimpan...' : 'Simpan target & titik acuan'}
							</button>
						</div>
						<p class="text-[11px] text-muted-foreground">
							Titik acuan geo-fence (opsional). Kosong = pakai koordinat markas POLRES.
						</p>
						<div class="grid gap-2 sm:grid-cols-2">
							<div>
								<label for="alat" class="text-xs text-muted-foreground">Anchor lat</label>
								<input
									id="alat"
									name="anchor_lat"
									type="text"
									inputmode="decimal"
									value={r.anchorLat ?? ''}
									placeholder="-6.2615"
									class="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
								/>
							</div>
							<div>
								<label for="alng" class="text-xs text-muted-foreground">Anchor lng</label>
								<input
									id="alng"
									name="anchor_lng"
									type="text"
									inputmode="decimal"
									value={r.anchorLng ?? ''}
									placeholder="106.7816"
									class="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
								/>
							</div>
						</div>
						<div class="sm:col-span-2">
							<label for="opselesai" class="text-xs text-muted-foreground">Batas waktu operasi (untuk deteksi LHP tertunda)</label>
							<input
								id="opselesai"
								name="operasi_selesai"
								type="datetime-local"
								value={r.operasiSelesai ? r.operasiSelesai.slice(0, 16) : ''}
								class="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
							/>
						</div>
					</form>
				</div>
			{/if}

			<!-- AI Analysis -->
			{#if r.aiAnalysis}
				<div class="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
					<div class="mb-2 flex items-center gap-2">
						<svg class="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
						</svg>
						<h2 class="text-sm font-semibold text-blue-800">Analisis AI</h2>
					</div>
					<p class="whitespace-pre-wrap text-sm leading-relaxed text-blue-900/80">{r.aiAnalysis}</p>
				</div>
			{/if}

			<!-- Final Plan -->
			{#if r.finalPlan}
				<div class="rounded-xl border border-accent/40 bg-accent/5 p-5 shadow-sm">
					<div class="mb-2 flex items-center gap-2">
						<svg class="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
						</svg>
						<h2 class="text-sm font-semibold text-amber-800">Rencana Taktis (AI Generated)</h2>
					</div>
					<p class="whitespace-pre-wrap text-sm leading-relaxed text-amber-900/80">{r.finalPlan}</p>
				</div>
			{/if}

			<!-- Rejection Note -->
			{#if r.rejectionNote}
				<div class="rounded-xl border border-destructive/30 bg-destructive/5 p-5 shadow-sm">
					<h2 class="mb-2 text-sm font-semibold text-destructive">Catatan Penolakan</h2>
					<p class="text-sm text-destructive/80">{r.rejectionNote}</p>
				</div>
			{/if}
		</div>

		<!-- Actions Sidebar -->
		<div class="space-y-4 lg:col-span-2">
			<!-- Nearby vulnerability points -->
			<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
				<h3 class="mb-2 text-sm font-semibold text-foreground">Titik Rawan Wilayah</h3>
				{#if data.nearbyPoints.length === 0}
					<p class="text-xs text-muted-foreground">Belum ada data titik rawan.</p>
				{:else}
					<div class="space-y-2">
						{#each data.nearbyPoints as pt}
							<div class="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
								<span class="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
									{pt.jenisKejahatan}
								</span>
								<span class="text-xs text-muted-foreground">×{pt.frekuensi}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Action Buttons -->
			<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
				<h3 class="mb-3 text-sm font-semibold text-foreground">Aksi</h3>
				<div class="space-y-2">
					<!-- POLRES: Submit for review -->
					{#if data.user?.role === 'POLRES' && r.status === 'Draft'}
						<form method="POST" action="?/submit" use:enhance={enhanceAction('submit')}>
							<button
								type="submit"
								disabled={loading === 'submit'}
								class="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
							>
								{loading === 'submit' ? 'Mengirim...' : 'Ajukan untuk Review'}
							</button>
						</form>
					{/if}

					<!-- AI Analyze -->
					{#if ['POLRES', 'POLDA'].includes(data.user?.role ?? '') && ['Draft', 'PendingReview'].includes(r.status)}
						<form method="POST" action="?/analyze" use:enhance={enhanceAction('analyze')}>
							<button
								type="submit"
								disabled={loading === 'analyze'}
								class="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 text-sm font-medium text-blue-700 transition-all hover:bg-blue-100 disabled:opacity-50"
							>
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
								</svg>
								{loading === 'analyze' ? 'Menganalisis...' : 'AI Auditor'}
							</button>
						</form>
					{/if}

					<!-- POLDA: Generate tactical plan -->
					{#if data.user?.role === 'POLDA' && ['PendingReview', 'PendingKabo'].includes(r.status)}
						<form method="POST" action="?/generate" use:enhance={enhanceAction('generate')}>
							<button
								type="submit"
								disabled={loading === 'generate'}
								class="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-accent/50 bg-accent/10 text-sm font-medium text-amber-800 transition-all hover:bg-accent/20 disabled:opacity-50"
							>
								{loading === 'generate' ? 'Generating...' : 'AI Generate Rencana Taktis'}
							</button>
						</form>
					{/if}

					<!-- POLDA: Approve to KARO OPS -->
					{#if data.user?.role === 'POLDA' && r.status === 'PendingReview'}
						<form method="POST" action="?/approve_polda" use:enhance={enhanceAction('approve_polda')}>
							<button
								type="submit"
								disabled={loading === 'approve_polda'}
								class="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-medium text-white transition-all hover:bg-emerald-700 disabled:opacity-50"
							>
								{loading === 'approve_polda' ? 'Memproses...' : 'Teruskan ke KARO OPS'}
							</button>
						</form>
					{/if}

					<!-- KARO OPS: Final Approval -->
					{#if data.user?.role === 'KARO OPS' && r.status === 'PendingKabo'}
						<form method="POST" action="?/approve_karoops" use:enhance={enhanceAction('approve_karoops')}>
							<button
								type="submit"
								disabled={loading === 'approve_karoops'}
								class="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-bold text-accent-foreground transition-all hover:bg-accent/90 disabled:opacity-50"
							>
								{loading === 'approve_karoops' ? 'Memproses...' : 'ACC — Setujui Rengiat'}
							</button>
						</form>
					{/if}

					<!-- Reject (POLDA / KARO OPS) -->
					{#if ['POLDA', 'KARO OPS'].includes(data.user?.role ?? '') && ['PendingReview', 'PendingKabo'].includes(r.status)}
						{#if !showRejectForm}
							<button
								onclick={() => (showRejectForm = true)}
								class="flex h-10 w-full items-center justify-center rounded-lg border border-destructive/30 text-sm font-medium text-destructive transition-all hover:bg-destructive/10"
							>
								Tolak
							</button>
						{:else}
							<form method="POST" action="?/reject" use:enhance={enhanceAction('reject')} class="space-y-2">
								<textarea
									name="note"
									rows="3"
									placeholder="Alasan penolakan..."
									class="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
								></textarea>
								<div class="flex gap-2">
									<button
										type="submit"
										class="flex h-9 flex-1 items-center justify-center rounded-lg bg-destructive text-sm font-medium text-white"
									>
										Konfirmasi Tolak
									</button>
									<button
										type="button"
										onclick={() => (showRejectForm = false)}
										class="flex h-9 flex-1 items-center justify-center rounded-lg border border-border text-sm text-muted-foreground"
									>
										Batal
									</button>
								</div>
							</form>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
