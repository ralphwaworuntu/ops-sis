<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';

	let { data, form } = $props();

	let tab = $state<'polres' | 'polsek' | 'personil'>('polres');
	// Default view selaras dengan Live Wall: NTT
	let pickLat = $state(-9.6);
	let pickLng = $state(123.9);
	let mapContainer: HTMLDivElement | undefined = $state();
	let map = $state<import('leaflet').Map | null>(null);
	let Lmod = $state<typeof import('leaflet') | null>(null);
	let markersLayer = $state<import('leaflet').LayerGroup | null>(null);
	let pickLayer = $state<import('leaflet').LayerGroup | null>(null);
	let pickMarker: import('leaflet').Marker | null = $state(null);
	let didAutoFit = $state(false);
	let mapReady = $state(false);

	let editingUnitId = $state<number | null>(null);
	let editingUnitLabel = $state<string>('');

	function selectPolres(id: string) {
		const u = new URL($page.url.href);
		if (id) u.searchParams.set('polres', id);
		else u.searchParams.delete('polres');
		void goto(`${u.pathname}${u.search}`, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function padMapToForm({ formData }: { formData: FormData }) {
		formData.set('lat', String(pickLat));
		formData.set('lng', String(pickLng));
	}

	function padMapToUnitMarkerForm({ formData }: { formData: FormData }) {
		if (editingUnitId != null) formData.set('unit_id', String(editingUnitId));
		formData.set('lat', String(pickLat));
		formData.set('lng', String(pickLng));
	}

	onMount(() => {
		let destroyed = false;
		void import('leaflet').then((L) => {
			if (destroyed || !mapContainer) return;
			Lmod = L;
			map = L.map(mapContainer).setView([pickLat, pickLng], 7);
			// Pane khusus untuk pin edit agar selalu terlihat (di atas marker lain).
			map.createPane('satwil-pin-pane');
			// z-index default marker pane ~600; kita naikkan sedikit.
			const paneEl = map.getPane('satwil-pin-pane');
			if (paneEl) paneEl.style.zIndex = '650';
			L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
				attribution: '&copy; OpenStreetMap',
				maxZoom: 19
			}).addTo(map);
			markersLayer = L.layerGroup().addTo(map);
			pickLayer = L.layerGroup().addTo(map);
			map.on('click', (e) => {
				pickLat = e.latlng.lat;
				pickLng = e.latlng.lng;
				// Jika sedang edit, klik peta akan memindahkan pin draggable juga.
				if (editingUnitId != null && pickMarker) {
					pickMarker.setLatLng(e.latlng);
				}
			});

			// Pastikan ukuran terhitung (jika container baru render).
			setTimeout(() => map?.invalidateSize(), 50);
			mapReady = true;
		});
		return () => {
			destroyed = true;
			map?.remove();
			map = null;
			markersLayer = null;
			pickLayer = null;
			Lmod = null;
			pickMarker = null;
			didAutoFit = false;
			mapReady = false;
		};
	});

	$effect(() => {
		if (!mapReady || !map || !Lmod || !markersLayer) return;
		markersLayer.clearLayers();

		const polresIcon = Lmod.icon({
			iconUrl: '/markers/polres.png',
			iconSize: [46, 46],
			iconAnchor: [23, 45],
			popupAnchor: [0, -40]
		});
		const polsekIcon = Lmod.icon({
			iconUrl: '/markers/polsek.png',
			iconSize: [46, 46],
			iconAnchor: [23, 45],
			popupAnchor: [0, -40]
		});
		const poldaIcon = Lmod.icon({
			iconUrl: '/markers/polda.png',
			iconSize: [64, 64],
			iconAnchor: [32, 32],
			popupAnchor: [0, -30]
		});

		// POLDA NTT (Kompleks Polda / Lapangan Polda, Kupang) — marker tetap.
		const POLDA_NTT: [number, number] = [-10.1777143, 123.5976401];

		const boundsPts: [number, number][] = [];
		boundsPts.push(POLDA_NTT);
		Lmod
			.marker(POLDA_NTT, { icon: poldaIcon })
			.bindPopup('<strong>POLDA NTT</strong><br/>Kupang')
			.addTo(markersLayer);

		for (const p of data.polresList) {
			if (p.lat != null && p.lng != null) {
				boundsPts.push([p.lat, p.lng]);
				Lmod.marker([p.lat, p.lng], { icon: polresIcon })
					.bindPopup(`<strong>POLRES</strong><br/>${p.nama}`)
					.addTo(markersLayer);
			}
		}
		for (const s of data.polsekList) {
			if (s.lat != null && s.lng != null) {
				boundsPts.push([s.lat, s.lng]);
				Lmod.marker([s.lat, s.lng], { icon: polsekIcon })
					.bindPopup(`<strong>POLSEK</strong><br/>${s.nama}`)
					.addTo(markersLayer);
			}
		}

		// Auto-jump sekali supaya marker terlihat. Jika tidak ada koordinat, tetap default NTT.
		if (!didAutoFit && boundsPts.length > 0) {
			didAutoFit = true;
			const b = Lmod.latLngBounds(boundsPts);
			map.flyToBounds(b, { padding: [40, 40], maxZoom: 10, duration: 0.9 });
		}
	});

	// Pin edit (draggable) dikelola terpisah agar tidak hilang saat layer marker direfresh.
	$effect(() => {
		if (!mapReady || !map || !Lmod || !pickLayer) return;
		pickLayer.clearLayers();
		pickMarker = null;
		if (editingUnitId == null) return;

		const icon = Lmod.divIcon({
			className: 'satwil-pin',
			html: '<div class=\"satwil-pin__dot\"></div>',
			iconSize: [18, 18],
			iconAnchor: [9, 9]
		});
		pickMarker = Lmod
			.marker([pickLat, pickLng], { icon, draggable: true, pane: 'satwil-pin-pane' })
			.bindPopup(`<strong>PIN</strong><br/>${editingUnitLabel || 'Lokasi unit'}`)
			.addTo(pickLayer);
		pickMarker.on('dragend', () => {
			const ll = pickMarker?.getLatLng();
			if (!ll) return;
			pickLat = ll.lat;
			pickLng = ll.lng;
		});
	});

	$effect(() => {
		if (editingUnitId == null || !pickMarker) return;
		pickMarker.setLatLng([pickLat, pickLng]);
	});
