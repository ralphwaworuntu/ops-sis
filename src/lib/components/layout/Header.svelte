<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { getTheme, toggleTheme } from '$lib/client/theme.svelte';
	import { browser } from '$app/environment';

	let {
		sticky = true,
		leading,
		breadcrumbs,
		search,
		trailing,
		actions
	}: {
		sticky?: boolean;
		leading?: Snippet;
		breadcrumbs?: Snippet;
		search?: Snippet;
		trailing?: Snippet;
		actions?: Snippet;
	} = $props();

	let themeLabel = $state('Tema');

	function refreshLabel() {
		const t = getTheme();
		themeLabel = t === 'light' ? 'Tema: Terang' : t === 'dark' ? 'Tema: Gelap' : 'Tema: Sistem';
	}

	$effect(() => {
		if (!browser) return;
		refreshLabel();
	});
</script>

<header
	class="{sticky ? 'sticky top-0 z-50' : ''} flex min-h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:px-4"
>
	{#if leading}
		<div class="flex shrink-0 items-center">
			{@render leading()}
		</div>
	{/if}
	<div class="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
		{#if breadcrumbs}
			<nav class="min-w-0 text-xs text-[var(--text-muted)] sm:text-sm" aria-label="Breadcrumb">
				{@render breadcrumbs()}
			</nav>
		{/if}
		{#if search}
			<div class="w-full min-w-0 sm:max-w-md">
				{@render search()}
			</div>
		{/if}
	</div>

	<div class="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2">
		{#if trailing}
			<div class="flex flex-wrap items-center justify-end gap-2">
				{@render trailing()}
			</div>
		{/if}
		{#if actions}
			{@render actions()}
		{/if}
		<Button
			variant="secondary"
			size="sm"
			class="hidden sm:inline-flex"
			onclick={() => {
				toggleTheme();
				refreshLabel();
			}}
			aria-label={themeLabel}
		>
			{themeLabel}
		</Button>
		<Button
			variant="ghost"
			size="sm"
			class="sm:hidden"
			onclick={() => {
				toggleTheme();
				refreshLabel();
			}}
			aria-label="Ganti tema"
		>
			<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
				/>
			</svg>
		</Button>
	</div>
</header>
