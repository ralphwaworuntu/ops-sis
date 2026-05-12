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

	const fetchWithTimeout = async () => {
		const ac = new AbortController();
		const t = setTimeout(() => ac.abort(), 5000);
		try {
			return await fetch(osrm, { signal: ac.signal });
		} finally {
			clearTimeout(t);
		}
	};

	let res: Response | null = null;
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			res = await fetchWithTimeout();
			if (res.ok) break;
			// Jika OSRM balas error HTTP, tidak perlu retry berkali-kali (retry 1x saja).
		} catch (e) {
			if (attempt === 0) {
				// Backoff sederhana sebelum retry.
				await new Promise((r) => setTimeout(r, 200));
				continue;
			}
			const msg = e instanceof Error ? e.message : String(e);
			if (msg.includes('aborted')) console.warn('[OSRM] Timeout → fallback');
			else console.warn('[OSRM] Fail → fallback');
			return json({ error: 'Route unavailable' }, { status: 503 });
		}
		// retry once on non-ok response
		if (attempt === 0) await new Promise((r) => setTimeout(r, 200));
	}

	if (!res || !res.ok) {
		console.warn('[OSRM] Fallback (bad response)');
		return json({ error: 'Route unavailable' }, { status: 503 });
	}

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
