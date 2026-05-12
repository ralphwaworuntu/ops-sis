<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		padding = true,
		hover = false,
		border = true,
		class: className = '',
		header,
		children,
		footer
	}: {
		padding?: boolean;
		hover?: boolean;
		border?: boolean;
		class?: string;
		header?: Snippet;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	const shell = $derived(
		[
			'rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-md)]',
			border ? 'border border-[var(--border)]' : '',
			hover ? 'transition-shadow hover:shadow-[var(--shadow-lg)]' : '',
			className
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<div class={shell}>
	{#if header}
		<div class="border-b border-[var(--border)] {padding ? 'px-4 py-3' : ''}">
			{@render header()}
		</div>
	{/if}
	<div class={padding ? 'p-4' : ''}>
		{@render children()}
	</div>
	{#if footer}
		<div class="border-t border-[var(--border)] {padding ? 'px-4 py-3' : ''}">
			{@render footer()}
		</div>
	{/if}
</div>
