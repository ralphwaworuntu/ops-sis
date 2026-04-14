import { db } from '$lib/server/db';
import { fieldGiatSessions, rengiat, users, units } from '$lib/server/db/schema';
import { and, eq, isNull, desc } from 'drizzle-orm';
import { sseBroadcaster } from '$lib/server/sse';

function emitFieldGiatUpdate(polresId: number) {
	const sessions = listActiveFieldSessionsForPolres(polresId);
	sseBroadcaster.emit({
		type: 'field_giat_update',
		data: { polresId, sessions }
	});
}

export function listActiveFieldSessionsForPolres(polresId: number) {
	return db
		.select({
			id: fieldGiatSessions.id,
			userId: fieldGiatSessions.userId,
			rengiatId: fieldGiatSessions.rengiatId,
			polsekUnitId: fieldGiatSessions.polsekUnitId,
			startLat: fieldGiatSessions.startLat,
			startLng: fieldGiatSessions.startLng,
			startedAt: fieldGiatSessions.startedAt,
			lastHeartbeatAt: fieldGiatSessions.lastHeartbeatAt,
			userNama: users.nama,
			userNrp: users.nrp,
			polsekNama: units.nama,
			rengiatJudul: rengiat.judul
		})
		.from(fieldGiatSessions)
		.innerJoin(users, eq(fieldGiatSessions.userId, users.id))
		.innerJoin(units, eq(fieldGiatSessions.polsekUnitId, units.id))
		.innerJoin(rengiat, eq(fieldGiatSessions.rengiatId, rengiat.id))
		.where(and(eq(fieldGiatSessions.polresId, polresId), isNull(fieldGiatSessions.endedAt)))
		.orderBy(desc(fieldGiatSessions.startedAt))
		.all();
}

function endOpenSessionsForUser(userId: number) {
	const open = db
		.select({ id: fieldGiatSessions.id, polresId: fieldGiatSessions.polresId })
		.from(fieldGiatSessions)
		.where(and(eq(fieldGiatSessions.userId, userId), isNull(fieldGiatSessions.endedAt)))
		.all();
	if (open.length === 0) return;
	const now = new Date().toISOString();
	for (const r of open) {
		db.update(fieldGiatSessions).set({ endedAt: now }).where(eq(fieldGiatSessions.id, r.id)).run();
	}
	const polresIds = [...new Set(open.map((o) => o.polresId))];
	for (const pid of polresIds) emitFieldGiatUpdate(pid);
}

export function startFieldGiatSession(params: {
	userId: number;
	rengiatId: number;
	polsekUnitId: number;
	polresId: number;
	startLat: number;
	startLng: number;
}): { ok: true } | { ok: false; error: string } {
	const rg = db.select().from(rengiat).where(eq(rengiat.id, params.rengiatId)).get();
	if (!rg || rg.status !== 'Approved' || rg.polresId !== params.polresId) {
		return { ok: false, error: 'Rengiat tidak valid atau belum disetujui.' };
	}

	endOpenSessionsForUser(params.userId);

	const now = new Date().toISOString();
	db.insert(fieldGiatSessions)
		.values({
			userId: params.userId,
			rengiatId: params.rengiatId,
			polsekUnitId: params.polsekUnitId,
			polresId: params.polresId,
			startLat: params.startLat,
			startLng: params.startLng,
			startedAt: now,
			endedAt: null,
			lastHeartbeatAt: now
		})
		.run();

	emitFieldGiatUpdate(params.polresId);
	return { ok: true };
}

export function heartbeatFieldGiatSession(userId: number): { ok: true } | { ok: false; error: string } {
	const row = db
		.select()
		.from(fieldGiatSessions)
		.where(and(eq(fieldGiatSessions.userId, userId), isNull(fieldGiatSessions.endedAt)))
		.get();
	if (!row) return { ok: false, error: 'Tidak ada sesi giat aktif.' };

	const now = new Date().toISOString();
	db.update(fieldGiatSessions)
		.set({ lastHeartbeatAt: now })
		.where(eq(fieldGiatSessions.id, row.id))
		.run();

	emitFieldGiatUpdate(row.polresId);
	return { ok: true };
}

export type EndFieldGiatOptions = {
	rengiatId?: number;
	/** Jika keduanya valid, disimpan sebagai ringkasan titik akhir sesi. */
	endLat?: number | null;
	endLng?: number | null;
};

export function endFieldGiatSessionForUser(userId: number, opts?: EndFieldGiatOptions) {
	const rengiatId = opts?.rengiatId;
	const cond =
		rengiatId != null
			? and(
					eq(fieldGiatSessions.userId, userId),
					eq(fieldGiatSessions.rengiatId, rengiatId),
					isNull(fieldGiatSessions.endedAt)
				)
			: and(eq(fieldGiatSessions.userId, userId), isNull(fieldGiatSessions.endedAt));

	const rows = db.select().from(fieldGiatSessions).where(cond).all();
	if (rows.length === 0) return;

	const now = new Date().toISOString();
	const elat = opts?.endLat;
	const elng = opts?.endLng;
	const hasEnd =
		elat != null &&
		elng != null &&
		Number.isFinite(elat) &&
		Number.isFinite(elng) &&
		!(elat === 0 && elng === 0);

	const polresIds = new Set<number>();
	for (const row of rows) {
		db.update(fieldGiatSessions)
			.set(
				hasEnd
					? { endedAt: now, endLat: elat as number, endLng: elng as number }
					: { endedAt: now }
			)
			.where(eq(fieldGiatSessions.id, row.id))
			.run();
		polresIds.add(row.polresId);
	}
	for (const pid of polresIds) emitFieldGiatUpdate(pid);
}

export function getActiveSessionsForPolsekUser(userId: number) {
	return db
		.select({
			id: fieldGiatSessions.id,
			rengiatId: fieldGiatSessions.rengiatId,
			startedAt: fieldGiatSessions.startedAt,
			startLat: fieldGiatSessions.startLat,
			startLng: fieldGiatSessions.startLng
		})
		.from(fieldGiatSessions)
		.where(and(eq(fieldGiatSessions.userId, userId), isNull(fieldGiatSessions.endedAt)))
		.all();
}
