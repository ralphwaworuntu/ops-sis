import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { heartbeatFieldGiatSession } from '$lib/server/field-giat';

export const POST: RequestHandler = async (event) => {
	const u = event.locals.user;
	if (!u || u.role !== 'POLSEK') {
		error(403, 'Unauthorized');
	}
	const r = heartbeatFieldGiatSession(u.id);
	if (!r.ok) return json({ error: r.error }, { status: 400 });
	return json({ ok: true });
};
