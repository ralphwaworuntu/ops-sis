import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		// '0.0.0.0' = dengarkan di semua interface; kalau hanya localhost, http://IP-LAN:5173 akan gagal
		host: '0.0.0.0',
		port: 5173,
		strictPort: true
	},
	preview: {
		host: '0.0.0.0',
		port: 4173,
		strictPort: true
	}
});
