import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { endFieldGiatSessionForUser } from '$lib/server/field-giat';

export const POST: RequestHandler = async (event) => {
	const u = event.locals.user;
	if (!u || u.role !== 'POLSEK') {
		error(403, 'Unauthorized');
	}
	let body: { rengiat_id?: number; end_lat?: number; end_lng?: number } = {};
	try {
		body = (await event.request.json()) as typeof body;
	} catch {
		body = {};
	}
	const rid =
		typeof body.rengiat_id === 'number' && Number.isFinite(body.rengiat_id)
			? body.rengiat_id
			: undefined;
	const elat = typeof body.end_lat === 'number' && Number.isFinite(body.end_lat) ? body.end_lat : undefined;
	const elng = typeof body.end_lng === 'number' && Number.isFinite(body.end_lng) ? body.end_lng : undefined;
	endFieldGiatSessionForUser(u.id, {
		rengiatId: rid,
		...(elat != null && elng != null ? { endLat: elat, endLng: elng } : {})
	});
	return json({ ok: true });
};
