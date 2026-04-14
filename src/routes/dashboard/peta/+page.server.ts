import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { vulnerabilityPoints, units, users, polsekIntelNotes } from '$lib/server/db/schema';
import { eq, and, inArray, isNotNull, desc } from 'drizzle-orm';
import { listPolresUnderPolda, isPoldaOrKaro } from '$lib/server/polda-scope';
import { auditFromRequest } from '$lib/server/audit';

const pointSelect = {
	id: vulnerabilityPoints.id,
	lat: vulnerabilityPoints.lat,
	lng: vulnerabilityPoints.lng,
	jenisKejahatan: vulnerabilityPoints.jenisKejahatan,
	frekuensi: vulnerabilityPoints.frekuensi,
	keterangan: vulnerabilityPoints.keterangan,
	origin: vulnerabilityPoints.origin,
	polsekUnitId: vulnerabilityPoints.polsekUnitId,
	polresNama: units.nama,
	createdAt: vulnerabilityPoints.createdAt
};

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();
	if (!user) {
		redirect(302, '/login');
	}

	if (user.role === 'POLSEK' && user.polresId != null && user.unitId != null) {
		const points = db
			.select(pointSelect)
			.from(vulnerabilityPoints)
			.leftJoin(units, eq(vulnerabilityPoints.polresId, units.id))
			.where(eq(vulnerabilityPoints.polresId, user.polresId))
			.all();

		const polsekRow = db.select().from(units).where(eq(units.id, user.unitId)).get();
		const polresRow = db.select().from(units).where(eq(units.id, user.polresId)).get();

		const intelNotes = db
			.select({
				id: polsekIntelNotes.id,
				teks: polsekIntelNotes.teks,
				createdAt: polsekIntelNotes.createdAt,
				polsekNama: units.nama
			})
			.from(polsekIntelNotes)
			.leftJoin(units, eq(polsekIntelNotes.polsekUnitId, units.id))
			.where(
				and(
					eq(polsekIntelNotes.polresId, user.polresId),
					eq(polsekIntelNotes.polsekUnitId, user.unitId)
				)
			)
			.orderBy(desc(polsekIntelNotes.createdAt))
			.limit(50)
			.all();

		return {
			viewMode: 'polsek' as const,
			points,
			canEdit: false,
			canEditPolsek: true,
			polresList: [],
			polresFilter: null,
			hqMarkers: [],
			showSatwilFilter: false,
			intelNotes,
			polsekCenter: {
				lat: polsekRow?.lat ?? polresRow?.lat ?? -6.2,
				lng: polsekRow?.lng ?? polresRow?.lng ?? 106.85
			},
			polresNama: user.polresNama,
			polsekNama: user.unitNama
		};
	}

	const polresList = isPoldaOrKaro(user.role)
		? listPolresUnderPolda(user.unitId!)
		: [];
	const satwil = url.searchParams.get('satwil');
	const wid = satwil ? parseInt(satwil, 10) : NaN;
	const polresFilter =
		polresList.length && !isNaN(wid) && polresList.some((p) => p.id === wid) ? wid : null;

	const basePoints = db
		.select(pointSelect)
		.from(vulnerabilityPoints)
		.leftJoin(units, eq(vulnerabilityPoints.polresId, units.id));

	const points = (() => {
		if (isPoldaOrKaro(user.role)) {
			return (
				polresFilter ? basePoints.where(eq(vulnerabilityPoints.polresId, polresFilter)) : basePoints
			).all();
		}
		if (user.role === 'POLRES') {
			return basePoints.where(eq(vulnerabilityPoints.polresId, user.unitId!)).all();
		}
		return [];
	})();

	const polresIdsForHq = polresFilter
		? [polresFilter]
		: polresList.map((p) => p.id);
	const polsekIds =
		polresIdsForHq.length === 0
			? []
			: db
					.select({ id: units.id })
					.from(units)
					.where(and(eq(units.tipe, 'POLSEK'), inArray(units.parentId, polresIdsForHq)))
					.all()
					.map((r) => r.id);
	const hqUnitIds = [...polresIdsForHq, ...polsekIds];
	const hqMarkers =
		hqUnitIds.length === 0
			? []
			: db
					.select({
						id: units.id,
						nama: units.nama,
						tipe: units.tipe,
						lat: units.lat,
						lng: units.lng
					})
					.from(units)
					.where(
						and(inArray(units.id, hqUnitIds), isNotNull(units.lat), isNotNull(units.lng))
					)
					.all();

	const intelNotes =
		user.role === 'POLRES' && user.unitId != null
			? db
					.select({
						id: polsekIntelNotes.id,
						teks: polsekIntelNotes.teks,
						createdAt: polsekIntelNotes.createdAt,
						polsekNama: units.nama
					})
					.from(polsekIntelNotes)
					.leftJoin(units, eq(polsekIntelNotes.polsekUnitId, units.id))
					.where(eq(polsekIntelNotes.polresId, user.unitId))
					.orderBy(desc(polsekIntelNotes.createdAt))
					.limit(80)
					.all()
			: [];

	return {
		viewMode: 'hq' as const,
		points,
		canEdit: user.role === 'POLRES',
		canEditPolsek: false,
		polresList,
		polresFilter,
		hqMarkers,
		intelNotes,
		showSatwilFilter: isPoldaOrKaro(user.role)
	};
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'POLRES') {
			return fail(403, { error: 'Hanya POLRES yang dapat menambah titik rawan resmi.' });
		}

		const data = await request.formData();
		const lat = parseFloat(data.get('lat')?.toString() ?? '');
		const lng = parseFloat(data.get('lng')?.toString() ?? '');
		const jenisKejahatan = data.get('jenis_kejahatan')?.toString() ?? '';
		const frekuensi = parseInt(data.get('frekuensi')?.toString() ?? '1');
		const keterangan = data.get('keterangan')?.toString() ?? '';

		if (isNaN(lat) || isNaN(lng) || !jenisKejahatan) {
			return fail(400, { error: 'Koordinat dan jenis kejahatan wajib diisi.' });
		}

		db.insert(vulnerabilityPoints)
			.values({
				lat,
				lng,
				jenisKejahatan,
				frekuensi: isNaN(frekuensi) ? 1 : frekuensi,
				keterangan: keterangan || null,
				origin: 'polres',
				polresId: locals.user.unitId!,
				createdBy: locals.user.id
			})
			.run();

		return { success: true };
	},

	addPolsek: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'POLSEK' || !locals.user.polresId || !locals.user.unitId) {
			return fail(403, { error: 'Hanya POLSEK yang dapat menambah temuan lapangan.' });
		}

		const data = await request.formData();
		const lat = parseFloat(data.get('lat')?.toString() ?? '');
		const lng = parseFloat(data.get('lng')?.toString() ?? '');
		const jenisKejahatan = data.get('jenis_kejahatan')?.toString()?.trim() ?? '';
		const frekuensi = parseInt(data.get('frekuensi')?.toString() ?? '1');
		const keterangan = data.get('keterangan')?.toString() ?? '';

		if (isNaN(lat) || isNaN(lng) || !jenisKejahatan) {
			return fail(400, { error: 'Koordinat dan jenis temuan wajib diisi.' });
		}

		db.insert(vulnerabilityPoints)
			.values({
				lat,
				lng,
				jenisKejahatan,
				frekuensi: isNaN(frekuensi) ? 1 : frekuensi,
				keterangan: keterangan || null,
				origin: 'polsek',
				polsekUnitId: locals.user.unitId,
				polresId: locals.user.polresId,
				createdBy: locals.user.id
			})
			.run();

		return { success: true };
	},

	delete: async (event) => {
		const { request, locals, getClientAddress } = event;
		if (!locals.user || locals.user.role !== 'POLRES') {
			return fail(403, { error: 'Unauthorized' });
		}

		const data = await request.formData();
		const id = parseInt(data.get('id')?.toString() ?? '');
		if (isNaN(id)) return fail(400, { error: 'ID tidak valid.' });

		const pt = db.select().from(vulnerabilityPoints).where(eq(vulnerabilityPoints.id, id)).get();
		if (pt?.origin === 'polsek') {
			return fail(403, { error: 'Titik temuan POLSEK tidak dapat dihapus dari akun POLRES.' });
		}
		db.delete(vulnerabilityPoints).where(eq(vulnerabilityPoints.id, id)).run();
		auditFromRequest(locals.user.id, request, getClientAddress, {
			action: 'VULNERABILITY_POINT_DELETE',
			entityType: 'vulnerability_point',
			entityId: id,
			detail: { jenisKejahatan: pt?.jenisKejahatan, lat: pt?.lat, lng: pt?.lng }
		});
		return { success: true };
	},

	addIntel: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'POLSEK' || !locals.user.polresId || !locals.user.unitId) {
			return fail(403, { error: 'Hanya POLSEK yang dapat menambah intel sementara.' });
		}
		const data = await request.formData();
		const teks = data.get('teks')?.toString()?.trim() ?? '';
		if (teks.length < 8) {
			return fail(400, { error: 'Uraian intel minimal 8 karakter.' });
		}
		if (teks.length > 4000) {
			return fail(400, { error: 'Teks terlalu panjang.' });
		}
		db.insert(polsekIntelNotes)
			.values({
				polresId: locals.user.polresId,
				polsekUnitId: locals.user.unitId,
				teks,
				createdBy: locals.user.id,
				validated: false
			})
			.run();
		return { success: true };
	},

	deletePolsek: async (event) => {
		const { request, locals, getClientAddress } = event;
		if (!locals.user || locals.user.role !== 'POLSEK' || !locals.user.unitId) {
			return fail(403, { error: 'Unauthorized' });
		}
		const data = await request.formData();
		const id = parseInt(data.get('id')?.toString() ?? '');
		if (isNaN(id)) return fail(400, { error: 'ID tidak valid.' });

		const pt = db.select().from(vulnerabilityPoints).where(eq(vulnerabilityPoints.id, id)).get();
		if (
			!pt ||
			pt.origin !== 'polsek' ||
			pt.polsekUnitId !== locals.user.unitId ||
			pt.polresId !== locals.user.polresId
		) {
			return fail(403, { error: 'Titik tidak dapat dihapus.' });
		}
		db.delete(vulnerabilityPoints).where(eq(vulnerabilityPoints.id, id)).run();
		auditFromRequest(locals.user.id, request, getClientAddress, {
			action: 'VULNERABILITY_POINT_DELETE_POLSEK',
			entityType: 'vulnerability_point',
			entityId: id,
			detail: { jenisKejahatan: pt.jenisKejahatan, lat: pt.lat, lng: pt.lng }
		});
		return { success: true };
	}
};
