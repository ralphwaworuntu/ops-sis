<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '$lib/components/ui/Card.svelte';
	import Table from '$lib/components/ui/Table.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let { data, form } = $props();

	let selected = $state<Set<number>>(new Set());
	let pendingBulk = $state<'verify' | 'return' | null>(null);

	function toggle(id: number) {
		const n = new Set(selected);
		if (n.has(id)) n.delete(id);
		else n.add(id);
		selected = n;
	}

	function toggleAll(checked: boolean) {
		if (!checked) {
			selected = new Set();
			return;
		}
		selected = new Set(data.rows.map((r) => r.id));
	}

	function thumbUrl(path: string | null) {
		if (!path) return null;
		const p = path.startsWith('/') ? path.slice(1) : path;
		return `/api/uploads/${p}`;
	}

	function formatWhen(iso: string) {
		return new Date(iso).toLocaleString('id-ID', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Verifikasi LHP — OPS SIS</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-xl font-bold tracking-tight text-foreground md:text-2xl">Verifikasi LHP</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Laporan menunggu verifikasi Kabag Ops. Baris <span class="text-red-700">merah</span> = di luar radius geo-fence
			(200 m dari titik acuan). Setujui massal atau kembalikan dengan alasan — POLSEK mendapat notifikasi SSE.
		</p>
	</div>

	{#if form?.error}
		<div class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
			{form.error}
		</div>
	{/if}
	{#if form?.success}
		<div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
			Aksi tersimpan.
		</div>
	{/if}

	<form
		method="POST"
		action="?/bulk"
		class="space-y-4"
		use:enhance={() => {
			return async ({ update }) => {
				try {
					selected = new Set();
					await update();
				} finally {
					pendingBulk = null;
				}
			};
		}}
	>
		<Card>
			<div class="flex flex-wrap items-center gap-3">
				<label class="flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--text)]">
					<input
						type="checkbox"
						checked={data.rows.length > 0 && selected.size === data.rows.length}
						onchange={(e) => toggleAll((e.currentTarget as HTMLInputElement).checked)}
						class="rounded border-input"
					/>
					Pilih semua
				</label>
				<span class="text-xs text-muted-foreground sm:text-sm">{selected.size} dipilih</span>
				<Button
					type="submit"
					name="bulk_action"
					value="verify"
					variant="primary"
					class="bg-emerald-600 hover:opacity-95"
					disabled={selected.size === 0 || pendingBulk != null}
					loading={pendingBulk === 'verify'}
					onclick={() => {
						pendingBulk = 'verify';
					}}
				>
					Setujui terpilih
				</Button>
				<Button
					type="submit"
					name="bulk_action"
					value="return"
					variant="secondary"
					class="border-destructive/40 bg-destructive/10 font-semibold text-destructive hover:bg-destructive/15"
					disabled={selected.size === 0 || pendingBulk != null}
					loading={pendingBulk === 'return'}
					onclick={() => {
						pendingBulk = 'return';
					}}
				>
					Kembalikan terpilih
				</Button>
			</div>
		</Card>

		<div>
			<label for="return_note" class="text-sm font-medium text-foreground">Alasan pengembalian (wajib jika kembalikan)</label>
			<textarea
				id="return_note"
				name="return_note"
				rows="2"
				class="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-base min-h-[5.5rem]"
				placeholder="Mis.: foto buram, koordinat tidak sesuai titik giat…"
			></textarea>
		</div>

		{#each data.rows as row (row.id)}
			<input type="hidden" name="report_id" value={row.id} disabled={!selected.has(row.id)} />
		{/each}

		<Card padding={false} class="overflow-hidden shadow-sm">
			<Table hasRows={data.rows.length > 0} stickyHeader={true} class="min-w-[960px]">
				{#snippet header()}
					<th class="w-10 px-4 py-2.5"></th>
					<th class="px-4 py-2.5">Foto</th>
					<th class="px-4 py-2.5">Waktu laporan</th>
					<th class="px-4 py-2.5">Personil / POLSEK</th>
					<th class="px-4 py-2.5">Rengiat</th>
					<th class="px-4 py-2.5">Radius</th>
					<th class="px-4 py-2.5">Deskripsi</th>
				{/snippet}
				{#snippet empty()}
					Tidak ada LHP yang menunggu verifikasi.
				{/snippet}
				{#snippet body()}
					{#each data.rows as row (row.id)}
						<tr
							class="border-b border-[var(--border)]/80 {row.diLuarRadius
								? 'bg-red-50/90 dark:bg-red-950/25'
								: 'hover:bg-[var(--bg)]/35'}"
						>
							<td class="px-4 py-2.5 align-top">
								<input
									type="checkbox"
									checked={selected.has(row.id)}
									onchange={() => toggle(row.id)}
									class="rounded border-input"
									aria-label="Pilih LHP {row.id}"
								/>
							</td>
							<td class="px-4 py-2.5 align-top">
								{#if thumbUrl(row.fotoPath)}
									<a href={thumbUrl(row.fotoPath)} target="_blank" rel="noopener noreferrer">
										<img
											src={thumbUrl(row.fotoPath)}
											alt="Bukti"
											class="h-16 w-16 rounded-md border border-border object-cover"
										/>
									</a>
								{:else}
									<span class="text-xs text-muted-foreground">—</span>
								{/if}
							</td>
							<td class="px-4 py-2.5 align-top text-xs text-muted-foreground whitespace-nowrap">
								{formatWhen(row.createdAt)}
							</td>
							<td class="px-4 py-2.5 align-top">
								<p class="font-medium text-foreground">{row.userNama}</p>
								<p class="text-xs font-mono text-muted-foreground">{row.userNrp || '—'}</p>
								<p class="text-xs text-muted-foreground">{row.polsekNama ?? '—'}</p>
							</td>
							<td class="px-4 py-2.5 align-top text-xs">{row.rengiatJudul}</td>
							<td class="px-4 py-2.5 align-top">
								{#if row.diLuarRadius}
									<span
										class="inline-flex rounded-full bg-red-200 px-2 py-0.5 text-xs font-bold text-red-950 dark:bg-red-900/50 dark:text-red-100"
									>
										Di luar radius
									</span>
									{#if row.distanceMeters != null}
										<p class="mt-1 text-xs text-red-800 dark:text-red-200/90">~{Math.round(row.distanceMeters)} m</p>
									{/if}
								{:else}
									<span class="text-xs text-emerald-800 dark:text-emerald-200/90">Dalam radius</span>
								{/if}
							</td>
							<td class="px-4 py-2.5 align-top text-xs text-foreground max-w-xs">
								<p class="line-clamp-4">{row.deskripsi}</p>
								<p class="mt-1 text-xs text-muted-foreground">
									Terploting: {row.jumlahTerploting ?? 0}
									{#if row.isBuktiLapangan}· bukti{/if}
								</p>
							</td>
						</tr>
					{/each}
				{/snippet}
			</Table>
		</Card>
	</form>
</div>
