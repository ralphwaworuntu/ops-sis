<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import {
		listFailedOutbox,
		failedOutboxCount,
		retryFailedOutboxItem,
		deleteFailedOutbox,
		clearFailedOutbox,
		syncOutbox,
		type QueuedLhp
	} from '$lib/client/lhp-outbox';

	let open = $state(false);
	let loading = $state(false);
	let rows = $state<QueuedLhp[]>([]);
	let count = $state(0);
	let lastRefreshedAt = $state<number | null>(null);

	function fmtWhen(iso: string) {
		try {
			return new Date(iso).toLocaleString('id-ID', {
				day: 'numeric',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}

	async function refresh() {
		if (!browser) return;
		loading = true;
		try {
			rows = await listFailedOutbox();
			count = await failedOutboxCount();
			lastRefreshedAt = Date.now();
		} finally {
			loading = false;
		}
	}

	async function retryOne(id: string) {
		await retryFailedOutboxItem(id);
		console.log(`[FAILED-UI] Moved to outbox ${id}`);
		// Trigger one sync attempt (scheduler tetap jalan terpisah).
		void syncOutbox();
		await refresh();
	}

	async function deleteOne(id: string) {
		if (!confirm('Hapus item failed ini permanen?')) return;
		await deleteFailedOutbox(id);
		console.log(`[FAILED-UI] Deleted item ${id}`);
		await refresh();
	}

	async function retryAll() {
		if (rows.length === 0) return;
		if (!confirm(`Retry semua (${rows.length}) item failed?`)) return;
		for (const r of rows) {
			await retryFailedOutboxItem(r.id);
			console.log(`[FAILED-UI] Moved to outbox ${r.id}`);
		}
		void syncOutbox();
		await refresh();
	}

	async function clearAll() {
		if (rows.length === 0) return;
		if (!confirm(`Bersihkan semua (${rows.length}) item failed secara permanen?`)) return;
		await clearFailedOutbox();
		console.log('[FAILED-UI] Cleared failed queue');
		await refresh();
	}

	onMount(() => {
		void refresh();
		const id = setInterval(() => {
			if (document.visibilityState === 'visible') void refresh();
		}, 10000);
		const onVis = () => {
			if (document.visibilityState === 'visible') void refresh();
		};
		document.addEventListener('visibilitychange', onVis);
		return () => {
			clearInterval(id);
			document.removeEventListener('visibilitychange', onVis);
		};
	});
</script>

{#if browser}
	<div id="failed-outbox" class="rounded-xl border border-border bg-card shadow-sm">
		<button
			type="button"
			class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
			onclick={() => (open = !open)}
			aria-expanded={open ? 'true' : 'false'}
		>
			<div class="min-w-0">
				<p class="text-sm font-semibold text-foreground">Failed Queue (LHP Offline)</p>
				<p class="text-xs text-muted-foreground">
					Item yang gagal permanen (400–499) atau melebihi batas retry.
				</p>
			</div>
			<div class="flex items-center gap-2">
				{#if count > 0}
					<span class="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-900">
						{count}
					</span>
				{:else}
					<span class="text-[10px] text-muted-foreground">0</span>
				{/if}
				<svg class="h-5 w-5 text-muted-foreground transition-transform {open ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
				</svg>
			</div>
		</button>

		{#if open}
			<div class="border-t border-border px-4 py-3">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						<button
							type="button"
							class="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
							disabled={rows.length === 0 || loading}
							onclick={() => void retryAll()}
						>
							Retry Semua
						</button>
						<button
							type="button"
							class="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
							disabled={rows.length === 0 || loading}
							onclick={() => void clearAll()}
						>
							Bersihkan Semua
						</button>
						<button
							type="button"
							class="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
							disabled={loading}
							onclick={() => void refresh()}
						>
							Refresh
						</button>
					</div>
					{#if lastRefreshedAt != null}
						<p class="text-[10px] text-muted-foreground">
							Update: {new Date(lastRefreshedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
						</p>
					{/if}
				</div>

				{#if loading}
					<p class="mt-3 text-xs text-muted-foreground">Memuat…</p>
				{:else if rows.length === 0}
					<p class="mt-3 text-sm text-muted-foreground">Tidak ada item failed.</p>
				{:else}
					<div class="mt-3 overflow-x-auto">
						<table class="w-full min-w-[780px] text-left text-sm">
							<thead class="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
								<tr>
									<th class="px-3 py-2">ID</th>
									<th class="px-3 py-2">Created</th>
									<th class="px-3 py-2">Retry</th>
									<th class="px-3 py-2">Hint</th>
									<th class="px-3 py-2 text-right">Aksi</th>
								</tr>
							</thead>
							<tbody>
								{#each rows as r (r.id)}
									<tr class="border-b border-border/70">
										<td class="px-3 py-2 font-mono text-[11px] text-foreground">{r.id}</td>
										<td class="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtWhen(r.createdAt)}</td>
										<td class="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
											{r.retryCount ?? 0}
										</td>
										<td class="px-3 py-2 text-xs text-foreground">
											{#if r.lastError}
												<span class="text-rose-900">{r.lastError}</span>
												{#if r.lastHttpStatus != null}
													<span class="ml-1 text-[10px] text-muted-foreground">(HTTP {r.lastHttpStatus})</span>
												{/if}
											{:else}
												<span class="text-muted-foreground">—</span>
											{/if}
										</td>
										<td class="px-3 py-2">
											<div class="flex justify-end gap-2">
												<button
													type="button"
													class="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
													onclick={() => void retryOne(r.id)}
												>
													Retry
												</button>
												<button
													type="button"
													class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/15"
													onclick={() => void deleteOne(r.id)}
												>
													Hapus
												</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

