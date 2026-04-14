import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Proxy rute OSRM agar klien tidak bergantung pada CORS publik. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const lat1 = parseFloat(url.searchParams.get('lat1') ?? '');
	const lng1 = parseFloat(url.searchParams.get('lng1') ?? '');
	const lat2 = parseFloat(url.searchParams.get('lat2') ?? '');
	const lng2 = parseFloat(url.searchParams.get('lng2') ?? '');
	if (
		!Number.isFinite(lat1) ||
		!Number.isFinite(lng1) ||
		!Number.isFinite(lat2) ||
		!Number.isFinite(lng2)
	) {
		return json({ error: 'Parameter lat1,lng1,lat2,lng2 wajib' }, { status: 400 });
	}
	const osrm = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
	const res = await fetch(osrm);
	if (!res.ok) return json({ error: 'OSRM gagal' }, { status: 502 });
	const data = (await res.json()) as {
		code?: string;
		routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
	};
	if (data.code !== 'Ok' || !data.routes?.[0]) {
		return json({ error: 'Rute tidak ditemukan' }, { status: 404 });
	}
	const r = data.routes[0];
	return json({
		distanceM: r.distance,
		durationS: r.duration,
		coordinates: r.geometry.coordinates
	});
};
