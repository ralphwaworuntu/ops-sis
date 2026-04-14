import { db } from '$lib/server/db';
import { auditLogs } from '$lib/server/db/schema';

export function writeAudit(entry: {
	userId: number | null;
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
	writeAudit({
		...entry,
		userId,
		ip: getClientAddress(),
		userAgent: request.headers.get('user-agent'),
		deviceId: deviceId || entry.deviceId || null
	});
}
