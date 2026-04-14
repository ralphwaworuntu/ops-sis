import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { logout } from '$lib/server/auth';

export const actions: Actions = {
	default: async ({ cookies, locals }) => {
		if (locals.sessionId) {
			await logout(locals.sessionId);
		}
		cookies.delete('session', { path: '/' });
		redirect(302, '/login');
	}
};
