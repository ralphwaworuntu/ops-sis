<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type Size = 'sm' | 'md' | 'lg';

	let {
		variant = 'primary',
		size = 'md',
		loading = false,
		disabled = false,
		type = 'button',
		class: className = '',
		iconLeft,
		iconRight,
		children,
		...rest
	}: {
		variant?: Variant;
		size?: Size;
		loading?: boolean;
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		class?: string;
		iconLeft?: Snippet;
		iconRight?: Snippet;
		children: Snippet;
		[key: string]: unknown;
	} = $props();

	const base =
		'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] active:scale-95 disabled:pointer-events-none disabled:opacity-50';

	const variants: Record<Variant, string> = {
		primary:
			'bg-[var(--primary)] text-white shadow-[var(--shadow-sm)] hover:opacity-95',
		secondary:
			'border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)] hover:bg-[var(--bg)]',
		ghost: 'bg-transparent text-[var(--text)] hover:bg-[var(--border)]/30',
		danger:
			'bg-[var(--danger)] text-white shadow-[var(--shadow-sm)] hover:opacity-95'
	};

	const sizes: Record<Size, string> = {
		sm: 'px-3 py-2 text-sm',
		md: 'px-4 py-2.5 text-sm',
		lg: 'px-5 py-3 text-base'
	};

	const cls = $derived(`${base} ${variants[variant]} ${sizes[size]} ${className}`.trim());
</script>

<button {...rest} {type} class={cls} disabled={disabled || loading} aria-busy={loading ? 'true' : 'false'}>
	{#if loading}
		<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
			<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
		</svg>
	{:else if iconLeft}
		{@render iconLeft()}
	{/if}

	{@render children()}

	{#if iconRight && !loading}
		{@render iconRight()}
	{/if}
</button>
