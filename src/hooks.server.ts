import type { Handle } from '@sveltejs/kit';
import { validateSession } from '$lib/server/auth';
import { startFieldGiatStaleWatchdog } from '$lib/server/field-giat-stale-watchdog';

startFieldGiatStaleWatchdog();

function allowedOriginForRequest(origin: string | null, fallbackAppOrigin: string): boolean {
	if (!origin) return false;
	const isProd = process.env.NODE_ENV === 'production';
	if (!isProd) {
		if (origin === 'http://localhost:5173') return true;
		return /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:5173$/.test(origin);
	}
	const raw = process.env.VITE_APP_URL ?? process.env.ORIGIN;
	if (!raw) return origin === fallbackAppOrigin;
	try {
		return origin === new URL(raw).origin;
	} catch {
		return false;
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	// Defense-in-depth CSRF hardening:
	// Untuk request state-changing (POST/PUT/PATCH/DELETE), pastikan Origin cocok dengan allowlist.
	// Ini melengkapi mekanisme CSRF bawaan SvelteKit (kit.csrf.trustedOrigins).
	const m = event.request.method.toUpperCase();
	if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS') {
		const origin = event.request.headers.get('origin');
		if (!allowedOriginForRequest(origin, event.url.origin)) {
			return new Response('Forbidden (bad origin)', { status: 403 });
		}
	}

	const sessionId = event.cookies.get('session');
	if (sessionId) {
		const { user, session } = await validateSession(sessionId);
		event.locals.user = user;
		event.locals.sessionId = session?.id ?? null;
	} else {
		event.locals.user = null;
		event.locals.sessionId = null;
	}
	return resolve(event);
};
