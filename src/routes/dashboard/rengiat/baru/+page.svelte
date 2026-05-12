<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { installThemedRasterBaseLayer } from '$lib/client/leaflet-themed-tiles';
	import Button from '$lib/components/ui/Button.svelte';

	let { data, form } = $props();
	let loading = $state(false);
	let fileInput: HTMLInputElement | null = $state(null);
	let chosenFile: File | null = $state(null);
	let dragOver = $state(false);

	let kategori = $state('Rengiat Harian');
	let deskripsi = $state('');
	let lastBoilerplate = $state('');
	let selectedPointId = $state<number | null>(null);

	const BOILERPLATE: Record<string, string> = {
		'Rengiat Harian':
			'Melaksanakan patroli dialogis di wilayah... guna mengantisipasi gangguan kamtibmas.',
		'Rengiat Penanganan Zona Merah':
			'Melaksanakan operasi penanganan zona merah di titik... guna menekan angka kriminalitas dan menciptakan situasi kamtibmas yang kondusif.',
		'Rengiat Pengamanan Objek Vital':
			'Melaksanakan pengamanan objek vital di lokasi... guna menjamin keamanan dan kelancaran operasional objek vital.',
		'Rengiat Pengamanan Tamu VIP':
			'Melaksanakan pengamanan kunjungan tamu VIP... meliputi sterilisasi rute, pengamanan venue, dan koordinasi lintas instansi.',
		'Rengiat Pengamanan Tamu VVIP':
			'Melaksanakan pengamanan kunjungan tamu VVIP... dengan koordinasi penuh bersama TNI, Paspampres, serta instansi terkait.'
	};

	const isVipVvip = $derived(
		kategori === 'Rengiat Pengamanan Tamu VIP' || kategori === 'Rengiat Pengamanan Tamu VVIP'
	);
	const isZonaMerah = $derived(kategori === 'Rengiat Penanganan Zona Merah');
	const isObjekVital = $derived(kategori === 'Rengiat Pengamanan Objek Vital');
	const needsTargetPoint = $derived(isZonaMerah || isObjekVital);

	const INSTANSI_OPTIONS = ['TNI', 'Paspampres', 'Basarnas', 'Dishub', 'Satpol PP'] as const;

	function onKategoriChange() {
		const bp = BOILERPLATE[kategori] ?? '';
		if (!deskripsi || deskripsi === lastBoilerplate) {
			deskripsi = bp;
			lastBoilerplate = bp;
		}
	}

	function syncChosenFromInput() {
		const f = fileInput?.files?.[0] ?? null;
		chosenFile = f;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const f = e.dataTransfer?.files?.[0];
		if (!f) return;
		chosenFile = f;
		if (fileInput) {
			try {
				const dt = new DataTransfer();
				dt.items.add(f);
				fileInput.files = dt.files;
			} catch { /* noop */ }
		}
	}

	let mapHost: HTMLDivElement | undefined = $state();
	const mapCtx: {
		L: typeof import('leaflet') | null;
		map: import('leaflet').Map | null;
		layer: import('leaflet').LayerGroup | null;
	} = { L: null, map: null, layer: null };
	let mapReady = $state(false);

	const poldaPoints = $derived(
		data.vulnerabilityPoints.filter((p) => p.origin === 'polda')
	);

	function redrawPointMarkers() {
		const { L, map, layer } = mapCtx;
		if (!L || !map || !layer) return;
		layer.clearLayers();
		const bounds: [number, number][] = [];
		for (const pt of data.vulnerabilityPoints) {
			const isPolda = pt.origin === 'polda';
			const isSelected = pt.id === selectedPointId;
			const marker = L.circleMarker([pt.lat, pt.lng], {
				radius: isSelected ? 10 : 7,
				fillColor: isPolda ? '#ef4444' : '#3b82f6',
				color: isSelected ? '#facc15' : isPolda ? '#dc2626' : '#2563eb',
				weight: isSelected ? 3 : 2,
				fillOpacity: 0.7
			}).addTo(layer);
			marker.bindTooltip(
				`${pt.jenisKejahatan} (×${pt.frekuensi})\n${pt.keterangan ?? ''}`,
				{ direction: 'top' }
			);
			marker.on('click', () => {
				selectedPointId = pt.id;
				redrawPointMarkers();
				map.flyTo([pt.lat, pt.lng], 14, { duration: 0.8 });
			});
			bounds.push([pt.lat, pt.lng]);
		}
		if (bounds.length > 0) {
			map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
		}
	}

	$effect(() => {
		if (!browser || !mapReady) return;
		if (isZonaMerah && poldaPoints.length > 0 && mapCtx.map) {
			const first = poldaPoints[0];
			mapCtx.map.flyTo([first.lat, first.lng], 13, { duration: 1 });
		}
	});

	onMount(() => {
		if (!mapHost) return;
		let destroyed = false;
		let teardownThemedBase: (() => void) | undefined;
		void import('leaflet').then((L) => {
			if (destroyed || !mapHost) return;
			mapCtx.L = L;
			mapCtx.map = L.map(mapHost).setView([-6.2, 106.85], 10);
			teardownThemedBase = installThemedRasterBaseLayer(L, mapCtx.map);
			mapCtx.layer = L.layerGroup().addTo(mapCtx.map);
			mapReady = true;
			redrawPointMarkers();
		});
		return () => {
			destroyed = true;
			teardownThemedBase?.();
			mapCtx.map?.remove();
			mapCtx.map = null;
			mapCtx.layer = null;
			mapCtx.L = null;
			mapReady = false;
		};
	});

	$effect(() => {
		if (!browser || !mapReady) return;
		void selectedPointId;
		void data.vulnerabilityPoints;
		redrawPointMarkers();
	});
