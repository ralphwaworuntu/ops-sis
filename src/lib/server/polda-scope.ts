import { db } from './db';
import { units } from './db/schema';
import { and, eq } from 'drizzle-orm';
import type { UserRole } from './auth';

export function isPoldaOrKaro(role: UserRole | undefined) {
	return role === 'POLDA' || role === 'KARO OPS';
}

export function isPolda(role: UserRole | undefined) {
	return role === 'POLDA';
}

/** POLRES langsung di bawah POLDA (Satwil). */
export function listPolresUnderPolda(poldaUnitId: number) {
	return db
		.select()
		.from(units)
		.where(and(eq(units.tipe, 'POLRES'), eq(units.parentId, poldaUnitId)))
		.all();
}

export function getPolresIfUnderPolda(polresId: number, poldaUnitId: number) {
	const u = db.select().from(units).where(eq(units.id, polresId)).get();
	if (!u || u.tipe !== 'POLRES' || u.parentId !== poldaUnitId) return null;
	return u;
}

export function getPolsekIfUnderPolda(polsekId: number, poldaUnitId: number) {
	const u = db.select().from(units).where(eq(units.id, polsekId)).get();
	if (!u || u.tipe !== 'POLSEK' || !u.parentId) return null;
	const parent = db.select().from(units).where(eq(units.id, u.parentId)).get();
	if (!parent || parent.tipe !== 'POLRES' || parent.parentId !== poldaUnitId) return null;
	return u;
}

export function listPolsekUnderPolres(polresId: number) {
	return db
		.select()
		.from(units)
		.where(and(eq(units.tipe, 'POLSEK'), eq(units.parentId, polresId)))
		.all();
}
