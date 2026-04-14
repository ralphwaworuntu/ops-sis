<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="flex min-h-screen flex-col bg-slate-950 text-slate-100">
	<header class="flex h-11 shrink-0 items-center gap-4 border-b border-slate-800 px-4">
		<a href="/dashboard" class="text-sm font-medium text-sky-400 hover:text-sky-300">← Dashboard</a>
		<span class="text-sm font-semibold tracking-tight text-white">Live Wall — Monitoring pasif</span>
	</header>
	<div class="min-h-0 flex-1">
		{@render children()}
	</div>
</div>
