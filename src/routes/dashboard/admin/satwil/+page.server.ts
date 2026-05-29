import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	units,
	users,
	sessions,
	vulnerabilityPoints,
	rengiat,
	activityReports,
	fieldGiatSessions,
	notableIncidents,
	polsekIntelNotes,
	auditLogs
} from '$lib/server/db/schema';
import { eq, and, inArray, or, isNull } from 'drizzle-orm';
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

	const polsekAllList = polresList.flatMap((p) => listPolsekUnderPolres(p.id));
	const polsekList =
		!isNaN(polresId) && getPolresIfUnderPolda(polresId, poldaId)
			? listPolsekUnderPolres(polresId)
			: [];

	const unitIdsUnderPolda = [
		...polresList.map((p) => p.id),
		...polsekAllList.map((s) => s.id)
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
							or(
								eq(users.role, 'KABAG OPS'),
								eq(users.role, 'ADMIN POLRES'),
								eq(users.role, 'KAPOLRES'),
								eq(users.role, 'WAKAPOLRES'),
								eq(users.role, 'KATIM PATROLI'),
								eq(users.role, 'ADMIN POLSEK'),
								eq(users.role, 'KAPOLSEK'),
								eq(users.role, 'WAKAPOLSEK'),
								eq(users.role, 'KANIT SAMAPTA')
							)
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
		polsekAllList,
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
		const role = d.get('role')?.toString() as
			| 'KABAG OPS'
			| 'ADMIN POLRES'
			| 'KAPOLRES'
			| 'WAKAPOLRES'
			| 'KATIM PATROLI'
			| 'ADMIN POLSEK'
			| 'KAPOLSEK'
			| 'WAKAPOLSEK'
			| 'KANIT SAMAPTA';
		const unitId = parseInt(d.get('unit_id')?.toString() ?? '', 10);
		if (!username || !password || !nama || !nrp || !pangkat || !role || isNaN(unitId)) {
			return fail(400, { error: 'Semua field wajib diisi (termasuk NRP).' });
		}
		if (
			role !== 'KABAG OPS' &&
			role !== 'ADMIN POLRES' &&
			role !== 'KAPOLRES' &&
			role !== 'WAKAPOLRES' &&
			role !== 'KATIM PATROLI' &&
			role !== 'ADMIN POLSEK' &&
			role !== 'KAPOLSEK' &&
			role !== 'WAKAPOLSEK' &&
			role !== 'KANIT SAMAPTA'
		) {
			return fail(400, { error: 'Peran tidak valid.' });
		}
		if (
			(role === 'KABAG OPS' || role === 'ADMIN POLRES' || role === 'KAPOLRES' || role === 'WAKAPOLRES') &&
			!getPolresIfUnderPolda(unitId, pid)
		) {
			return fail(403, { error: 'Unit POLRES tidak valid.' });
		}
		if (
			(role === 'KATIM PATROLI' ||
				role === 'ADMIN POLSEK' ||
				role === 'KAPOLSEK' ||
				role === 'WAKAPOLSEK' ||
				role === 'KANIT SAMAPTA') &&
			!getPolsekIfUnderPolda(unitId, pid)
		) {
			return fail(403, { error: 'Unit POLSEK tidak valid.' });
		}
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
		const role = d.get('role')?.toString() as
			| 'KABAG OPS'
			| 'ADMIN POLRES'
			| 'KAPOLRES'
			| 'WAKAPOLRES'
			| 'KATIM PATROLI'
			| 'ADMIN POLSEK'
			| 'KAPOLSEK'
			| 'WAKAPOLSEK'
			| 'KANIT SAMAPTA';
		if (
			isNaN(id) ||
			!nama ||
			!nrp ||
			!pangkat ||
			isNaN(unitId) ||
			(role !== 'KABAG OPS' &&
				role !== 'ADMIN POLRES' &&
				role !== 'KAPOLRES' &&
				role !== 'WAKAPOLRES' &&
				role !== 'KATIM PATROLI' &&
				role !== 'ADMIN POLSEK' &&
				role !== 'KAPOLSEK' &&
				role !== 'WAKAPOLSEK' &&
				role !== 'KANIT SAMAPTA')
		) {
			return fail(400, { error: 'Data tidak valid.' });
		}
		const u = db.select().from(users).where(eq(users.id, id)).get();
		if (
			!u ||
			(u.role !== 'KABAG OPS' &&
				u.role !== 'ADMIN POLRES' &&
				u.role !== 'KAPOLRES' &&
				u.role !== 'WAKAPOLRES' &&
				u.role !== 'KATIM PATROLI' &&
				u.role !== 'ADMIN POLSEK' &&
				u.role !== 'KAPOLSEK' &&
				u.role !== 'WAKAPOLSEK' &&
				u.role !== 'KANIT SAMAPTA')
		) {
			return fail(403, { error: 'Tidak diizinkan.' });
		}
		if (
			(role === 'KABAG OPS' ||
				role === 'ADMIN POLRES' ||
				role === 'KAPOLRES' ||
				role === 'WAKAPOLRES') &&
			!getPolresIfUnderPolda(unitId, pid)
		)
			return fail(403, { error: 'Unit tidak valid.' });
		if (
			(role === 'KATIM PATROLI' ||
				role === 'ADMIN POLSEK' ||
				role === 'KAPOLSEK' ||
				role === 'WAKAPOLSEK' ||
				role === 'KANIT SAMAPTA') &&
			!getPolsekIfUnderPolda(unitId, pid)
		)
			return fail(403, { error: 'Unit tidak valid.' });
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
		if (
			!u ||
			(u.role !== 'KABAG OPS' &&
				u.role !== 'ADMIN POLRES' &&
				u.role !== 'KAPOLRES' &&
				u.role !== 'WAKAPOLRES' &&
				u.role !== 'KATIM PATROLI' &&
				u.role !== 'ADMIN POLSEK' &&
				u.role !== 'KAPOLSEK' &&
				u.role !== 'WAKAPOLSEK' &&
				u.role !== 'KANIT SAMAPTA')
		) {
			return fail(403, { error: 'Tidak diizinkan.' });
		}
		if (u.unitId) {
			if (
				(u.role === 'KABAG OPS' ||
					u.role === 'ADMIN POLRES' ||
					u.role === 'KAPOLRES' ||
					u.role === 'WAKAPOLRES') &&
				!getPolresIfUnderPolda(u.unitId, pid)
			)
				return fail(403, { error: 'Tidak diizinkan.' });
			if (
				(u.role === 'KATIM PATROLI' ||
					u.role === 'ADMIN POLSEK' ||
					u.role === 'KAPOLSEK' ||
					u.role === 'WAKAPOLSEK' ||
					u.role === 'KANIT SAMAPTA') &&
				!getPolsekIfUnderPolda(u.unitId, pid)
			)
				return fail(403, { error: 'Tidak diizinkan.' });
		}

		// Hindari 500 dari foreign key constraint: cek relasi data dahulu.
		const hasVuln = db.select({ id: vulnerabilityPoints.id }).from(vulnerabilityPoints).where(eq(vulnerabilityPoints.createdBy, id)).get();
		if (hasVuln) return fail(400, { error: 'Tidak bisa hapus personil: masih ada titik rawan yang dibuat oleh akun ini.' });

		const hasRengiatCreated = db.select({ id: rengiat.id }).from(rengiat).where(eq(rengiat.createdBy, id)).get();
		if (hasRengiatCreated) return fail(400, { error: 'Tidak bisa hapus personil: masih ada Rengiat yang dibuat oleh akun ini.' });

		const hasRengiatReviewed = db.select({ id: rengiat.id }).from(rengiat).where(eq(rengiat.reviewedBy, id)).get();
		if (hasRengiatReviewed) return fail(400, { error: 'Tidak bisa hapus personil: akun ini tercatat sebagai reviewer Rengiat.' });

		const hasRengiatApproved = db.select({ id: rengiat.id }).from(rengiat).where(eq(rengiat.approvedBy, id)).get();
		if (hasRengiatApproved) return fail(400, { error: 'Tidak bisa hapus personil: akun ini tercatat sebagai approver Rengiat.' });

		const hasReports = db.select({ id: activityReports.id }).from(activityReports).where(eq(activityReports.userId, id)).get();
		if (hasReports) return fail(400, { error: 'Tidak bisa hapus personil: masih ada laporan kegiatan (LHP) yang dibuat oleh akun ini.' });

		const hasField = db.select({ id: fieldGiatSessions.id }).from(fieldGiatSessions).where(eq(fieldGiatSessions.userId, id)).get();
		if (hasField) return fail(400, { error: 'Tidak bisa hapus personil: masih ada sesi Field Giat yang terkait akun ini.' });

		const hasIncident = db.select({ id: notableIncidents.id }).from(notableIncidents).where(eq(notableIncidents.createdBy, id)).get();
		if (hasIncident) return fail(400, { error: 'Tidak bisa hapus personil: masih ada insiden menonjol yang dibuat oleh akun ini.' });

		const hasIntel = db.select({ id: polsekIntelNotes.id }).from(polsekIntelNotes).where(eq(polsekIntelNotes.createdBy, id)).get();
		if (hasIntel) return fail(400, { error: 'Tidak bisa hapus personil: masih ada catatan intel yang dibuat oleh akun ini.' });

		try {
			db.delete(sessions).where(eq(sessions.userId, id)).run();
			// Audit log tetap disimpan, tapi dilepas dari user (user_id -> NULL).
			// Simpan snapshot actor agar histori tidak "kosong" di halaman audit.
			const unitNama = u.unitId ? db.select({ nama: units.nama }).from(units).where(eq(units.id, u.unitId)).get()?.nama : null;
			db.update(auditLogs)
				.set({
					actorUsername: u.username,
					actorNama: u.nama,
					actorRole: u.role,
					actorUnitId: u.unitId ?? null,
					actorUnitNama: unitNama ?? null,
					userId: null
				})
				.where(and(eq(auditLogs.userId, id), isNull(auditLogs.actorNama)))
				.run();
			// Untuk baris yang sudah punya snapshot, cukup detach FK-nya saja.
			db.update(auditLogs).set({ userId: null }).where(eq(auditLogs.userId, id)).run();
			db.delete(users).where(eq(users.id, id)).run();
			return { success: true };
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return fail(500, { error: `Gagal menghapus personil. (${msg})` });
		}
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
		// Serialize + dedupe per unitId to avoid request storms causing SQLITE_BUSY.
		const g = globalThis as unknown as {
			__satwilUnitMarkerInFlight?: Map<number, Promise<{ ok: boolean; error?: string }>>;
		};
		if (!g.__satwilUnitMarkerInFlight) g.__satwilUnitMarkerInFlight = new Map();

		const existing = g.__satwilUnitMarkerInFlight.get(unitId);
		if (existing) {
			const r = await existing;
			return r.ok ? { success: true } : fail(503, { error: r.error ?? 'Database sedang sibuk.' });
		}

		const task = (async () => {
			try {
				// Dengan sqlite timeout/busy_timeout 60 detik, query ini akan menunggu lock.
				db.update(units).set({ lat, lng }).where(eq(units.id, unitId)).run();
				return { ok: true as const };
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				console.warn('[satwil.setUnitMarker] failed', {
					unitId,
					userId: locals.user?.id,
					msg
				});
				if (msg.toLowerCase().includes('database is locked')) {
					return { ok: false as const, error: 'Database sedang sibuk. Coba lagi beberapa detik.' };
				}
				return { ok: false as const, error: `Gagal menyimpan lokasi. (${msg})` };
			}
		})().finally(() => {
			g.__satwilUnitMarkerInFlight?.delete(unitId);
		});

		g.__satwilUnitMarkerInFlight.set(unitId, task);
		const r = await task;
		if (r.ok) return { success: true };
		if (r.error?.startsWith('Gagal menyimpan lokasi')) return fail(500, { error: r.error });
		return fail(503, { error: r.error ?? 'Database sedang sibuk. Coba lagi beberapa detik.' });
	}
};
