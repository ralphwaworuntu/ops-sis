import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { rengiat, units, users, vulnerabilityPoints } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { analyzeRengiat, generateTacticalPlan } from '$lib/server/ai';
import { sseBroadcaster } from '$lib/server/sse';
import { auditFromRequest } from '$lib/server/audit';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { user } = await parent();
	const id = parseInt(params.id);
	if (isNaN(id)) error(404, 'Rengiat tidak ditemukan');

	const item = db
		.select({
			id: rengiat.id,
			kategori: rengiat.kategori,
			judul: rengiat.judul,
			deskripsi: rengiat.deskripsi,
			filePath: rengiat.filePath,
			status: rengiat.status,
			aiAnalysis: rengiat.aiAnalysis,
			finalPlan: rengiat.finalPlan,
			rejectionNote: rengiat.rejectionNote,
			jumlahRencanaPlotting: rengiat.jumlahRencanaPlotting,
			anchorLat: rengiat.anchorLat,
			anchorLng: rengiat.anchorLng,
			operasiSelesai: rengiat.operasiSelesai,
			polresId: rengiat.polresId,
			createdBy: rengiat.createdBy,
			polresNama: units.nama,
			createdByNama: users.nama,
			createdAt: rengiat.createdAt,
			updatedAt: rengiat.updatedAt
		})
		.from(rengiat)
		.leftJoin(units, eq(rengiat.polresId, units.id))
		.leftJoin(users, eq(rengiat.createdBy, users.id))
		.where(eq(rengiat.id, id))
		.get();

	if (!item) error(404, 'Rengiat tidak ditemukan');

	const nearbyPoints = db
		.select({
			jenisKejahatan: vulnerabilityPoints.jenisKejahatan,
			frekuensi: vulnerabilityPoints.frekuensi,
			keterangan: vulnerabilityPoints.keterangan
		})
		.from(vulnerabilityPoints)
		.where(eq(vulnerabilityPoints.polresId, item.polresId))
		.all();

	return { rengiatDetail: item, nearbyPoints };
};

