import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { login } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(302, '/dashboard');
	}
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const username = data.get('username')?.toString() ?? '';
		const password = data.get('password')?.toString() ?? '';

		if (!username || !password) {
			return fail(400, { error: 'Username dan password harus diisi.', username });
		}

		const result = await login(username, password);
		if (!result) {
			return fail(401, { error: 'Username atau password salah.', username });
		}

		const isProd = process.env.NODE_ENV === 'production';
		cookies.set('session', result.sessionId, {
			path: '/',
			httpOnly: true,
			// sameSite:
			// - 'lax' menjaga cookie tetap terkirim pada navigasi normal (paling kompatibel untuk app web).
			// - gunakan 'strict' bila tidak ada kebutuhan cross-site sama sekali.
			sameSite: 'lax',
			// secure harus true di HTTPS (production). Di dev LAN (HTTP) harus false agar cookie tersimpan.
			secure: isProd,
			maxAge: 60 * 60 * 24 * 7
		});

		redirect(302, '/dashboard');
	}
};
