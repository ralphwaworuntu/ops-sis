import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { rengiat, units, users, vulnerabilityPoints, activityReports, fieldGiatSessions } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
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
			requiresPoldaApproval: rengiat.requiresPoldaApproval,
			urgency: rengiat.urgency,
			targetPointId: rengiat.targetPointId,
			instansiTerkait: rengiat.instansiTerkait,
			namaTamu: rengiat.namaTamu,
			tingkatKerawanan: rengiat.tingkatKerawanan,
			analisaSingkatAncaman: rengiat.analisaSingkatAncaman,
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
	delete: async (event) => {
		const { params, locals, request, getClientAddress } = event;
		if (
			!locals.user ||
			!['ADMIN POLRES', 'KABAG OPS', 'KAPOLRES', 'WAKAPOLRES', 'POLDA', 'KARO OPS'].includes(
				locals.user.role
			)
		) {
			return fail(403, { error: 'Unauthorized' });
		}
		const id = parseInt(params.id);
		if (isNaN(id)) return fail(400, { error: 'ID tidak valid.' });

		const row = db.select().from(rengiat).where(eq(rengiat.id, id)).get();
		if (!row) return fail(404, { error: 'Rengiat tidak ditemukan.' });

		// Scope check
		if (
			locals.user.role === 'ADMIN POLRES' ||
			locals.user.role === 'KABAG OPS' ||
			locals.user.role === 'KAPOLRES' ||
			locals.user.role === 'WAKAPOLRES'
		) {
			if (row.polresId !== locals.user.unitId) return fail(403, { error: 'Tidak diizinkan.' });
		} else if (locals.user.role === 'POLDA') {
			const polresRow = db.select().from(units).where(eq(units.id, row.polresId)).get();
			if (!polresRow || polresRow.tipe !== 'POLRES' || polresRow.parentId !== locals.user.unitId) {
				return fail(403, { error: 'Tidak diizinkan.' });
			}
		}

		// Safety: delete children first to avoid FK constraint errors.
		db.delete(activityReports).where(eq(activityReports.rengiatId, id)).run();
		db.delete(fieldGiatSessions).where(eq(fieldGiatSessions.rengiatId, id)).run();

		db.delete(rengiat).where(eq(rengiat.id, id)).run();

		auditFromRequest(locals.user.id, request, getClientAddress, {
			action: 'RENGIAT_DELETE',
			entityType: 'rengiat',
			entityId: id,
			detail: { polresId: row.polresId, status: row.status }
		});

		return { success: true };
	},

	updateDraftMeta: async ({ request, params, locals }) => {
		if (
			!locals.user ||
			(locals.user.role !== 'ADMIN POLRES' &&
				locals.user.role !== 'KABAG OPS' &&
				locals.user.role !== 'KAPOLRES' &&
				locals.user.role !== 'WAKAPOLRES')
		)
			return fail(403, { error: 'Unauthorized' });
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
		if (
			!locals.user ||
			(locals.user.role !== 'ADMIN POLRES' &&
				locals.user.role !== 'KABAG OPS' &&
				locals.user.role !== 'KAPOLRES' &&
				locals.user.role !== 'WAKAPOLRES')
		)
			return fail(403, { error: 'Unauthorized' });
		const id = parseInt(params.id);
		const row = db.select().from(rengiat).where(eq(rengiat.id, id)).get();
		if (!row) return fail(404, { error: 'Rengiat tidak ditemukan.' });

		const kat = row.kategori ?? 'Rengiat Harian';
		const isVipVvip =
			kat === 'Rengiat Pengamanan Tamu VIP' || kat === 'Rengiat Pengamanan Tamu VVIP';
		const isZonaMerah = kat === 'Rengiat Penanganan Zona Merah';
		const isObjekVital = kat === 'Rengiat Pengamanan Objek Vital';

		if ((isZonaMerah || isObjekVital) && !row.targetPointId) {
			return fail(400, {
				error: 'Lokasi/Target titik rawan wajib dipilih untuk kategori Zona Merah / Objek Vital.'
			});
		}

		if (isVipVvip && !row.namaTamu) {
			return fail(400, {
				error: 'Nama tamu wajib diisi untuk kategori VIP/VVIP.'
			});
		}

		if (kat === 'Rengiat Pengamanan Tamu VVIP' && (row.jumlahRencanaPlotting ?? 0) < 10) {
			return fail(400, {
				error: 'Giat VVIP wajib menyertakan minimal 10 personil (jumlah rencana plotting).'
			});
		}

		const requiresPoldaApproval = isVipVvip;
		const urgency = (isVipVvip || isZonaMerah) ? 'HIGH' as const : 'NORMAL' as const;

		db.update(rengiat)
			.set({
				status: 'PendingReview',
				requiresPoldaApproval,
				urgency,
				updatedAt: new Date().toISOString()
			})
			.where(eq(rengiat.id, id))
			.run();
		auditFromRequest(locals.user.id, request, getClientAddress, {
			action: 'RENGIAT_SUBMIT_REVIEW',
			entityType: 'rengiat',
			entityId: id,
			detail: { status: 'PendingReview', requiresPoldaApproval, urgency }
		});
		sseBroadcaster.emit({
			type: 'rengiat_update',
			data: {
				id,
				status: 'PendingReview',
				message: requiresPoldaApproval
					? `Rengiat ${kat} masuk — memerlukan review prioritas POLDA.`
					: 'Rengiat baru masuk — mohon ditinjau di Review Rengiat.',
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
				notifyRoles: [
					'ADMIN POLRES',
					'KABAG OPS',
					'KAPOLRES',
					'WAKAPOLRES',
					'ADMIN POLSEK',
					'KATIM PATROLI',
					'KAPOLSEK',
					'WAKAPOLSEK',
					'KANIT SAMAPTA'
				],
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
				notifyRoles: [
					'ADMIN POLRES',
					'KABAG OPS',
					'KAPOLRES',
					'WAKAPOLRES',
					'ADMIN POLSEK',
					'KATIM PATROLI',
					'KAPOLSEK',
					'WAKAPOLSEK',
					'KANIT SAMAPTA'
				],
				polresId: row?.polresId
			}
		});
		return { success: true };
	}
};