export const actions: Actions = {
	updateDraftMeta: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role !== 'POLRES') return fail(403, { error: 'Unauthorized' });
		const id = parseInt(params.id);
		const item = db.select().from(rengiat).where(eq(rengiat.id, id)).get();
		if (!item || item.status !== 'Draft' || item.polresId !== locals.user.unitId) {
			return fail(403, { error: 'Tidak dapat mengubah.' });
		}
		const d = await request.formData();
		const jumlahRencanaPlotting = parseInt(d.get('jumlah_rencana_plotting')?.toString() ?? '0', 10);
		const alat = parseFloat(d.get('anchor_lat')?.toString() ?? '');
		const alng = parseFloat(d.get('anchor_lng')?.toString() ?? '');
		const opSelesaiRaw = d.get('operasi_selesai')?.toString()?.trim() ?? '';
		let operasiSelesai: string | null = null;
		if (opSelesaiRaw.length > 0) {
			const t = new Date(opSelesaiRaw);
			operasiSelesai = isNaN(t.getTime()) ? null : t.toISOString();
		}
		db.update(rengiat)
			.set({
				jumlahRencanaPlotting: isNaN(jumlahRencanaPlotting) ? 0 : Math.max(0, jumlahRencanaPlotting),
				anchorLat: isNaN(alat) ? null : alat,
				anchorLng: isNaN(alng) ? null : alng,
				operasiSelesai,
				updatedAt: new Date().toISOString()
			})
			.where(eq(rengiat.id, id))
			.run();
		return { success: true };
	},

	submit: async (event) => {
		const { params, locals, request, getClientAddress } = event;
		if (!locals.user || locals.user.role !== 'POLRES') return fail(403, { error: 'Unauthorized' });
		const id = parseInt(params.id);
		const row = db.select().from(rengiat).where(eq(rengiat.id, id)).get();
		db.update(rengiat)
			.set({ status: 'PendingReview', updatedAt: new Date().toISOString() })
			.where(eq(rengiat.id, id))
			.run();
		auditFromRequest(locals.user.id, request, getClientAddress, {
			action: 'RENGIAT_SUBMIT_REVIEW',
			entityType: 'rengiat',
			entityId: id,
			detail: { status: 'PendingReview' }
		});
		sseBroadcaster.emit({
			type: 'rengiat_update',
			data: {
				id,
				status: 'PendingReview',
				message: 'Rengiat baru masuk — mohon ditinjau di Review Rengiat.',
				notifyRoles: ['POLDA'],
				polresId: row?.polresId
			}
		});
		return { success: true };
	},

	analyze: async ({ params, locals }) => {
		if (!locals.user || !['POLRES', 'POLDA'].includes(locals.user.role)) {
			return fail(403, { error: 'Unauthorized' });
		}
		const id = parseInt(params.id);
		const item = db.select().from(rengiat).where(eq(rengiat.id, id)).get();
		if (!item) return fail(404, { error: 'Not found' });

		const points = db
			.select()
			.from(vulnerabilityPoints)
			.where(eq(vulnerabilityPoints.polresId, item.polresId))
			.all();

		const jenisKejahatan = [...new Set(points.map((p) => p.jenisKejahatan))].join(', ');
		const lokasi =
			points.length > 0
				? `Lat ${points[0].lat}, Lng ${points[0].lng}`
				: 'Lokasi tidak tersedia';

		try {
			const analysis = await analyzeRengiat({
				rengiatJudul: item.judul,
				rengiatDeskripsi: item.deskripsi,
				jenisKejahatan,
				lokasi
			});
			db.update(rengiat)
				.set({ aiAnalysis: analysis, updatedAt: new Date().toISOString() })
				.where(eq(rengiat.id, id))
				.run();
			return { success: true, analysis };
		} catch (e) {
			return fail(500, { error: 'Gagal menganalisis. Periksa konfigurasi AI.' });
		}
	},

	generate: async ({ params, locals }) => {
		if (!locals.user || locals.user.role !== 'POLDA') {
			return fail(403, { error: 'Hanya Admin POLDA yang dapat generate rencana taktis.' });
		}
		const id = parseInt(params.id);
		const item = db.select().from(rengiat).where(eq(rengiat.id, id)).get();
		if (!item) return fail(404, { error: 'Not found' });

		const points = db
			.select()
			.from(vulnerabilityPoints)
			.where(eq(vulnerabilityPoints.polresId, item.polresId))
			.all();

		const jenisKejahatan = [...new Set(points.map((p) => p.jenisKejahatan))].join(', ');

		try {
			const plan = await generateTacticalPlan({
				rengiatJudul: item.judul,
				rengiatDeskripsi: item.deskripsi,
				jenisKejahatan,
				lokasi: points.length > 0 ? `Lat ${points[0].lat}, Lng ${points[0].lng}` : ''
			});
			db.update(rengiat)
				.set({ finalPlan: plan, updatedAt: new Date().toISOString() })
				.where(eq(rengiat.id, id))
				.run();
			return { success: true };
		} catch {
			return fail(500, { error: 'Gagal generate rencana taktis.' });
		}
	},

	approve_polda: async (event) => {
		const { params, locals, request, getClientAddress } = event;
		if (!locals.user || locals.user.role !== 'POLDA') return fail(403, { error: 'Unauthorized' });
		const id = parseInt(params.id);
		const row = db.select().from(rengiat).where(eq(rengiat.id, id)).get();
		db.update(rengiat)
			.set({
				status: 'PendingKabo',
				reviewedBy: locals.user.id,
				updatedAt: new Date().toISOString()
			})
			.where(eq(rengiat.id, id))
			.run();
		auditFromRequest(locals.user.id, request, getClientAddress, {
			action: 'RENGIAT_APPROVE_POLDA',
			entityType: 'rengiat',
			entityId: id,
			detail: { status: 'PendingKabo' }
		});
		sseBroadcaster.emit({
			type: 'rengiat_update',
			data: {
				id,
				status: 'PendingKabo',
				message: 'Rengiat menunggu ACC KARO OPS — mohon segera diproses.',
				notifyRoles: ['KARO OPS'],
				polresId: row?.polresId
			}
		});
		return { success: true };
	},

	approve_karoops: async (event) => {
		const { params, locals, request, getClientAddress } = event;
		if (!locals.user || locals.user.role !== 'KARO OPS') return fail(403, { error: 'Unauthorized' });
		const id = parseInt(params.id);
		const row = db.select().from(rengiat).where(eq(rengiat.id, id)).get();
		db.update(rengiat)
			.set({
				status: 'Approved',
				approvedBy: locals.user.id,
				updatedAt: new Date().toISOString()
			})
			.where(eq(rengiat.id, id))
			.run();
		auditFromRequest(locals.user.id, request, getClientAddress, {
			action: 'RENGIAT_APPROVE_KARO',
			entityType: 'rengiat',
			entityId: id,
			detail: { status: 'Approved' }
		});
		sseBroadcaster.emit({
			type: 'rengiat_update',
			data: {
				id,
				status: 'Approved',
				message:
					'Rengiat disetujui (ACC KARO OPS) — siap dilaksanakan; input LHP via menu Giat Saya.',
				notifyRoles: ['POLRES', 'POLSEK'],
				polresId: row?.polresId
			}
		});
		return { success: true };
	},

	reject: async (event) => {
		const { request, params, locals, getClientAddress } = event;
		if (!locals.user || !['POLDA', 'KARO OPS'].includes(locals.user.role)) {
			return fail(403, { error: 'Unauthorized' });
		}
		const formData = await request.formData();
		const note = formData.get('note')?.toString() ?? '';
		const id = parseInt(params.id);
		const row = db.select().from(rengiat).where(eq(rengiat.id, id)).get();
		db.update(rengiat)
			.set({
				status: 'Rejected',
				rejectionNote: note,
				updatedAt: new Date().toISOString()
			})
			.where(eq(rengiat.id, id))
			.run();
		auditFromRequest(locals.user.id, request, getClientAddress, {
			action: 'RENGIAT_REJECT',
			entityType: 'rengiat',
			entityId: id,
			detail: { status: 'Rejected', note }
		});
		sseBroadcaster.emit({
			type: 'rengiat_update',
			data: {
				id,
				status: 'Rejected',
				message: 'Rengiat ditolak — periksa catatan di detail Rengiat.',
				notifyRoles: ['POLRES', 'POLSEK'],
				polresId: row?.polresId
			}
		});
		return { success: true };
	}
};
