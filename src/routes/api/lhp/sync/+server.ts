import { json, error, isActionFailure } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { submitPolsekActivityReport } from '$lib/server/activity-report';

type Body = {
	rengiat_id: number;
	deskripsi: string;
	jumlah_terploting?: number;
	bukti_lapangan?: boolean;
	lat?: string;
	lng?: string;
	foto_base64?: string | null;
	foto_name?: string | null;
	foto_mime?: string | null;
	/** ISO waktu simpan lokal (antrean) — dipakai sebagai created_at di server. */
	captured_at_iso?: string | null;
};

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user || event.locals.user.role !== 'POLSEK') {
		error(403, 'Unauthorized');
	}

	let body: Body;
	try {
		body = (await event.request.json()) as Body;
	} catch {
		error(400, 'JSON tidak valid');
	}

	const fd = new FormData();
	fd.append('rengiat_id', String(body.rengiat_id));
	fd.append('deskripsi', body.deskripsi ?? '');
	fd.append('jumlah_terploting', String(body.jumlah_terploting ?? 0));
	if (body.bukti_lapangan) fd.append('bukti_lapangan', 'on');
	fd.append('lat', body.lat ?? '');
	fd.append('lng', body.lng ?? '');
	if (body.captured_at_iso) {
		fd.append('captured_at_iso', body.captured_at_iso);
	}

	if (body.foto_base64) {
		const buf = Buffer.from(body.foto_base64, 'base64');
		const mime = body.foto_mime || 'image/jpeg';
		const name = body.foto_name || 'laporan.jpg';
		fd.append('foto', new Blob([buf], { type: mime }), name);
	}

	const result = await submitPolsekActivityReport(event.locals, fd, event);
	if (isActionFailure(result)) {
		const failData = result.data as { error?: string } | undefined;
		return json({ error: failData?.error ?? 'Gagal mengirim laporan' }, { status: result.status });
	}
	return json({ ok: true });
};
