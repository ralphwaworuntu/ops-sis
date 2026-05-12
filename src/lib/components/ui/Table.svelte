<script lang="ts">
	import type { Snippet } from 'svelte';
	import TableWrapper from './TableWrapper.svelte';

	let {
		hasRows = true,
		striped = true,
		compact = false,
		stickyHeader = false,
		class: className = '',
		header,
		body,
		empty
	}: {
		hasRows?: boolean;
		striped?: boolean;
		compact?: boolean;
		stickyHeader?: boolean;
		class?: string;
		header: Snippet;
		body: Snippet;
		empty?: Snippet;
	} = $props();

	const tdPad = $derived(compact ? 'px-3 py-2' : 'px-4 py-2.5');
</script>

<TableWrapper>
	<table class="w-full border-collapse text-left text-sm text-[var(--text)] {className}">
		<thead
			class="border-b border-[var(--border)] bg-[var(--bg)]/60 text-xs font-medium text-[var(--text-muted)] {stickyHeader
				? 'sticky top-0 z-10 backdrop-blur-sm'
				: ''}"
		>
			<tr>
				{@render header()}
			</tr>
		</thead>
		<tbody class="{striped ? '[&>tr:nth-child(even)]:bg-[var(--bg)]/40' : ''}">
			{#if !hasRows}
				{#if empty}
					<tr>
						<td colspan="999" class="{tdPad} text-center text-sm text-[var(--text-muted)]">
							{@render empty()}
						</td>
					</tr>
				{/if}
			{:else}
				{@render body()}
			{/if}
		</tbody>
	</table>
</TableWrapper>
