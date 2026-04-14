<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { compressImageFileIfNeeded } from '$lib/client/image-compress';
	import { stampImageCornerTimestamp } from '$lib/client/stamp-image-corner';
	import { enqueueLhp, fileToBase64, listOutbox, type QueuedLhp } from '$lib/client/lhp-outbox';
	import { refreshLhpOutboxCount } from '$lib/stores/lhp-outbox-status';
	import { onMount } from 'svelte';

	let { data, form } = $props();

	let loading = $state(false);
	let openFormFor = $state<number | null>(null);
	let fotoInput: HTMLInputElement | undefined = $state();
	let localNotice = $state('');
	let outboxRows = $state<QueuedLhp[]>([]);
	let lhpForm: HTMLFormElement | undefined = $state();

	onMount(() => {
		void refreshOutbox();
	});

	$effect(() => {
		const has = data.activeFieldSessions.length > 0;
		if (!has) return;
		const id = setInterval(() => {
			void fetch('/api/field-giat/heartbeat', { method: 'POST', credentials: 'include' });
		}, 45000);
		return () => clearInterval(id);
	});

	async function refreshOutbox() {
		outboxRows = await listOutbox();
	}

	function getPosition(): Promise<GeolocationPosition> {
		return new Promise((resolve, reject) => {
			if (!navigator.geolocation) {
				reject(new Error('Peramban tidak mendukung GPS'));
				return;
			}
			navigator.geolocation.getCurrentPosition(resolve, reject, {
				enableHighAccuracy: true,
				timeout: 20000,
				maximumAge: 0
			});
		});
	}

	function setFormCoords(formEl: HTMLFormElement, lat: number, lng: number) {
		const la = formEl.elements.namedItem('lat') as HTMLInputElement | null;
		const ln = formEl.elements.namedItem('lng') as HTMLInputElement | null;
		if (la) la.value = String(lat.toFixed(6));
		if (ln) ln.value = String(lng.toFixed(6));
	}

	async function mulaiGiat(rgId: number) {
		localNotice = '';
		try {
			const pos = await getPosition();
			const res = await fetch('/api/field-giat/start', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					rengiat_id: rgId,
					lat: pos.coords.latitude,
					lng: pos.coords.longitude
				})
			});
			const j = (await res.json()) as { error?: string };
			if (!res.ok) throw new Error(j.error ?? 'Gagal memulai giat');
			await invalidateAll();
			localNotice = 'Giat dimulai — lokasi awal terekam untuk Monitoring POLRES.';
		} catch (e) {
			localNotice = e instanceof Error ? e.message : 'Gagal mulai giat';
		}
	}

	async function selesaiGiat(rgId: number) {
		localNotice = '';
		try {
			let end_lat: number | undefined;
			let end_lng: number | undefined;
			try {
				const pos = await getPosition();
				end_lat = pos.coords.latitude;
				end_lng = pos.coords.longitude;
			} catch {
				/* titik akhir opsional jika GPS gagal */
			}
			await fetch('/api/field-giat/end', {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					rengiat_id: rgId,
					...(end_lat != null && end_lng != null ? { end_lat, end_lng } : {})
				})
			});
			await invalidateAll();
			localNotice = 'Sesi giat diakhiri.';
		} catch {
			localNotice = 'Gagal mengakhiri sesi.';
		}
	}

	async function handleSendLhp(rgId: number, formEl: HTMLFormElement) {
		localNotice = '';
		if (!formEl.reportValidity()) return;
		loading = true;
		try {
			let lat = 0;
			let lng = 0;
			try {
				const pos = await getPosition();
				lat = pos.coords.latitude;
				lng = pos.coords.longitude;
			} catch {
				localNotice =
					'GPS gagal. Aktifkan izin lokasi — koordinat wajib untuk geo-fence dan bukti lapangan.';
				loading = false;
				return;
			}
			setFormCoords(formEl, lat, lng);
			const cap = formEl.elements.namedItem('captured_at_iso') as HTMLInputElement | null;
			if (cap) cap.value = new Date().toISOString();

			if (typeof navigator !== 'undefined' && !navigator.onLine) {
				await queueFormFromElement(formEl);
				openFormFor = null;
				formEl.reset();
				await refreshOutbox();
				localNotice =
					'Laporan disimpan di perangkat (dengan GPS). Akan dikirim saat sinyal kembali.';
				loading = false;
				return;
			}

			formEl.requestSubmit();
		} catch (e) {
			localNotice = e instanceof Error ? e.message : 'Gagal memproses.';
			loading = false;
		}
	}

	function ringkas(rengiatId: number) {
		return data.laporanRingkas.find((x) => x.rengiatId === rengiatId);
	}

	function formatDate(iso: string | null) {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('id-ID', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function activeForRengiat(rgId: number) {
		return data.activeFieldSessions.find((x) => x.rengiatId === rgId);
	}

	async function onFotoChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const f = input.files?.[0];
		if (!f || !fotoInput) return;
		const c = await compressImageFileIfNeeded(f);
		const stamped = await stampImageCornerTimestamp(c);
		const dt = new DataTransfer();
		dt.items.add(stamped);
		fotoInput.files = dt.files;
	}

	async function queueFormFromElement(formEl: HTMLFormElement) {
		const fd = new FormData(formEl);
		const rengiatId = Number(fd.get('rengiat_id'));
		const deskripsi = String(fd.get('deskripsi') ?? '').trim();
		const jumlahTerploting = parseInt(String(fd.get('jumlah_terploting') ?? '0'), 10);
		const buktiLapangan =
			fd.get('bukti_lapangan') === 'on' || fd.get('bukti_lapangan') === 'true';
		const lat = String(fd.get('lat') ?? '').trim();
		const lng = String(fd.get('lng') ?? '').trim();
		const capturedAt =
			String(fd.get('captured_at_iso') ?? '').trim() || new Date().toISOString();
		const foto = fd.get('foto') as File | null;
		let fotoBase64: string | null = null;
		let fotoName: string | null = null;
		let fotoMime: string | null = null;
		if (foto && foto.size > 0) {
			const x = await fileToBase64(foto);
			fotoBase64 = x.base64;
			fotoName = x.name;
			fotoMime = x.mime;
		}
		if (isNaN(rengiatId) || !deskripsi) {
			throw new Error('Rengiat dan deskripsi wajib diisi.');
		}
		await enqueueLhp({
			rengiatId,
			deskripsi,
			jumlahTerploting: isNaN(jumlahTerploting) ? 0 : Math.max(0, jumlahTerploting),
			buktiLapangan,
			lat,
			lng,
			fotoBase64,
			fotoName,
			fotoMime,
			createdAt: capturedAt
		});
		await refreshLhpOutboxCount();
		await refreshOutbox();
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>Giat Saya — OPS SIS</title>
</svelte:head>

<div class="mx-auto max-w-lg space-y-4 md:max-w-2xl">
	<div>
		<h1 class="text-xl font-bold tracking-tight text-foreground md:text-2xl">Giat Saya</h1>
		<p class="text-sm text-muted-foreground">
			<strong>Mulai Giat</strong> mengunci koordinat &amp; waktu untuk Monitoring Kabag Ops di POLRES. NRP diambil dari
			profil (tidak perlu diketik). Jika LHP <strong>dikembalikan</strong> oleh Kabag Ops, alasan ditampilkan di kartu
			Rengiat — kirim ulang LHP yang baru setelah perbaikan.
		</p>
	</div>

	{#if form?.error}
		<div class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
			{form.error}
		</div>
	{/if}
	{#if form?.success}
		<div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
			<p>Laporan berhasil dikirim.</p>
			<p class="mt-1 text-xs text-emerald-900/90">
				Status: menunggu verifikasi Kabag Ops / Polres — belum dianggap final untuk laporan Polda sampai diverifikasi.
			</p>
		</div>
	{/if}
	{#if localNotice}
		<div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
			{localNotice}
		</div>
	{/if}

	{#if outboxRows.length > 0}
		<div class="rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-sm shadow-sm">
			<p class="font-semibold text-amber-950">Antrean lokal (menunggu sinyal)</p>
			<ul class="mt-2 space-y-1.5 text-xs text-amber-900">
				{#each outboxRows as row (row.id)}
					<li class="flex justify-between gap-2 border-b border-amber-200/80 pb-1 last:border-0">
						<span>Rengiat #{row.rengiatId} · {new Date(row.createdAt).toLocaleString('id-ID')}</span>
						<span class="font-mono text-[10px] opacity-80">{row.deskripsi.slice(0, 40)}…</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if data.approvedRengiat.length === 0}
		<div class="rounded-xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground shadow-sm">
			Belum ada Rengiat berstatus <strong>Disetujui</strong> untuk wilayah Anda.
		</div>
	{:else}
		<ul class="space-y-3">
			{#each data.approvedRengiat as rg}
				{@const s = ringkas(rg.id)}
				{@const active = activeForRengiat(rg.id)}
				{@const outPending = outboxRows.some((o) => o.rengiatId === rg.id)}
				{@const synced = (s?.count ?? 0) > 0}
				<li class="rounded-xl border border-border bg-card p-4 shadow-sm">
					<div class="flex flex-col gap-2">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-base font-semibold text-foreground">{rg.judul}</h2>
							<span class="text-[10px] text-muted-foreground" aria-hidden="true">
								{#if outPending}
									<span title="Menunggu sinyal / IndexedDB">☁️</span>
								{/if}
								{#if synced}
									<span title="Sudah tersinkron ke server">✅</span>
								{/if}
							</span>
						</div>
						<p class="text-xs text-muted-foreground">{rg.polresNama}</p>
						<p class="text-xs text-foreground">
							Target plotting: <strong>{rg.jumlahRencanaPlotting ?? 0}</strong>
						</p>

						{#if s?.lastReturned}
							<div
								class="rounded-lg border border-rose-300/90 bg-rose-50 px-3 py-2.5 text-xs text-rose-950 shadow-sm"
								role="status"
							>
								<p class="font-semibold text-rose-950">LHP dikembalikan — perbaiki &amp; kirim ulang</p>
								<p class="mt-1.5 whitespace-pre-wrap text-rose-900/95">
									{s.lastReturned.note?.trim()
										? s.lastReturned.note
										: 'Tidak ada catatan detail; hubungi Kabag Ops jika perlu klarifikasi.'}
								</p>
								<p class="mt-1 text-[10px] text-rose-800/85">
									Dikembalikan: {formatDate(s.lastReturned.at)}
								</p>
								<button
									type="button"
									onclick={() => (openFormFor = rg.id)}
									class="mt-2 w-full rounded-md bg-rose-700 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-800 sm:w-auto"
								>
									Buka form LHP untuk kirim ulang
								</button>
							</div>
						{:else if s?.latestVerificationStatus === 'awaiting_polres' && (s.count ?? 0) > 0}
							<p class="text-[10px] text-blue-900/90">
								<span class="rounded bg-blue-100/90 px-1.5 py-0.5 font-medium">Menunggu verifikasi Polres</span>
								— LHP terakhir Anda masih dalam antrean Kabag Ops.
							</p>
						{:else if s?.latestVerificationStatus === 'verified' && (s.count ?? 0) > 0}
							<p class="text-[10px] text-emerald-900/85">
								<span class="rounded bg-emerald-100/90 px-1.5 py-0.5 font-medium">LHP terakhir diverifikasi</span>
							</p>
						{/if}

						<p class="text-[10px] text-muted-foreground">
							{#if outPending}
								<span class="text-amber-800">☁️ Menunggu sinyal (lokal)</span>
							{/if}
							{#if outPending && synced}
								<span class="mx-1">·</span>
							{/if}
							{#if synced}
								<span class="text-emerald-800">✅ Sudah di server</span>
							{/if}
							{#if !outPending && !synced}
								Belum ada LHP — mulai giat lalu kirim laporan.
							{/if}
						</p>

						{#if s && s.count > 0}
							<div class="rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
								<p class="font-medium">Ringkasan laporan Anda</p>
								<p class="mt-0.5">
									{s.count} laporan · total terploting <strong>{s.sumPlot}</strong> · terakhir
									{formatDate(s.lastAt)}
								</p>
								{#if s.lastDeskripsi}
									<p class="mt-1 line-clamp-2 text-emerald-800/90">{s.lastDeskripsi}</p>
								{/if}
							</div>
						{/if}

						<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
							{#if !active}
								<button
									type="button"
									onclick={() => void mulaiGiat(rg.id)}
									class="flex h-11 items-center justify-center rounded-lg border-2 border-primary bg-primary/5 text-sm font-bold text-primary"
								>
									Mulai Giat
								</button>
							{:else}
								<button
									type="button"
									onclick={() => void selesaiGiat(rg.id)}
									class="flex h-11 items-center justify-center rounded-lg border border-border bg-muted/50 text-sm font-semibold text-foreground"
								>
									Selesai Giat
								</button>
								<p class="col-span-full text-[10px] text-muted-foreground sm:col-span-2">
									Aktif sejak {formatDate(active.startedAt)} · titik awal
									{active.startLat.toFixed(5)}, {active.startLng.toFixed(5)}
								</p>
							{/if}
							<button
								type="button"
								disabled={!active}
								onclick={() => (openFormFor = openFormFor === rg.id ? null : rg.id)}
								class="flex h-11 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
								title={!active ? 'Tekan Mulai Giat terlebih dahulu' : ''}
							>
								{openFormFor === rg.id ? 'Tutup form LHP' : 'Input LHP'}
							</button>
						</div>
					</div>

					{#if openFormFor === rg.id}
						<form
							bind:this={lhpForm}
							method="POST"
							action="?/report"
							enctype="multipart/form-data"
							class="mt-4 space-y-3 border-t border-border pt-4"
							use:enhance={() => {
								return async ({ result, update }) => {
									loading = false;
									if (
										result.type === 'error' &&
										typeof navigator !== 'undefined' &&
										!navigator.onLine &&
										lhpForm
									) {
										loading = true;
										try {
											await queueFormFromElement(lhpForm);
											openFormFor = null;
											lhpForm.reset();
											await refreshOutbox();
											localNotice =
												'Koneksi putus saat kirim. Laporan disimpan lokal dengan GPS terakhir.';
										} catch (e) {
											localNotice =
												e instanceof Error ? e.message : 'Gagal menyimpan ke antrean lokal.';
										} finally {
											loading = false;
										}
										await update();
										return;
									}
									if (result.type === 'success') {
										openFormFor = null;
										void refreshOutbox();
										await invalidateAll();
									}
									await update();
								};
							}}
						>
							<input type="hidden" name="rengiat_id" value={rg.id} />
							<input type="hidden" name="nrp" value={data.nrp} />
							<input type="hidden" name="captured_at_iso" value="" />
							<input type="hidden" name="lat" value="" />
							<input type="hidden" name="lng" value="" />

							<div>
								<label class="text-xs font-medium text-foreground" for="d-{rg.id}">Deskripsi</label>
								<textarea
									id="d-{rg.id}"
									name="deskripsi"
									required
									rows="3"
									class="mt-1 flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
									placeholder="Uraian kegiatan di lapangan…"
								></textarea>
							</div>

							<div class="grid grid-cols-2 gap-2">
								<div>
									<label class="text-xs font-medium" for="j-{rg.id}">Personil hadir (riil)</label>
									<input
										id="j-{rg.id}"
										name="jumlah_terploting"
										type="number"
										min="0"
										value="0"
										class="mt-1 flex h-10 w-full rounded-lg border border-input px-2 text-sm"
									/>
								</div>
								<div class="flex items-end pb-1">
									<label class="flex items-center gap-2 text-xs font-medium">
										<input type="checkbox" name="bukti_lapangan" class="rounded border-input" />
										Bukti lapangan
									</label>
								</div>
							</div>

							<p class="text-[11px] text-muted-foreground">
								<strong class="text-foreground">GPS:</strong> koordinat diambil saat Kirim.
								<strong class="text-foreground">Foto:</strong> kompresi + cap waktu pojok untuk ANEV.
							</p>

							<div>
								<label class="text-xs font-medium" for="f-{rg.id}">Bukti lapangan (kamera)</label>
								<input
									bind:this={fotoInput}
									id="f-{rg.id}"
									name="foto"
									type="file"
									accept="image/*"
									capture="environment"
									onchange={onFotoChange}
									class="mt-1 w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-1"
								/>
								<p class="mt-0.5 text-[10px] text-muted-foreground">
									Kompres &lt;500KB + stempel waktu di pojok.
								</p>
							</div>

							<button
								type="button"
								disabled={loading}
								onclick={() => lhpForm && void handleSendLhp(rg.id, lhpForm)}
								class="h-12 w-full rounded-lg bg-primary text-base font-bold text-primary-foreground disabled:opacity-50"
							>
								{loading ? 'Mengambil GPS & mengirim…' : 'Kirim LHP'}
							</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
