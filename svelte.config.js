import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

function getTrustedOrigins() {
	const isProd = process.env.NODE_ENV === 'production';
	const rawAppUrl = process.env.VITE_APP_URL;

	// Dev: izinkan origin localhost + IP LAN (agar login dari device lain tidak kena CSRF false-positive).
	// Prod: wajib origin tunggal dari env (tanpa wildcard).
	if (!isProd) {
		// SvelteKit hanya menerima array string (bukan regex).
		// Untuk akses LAN (http://192.168.x.x:5173), set env `DEV_TRUSTED_ORIGINS`
		// contoh: DEV_TRUSTED_ORIGINS=http://192.168.1.10:5173,http://192.168.1.11:5173
		const devExtra = (process.env.DEV_TRUSTED_ORIGINS ?? '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		return ['http://localhost:5173', 'http://127.0.0.1:5173', ...devExtra];
	}

	if (!rawAppUrl) {
		// Fail-closed: jangan fallback ke wildcard.
		// Jika env production belum di-set (mis. saat tooling/build lokal), biarkan list kosong
		// agar SvelteKit tetap melakukan pemeriksaan same-origin default.
		return [];
	}
	const origin = new URL(rawAppUrl).origin;
	return [origin];
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		alias: {
			'$components': 'src/lib/components',
			'$components/*': 'src/lib/components/*'
		},
		// CSRF: trustedOrigins harus eksplisit.
		// - Dev: localhost + IP LAN dev server (mencegah false-positive saat akses via IP).
		// - Prod: 1 origin dari VITE_APP_URL (tanpa wildcard).
		csrf: {
			trustedOrigins: getTrustedOrigins()
		}
	}
};

export default config;
