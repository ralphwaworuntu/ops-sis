import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCounters } from '$lib/server/telemetry';

export const GET: RequestHandler = async () => {
	return json({
		ok: true,
		telemetry: getCounters()
	});
};

