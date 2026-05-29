<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let { data } = $props();

	let q = $state<string>('');
	let pageSize = $state<number>(50);

	$effect(() => {
		// sync dari server load (saat user ganti page / filter)
		q = data.q ?? '';
		pageSize = data.pageSize ?? 50;
	});

	function applyFilters(nextPage: number = 1) {
		const u = new URL($page.url.href);
		if (q.trim()) u.searchParams.set('q', q.trim());
		else u.searchParams.delete('q');
		u.searchParams.set('page', String(nextPage));
		u.searchParams.set('pageSize', String(pageSize));
		void goto(`${u.pathname}${u.search}`, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function fmt(iso: string) {
		try {
			return new Date(iso).toLocaleString('id-ID');
		} catch {
			return iso;
		}
	}

	function prettyJson(raw: string | null) {
		if (!raw) return '';
		try {
			return JSON.stringify(JSON.parse(raw), null, 2);
		} catch {
			return raw;
		}
	}
</script>

<svelte:head>
	<title>Audit Log — OPS SIS</title>
</svelte:head>

<div class="space-y-4">
	<div>
		<h1 class="text-xl font-bold tracking-tight text-foreground md:text-2xl">Audit Log</h1>
		<p class="text-sm text-muted-foreground">
			Menampilkan log audit untuk membantu tracing aksi user. Total: <strong>{data.total}</strong>.
		</p>
	</div>

	<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
		<div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
			<div class="flex-1">
				<label class="text-xs font-semibold text-muted-foreground" for="q">Cari</label>
				<input
					id="q"
					class="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
					placeholder="action / nama / username / unit / IP…"
					bind:value={q}
					onkeydown={(e) => {
						if (e.key === 'Enter') applyFilters(1);
					}}
				/>
			</div>
			<div class="w-full md:w-44">
				<label class="text-xs font-semibold text-muted-foreground" for="ps">Per halaman</label>
				<select
					id="ps"
					class="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
					bind:value={pageSize}
					onchange={() => applyFilters(1)}
				>
					<option value="20">20</option>
					<option value="50">50</option>
					<option value="100">100</option>
					<option value="200">200</option>
				</select>
			</div>
			<div class="flex gap-2">
				<button
					type="button"
					class="min-h-11 rounded-lg border border-border bg-background px-4 text-sm font-semibold hover:bg-muted/60"
					onclick={() => {
						q = '';
						pageSize = 50;
						applyFilters(1);
					}}
				>
					Reset
				</button>
				<button
					type="button"
					class="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
					onclick={() => applyFilters(1)}
				>
					Terapkan
				</button>
			</div>
		</div>
	</div>

	<div class="rounded-xl border border-border bg-card shadow-sm">
		<div class="border-b border-border px-4 py-3 text-sm font-semibold">Log terbaru</div>

		<div class="max-h-[70vh] overflow-auto">
			<table class="w-full min-w-[1100px] text-left text-sm">
				<thead class="sticky top-0 border-b border-border bg-muted/40 text-xs text-muted-foreground">
					<tr>
						<th class="px-3 py-2">Waktu</th>
						<th class="px-3 py-2">Action</th>
						<th class="px-3 py-2">User</th>
						<th class="px-3 py-2">Unit</th>
						<th class="px-3 py-2">Entity</th>
						<th class="px-3 py-2">IP</th>
						<th class="px-3 py-2">Detail</th>
					</tr>
				</thead>
				<tbody>
					{#each data.rows as r (r.id)}
						<tr class="border-b border-border/70 align-top">
							<td class="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{fmt(r.createdAt)}</td>
							<td class="px-3 py-2 font-mono text-xs">{r.action}</td>
							<td class="px-3 py-2">
								<div class="text-sm font-medium">{r.nama ?? r.actorNama ?? '—'}</div>
								<div class="text-xs text-muted-foreground font-mono">{r.username ?? r.actorUsername ?? 'anon'}</div>
								{#if r.role ?? r.actorRole}
									<div class="text-[10px] text-muted-foreground">{r.role ?? r.actorRole}</div>
								{/if}
							</td>
							<td class="px-3 py-2">
								<div class="text-sm">{r.unitNama ?? r.actorUnitNama ?? '—'}</div>
								{#if (r.unitId ?? r.actorUnitId) != null}
									<div class="text-xs text-muted-foreground font-mono">unit_id={r.unitId ?? r.actorUnitId}</div>
								{/if}
							</td>
							<td class="px-3 py-2">
								<div class="text-xs font-mono">{r.entityType ?? '—'}</div>
								<div class="text-xs text-muted-foreground font-mono">{r.entityId ?? '—'}</div>
							</td>
							<td class="px-3 py-2 font-mono text-xs">{r.ip}</td>
							<td class="px-3 py-2">
								{#if r.detailJson}
									<details>
										<summary class="cursor-pointer text-xs font-semibold text-primary">lihat</summary>
										<pre class="mt-2 max-w-[520px] overflow-auto rounded-lg border border-border bg-background p-2 text-[11px] leading-relaxed">{prettyJson(r.detailJson)}</pre>
										{#if r.userAgent}
											<p class="mt-2 text-[11px] text-muted-foreground break-words">
												UA: {r.userAgent}
											</p>
										{/if}
										{#if r.deviceId}
											<p class="mt-1 text-[11px] text-muted-foreground">device: {r.deviceId}</p>
										{/if}
									</details>
								{:else}
									<span class="text-xs text-muted-foreground">—</span>
								{/if}
							</td>
						</tr>
					{:else}
						<tr>
							<td class="px-4 py-10 text-center text-sm text-muted-foreground" colspan="7">Tidak ada data.</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-2">
		<p class="text-xs text-muted-foreground">
			Page {data.page} / {data.totalPages} · {data.pageSize} per halaman
		</p>
		<div class="flex gap-2">
			<button
				type="button"
				class="min-h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold hover:bg-muted/60 disabled:opacity-50"
				disabled={data.page <= 1}
				onclick={() => applyFilters(Math.max(1, data.page - 1))}
			>
				Sebelumnya
			</button>
			<button
				type="button"
				class="min-h-10 rounded-lg border border-border bg-background px-3 text-sm font-semibold hover:bg-muted/60 disabled:opacity-50"
				disabled={data.page >= data.totalPages}
				onclick={() => applyFilters(Math.min(data.totalPages, data.page + 1))}
			>
				Berikutnya
			</button>
		</div>
	</div>
</div>