</script>

<svelte:head>
	<title>Admin Satwil — OPS SIS</title>
	<link
		rel="stylesheet"
		href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
		integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
		crossorigin=""
	/>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-bold tracking-tight text-foreground md:text-2xl">Manajemen Satwil</h1>
		<p class="text-sm text-muted-foreground">
			Kelola POLRES, POLSEK, dan akun personil. Klik peta untuk menentukan koordinat markas saat menambah unit baru.
		</p>
	</div>

	{#if form?.error}
		<div class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
			{form.error}
		</div>
	{/if}
	{#if form?.success}
		<div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Perubahan disimpan.</div>
	{/if}

	<div class="flex flex-wrap gap-2 border-b border-border pb-2">
		{#each [{ k: 'polres' as const, l: 'POLRES' }, { k: 'polsek' as const, l: 'POLSEK' }, { k: 'personil' as const, l: 'Personil' }] as t}
			<button
				type="button"
				onclick={() => (tab = t.k)}
				class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {tab === t.k
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
			>
				{t.l}
			</button>
		{/each}
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<div class="min-w-0 space-y-4">
			{#if tab === 'polres'}
				<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
					<h2 class="mb-3 text-sm font-semibold">Tambah POLRES</h2>
					<form method="POST" action="?/createPolres" class="space-y-3" use:enhance={padMapToForm}>
						<div>
							<label class="text-xs font-medium text-muted-foreground" for="np-nama">Nama POLRES</label>
							<input
								id="np-nama"
								name="nama"
								required
								class="mt-1 flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
							/>
						</div>
						<p class="text-xs text-muted-foreground">
							Koordinat dari peta: <span class="font-mono text-foreground">{pickLat.toFixed(5)}, {pickLng.toFixed(5)}</span>
						</p>
						<button
							type="submit"
							class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
						>
							Simpan POLRES
						</button>
					</form>
				</div>

				<div class="rounded-xl border border-border bg-card shadow-sm">
					<div class="border-b border-border px-4 py-2 text-sm font-semibold">Daftar POLRES</div>
					<ul class="max-h-[50vh] divide-y divide-border overflow-y-auto lg:max-h-none">
						{#each data.polresList as p}
							<li class="p-4">
								<details class="group">
									<summary class="cursor-pointer text-sm font-medium text-foreground">
										{p.nama}
										<span class="ml-2 text-xs font-normal text-muted-foreground">
											{p.lat != null && p.lng != null ? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : 'tanpa koordinat'}
										</span>
									</summary>
									<div class="mt-3 space-y-3">
										<div class="rounded-lg border border-border bg-muted/30 p-3 text-xs">
											<p class="font-medium text-foreground">Ubah lokasi via pin peta</p>
											<p class="mt-1 text-muted-foreground">
												Klik tombol di bawah, lalu <strong>klik peta</strong> untuk memindahkan pin. Setelah sesuai, simpan.
											</p>
											<div class="mt-2 flex flex-wrap gap-2">
												<button
													type="button"
													class="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
													onclick={() => {
														editingUnitId = p.id;
														editingUnitLabel = p.nama;
														pickLat = p.lat ?? -9.6;
														pickLng = p.lng ?? 123.9;
														map?.flyTo([pickLat, pickLng], 11, { duration: 0.8 });
													}}
												>
													Ubah lokasi di peta
												</button>
												{#if editingUnitId === p.id}
													<form
														method="POST"
														action="?/setUnitMarker"
														use:enhance={(args) => {
															padMapToUnitMarkerForm(args);
															return async ({ result, update }) => {
																await update();
																if (result.type === 'success') {
																	editingUnitId = null;
																	editingUnitLabel = '';
																}
															};
														}}
													>
														<button
															type="submit"
															class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
														>
															Simpan lokasi (pin)
														</button>
													</form>
													<button
														type="button"
														class="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
														onclick={() => {
															editingUnitId = null;
															editingUnitLabel = '';
														}}
													>
														Batal
													</button>
												{/if}
											</div>
											{#if editingUnitId === p.id}
												<p class="mt-2 font-mono text-[11px] text-foreground">
													Pin: {pickLat.toFixed(5)}, {pickLng.toFixed(5)}
												</p>
											{/if}
										</div>

										<form method="POST" action="?/updatePolres" class="space-y-2" use:enhance>
											<input type="hidden" name="id" value={p.id} />
											<input name="nama" value={p.nama} class="flex h-9 w-full rounded border border-input px-2 text-sm" />
											<div class="flex gap-2">
												<input
													name="lat"
													type="number"
													step="any"
													placeholder="lat"
													value={p.lat ?? ''}
													class="h-9 w-full rounded border border-input px-2 text-sm"
												/>
												<input
													name="lng"
													type="number"
													step="any"
													placeholder="lng"
													value={p.lng ?? ''}
													class="h-9 w-full rounded border border-input px-2 text-sm"
												/>
											</div>
											<button type="submit" class="text-sm font-medium text-primary hover:underline">Simpan perubahan</button>
										</form>
										<form
											method="POST"
											action="?/deletePolres"
											use:enhance
											onsubmit={(e) => {
												if (!confirm(`Hapus ${p.nama}?`)) e.preventDefault();
											}}
										>
											<input type="hidden" name="id" value={p.id} />
											<button type="submit" class="text-sm text-destructive hover:underline">Hapus POLRES</button>
										</form>
									</div>
								</details>
							</li>
						{/each}
					</ul>
				</div>
			{:else if tab === 'polsek'}
				<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
					<label for="sel-polres" class="text-sm font-medium">POLRES</label>
					<select
						id="sel-polres"
						class="h-10 max-w-md rounded-lg border border-input bg-background px-3 text-sm"
						value={data.selectedPolresId != null ? String(data.selectedPolresId) : ''}
						onchange={(e) => selectPolres((e.currentTarget as HTMLSelectElement).value)}
					>
						<option value="">Pilih POLRES…</option>
						{#each data.polresList as p}
							<option value={String(p.id)}>{p.nama}</option>
						{/each}
					</select>
				</div>

				{#if !data.selectedPolresId}
					<p class="text-sm text-muted-foreground">Pilih POLRES untuk mengelola POLSEK.</p>
				{:else}
					<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
						<h2 class="mb-3 text-sm font-semibold">Tambah POLSEK</h2>
						<form method="POST" action="?/createPolsek" class="space-y-3" use:enhance={padMapToForm}>
							<input type="hidden" name="polres_id" value={data.selectedPolresId} />
							<div>
								<label class="text-xs font-medium" for="ns-nama">Nama POLSEK</label>
								<input
									id="ns-nama"
									name="nama"
									required
									class="mt-1 flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
								/>
							</div>
							<p class="text-xs text-muted-foreground">Koordinat dari peta: {pickLat.toFixed(5)}, {pickLng.toFixed(5)}</p>
							<button type="submit" class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
								Simpan POLSEK
							</button>
						</form>
					</div>

					<div class="rounded-xl border border-border bg-card shadow-sm">
						<div class="border-b border-border px-4 py-2 text-sm font-semibold">POLSEK</div>
						<ul class="max-h-[40vh] divide-y divide-border overflow-y-auto">
							{#each data.polsekList as s}
								<li class="p-4">
									<details>
										<summary class="cursor-pointer text-sm font-medium">
											{s.nama}
											<span class="text-xs font-normal text-muted-foreground">
												{s.lat != null && s.lng != null ? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}` : 'tanpa koordinat'}
											</span>
										</summary>
										<div class="mt-3 space-y-3">
											<form method="POST" action="?/updatePolsek" class="space-y-2" use:enhance>
												<input type="hidden" name="id" value={s.id} />
												<input name="nama" value={s.nama} class="flex h-9 w-full rounded border border-input px-2 text-sm" />
												<div class="flex gap-2">
													<input
														name="lat"
														type="number"
														step="any"
														value={s.lat ?? ''}
														class="h-9 w-full rounded border border-input px-2 text-sm"
													/>
													<input
														name="lng"
														type="number"
														step="any"
														value={s.lng ?? ''}
														class="h-9 w-full rounded border border-input px-2 text-sm"
													/>
												</div>
												<button type="submit" class="text-sm font-medium text-primary hover:underline">Simpan</button>
											</form>
											<form
												method="POST"
												action="?/deletePolsek"
												use:enhance
												onsubmit={(e) => {
													if (!confirm(`Hapus ${s.nama}?`)) e.preventDefault();
												}}
											>
												<input type="hidden" name="id" value={s.id} />
												<button type="submit" class="text-sm text-destructive hover:underline">Hapus POLSEK</button>
											</form>
										</div>
									</details>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{:else}
				<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
					<h2 class="mb-3 text-sm font-semibold">Tambah personil</h2>
					<form method="POST" action="?/createUser" class="grid gap-3 sm:grid-cols-2" use:enhance>
						<div class="sm:col-span-2">
							<label class="text-xs font-medium" for="u-user">Username</label>
							<input id="u-user" name="username" required class="mt-1 flex h-10 w-full rounded-lg border border-input px-3 text-sm" />
						</div>
						<div class="sm:col-span-2">
							<label class="text-xs font-medium" for="u-pass">Password</label>
							<input
								id="u-pass"
								name="password"
								type="password"
								required
								class="mt-1 flex h-10 w-full rounded-lg border border-input px-3 text-sm"
							/>
						</div>
						<div>
							<label class="text-xs font-medium" for="u-nama">Nama</label>
							<input id="u-nama" name="nama" required class="mt-1 flex h-10 w-full rounded-lg border border-input px-3 text-sm" />
						</div>
						<div>
							<label class="text-xs font-medium" for="u-nrp">NRP</label>
							<input
								id="u-nrp"
								name="nrp"
								required
								class="mt-1 flex h-10 w-full rounded-lg border border-input px-3 text-sm font-mono"
								placeholder="Nomor registrasi personil"
							/>
						</div>
						<div>
							<label class="text-xs font-medium" for="u-pangkat">Pangkat</label>
							<input id="u-pangkat" name="pangkat" required class="mt-1 flex h-10 w-full rounded-lg border border-input px-3 text-sm" />
						</div>
						<div>
							<label class="text-xs font-medium" for="u-role">Peran</label>
							<select id="u-role" name="role" required class="mt-1 flex h-10 w-full rounded-lg border border-input px-3 text-sm">
								<option value="POLRES">POLRES</option>
								<option value="POLSEK">POLSEK</option>
							</select>
						</div>
						<div>
							<label class="text-xs font-medium" for="u-unit">Unit</label>
							<select id="u-unit" name="unit_id" required class="mt-1 flex h-10 w-full rounded-lg border border-input px-3 text-sm">
								<option value="">Pilih unit…</option>
								{#each data.allSatwilUnits as u}
									<option value={String(u.id)}>[{u.tipe}] {u.label}</option>
								{/each}
							</select>
						</div>
						<div class="sm:col-span-2">
							<button type="submit" class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
								Buat akun
							</button>
						</div>
					</form>
				</div>

				<div class="rounded-xl border border-border bg-card shadow-sm">
					<div class="border-b border-border px-4 py-2 text-sm font-semibold">Personil terdaftar</div>
					<div class="max-h-[50vh] overflow-x-auto overflow-y-auto">
						<table class="w-full min-w-[520px] text-left text-sm">
							<thead class="border-b border-border bg-muted/40 text-xs text-muted-foreground">
								<tr>
									<th class="px-3 py-2">Nama</th>
									<th class="px-3 py-2">NRP</th>
									<th class="px-3 py-2">Username</th>
									<th class="px-3 py-2">Peran</th>
									<th class="px-3 py-2">Unit</th>
									<th class="px-3 py-2"></th>
								</tr>
							</thead>
							<tbody>
								{#each data.personil as pe}
									<tr class="border-b border-border/70">
										<td class="px-3 py-2">{pe.nama}</td>
										<td class="px-3 py-2 font-mono text-xs">{pe.nrp || '—'}</td>
										<td class="px-3 py-2 font-mono text-xs">{pe.username}</td>
										<td class="px-3 py-2">{pe.role}</td>
										<td class="px-3 py-2 text-muted-foreground">{pe.unitNama}</td>
										<td class="px-3 py-2">
											<details>
												<summary class="cursor-pointer text-xs font-medium text-primary">Edit</summary>
												<div class="mt-2 space-y-2 rounded border border-border bg-background p-2">
													<form method="POST" action="?/updateUser" class="space-y-2" use:enhance>
														<input type="hidden" name="id" value={pe.id} />
														<input name="nama" value={pe.nama} class="h-8 w-full rounded border px-2 text-xs" />
														<input name="nrp" value={pe.nrp ?? ''} class="h-8 w-full rounded border px-2 font-mono text-xs" />
														<input name="pangkat" value={pe.pangkat} class="h-8 w-full rounded border px-2 text-xs" />
														<select name="role" class="h-8 w-full rounded border px-2 text-xs" value={pe.role}>
															<option value="POLRES">POLRES</option>
															<option value="POLSEK">POLSEK</option>
														</select>
														<select name="unit_id" class="h-8 w-full rounded border px-2 text-xs" value={pe.unitId}>
															{#each data.allSatwilUnits as u}
																<option value={String(u.id)}>[{u.tipe}] {u.label}</option>
															{/each}
														</select>
														<input
															name="password"
															type="password"
															placeholder="Password baru (opsional)"
															class="h-8 w-full rounded border px-2 text-xs"
														/>
														<button type="submit" class="text-xs font-medium text-primary">Simpan</button>
													</form>
													<form
														method="POST"
														action="?/deleteUser"
														use:enhance
														onsubmit={(e) => {
															if (!confirm(`Hapus akun ${pe.username}?`)) e.preventDefault();
														}}
													>
														<input type="hidden" name="id" value={pe.id} />
														<button type="submit" class="text-xs text-destructive">Hapus</button>
													</form>
												</div>
											</details>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		</div>

		<div class="rounded-xl border border-border bg-card p-3 shadow-sm lg:sticky lg:top-4 lg:self-start">
			<h2 class="mb-1 text-sm font-semibold">Peta</h2>
			<p class="mb-2 text-xs text-muted-foreground">
				Klik pada peta untuk mengatur titik koordinat saat menambah POLRES atau POLSEK.
			</p>
			<div bind:this={mapContainer} class="h-[min(420px,50vh)] w-full rounded-lg border border-border"></div>
		</div>
	</div>
</div>

<style>
	:global(.satwil-pin) {
		background: transparent;
		border: none;
	}
	:global(.satwil-pin__dot) {
		width: 18px;
		height: 18px;
		border-radius: 9999px;
		background: #ef4444;
		border: 3px solid #fff;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
	}
</style>
