import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { auditLogs, users, units } from '$lib/server/db/schema';
import { count, desc, eq, like, or } from 'drizzle-orm';

function safeInt(v: string | null, fallback: number) {
	if (!v) return fallback;
	const n = parseInt(v, 10);
	return Number.isFinite(n) ? n : fallback;
}

export const load: PageServerLoad = async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	const page = Math.max(1, safeInt(url.searchParams.get('page'), 1));
	const pageSize = Math.min(200, Math.max(20, safeInt(url.searchParams.get('pageSize'), 50)));
	const offset = (page - 1) * pageSize;

	const base = db
		.select({
			id: auditLogs.id,
			action: auditLogs.action,
			entityType: auditLogs.entityType,
			entityId: auditLogs.entityId,
			detailJson: auditLogs.detailJson,
			ip: auditLogs.ip,
			userAgent: auditLogs.userAgent,
			deviceId: auditLogs.deviceId,
			createdAt: auditLogs.createdAt,
			actorUsername: auditLogs.actorUsername,
			actorNama: auditLogs.actorNama,
			actorRole: auditLogs.actorRole,
			actorUnitId: auditLogs.actorUnitId,
			actorUnitNama: auditLogs.actorUnitNama,
			userId: users.id,
			username: users.username,
			nama: users.nama,
			role: users.role,
			unitId: users.unitId,
			unitNama: units.nama
		})
		.from(auditLogs)
		.leftJoin(users, eq(auditLogs.userId, users.id))
		.leftJoin(units, eq(users.unitId, units.id));

	const where = q
		? or(
				like(auditLogs.action, `%${q}%`),
				like(auditLogs.ip, `%${q}%`),
				like(auditLogs.entityType, `%${q}%`),
				like(auditLogs.actorUsername, `%${q}%`),
				like(auditLogs.actorNama, `%${q}%`),
				like(auditLogs.actorUnitNama, `%${q}%`),
				like(users.username, `%${q}%`),
				like(users.nama, `%${q}%`),
				like(units.nama, `%${q}%`)
			)
		: undefined;

	const rows = (where ? base.where(where) : base).orderBy(desc(auditLogs.id)).limit(pageSize).offset(offset).all();

	// Count total (untuk pagination sederhana)
	const countBase = db
		.select({ c: count() })
		.from(auditLogs)
		.leftJoin(users, eq(auditLogs.userId, users.id))
		.leftJoin(units, eq(users.unitId, units.id));
	const countRow = (where ? countBase.where(where) : countBase).get();

	const total = Number((countRow as unknown as { c?: number })?.c ?? 0);
	const totalPages = Math.max(1, Math.ceil(total / pageSize));

	return {
		q,
		page,
		pageSize,
		total,
		totalPages,
		rows
	};
};

