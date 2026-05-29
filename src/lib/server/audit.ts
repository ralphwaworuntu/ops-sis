import { db } from '$lib/server/db';
import { auditLogs, units, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export function writeAudit(entry: {
	userId: number | null;
	actorUsername?: string | null;
	actorNama?: string | null;
	actorRole?: string | null;
	actorUnitId?: number | null;
	actorUnitNama?: string | null;
	action: string;
	entityType?: string | null;
	entityId?: number | null;
	detail?: Record<string, unknown> | null;
	ip: string;
	userAgent: string | null;
	deviceId?: string | null;
}) {
	db.insert(auditLogs)
		.values({
			userId: entry.userId,
			actorUsername: entry.actorUsername ?? null,
			actorNama: entry.actorNama ?? null,
			actorRole: entry.actorRole ?? null,
			actorUnitId: entry.actorUnitId ?? null,
			actorUnitNama: entry.actorUnitNama ?? null,
			action: entry.action,
			entityType: entry.entityType ?? null,
			entityId: entry.entityId ?? null,
			detailJson: entry.detail ? JSON.stringify(entry.detail) : null,
			ip: entry.ip,
			userAgent: entry.userAgent,
			deviceId: entry.deviceId ?? null,
			createdAt: new Date().toISOString()
		})
		.run();
}

export function auditFromRequest(
	userId: number | null,
	request: Request,
	getClientAddress: () => string,
	entry: Omit<Parameters<typeof writeAudit>[0], 'ip' | 'userAgent' | 'deviceId' | 'userId'> & {
		deviceId?: string | null;
	}
) {
	const deviceId = request.headers.get('x-device-id');
	const actor =
		userId == null
			? null
			: db
					.select({
						username: users.username,
						nama: users.nama,
						role: users.role,
						unitId: users.unitId,
						unitNama: units.nama
					})
					.from(users)
					.leftJoin(units, eq(users.unitId, units.id))
					.where(eq(users.id, userId))
					.get();
	writeAudit({
		...entry,
		userId,
		actorUsername: actor?.username ?? null,
		actorNama: actor?.nama ?? null,
		actorRole: actor?.role ?? null,
		actorUnitId: actor?.unitId ?? null,
		actorUnitNama: actor?.unitNama ?? null,
		ip: getClientAddress(),
		userAgent: request.headers.get('user-agent'),
		deviceId: deviceId || entry.deviceId || null
	});
}
