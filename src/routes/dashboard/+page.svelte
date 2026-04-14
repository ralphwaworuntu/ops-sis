<script lang="ts">
	import { onMount } from 'svelte';
	import { activityFeed, type FeedItem } from '$lib/stores/activity-feed';
	import PolsekMiniMap from '$lib/components/PolsekMiniMap.svelte';
	import { lhpOutboxCount } from '$lib/stores/lhp-outbox-status';

	let { data } = $props();

	let outboxN = $state(0);
	let feedItems = $state<FeedItem[]>([]);

	onMount(() => {
		const u1 = lhpOutboxCount.subscribe((n) => (outboxN = n));
		const u2 = activityFeed.subscribe((v) => (feedItems = v));
		return () => {
			u1();
			u2();
		};
	});

	const statusLabels: Record<string, string> = {
		Draft: 'Draf',
		PendingReview: 'Menunggu Review',
		PendingKabo: 'Menunggu ACC',
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

	const statCards = $derived.by(() => {
		const sc = data.stats.statusCounts as Record<string, number>;
		return [
		{
			label: 'Titik Rawan',
			value: data.stats.totalVulnerability,
			icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
			color: 'text-red-600 bg-red-50'
		},
		{
			label: 'Rengiat Disetujui',
			value: sc['Approved'] ?? 0,
			icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
			color: 'text-emerald-600 bg-emerald-50'
		},
		{
			label: 'Menunggu Review',
			value: (sc['PendingReview'] ?? 0) + (sc['PendingKabo'] ?? 0),
			icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
			color: 'text-amber-600 bg-amber-50'
		},
		{
			label: 'Laporan Giat',
			value: data.stats.totalReports,
			icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
			color: 'text-blue-600 bg-blue-50'
		}
	];
	});

	function radarPolygon(kpi: { volume: number; bukti: number; gps: number }): string {
		const cx = 50;
		const cy = 50;
		const maxR = 32;
		const angles = [-90, 30, 150].map((d) => (d * Math.PI) / 180);
		const vals = [kpi.volume, kpi.bukti, kpi.gps].map((x) => (Math.min(100, x) / 100) * maxR);
		const pts = angles.map((ang, i) => {
			const r = vals[i];
			return `${cx + r * Math.cos(ang)},${cy + r * Math.sin(ang)}`;
		});
		return pts.join(' ');
	}

	function formatFeedTime(iso: string) {
		return new Date(iso).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Selamat datang, {data.user?.nama}.
			{#if data.roleView === 'polsek' && data.polsekAwareness}
				<strong class="text-foreground">Apa yang harus anggota lakukan hari ini?</strong> Ringkasan tugas, hotspot LP, dan
				banding KPI terhadap rata-rata POLRES.
			{:else if data.roleView === 'polres'}
				Verifikasi LHP, leaderboard POLSEK (LHP terverifikasi minggu ini), dan ringkasan wilayah Anda.
			{:else}
				Berikut ringkasan operasional.
			{/if}
		</p>
	</div>

	{#if data.roleView === 'polsek' && data.polsekAwareness}
		{@const pa = data.polsekAwareness}
		<div class="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
			<p class="font-semibold text-foreground">
				Terhubung ke <span class="text-primary">{pa.polresNama}</span>
			</p>
			<p class="mt-1 text-xs text-muted-foreground">
				Data operasional {pa.polsekNama} terlihat oleh pimpinan di tingkat POLRES sesuai hierarki komando.
			</p>
		</div>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
			<div class="rounded-xl border border-blue-200/90 bg-blue-50/80 p-4 shadow-sm">
				<p class="text-xs font-medium uppercase tracking-wide text-blue-900/85">Pending ACC</p>
				<p class="mt-1 text-3xl font-bold text-blue-950">{pa.pendingAcc}</p>
				<p class="mt-1 text-xs text-blue-900/85">
					Rengiat di POLRES yang masih menunggu review / ACC — pantau di daftar bawah.
				</p>
			</div>
			<div class="rounded-xl border border-emerald-200/90 bg-emerald-50/80 p-4 shadow-sm">
				<p class="text-xs font-medium uppercase tracking-wide text-emerald-900/85">Ready to Execute</p>
				<p class="mt-1 text-3xl font-bold text-emerald-950">{pa.readyExecute}</p>
				<p class="mt-1 text-xs text-emerald-900/85">
					Rengiat <strong>disetujui</strong> — siap giat &amp; LHP. Aktif 24 jam terakhir:
					<strong>{pa.giatHariIni}</strong>.
				</p>
			</div>
			<div class="rounded-xl border border-amber-200/80 bg-amber-50/80 p-4 shadow-sm">
				<p class="text-xs font-medium uppercase tracking-wide text-amber-900/80">Laporan tertunda</p>
				<p class="mt-1 text-3xl font-bold text-amber-950">{pa.laporanTertunda}</p>
				<p class="mt-1 text-xs text-amber-900/80">
					Jadwal lewat / ambang tanpa LHP tersinkron di server. Antre lokal perangkat:
					<strong>{outboxN}</strong> (kirim dari <a href="/dashboard/giat-saya" class="underline">Giat Saya</a>).
				</p>
			</div>
		</div>

		<div class="grid gap-4 lg:grid-cols-5">
			<div class="lg:col-span-3">
				<PolsekMiniMap center={pa.miniMapCenter} hotspots={pa.lpHotspots} />
			</div>
			<div class="rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-2">
				<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">KPI vs rata-rata POLRES</p>
				<p class="mt-2 text-2xl font-bold text-foreground">
					{#if pa.kpiPolsekCombined != null}
						Skor gabungan Anda: <span class="text-primary">{pa.kpiPolsekCombined}</span>
						<span class="text-base font-normal text-muted-foreground">/100</span>
					{:else}
						<span class="text-base font-normal text-muted-foreground">Belum ada LHP minggu ini — isi laporan untuk skor.</span>
					{/if}
				</p>
				{#if pa.kpiPolresRata != null}
					<p class="mt-2 text-sm text-muted-foreground">
						Rata-rata personil POLSEK lain di <strong class="text-foreground">{pa.polresNama}</strong>:
						<span class="font-semibold text-foreground">{pa.kpiPolresRata}</span>/100
						{#if pa.kpiPolsekCombined != null}
							<span class="ml-1">
								({pa.kpiPolsekCombined >= pa.kpiPolresRata ? 'di atas' : 'di bawah'} rata-rata)
							</span>
						{/if}
					</p>
				{:else}
					<p class="mt-2 text-sm text-muted-foreground">
						Belum ada cukup data POLSEK lain untuk rata-rata — tetap disiplin LHP untuk pimpinan melihat kinerja.
					</p>
				{/if}
				<div class="mt-4 flex items-center gap-3 border-t border-border pt-4">
					<svg viewBox="0 0 100 100" class="h-24 w-24 shrink-0 text-emerald-600">
						<polygon
							fill="currentColor"
							fill-opacity="0.2"
							stroke="currentColor"
							stroke-width="1.5"
							points={radarPolygon(pa.kpiRadar)}
						/>
						<circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" stroke-opacity="0.15" />
						<line x1="50" y1="50" x2="50" y2="18" stroke="currentColor" stroke-opacity="0.2" />
						<line x1="50" y1="50" x2="77.7" y2="66" stroke="currentColor" stroke-opacity="0.2" />
						<line x1="50" y1="50" x2="22.3" y2="66" stroke="currentColor" stroke-opacity="0.2" />
					</svg>
					<div class="min-w-0 text-[11px] text-muted-foreground">
						<p><span class="font-medium text-foreground">Volume</span> · intensitas LHP minggu ini</p>
						<p><span class="font-medium text-foreground">Bukti</span> · % berfoto</p>
						<p><span class="font-medium text-foreground">GPS</span> · % berkoordinat</p>
						<p class="mt-2 text-[10px]">Sampel: {pa.kpiRadar.sampleSize} LHP</p>
					</div>
				</div>
			</div>
		</div>

		<div class="grid gap-4 lg:grid-cols-2">
			<div class="rounded-xl border border-border bg-card shadow-sm">
				<div class="border-b border-border px-4 py-3">
					<h2 class="text-sm font-semibold text-foreground">Log notifikasi (SSE)</h2>
					<p class="text-xs text-muted-foreground">Perintah &amp; persetujuan Rengiat untuk wilayah Anda.</p>
				</div>
				<div class="max-h-56 overflow-y-auto px-4 py-2">
					{#if feedItems.length === 0}
						<p class="py-6 text-center text-sm text-muted-foreground">Belum ada entri — notifikasi real-time muncul di sini.</p>
					{:else}
						<ul class="space-y-2">
							{#each feedItems as it (it.id)}
								<li class="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
									<p class="text-[10px] text-muted-foreground">{formatFeedTime(it.at)}</p>
									<p class="text-foreground">{it.message}</p>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
			<div class="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
				<p class="font-medium text-foreground">Cakupan data</p>
				<p class="mt-2">
					<strong class="text-foreground">{pa.titikRawanCount}</strong> titik rawan (referensi + temuan) di wilayah POLRES Anda
					terlihat di <a href="/dashboard/peta" class="font-medium text-primary hover:underline">Peta Rawan</a>.
				</p>
			</div>
		</div>
	{/if}

	{#if data.roleView === 'polres' && data.polresLeaderboard}
		<div class="grid gap-4 lg:grid-cols-3">
			<div class="rounded-xl border border-primary/25 bg-primary/5 p-4 shadow-sm lg:col-span-2">
				<h2 class="text-sm font-semibold text-foreground">Leaderboard POLSEK (minggu ini)</h2>
				<p class="mt-1 text-xs text-muted-foreground">
					Skor dari LHP berstatus <strong>verifikasi Polres</strong> (volume, bukti foto, GPS). Mendorong kompetisi sehat
					antar Kapolsek.
				</p>
				{#if data.polresLeaderboard.length === 0}
					<p class="mt-4 text-sm text-muted-foreground">Belum ada POLSEK terdaftar.</p>
				{:else}
					<ol class="mt-4 space-y-2">
						{#each data.polresLeaderboard as row, i (row.polsekId)}
							<li
								class="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
							>
								<span class="font-medium text-muted-foreground">#{i + 1}</span>
								<span class="min-w-0 flex-1 truncate font-medium text-foreground">{row.polsekNama}</span>
								<span class="shrink-0 tabular-nums">
									{#if row.score != null}
										<strong class="text-primary">{row.score}</strong><span class="text-xs text-muted-foreground">/100</span>
										<span class="ml-1 text-[10px] text-muted-foreground">({row.sampleSize} LHP)</span>
									{:else}
										<span class="text-xs text-muted-foreground">— belum ada LHP terverifikasi</span>
									{/if}
								</span>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
			<div class="flex flex-col justify-center rounded-xl border border-border bg-card p-4 shadow-sm">
				<h2 class="text-sm font-semibold text-foreground">Antrean verifikasi</h2>
				<p class="mt-2 text-3xl font-bold text-foreground">{data.lhpAwaitingCount ?? 0}</p>
				<p class="mt-1 text-xs text-muted-foreground">LHP menunggu ACC Kabag Ops.</p>
				<a
					href="/dashboard/verifikasi-lhp"
					class="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
				>
					Buka Verifikasi LHP
				</a>
			</div>
		</div>
	{/if}

	{#if data.roleView !== 'polsek'}
		<!-- Stats Grid -->
		<div class="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
			{#each statCards as card}
				<div class="rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md md:p-5">
					<div class="flex items-center gap-3">
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg {card.color}">
							<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d={card.icon} />
							</svg>
						</div>
						<div>
							<p class="text-2xl font-bold text-foreground">{card.value}</p>
							<p class="text-xs text-muted-foreground">{card.label}</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Recent Rengiat -->
	<div class="rounded-xl border border-border bg-card shadow-sm">
		<div class="border-b border-border px-5 py-4">
			<h2 class="text-base font-semibold text-foreground">
				{data.roleView === 'polsek' ? 'Aktivitas Rengiat wilayah' : 'Rengiat Terbaru'}
			</h2>
		</div>

		{#if data.recentRengiat.length === 0}
			<div class="px-5 py-10 text-center text-sm text-muted-foreground">
				Belum ada data Rengiat.
			</div>
		{:else}
			<div class="divide-y divide-border">
				{#each data.recentRengiat as item}
					{#if data.roleView === 'polsek'}
						<div class="flex items-center justify-between gap-4 px-5 py-3.5">
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-foreground">{item.judul}</p>
								<p class="mt-0.5 truncate text-xs text-muted-foreground">{item.deskripsi}</p>
							</div>
							<a
								href="/dashboard/giat-saya"
								class="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600/90"
							>
								Input LHP
							</a>
						</div>
					{:else}
						<a
							href="/dashboard/rengiat/{item.id}"
							class="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50"
						>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-foreground">{item.judul}</p>
								<p class="mt-0.5 truncate text-xs text-muted-foreground">{item.deskripsi}</p>
							</div>
							<span class="shrink-0 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {statusColors[item.status]}">
								{statusLabels[item.status]}
							</span>
						</a>
					{/if}
				{/each}
			</div>
		{/if}
	</div>

	<!-- Quick Actions (role-specific) -->
	<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
		{#if data.user?.role === 'POLRES'}
			<a
				href="/dashboard/rengiat/baru"
				class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
			>
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
					</svg>
				</div>
				<div>
					<p class="text-sm font-semibold text-foreground">Buat Rengiat Baru</p>
					<p class="text-xs text-muted-foreground">Ajukan rencana kegiatan</p>
				</div>
			</a>
			<a
				href="/dashboard/peta"
				class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
			>
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white">
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
					</svg>
				</div>
				<div>
					<p class="text-sm font-semibold text-foreground">Input Titik Rawan</p>
					<p class="text-xs text-muted-foreground">Tambah titik kerawanan baru</p>
				</div>
			</a>
		{/if}

		{#if data.user?.role === 'POLSEK'}
			<a
				href="/dashboard/giat-saya"
				class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
			>
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white">
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
					</svg>
				</div>
				<div>
					<p class="text-sm font-semibold text-foreground">Giat Saya</p>
					<p class="text-xs text-muted-foreground">Input LHP &amp; bukti lapangan</p>
				</div>
			</a>
			<a
				href="/dashboard/peta"
				class="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
			>
				<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-600 text-white">
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
					</svg>
				</div>
				<div>
					<p class="text-sm font-semibold text-foreground">Peta Rawan Taktis</p>
					<p class="text-xs text-muted-foreground">Titik lokal &amp; radius patroli</p>
				</div>
			</a>
		{/if}

		{#if data.user?.role === 'POLDA' || data.user?.role === 'KARO OPS'}
			<div class="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm md:col-span-2 lg:col-span-1">
				<p class="text-sm font-semibold text-foreground">Ekspor Laporan ANEV</p>
				<p class="text-xs text-muted-foreground">
					Rekap Rengiat, LHP, dan skor KPI per POLRES — siap cetak untuk Kapolda.
				</p>
				<div class="flex flex-wrap gap-2">
					<a
						href="/api/export/anev?format=xlsx"
						class="inline-flex flex-1 items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
					>
						Unduh Excel
					</a>
					<a
						href="/api/export/anev?format=pdf"
						class="inline-flex flex-1 items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
					>
						Unduh PDF
					</a>
				</div>
			</div>
		{/if}
	</div>
</div>
