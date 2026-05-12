<script lang="ts">
	/** Reuse di login, sidebar, header, PWA shell — sumber tunggal `/LOGO_OPS-SIS.png`. */
	type Size = 'xs' | 'sm' | 'sidebar' | 'md' | 'lg';

	let {
		size = 'md',
		class: className = '',
		priority = false
	}: {
		size?: Size;
		class?: string;
		priority?: boolean;
	} = $props();

	const dim: Record<Size, string> = {
		xs: 'h-7 w-7 min-h-7 min-w-7',
		sm: 'h-8 w-8 min-h-8 min-w-8',
		sidebar: 'h-9 w-9 min-h-9 min-w-9',
		md: 'h-16 w-16 min-h-16 min-w-16',
		lg: 'h-24 w-24 min-h-24 min-w-24'
	};
</script>

<img
	src="/LOGO_OPS-SIS.png"
	width="512"
	height="512"
	alt="OPS-SIS — OPS POLDA NTT"
	class="object-contain {dim[size]} {className}"
	loading={priority ? 'eager' : 'lazy'}
	decoding="async"
/>
