<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Buat Rengiat Baru — OPS SIS</title>
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
				<label for="judul" class="text-sm font-medium text-foreground">Judul Rengiat</label>
				<input
					id="judul"
					name="judul"
					type="text"
					required
					value=""
					class="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
					class="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
					placeholder="Jelaskan rencana kegiatan secara detail: tujuan, metode, personil, jadwal..."
				></textarea>
			</div>

			<div class="space-y-2">
				<label for="jumlah_rencana_plotting" class="text-sm font-medium text-foreground"
					>Jumlah rencana plotting (target)</label
				>
				<input
					id="jumlah_rencana_plotting"
					name="jumlah_rencana_plotting"
					type="number"
					min="0"
					step="1"
					value="0"
					class="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
				/>
				<p class="text-xs text-muted-foreground">
					Target titik/kegiatan terploting yang direncanakan (untuk dibandingkan dengan laporan lapangan).
				</p>
			</div>

			<div class="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
				<p class="text-sm font-medium text-foreground">Titik acuan geo-fence (opsional)</p>
				<p class="text-xs text-muted-foreground">
					Koordinat lokasi giat untuk validasi jarak LHP (&gt;200 m → tanda &quot;Di luar radius&quot;). Kosongkan
					untuk memakai koordinat markas POLRES.
				</p>
				<div class="grid gap-3 sm:grid-cols-2">
					<div>
						<label for="anchor_lat" class="text-xs font-medium text-muted-foreground">Latitude</label>
						<input
							id="anchor_lat"
							name="anchor_lat"
							type="text"
							inputmode="decimal"
							placeholder="-6.261500"
							class="mt-1 flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
						/>
					</div>
					<div>
						<label for="anchor_lng" class="text-xs font-medium text-muted-foreground">Longitude</label>
						<input
							id="anchor_lng"
							name="anchor_lng"
							type="text"
							inputmode="decimal"
							placeholder="106.781600"
							class="mt-1 flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
						/>
					</div>
				</div>
			</div>

			<div class="space-y-2">
				<label for="operasi_selesai" class="text-sm font-medium text-foreground">Batas waktu operasi (opsional)</label>
				<input
					id="operasi_selesai"
					name="operasi_selesai"
					type="datetime-local"
					class="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
				/>
				<p class="text-xs text-muted-foreground">
					Dipakai POLSEK untuk indikator &quot;LHP tertunda&quot; setelah jadwal berakhir.
				</p>
			</div>

			<div class="flex gap-3">
				<button
					type="submit"
					disabled={loading}
					class="flex h-11 flex-1 items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
				>
					{loading ? 'Menyimpan...' : 'Simpan sebagai Draf'}
				</button>
			</div>
		</form>
	</div>
</div>
