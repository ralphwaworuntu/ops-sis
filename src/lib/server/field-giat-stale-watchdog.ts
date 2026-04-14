import { db } from '$lib/server/db';
import { fieldGiatSessions, rengiat, users, units } from '$lib/server/db/schema';
import { alias } from 'drizzle-orm/sqlite-core';
import { eq, isNull } from 'drizzle-orm';
import { sseBroadcaster } from '$lib/server/sse';

const POLL_MS = 30_000;
/** Client heartbeat ~45s; anggap tidak wajar setelah ~3× interval tanpa update. */
export const STALE_HEARTBEAT_MS = 135_000;

const alertedStale = new Set<number>();
let started = false;

export function startFieldGiatStaleWatchdog() {
	if (started) return;
	started = true;
	if (typeof setInterval === 'undefined') return;

	const polresU = alias(units, 'polres_u');
	const polsekU = alias(units, 'polsek_u');

	const tick = () => {
		try {
			const rows = db
				.select({
					id: fieldGiatSessions.id,
					polresId: fieldGiatSessions.polresId,
					lastHeartbeatAt: fieldGiatSessions.lastHeartbeatAt,
					startLat: fieldGiatSessions.startLat,
					startLng: fieldGiatSessions.startLng,
					userNama: users.nama,
					userNrp: users.nrp,
					rengiatJudul: rengiat.judul,
					polsekNama: polsekU.nama,
					polresNama: polresU.nama
				})
				.from(fieldGiatSessions)
				.innerJoin(users, eq(fieldGiatSessions.userId, users.id))
				.innerJoin(rengiat, eq(fieldGiatSessions.rengiatId, rengiat.id))
				.innerJoin(polsekU, eq(fieldGiatSessions.polsekUnitId, polsekU.id))
				.innerJoin(polresU, eq(fieldGiatSessions.polresId, polresU.id))
				.where(isNull(fieldGiatSessions.endedAt))
				.all();

			const now = Date.now();
			const staleIds = new Set<number>();

			for (const row of rows) {
				const last = new Date(row.lastHeartbeatAt).getTime();
				if (Number.isNaN(last)) continue;
				if (now - last <= STALE_HEARTBEAT_MS) continue;

				staleIds.add(row.id);
				if (alertedStale.has(row.id)) continue;

				alertedStale.add(row.id);
				sseBroadcaster.emit({
					type: 'heartbeat_stale',
					data: {
						sessionId: row.id,
						polresId: row.polresId,
						polresNama: row.polresNama ?? '',
						polsekNama: row.polsekNama ?? '',
						userNama: row.userNama ?? '',
						userNrp: row.userNrp ?? '',
						rengiatJudul: row.rengiatJudul ?? '',
						lastHeartbeatAt: row.lastHeartbeatAt,
						startLat: row.startLat,
						startLng: row.startLng
					}
				});
			}

			for (const id of [...alertedStale]) {
				if (!staleIds.has(id)) alertedStale.delete(id);
			}
		} catch {
			/* ignore */
		}
	};

	void tick();
	setInterval(tick, POLL_MS);
}