</script>

<svelte:head>
	<title>Buat Rengiat Baru — OPS SIS</title>
	<link
		rel="stylesheet"
		href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
		integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
		crossorigin=""
	/>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div>
		<a href="/dashboard/rengiat" class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Kembali
		</a>
		<h1 class="mt-2 text-xl font-bold tracking-tight text-foreground md:text-2xl">Buat Rengiat Baru</h1>
		<p class="text-sm text-muted-foreground">Ajukan rencana kegiatan operasional untuk review.</p>
	</div>

	<div class="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6">
		<form
			method="POST"
			enctype="multipart/form-data"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="space-y-5"
		>
			{#if form?.error}
				<div class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{form.error}
				</div>
			{/if}

			<div class="space-y-2">
				<label for="kategori" class="text-sm font-medium text-foreground">Kategori Rengiat</label>
				<select
					id="kategori"
					name="kategori"
					required
					bind:value={kategori}
					onchange={onKategoriChange}
					class="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
				>
					<option value="Rengiat Harian">Rengiat Harian</option>
					<option value="Rengiat Penanganan Zona Merah">Rengiat Penanganan Zona Merah</option>
					<option value="Rengiat Pengamanan Objek Vital">Rengiat Pengamanan Objek Vital</option>
					<option value="Rengiat Pengamanan Tamu VIP">Rengiat Pengamanan Tamu VIP</option>
					<option value="Rengiat Pengamanan Tamu VVIP">Rengiat Pengamanan Tamu VVIP</option>
				</select>
			</div>

			<div class="space-y-2">
				<label for="judul" class="text-sm font-medium text-foreground">Judul Rengiat</label>
				<input
					id="judul"
					name="judul"
					type="text"
					required
					value=""
					class="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
					placeholder="Contoh: Operasi Anti C3 Blok M"
				/>
			</div>

			<div class="space-y-2">
				<label for="deskripsi" class="text-sm font-medium text-foreground">Deskripsi / Draf Rencana</label>
				<textarea
					id="deskripsi"
					name="deskripsi"
					required
					rows="8"
					bind:value={deskripsi}
					class="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-base transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
					placeholder="Jelaskan rencana kegiatan secara detail: tujuan, metode, personil, jadwal..."
				></textarea>
				{#if deskripsi && deskripsi === lastBoilerplate}
					<p class="text-xs text-amber-600">Template otomatis — silakan edit sesuai kebutuhan.</p>
				{/if}
			</div>

			<!-- VIP/VVIP-specific fields -->
			{#if isVipVvip}
				<div class="space-y-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
					<p class="text-xs font-semibold uppercase tracking-wide text-amber-800">Informasi Tamu {kategori.includes('VVIP') ? 'VVIP' : 'VIP'}</p>
					<div class="space-y-2">
						<label for="nama_tamu" class="text-sm font-medium text-foreground">Nama Tamu</label>
						<input
							id="nama_tamu"
							name="nama_tamu"
							type="text"
							required
							class="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
							placeholder="Nama lengkap tamu VIP/VVIP"
						/>
					</div>
					<div class="space-y-2">
						<span class="text-sm font-medium text-foreground">Instansi Terkait</span>
						<div class="flex flex-wrap gap-2">
							{#each INSTANSI_OPTIONS as inst}
								<label class="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted/40 cursor-pointer">
									<input type="checkbox" name="instansi_terkait" value={inst} class="accent-primary" />
									{inst}
								</label>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- Zona Merah-specific fields -->
			{#if isZonaMerah}
				<div class="space-y-4 rounded-lg border border-red-200 bg-red-50/50 p-4">
					<p class="text-xs font-semibold uppercase tracking-wide text-red-800">Data Zona Merah</p>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-2">
							<label for="tingkat_kerawanan" class="text-sm font-medium text-foreground">Tingkat Kerawanan</label>
							<select
								id="tingkat_kerawanan"
								name="tingkat_kerawanan"
								class="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
							>
								<option value="High" selected>High</option>
								<option value="Medium">Medium</option>
								<option value="Low">Low</option>
							</select>
						</div>
					</div>
					<div class="space-y-2">
						<label for="analisa_singkat_ancaman" class="text-sm font-medium text-foreground">Analisa Singkat Ancaman</label>
						<textarea
							id="analisa_singkat_ancaman"
							name="analisa_singkat_ancaman"
							rows="3"
							class="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
							placeholder="Uraian singkat analisa ancaman di zona merah ini..."
						></textarea>
					</div>
				</div>
			{/if}

			<!-- Target point picker for Zona Merah / Objek Vital -->
			{#if needsTargetPoint}
				<div class="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
					<p class="text-sm font-semibold text-foreground">Pilih Lokasi/Target Titik Rawan</p>
					<p class="text-xs text-muted-foreground">
						Klik marker pada peta untuk memilih titik rawan sebagai target. {isZonaMerah ? 'Titik merah = data POLDA.' : ''}
					</p>
					<input type="hidden" name="target_point_id" value={selectedPointId ?? ''} />
					<div bind:this={mapHost} class="h-[260px] w-full rounded-lg border border-border overflow-hidden"></div>
					{#if data.vulnerabilityPoints.length === 0}
						<p class="text-xs text-amber-600">Belum ada titik rawan di wilayah Anda.</p>
					{/if}
					{#if selectedPointId != null}
						{@const sel = data.vulnerabilityPoints.find((p) => p.id === selectedPointId)}
						{#if sel}
							<div class="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm text-foreground">
								<svg class="h-4 w-4 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
								</svg>
								<span class="font-medium">{sel.jenisKejahatan}</span>
								<span class="text-xs text-muted-foreground">({sel.lat.toFixed(4)}, {sel.lng.toFixed(4)})</span>
								<button type="button" class="ml-auto text-xs text-destructive hover:underline" onclick={() => { selectedPointId = null; }}>Hapus</button>
							</div>
						{/if}
					{:else}
						<p class="text-xs text-destructive">Belum dipilih — wajib untuk kategori ini.</p>
					{/if}
				</div>
			{/if}

			<div class="space-y-2">
				<label for="rengiat_file" class="text-sm font-medium text-foreground">Upload dokumen Rengiat (opsional)</label>
				<div
					class="group relative flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors {dragOver
						? 'border-primary bg-primary/5'
						: 'border-border bg-muted/20 hover:bg-muted/30'}"
					role="button"
					tabindex="0"
					aria-label="Upload dokumen rengiat (tarik & lepas atau klik)"
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							fileInput?.click();
						}
					}}
					ondragenter={(e) => { e.preventDefault(); dragOver = true; }}
					ondragover={(e) => { e.preventDefault(); dragOver = true; }}
					ondragleave={(e) => { e.preventDefault(); dragOver = false; }}
					ondrop={onDrop}
				>
					<input
						bind:this={fileInput}
						id="rengiat_file"
						name="rengiat_file"
						type="file"
						accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
						class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
						onchange={syncChosenFromInput}
					/>
					<div
						class="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors group-hover:text-foreground {dragOver ? 'border-primary text-primary' : ''}"
						aria-hidden="true"
					>
						<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 16V8m0 0l3 3m-3-3l-3 3M20 16.5a4.5 4.5 0 00-3.3-4.34 6 6 0 10-11.4 2.02A4 4 0 006 22h11a3 3 0 003-3v-2.5z" />
						</svg>
					</div>
					<p class="text-sm font-medium text-foreground">Tarik &amp; lepas file di sini</p>
					<p class="text-xs text-muted-foreground">atau klik untuk memilih (PDF, DOC, DOCX · maks 100MB)</p>
					{#if chosenFile}
						<p class="mt-1 text-xs font-medium text-foreground">
							File dipilih: <span class="font-mono">{chosenFile.name}</span>
						</p>
					{/if}
				</div>
				<p class="text-xs text-muted-foreground">Maksimal 100MB. Format: PDF, DOC, DOCX.</p>
			</div>

			<div class="space-y-2">
				<label for="jumlah_rencana_plotting" class="text-sm font-medium text-foreground">Jumlah rencana plotting (target)</label>
				<input
					id="jumlah_rencana_plotting"
					name="jumlah_rencana_plotting"
					type="number"
					min="0"
					step="1"
					value="0"
					class="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
				/>
				<p class="text-xs text-muted-foreground">
					Target titik/kegiatan terploting yang direncanakan (untuk dibandingkan dengan laporan lapangan).
				</p>
			</div>

			<div class="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
				<p class="text-sm font-medium text-foreground">Titik acuan geo-fence (opsional)</p>
				<p class="text-xs text-muted-foreground">
					Koordinat lokasi giat untuk validasi jarak LHP (&gt;200 m → tanda &quot;Di luar radius&quot;). Kosongkan untuk memakai koordinat markas POLRES.
				</p>
				<div class="grid gap-3 sm:grid-cols-2">
					<div>
						<label for="anchor_lat" class="text-sm font-medium text-muted-foreground">Latitude</label>
						<input id="anchor_lat" name="anchor_lat" type="text" inputmode="decimal" placeholder="-6.261500" class="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base" />
					</div>
					<div>
						<label for="anchor_lng" class="text-sm font-medium text-muted-foreground">Longitude</label>
						<input id="anchor_lng" name="anchor_lng" type="text" inputmode="decimal" placeholder="106.781600" class="mt-1 flex h-11 w-full rounded-lg border border-input bg-background px-3 text-base" />
					</div>
				</div>
			</div>

			<div class="space-y-2">
				<label for="operasi_selesai" class="text-sm font-medium text-foreground">Batas waktu operasi (opsional)</label>
				<input id="operasi_selesai" name="operasi_selesai" type="datetime-local" class="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base" />
				<p class="text-xs text-muted-foreground">Dipakai POLSEK untuk indikator &quot;LHP tertunda&quot; setelah jadwal berakhir.</p>
			</div>

			<div class="flex gap-3">
				<Button type="submit" variant="primary" size="lg" class="flex-1" disabled={loading} loading={loading}>
					Simpan sebagai Draf
				</Button>
			</div>
		</form>
	</div>
</div>
