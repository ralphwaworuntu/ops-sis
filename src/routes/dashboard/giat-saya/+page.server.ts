import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { activityReports, rengiat, units } from '$lib/server/db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { submitPolsekActivityReport } from '$lib/server/activity-report';
import { getActiveSessionsForPolsekUser } from '$lib/server/field-giat';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();

	if (user!.role !== 'POLSEK') {
		redirect(302, '/dashboard');
	}

	let polresId: number | null = null;
	if (user!.unitId) {
		const u = db.select().from(units).where(eq(units.id, user!.unitId)).get();
		if (u?.tipe === 'POLSEK' && u.parentId) polresId = u.parentId;
	}

	const approvedRengiat =
		polresId == null
			? []
			: db
					.select({
						id: rengiat.id,
						judul: rengiat.judul,
						jumlahRencanaPlotting: rengiat.jumlahRencanaPlotting,
						polresNama: units.nama
					})
					.from(rengiat)
					.leftJoin(units, eq(rengiat.polresId, units.id))
					.where(and(eq(rengiat.status, 'Approved'), eq(rengiat.polresId, polresId)))
					.orderBy(desc(rengiat.updatedAt))
					.all();

	const ridList = approvedRengiat.map((r) => r.id);
	const myReports =
		ridList.length === 0
			? []
			: db
					.select({
						id: activityReports.id,
						rengiatId: activityReports.rengiatId,
						deskripsi: activityReports.deskripsi,
						fotoPath: activityReports.fotoPath,
						jumlahTerploting: activityReports.jumlahTerploting,
						isBuktiLapangan: activityReports.isBuktiLapangan,
						createdAt: activityReports.createdAt,
						verificationStatus: activityReports.verificationStatus,
						returnedNote: activityReports.returnedNote
					})
					.from(activityReports)
					.where(
						and(eq(activityReports.userId, user!.id), inArray(activityReports.rengiatId, ridList))
					)
					.orderBy(desc(activityReports.createdAt))
					.all();

	/** Laporan terbaru per Rengiat (urutan sudah terbaru dulu). */
	const latestByRengiat = new Map<
		number,
		(typeof myReports)[0]
	>();
	for (const r of myReports) {
		if (!latestByRengiat.has(r.rengiatId)) {
			latestByRengiat.set(r.rengiatId, r);
		}
	}

	const agg = new Map<
		number,
		{ count: number; sumPlot: number; lastAt: string; lastDeskripsi: string }
	>();
	for (const r of myReports) {
		const cur = agg.get(r.rengiatId);
		if (!cur) {
			agg.set(r.rengiatId, {
				count: 1,
				sumPlot: r.jumlahTerploting ?? 0,
				lastAt: r.createdAt,
				lastDeskripsi: r.deskripsi
			});
		} else {
			cur.count += 1;
			cur.sumPlot += r.jumlahTerploting ?? 0;
		}
	}

	const laporanRingkas = approvedRengiat.map((rg) => {
		const s = agg.get(rg.id);
		const latest = latestByRengiat.get(rg.id);
		const lastReturned =
			latest?.verificationStatus === 'returned'
				? {
						note: latest.returnedNote ?? '',
						at: latest.createdAt,
						reportId: latest.id
					}
				: null;
		return {
			rengiatId: rg.id,
			count: s?.count ?? 0,
			sumPlot: s?.sumPlot ?? 0,
			lastAt: s?.lastAt ?? null,
			lastDeskripsi: s?.lastDeskripsi ?? null,
			lastReturned,
			latestVerificationStatus: latest?.verificationStatus ?? null
		};
	});

	const activeFieldSessions = getActiveSessionsForPolsekUser(user!.id);

	return {
		approvedRengiat,
		myReports,
		laporanRingkas,
		activeFieldSessions,
		nrp: user!.nrp ?? ''
	};
};

export const actions: Actions = {
	report: async (event) => {
		const fd = await event.request.formData();
		return submitPolsekActivityReport(event.locals, fd, event);
	}
};
