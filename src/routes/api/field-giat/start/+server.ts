import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startFieldGiatSession } from '$lib/server/field-giat';

export const POST: RequestHandler = async (event) => {
	const u = event.locals.user;
	if (!u || u.role !== 'POLSEK' || u.polresId == null || u.unitId == null) {
		error(403, 'Unauthorized');
	}
	let body: { rengiat_id?: number; lat?: number; lng?: number };
	try {
		body = (await event.request.json()) as typeof body;
	} catch {
		error(400, 'JSON tidak valid');
	}
	const rengiatId = Number(body.rengiat_id);
	const lat = Number(body.lat);
	const lng = Number(body.lng);
	if (!Number.isFinite(rengiatId) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
		return json({ error: 'rengiat_id, lat, lng wajib valid.' }, { status: 400 });
	}
	const r = startFieldGiatSession({
		userId: u.id,
		rengiatId,
		polsekUnitId: u.unitId,
		polresId: u.polresId,
		startLat: lat,
		startLng: lng
	});
	if (!r.ok) return json({ error: r.error }, { status: 400 });
	return json({ ok: true });
};
