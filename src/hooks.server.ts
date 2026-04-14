import type { Handle } from '@sveltejs/kit';
import { validateSession } from '$lib/server/auth';
import { startFieldGiatStaleWatchdog } from '$lib/server/field-giat-stale-watchdog';

startFieldGiatStaleWatchdog();

export const handle: Handle = async ({ event, resolve }) => {
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
