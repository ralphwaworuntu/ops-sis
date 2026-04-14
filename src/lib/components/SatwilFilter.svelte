<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	export type PolresOpt = { id: number; nama: string };

	let { polresList }: { polresList: PolresOpt[] } = $props();

	function onchange(e: Event) {
		const v = (e.target as HTMLSelectElement).value;
		const u = new URL($page.url.href);
		if (v) u.searchParams.set('satwil', v);
		else u.searchParams.delete('satwil');
		void goto(`${u.pathname}${u.search}`, { replaceState: true, keepFocus: true, noScroll: true });
	}
</script>

{#if polresList.length > 0}
	<div class="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
		<label for="satwil-filter" class="text-sm font-medium text-foreground whitespace-nowrap"
			>Filter Satwil (POLRES)</label
		>
		<select
			id="satwil-filter"
			class="h-10 max-w-full rounded-lg border border-input bg-background px-3 text-sm sm:max-w-md"
			value={$page.url.searchParams.get('satwil') ?? ''}
			onchange={onchange}
		>
			<option value="">Semua wilayah</option>
			{#each polresList as p}
				<option value={String(p.id)}>{p.nama}</option>
			{/each}
		</select>
	</div>
{/if}
