import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { heartbeatFieldGiatSession } from '$lib/server/field-giat';

export const POST: RequestHandler = async (event) => {
	const u = event.locals.user;
	if (
		!u ||
		(u.role !== 'KATIM PATROLI' &&
			u.role !== 'ADMIN POLSEK' &&
			u.role !== 'KAPOLSEK' &&
			u.role !== 'WAKAPOLSEK' &&
			u.role !== 'KANIT SAMAPTA')
	) {
		error(403, 'Unauthorized');
	}
	const r = heartbeatFieldGiatSession(u.id);
	if (!r.ok) return json({ error: r.error }, { status: 400 });
	return json({ ok: true });
};
