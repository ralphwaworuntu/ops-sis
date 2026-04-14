import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { units, users, sessions, vulnerabilityPoints, rengiat } from '$lib/server/db/schema';
import { eq, and, inArray, or } from 'drizzle-orm';
import bcryptjs from 'bcryptjs';
const { hashSync } = bcryptjs;
import {
	listPolresUnderPolda,
	getPolresIfUnderPolda,
	getPolsekIfUnderPolda,
	listPolsekUnderPolres
} from '$lib/server/polda-scope';

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();
	const poldaId = user!.unitId!;
	const polresList = listPolresUnderPolda(poldaId);
	const polresFilter = url.searchParams.get('polres');
	const polresId = polresFilter ? parseInt(polresFilter, 10) : NaN;
	const polsekList =
		!isNaN(polresId) && getPolresIfUnderPolda(polresId, poldaId)
			? listPolsekUnderPolres(polresId)
			: [];

	const unitIdsUnderPolda = [
		...polresList.map((p) => p.id),
		...polresList.flatMap((p) => listPolsekUnderPolres(p.id).map((s) => s.id))
	];

	const personil =
		unitIdsUnderPolda.length === 0
			? []
			: db
					.select({
						id: users.id,
						username: users.username,
						nama: users.nama,
						nrp: users.nrp,
						pangkat: users.pangkat,
						role: users.role,
						unitId: users.unitId,
						unitNama: units.nama
					})
					.from(users)
					.leftJoin(units, eq(users.unitId, units.id))
					.where(
						and(
							inArray(users.unitId, unitIdsUnderPolda),
							or(eq(users.role, 'POLRES'), eq(users.role, 'POLSEK'))
						)
					)
					.all();

	const allSatwilUnits: { id: number; label: string; tipe: string }[] = [];
	for (const p of polresList) {
		allSatwilUnits.push({ id: p.id, tipe: 'POLRES', label: `${p.nama} (POLRES)` });
		for (const s of listPolsekUnderPolres(p.id)) {
			allSatwilUnits.push({ id: s.id, tipe: 'POLSEK', label: `${s.nama} — ${p.nama}` });
		}
	}

	return {
		polresList,
		polsekList,
		personil,
		allSatwilUnits,
		selectedPolresId: !isNaN(polresId) ? polresId : null
	};
};

