<script lang="ts">
	type Variant = 'text' | 'card' | 'table-row' | 'avatar';

	let {
		variant = 'text',
		lines = 3,
		class: className = ''
	}: {
		variant?: Variant;
		lines?: number;
		class?: string;
	} = $props();

	const base = 'animate-pulse rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--border)_50%,transparent)]';
</script>

{#if variant === 'text'}
	<div class="space-y-2 {className}">
		{#each Array.from({ length: lines }) as _, i}
			<div class="{base} h-3 w-full {i === lines - 1 ? 'w-2/3' : ''}"></div>
		{/each}
	</div>
{:else if variant === 'card'}
	<div class="{base} h-32 w-full {className}"></div>
{:else if variant === 'avatar'}
	<div class="{base} h-10 w-10 {className}"></div>
{:else}
	<tr class="{className}">
		<td colspan="999" class="px-4 py-3">
			<div class="flex items-center gap-3">
				<div class="{base} h-4 w-4 rounded-full"></div>
				<div class="flex-1 space-y-2">
					<div class="{base} h-3 w-1/3"></div>
					<div class="{base} h-3 w-2/3"></div>
				</div>
			</div>
		</td>
	</tr>
{/if}
