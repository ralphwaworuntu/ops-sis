import { json, error, isActionFailure } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { submitPolsekActivityReport } from '$lib/server/activity-report';
import { db } from '$lib/server/db';
import { idempotencyKeys } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

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

function stableFallbackIdempotencyKey(deviceId: string, body: Body): string {
	const h = crypto.createHash('sha256');
	h.update(deviceId || 'no-device');
	h.update('|');
	h.update(String(body.rengiat_id ?? ''));
	h.update('|');
	h.update(String(body.captured_at_iso ?? ''));
	h.update('|');
	h.update(String(body.deskripsi ?? ''));
	h.update('|');
	h.update(String(body.lat ?? ''));
	h.update('|');
	h.update(String(body.lng ?? ''));
	return `sha256_${h.digest('hex')}`;
}

export const POST: RequestHandler = async (event) => {
	if (
		!event.locals.user ||
		(event.locals.user.role !== 'KATIM PATROLI' &&
			event.locals.user.role !== 'ADMIN POLSEK' &&
			event.locals.user.role !== 'KAPOLSEK' &&
			event.locals.user.role !== 'WAKAPOLSEK' &&
			event.locals.user.role !== 'KANIT SAMAPTA')
	) {
		error(403, 'Unauthorized');
	}

	let body: Body;
	try {
		body = (await event.request.json()) as Body;
	} catch {
		error(400, 'JSON tidak valid');
	}

	// Validasi minimal (4xx = permanent fail di client outbox).
	if (!Number.isFinite(Number(body.rengiat_id)) || !String(body.deskripsi ?? '').trim()) {
		return json({ error: 'rengiat_id dan deskripsi wajib valid.' }, { status: 400 });
	}

	const deviceId = event.request.headers.get('x-device-id') ?? '';
	const rawKey = event.request.headers.get('x-idempotency-key')?.trim() ?? '';
	const idemKey = rawKey || stableFallbackIdempotencyKey(deviceId, body);

	const existing = db
		.select({ state: idempotencyKeys.state })
		.from(idempotencyKeys)
		.where(eq(idempotencyKeys.key, idemKey))
		.get();
	if (existing?.state === 'done') {
		return json({ ok: true, idempotent: true });
	}
	if (existing?.state === 'started') {
		// Permintaan duplikat saat request pertama masih berjalan.
		// Anggap temporary; client outbox akan retry.
		return json({ error: 'Sync sedang diproses, coba lagi.' }, { status: 503 });
	}

	// Claim idempotency key (race-safe via PK constraint).
	try {
		db.insert(idempotencyKeys).values({ key: idemKey, state: 'started' }).run();
	} catch {
		// Jika constraint violation → ada request lain yang sudah claim.
		return json({ error: 'Sync sedang diproses, coba lagi.' }, { status: 503 });
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
		// Rollback claim supaya bisa dicoba ulang (kecuali error 4xx yang memang permanent di client).
		db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, idemKey)).run();
		const failData = result.data as { error?: string } | undefined;
		return json({ error: failData?.error ?? 'Gagal mengirim laporan' }, { status: result.status });
	}

	db.update(idempotencyKeys).set({ state: 'done' }).where(eq(idempotencyKeys.key, idemKey)).run();
	return json({ ok: true }, { status: 201 });

};
