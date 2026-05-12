import { describe, expect, it, vi } from 'vitest';

// NOTE:
// - Vitest refuses files prefixed with '+' in their name, so this test lives next to +page.server.ts.
// - We mock $lib/server/auth to avoid native sqlite bindings in the test runner.
vi.mock('$lib/server/auth', () => {
	return {
		login: vi.fn(async (username: string, password: string) => {
			if (username === 'u1' && password === 'pw123') {
				return { sessionId: 'sess_test_123', user: { id: 1, username: 'u1' } };
			}
			return null;
		}),
		logout: vi.fn(async () => {}),
		validateSession: vi.fn(async () => ({ user: null, session: null }))
	};
});

describe('auth flow (login → session → logout)', () => {
	it('sets cookie on login and deletes cookie on logout', async () => {
		const { actions: loginActions } = await import('./+page.server');
		const { actions: logoutActions } = await import('../logout/+page.server');
		const { logout } = await import('$lib/server/auth');

		const cookiesSet = vi.fn();
		const cookiesDelete = vi.fn();

		const req = new Request('http://localhost/login', { method: 'POST' });
		vi.spyOn(req, 'formData').mockResolvedValue(
			new Map([
				['username', 'u1'],
				['password', 'pw123']
			]) as unknown as FormData
		);

		try {
			await loginActions.default({
				request: req,
				cookies: { set: cookiesSet } as unknown as { set: (name: string, value: string, opts?: unknown) => void }
			} as Parameters<typeof loginActions.default>[0]);
		} catch {
			// redirect throws in SvelteKit runtime
		}

		expect(cookiesSet).toHaveBeenCalledTimes(1);
		const sessionId = (cookiesSet.mock.calls[0]?.[1] as string) ?? '';
		expect(sessionId).toBe('sess_test_123');

		try {
			await logoutActions.default({
				cookies: { delete: cookiesDelete } as unknown as { delete: (name: string, opts?: unknown) => void },
				locals: { sessionId }
			} as Parameters<typeof logoutActions.default>[0]);
		} catch {
			/* redirect */
		}
		expect(cookiesDelete).toHaveBeenCalledTimes(1);
		expect(logout).toHaveBeenCalledTimes(1);
	});
});

