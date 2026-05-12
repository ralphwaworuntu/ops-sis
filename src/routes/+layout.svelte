<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { initTheme } from '$lib/client/theme.svelte';

	let { children } = $props();

	onMount(() => {
		// Theme init (client-only): apply 'dark' class on <html> based on saved/system preference.
		initTheme();

		// Jangan aktifkan SW saat dev agar tidak mengganggu HMR/cache.
		if (!browser || import.meta.env.DEV) return;
		if (!('serviceWorker' in navigator)) return;
		void navigator.serviceWorker.register('/service-worker.js');
	});
</script>

{@render children()}
