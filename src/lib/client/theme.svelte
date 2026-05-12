<script module lang="ts">
	export type ThemeMode = 'system' | 'light' | 'dark';

	const KEY = 'ops-sis-theme';

	let theme = $state<ThemeMode>('system');

	function systemPrefersDark() {
		if (typeof window === 'undefined') return false;
		return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
	}

	function applyToHtml(mode: ThemeMode) {
		if (typeof document === 'undefined') return;
		const html = document.documentElement;
		const effectiveDark = mode === 'dark' || (mode === 'system' && systemPrefersDark());
		html.classList.toggle('dark', effectiveDark);
	}

	function loadSaved(): ThemeMode {
		if (typeof localStorage === 'undefined') return 'system';
		const raw = localStorage.getItem(KEY);
		if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
		return 'system';
	}

	export function initTheme() {
		// Init: saved preference wins; otherwise system.
		theme = loadSaved();
		applyToHtml(theme);

		// React to system theme changes when in 'system'
		if (typeof window !== 'undefined' && window.matchMedia) {
			const mq = window.matchMedia('(prefers-color-scheme: dark)');
			const onChange = () => applyToHtml(theme);
			mq.addEventListener?.('change', onChange);
		}
	}

	export function getTheme(): ThemeMode {
		return theme;
	}

	export function setTheme(next: ThemeMode) {
		theme = next;
		try {
			localStorage?.setItem(KEY, next);
		} catch {
			/* noop */
		}
		applyToHtml(next);
	}

	export function toggleTheme() {
		// Cycle: light → dark → system
		const cur = theme;
		if (cur === 'light') return setTheme('dark');
		if (cur === 'dark') return setTheme('system');
		return setTheme('light');
	}
</script>

