import { db } from './db';
import { sessions, users, units } from './db/schema';
import { eq, and, gt } from 'drizzle-orm';
import bcryptjs from 'bcryptjs';
const { compareSync } = bcryptjs;
import crypto from 'crypto';

export type UserRole = 'POLSEK' | 'POLRES' | 'POLDA' | 'KARO OPS';

export interface SessionUser {
	id: number;
	username: string;
	nama: string;
	nrp: string;
	pangkat: string;
	role: UserRole;
	unitId: number | null;
	unitNama: string | null;
	/** Induk POLRES (hanya diisi untuk akun POLSEK). */
	polresId: number | null;
	polresNama: string | null;
}

function withPolresScope(
	row: Omit<SessionUser, 'polresId' | 'polresNama'>
): SessionUser {
	let polresId: number | null = null;
	let polresNama: string | null = null;
	if (row.role === 'POLSEK' && row.unitId != null) {
		const u = db.select().from(units).where(eq(units.id, row.unitId)).get();
		if (u?.tipe === 'POLSEK' && u.parentId != null) {
			polresId = u.parentId;
			const pr = db.select().from(units).where(eq(units.id, u.parentId)).get();
			polresNama = pr?.nama ?? null;
		}
	}
	return { ...row, polresId, polresNama };
}

export async function login(
	username: string,
	password: string
): Promise<{ sessionId: string; user: SessionUser } | null> {
	const result = db
		.select({
			id: users.id,
			username: users.username,
			passwordHash: users.passwordHash,
			nama: users.nama,
			nrp: users.nrp,
			pangkat: users.pangkat,
			role: users.role,
			unitId: users.unitId,
			unitNama: units.nama
		})
		.from(users)
		.leftJoin(units, eq(users.unitId, units.id))
		.where(eq(users.username, username))
		.get();

	if (!result || !compareSync(password, result.passwordHash)) {
		return null;
	}

	const sessionId = crypto.randomUUID();
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

	db.insert(sessions).values({ id: sessionId, userId: result.id, expiresAt }).run();

	return {
		sessionId,
		user: withPolresScope({
			id: result.id,
			username: result.username,
			nama: result.nama,
			nrp: result.nrp ?? '',
			pangkat: result.pangkat,
			role: result.role as UserRole,
			unitId: result.unitId,
			unitNama: result.unitNama
		})
	};
}

export async function validateSession(
	sessionId: string
): Promise<{ user: SessionUser | null; session: { id: string } | null }> {
	const now = new Date().toISOString();
	const result = db
		.select({
			sessionId: sessions.id,
			userId: users.id,
			username: users.username,
			nama: users.nama,
			nrp: users.nrp,
			pangkat: users.pangkat,
			role: users.role,
			unitId: users.unitId,
			unitNama: units.nama
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.leftJoin(units, eq(users.unitId, units.id))
		.where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
		.get();

	if (!result) {
		db.delete(sessions).where(eq(sessions.id, sessionId)).run();
		return { user: null, session: null };
	}

	return {
		user: withPolresScope({
			id: result.userId,
			username: result.username,
			nama: result.nama,
			nrp: result.nrp ?? '',
			pangkat: result.pangkat,
			role: result.role as UserRole,
			unitId: result.unitId,
			unitNama: result.unitNama
		}),
		session: { id: result.sessionId }
	};
}

export async function logout(sessionId: string): Promise<void> {
	db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function assertRole(userRole: UserRole | undefined, ...allowed: UserRole[]): void {
	if (!userRole || !allowed.includes(userRole)) {
		throw new Error('Unauthorized');
	}
}
