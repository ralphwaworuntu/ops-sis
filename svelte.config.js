import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		alias: {
			'$components': 'src/lib/components',
			'$components/*': 'src/lib/components/*'
		},
		// Tanpa ini, login dari laptop lain (Host = IP LAN) sering gagal: browser kirim
		// Origin http://192.168.x.x:5173 sementara request internal bisa terbaca sebagai localhost → CSRF tolak POST.
		// '*' menonaktifkan pengecekan origin form. Untuk deploy internet publik, ganti daftar origin eksplisit.
		csrf: {
			trustedOrigins: ['*']
		}
	}
};

export default config;