export const actions: Actions = {
	createPolres: async ({ request, locals }) => {
		const pid = locals.user!.unitId!;
		const d = await request.formData();
		const nama = d.get('nama')?.toString()?.trim() ?? '';
		const lat = parseFloat(d.get('lat')?.toString() ?? '');
		const lng = parseFloat(d.get('lng')?.toString() ?? '');
		if (!nama) return fail(400, { error: 'Nama POLRES wajib diisi.' });
		db.insert(units)
			.values({
				nama,
				tipe: 'POLRES',
				parentId: pid,
				lat: isNaN(lat) ? null : lat,
				lng: isNaN(lng) ? null : lng
			})
			.run();
		return { success: true };
	},

	updatePolres: async ({ request, locals }) => {
		const pid = locals.user!.unitId!;
		const d = await request.formData();
		const id = parseInt(d.get('id')?.toString() ?? '', 10);
		const nama = d.get('nama')?.toString()?.trim() ?? '';
		if (isNaN(id) || !getPolresIfUnderPolda(id, pid)) return fail(403, { error: 'Tidak diizinkan.' });
		if (!nama) return fail(400, { error: 'Nama wajib.' });
		const lat = parseFloat(d.get('lat')?.toString() ?? '');
		const lng = parseFloat(d.get('lng')?.toString() ?? '');
		db.update(units)
			.set({
				nama,
				lat: isNaN(lat) ? null : lat,
				lng: isNaN(lng) ? null : lng
			})
			.where(eq(units.id, id))
			.run();
		return { success: true };
	},

	deletePolres: async ({ request, locals }) => {
		const pid = locals.user!.unitId!;
		const d = await request.formData();
		const id = parseInt(d.get('id')?.toString() ?? '', 10);
		if (isNaN(id) || !getPolresIfUnderPolda(id, pid)) return fail(403, { error: 'Tidak diizinkan.' });
		const child = listPolsekUnderPolres(id);
		if (child.length) return fail(400, { error: 'Hapus POLSEK di bawahnya terlebih dahulu.' });
		const vp = db.select().from(vulnerabilityPoints).where(eq(vulnerabilityPoints.polresId, id)).get();
		if (vp) return fail(400, { error: 'Masih ada titik rawan untuk POLRES ini.' });
		const rg = db.select().from(rengiat).where(eq(rengiat.polresId, id)).get();
		if (rg) return fail(400, { error: 'Masih ada Rengiat untuk POLRES ini.' });
		const usr = db.select().from(users).where(eq(users.unitId, id)).get();
		if (usr) return fail(400, { error: 'Masih ada personil terikat ke POLRES ini.' });
		db.delete(units).where(eq(units.id, id)).run();
		return { success: true };
	},

	createPolsek: async ({ request, locals }) => {
		const pid = locals.user!.unitId!;
		const d = await request.formData();
		const polresId = parseInt(d.get('polres_id')?.toString() ?? '', 10);
		const nama = d.get('nama')?.toString()?.trim() ?? '';
		const lat = parseFloat(d.get('lat')?.toString() ?? '');
		const lng = parseFloat(d.get('lng')?.toString() ?? '');
		if (!nama || isNaN(polresId) || !getPolresIfUnderPolda(polresId, pid)) {
			return fail(400, { error: 'POLRES dan nama POLSEK wajib valid.' });
		}
		db.insert(units)
			.values({
				nama,
				tipe: 'POLSEK',
				parentId: polresId,
				lat: isNaN(lat) ? null : lat,
				lng: isNaN(lng) ? null : lng
			})
			.run();
		return { success: true };
	},

	updatePolsek: async ({ request, locals }) => {
		const pid = locals.user!.unitId!;
		const d = await request.formData();
		const id = parseInt(d.get('id')?.toString() ?? '', 10);
		const nama = d.get('nama')?.toString()?.trim() ?? '';
		if (isNaN(id) || !getPolsekIfUnderPolda(id, pid)) return fail(403, { error: 'Tidak diizinkan.' });
		if (!nama) return fail(400, { error: 'Nama wajib.' });
		const lat = parseFloat(d.get('lat')?.toString() ?? '');
		const lng = parseFloat(d.get('lng')?.toString() ?? '');
		db.update(units)
			.set({
				nama,
				lat: isNaN(lat) ? null : lat,
				lng: isNaN(lng) ? null : lng
			})
			.where(eq(units.id, id))
			.run();
		return { success: true };
	},

	deletePolsek: async ({ request, locals }) => {
		const pid = locals.user!.unitId!;
		const d = await request.formData();
		const id = parseInt(d.get('id')?.toString() ?? '', 10);
		if (isNaN(id) || !getPolsekIfUnderPolda(id, pid)) return fail(403, { error: 'Tidak diizinkan.' });
		const usr = db.select().from(users).where(eq(users.unitId, id)).get();
		if (usr) return fail(400, { error: 'Masih ada personil di POLSEK ini.' });
		db.delete(units).where(eq(units.id, id)).run();
		return { success: true };
	},

	createUser: async ({ request, locals }) => {
		const pid = locals.user!.unitId!;
		const d = await request.formData();
		const username = d.get('username')?.toString()?.trim() ?? '';
		const password = d.get('password')?.toString() ?? '';
		const nama = d.get('nama')?.toString()?.trim() ?? '';
		const nrp = d.get('nrp')?.toString()?.trim() ?? '';
		const pangkat = d.get('pangkat')?.toString()?.trim() ?? '';
		const role = d.get('role')?.toString() as 'POLRES' | 'POLSEK';
		const unitId = parseInt(d.get('unit_id')?.toString() ?? '', 10);
		if (!username || !password || !nama || !nrp || !pangkat || !role || isNaN(unitId)) {
			return fail(400, { error: 'Semua field wajib diisi (termasuk NRP).' });
		}
		if (role !== 'POLRES' && role !== 'POLSEK') return fail(400, { error: 'Peran tidak valid.' });
		if (role === 'POLRES' && !getPolresIfUnderPolda(unitId, pid)) return fail(403, { error: 'Unit POLRES tidak valid.' });
		if (role === 'POLSEK' && !getPolsekIfUnderPolda(unitId, pid)) return fail(403, { error: 'Unit POLSEK tidak valid.' });
		try {
			db.insert(users)
				.values({
					username,
					passwordHash: hashSync(password, 10),
					nama,
					nrp,
					pangkat,
					role,
					unitId
				})
				.run();
		} catch {
			return fail(400, { error: 'Username sudah dipakai.' });
		}
		return { success: true };
	},

	updateUser: async ({ request, locals }) => {
		const pid = locals.user!.unitId!;
		const d = await request.formData();
		const id = parseInt(d.get('id')?.toString() ?? '', 10);
		const nama = d.get('nama')?.toString()?.trim() ?? '';
		const nrp = d.get('nrp')?.toString()?.trim() ?? '';
		const pangkat = d.get('pangkat')?.toString()?.trim() ?? '';
		const password = d.get('password')?.toString() ?? '';
		const unitId = parseInt(d.get('unit_id')?.toString() ?? '', 10);
		const role = d.get('role')?.toString() as 'POLRES' | 'POLSEK';
		if (isNaN(id) || !nama || !nrp || !pangkat || isNaN(unitId) || (role !== 'POLRES' && role !== 'POLSEK')) {
			return fail(400, { error: 'Data tidak valid.' });
		}
		const u = db.select().from(users).where(eq(users.id, id)).get();
		if (!u || (u.role !== 'POLRES' && u.role !== 'POLSEK')) return fail(403, { error: 'Tidak diizinkan.' });
		if (role === 'POLRES' && !getPolresIfUnderPolda(unitId, pid)) return fail(403, { error: 'Unit tidak valid.' });
		if (role === 'POLSEK' && !getPolsekIfUnderPolda(unitId, pid)) return fail(403, { error: 'Unit tidak valid.' });
		if (password.length > 0) {
			db.update(users)
				.set({
					nama,
					nrp,
					pangkat,
					role,
					unitId,
					passwordHash: hashSync(password, 10)
				})
				.where(eq(users.id, id))
				.run();
		} else {
			db.update(users).set({ nama, nrp, pangkat, role, unitId }).where(eq(users.id, id)).run();
		}
		return { success: true };
	},

	deleteUser: async ({ request, locals }) => {
		const pid = locals.user!.unitId!;
		const d = await request.formData();
		const id = parseInt(d.get('id')?.toString() ?? '', 10);
		if (isNaN(id)) return fail(400, { error: 'ID tidak valid.' });
		const u = db.select().from(users).where(eq(users.id, id)).get();
		if (!u || (u.role !== 'POLRES' && u.role !== 'POLSEK')) return fail(403, { error: 'Tidak diizinkan.' });
		if (u.unitId) {
			if (u.role === 'POLRES' && !getPolresIfUnderPolda(u.unitId, pid)) return fail(403, { error: 'Tidak diizinkan.' });
			if (u.role === 'POLSEK' && !getPolsekIfUnderPolda(u.unitId, pid)) return fail(403, { error: 'Tidak diizinkan.' });
		}
		db.delete(sessions).where(eq(sessions.userId, id)).run();
		db.delete(users).where(eq(users.id, id)).run();
		return { success: true };
	},

	setUnitMarker: async ({ request, locals }) => {
		const pid = locals.user!.unitId!;
		const d = await request.formData();
		const unitId = parseInt(d.get('unit_id')?.toString() ?? '', 10);
		const lat = parseFloat(d.get('lat')?.toString() ?? '');
		const lng = parseFloat(d.get('lng')?.toString() ?? '');
		if (isNaN(unitId) || isNaN(lat) || isNaN(lng)) return fail(400, { error: 'Koordinat tidak valid.' });
		const polres = getPolresIfUnderPolda(unitId, pid);
		const polsek = getPolsekIfUnderPolda(unitId, pid);
		if (!polres && !polsek) return fail(403, { error: 'Unit tidak dalam wilayah Anda.' });
		db.update(units).set({ lat, lng }).where(eq(units.id, unitId)).run();
		return { success: true };
	}
};
