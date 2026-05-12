<script lang="ts">
	import { browser } from '$app/environment';
	import { dismissToast, type ToastItem, type ToastType } from '$lib/client/toast.svelte';

	let { items }: { items: ToastItem[] } = $props();

	function styles(t: ToastType) {
		if (t === 'success')
			return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100';
		if (t === 'error')
			return 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100';
		return 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)]';
	}
</script>

{#if browser && items.length > 0}
	<div
		class="pointer-events-none fixed bottom-20 right-4 z-[60] flex max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6"
		aria-live="polite"
		aria-relevant="additions text"
	>
		{#each items as t (t.id)}
			<div
				class="pointer-events-auto flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 shadow-[var(--shadow-lg)] {styles(
					t.type
				)}"
				role="status"
			>
				<p class="min-w-0 flex-1 text-sm font-medium">{t.message}</p>
				<button
					type="button"
					class="shrink-0 rounded-md p-1 text-[var(--text-muted)] hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] dark:hover:bg-white/10"
					onclick={() => dismissToast(t.id)}
					aria-label="Tutup notifikasi"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		{/each}
	</div>
{/if}
