import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { activityReports, rengiat, units, users } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { sseBroadcaster } from '$lib/server/sse';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (user?.role !== 'POLRES' || user.unitId == null) {
		redirect(302, '/dashboard');
	}

	const rows = db
		.select({
			id: activityReports.id,
			deskripsi: activityReports.deskripsi,
			fotoPath: activityReports.fotoPath,
			lat: activityReports.lat,
			lng: activityReports.lng,
			jumlahTerploting: activityReports.jumlahTerploting,
			isBuktiLapangan: activityReports.isBuktiLapangan,
			diLuarRadius: activityReports.diLuarRadius,
			distanceMeters: activityReports.distanceMeters,
			createdAt: activityReports.createdAt,
			userNama: users.nama,
			userNrp: users.nrp,
			polsekNama: units.nama,
			rengiatJudul: rengiat.judul
		})
		.from(activityReports)
		.innerJoin(rengiat, eq(activityReports.rengiatId, rengiat.id))
		.innerJoin(users, eq(activityReports.userId, users.id))
		.leftJoin(units, eq(users.unitId, units.id))
		.where(
			and(
				eq(rengiat.polresId, user.unitId),
				eq(activityReports.verificationStatus, 'awaiting_polres')
			)
		)
		.orderBy(desc(activityReports.createdAt))
		.all();

	return { rows };
};

export const actions: Actions = {
	bulk: async ({ request, locals }) => {
		if (locals.user?.role !== 'POLRES' || locals.user.unitId == null) {
			return fail(403, { error: 'Unauthorized' });
		}

		const fd = await request.formData();
		const bulkAction = fd.get('bulk_action')?.toString();
		const ids = fd
			.getAll('report_id')
			.map((x) => parseInt(String(x), 10))
			.filter((n) => !isNaN(n));
		const returnNote = fd.get('return_note')?.toString()?.trim() ?? '';

		if (bulkAction !== 'verify' && bulkAction !== 'return') {
			return fail(400, { error: 'Aksi tidak valid.' });
		}
		if (ids.length === 0) {
			return fail(400, { error: 'Pilih minimal satu LHP.' });
		}
		if (bulkAction === 'return' && returnNote.length < 5) {
			return fail(400, { error: 'Alasan pengembalian minimal 5 karakter.' });
		}

		const polresId = locals.user.unitId;

		for (const id of ids) {
			const row = db.select().from(activityReports).where(eq(activityReports.id, id)).get();
			if (!row || row.verificationStatus !== 'awaiting_polres') continue;
			const rg = db.select().from(rengiat).where(eq(rengiat.id, row.rengiatId)).get();
			if (!rg || rg.polresId !== polresId) continue;

			if (bulkAction === 'verify') {
				db.update(activityReports)
					.set({ verificationStatus: 'verified', returnedNote: null })
					.where(eq(activityReports.id, id))
					.run();
				sseBroadcaster.emit({
					type: 'lhp_verification',
					data: {
						message: 'LHP Anda telah diverifikasi Kabag Ops / Polres.',
						notifyRoles: ['POLSEK'],
						polresId: rg.polresId,
						targetUserId: row.userId,
						kind: 'verified'
					}
				});
			} else {
				db.update(activityReports)
					.set({ verificationStatus: 'returned', returnedNote: returnNote })
					.where(eq(activityReports.id, id))
					.run();
				sseBroadcaster.emit({
					type: 'lhp_verification',
					data: {
						message: `LHP dikembalikan untuk perbaikan: ${returnNote.slice(0, 120)}`,
						notifyRoles: ['POLSEK'],
						polresId: rg.polresId,
						targetUserId: row.userId,
						kind: 'returned'
					}
				});
			}
		}

		return { success: true };
	}
};
