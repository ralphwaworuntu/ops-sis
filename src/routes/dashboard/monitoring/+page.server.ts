import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { rengiat, units, activityReports, users, vulnerabilityPoints } from '$lib/server/db/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { listPolresUnderPolda, isPoldaOrKaro } from '$lib/server/polda-scope';
import { listActiveFieldSessionsForPolres } from '$lib/server/field-giat';

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();

	if (
		(user!.role === 'KABAG OPS' ||
			user!.role === 'ADMIN POLRES' ||
			user!.role === 'KAPOLRES' ||
			user!.role === 'WAKAPOLRES') &&
		user!.unitId != null
	) {
		const fieldActive = listActiveFieldSessionsForPolres(user.unitId);
		return {
			mode: 'polres' as const,
			fieldActive,
			polresList: [] as { id: number; nama: string }[],
			polresFilter: null as number | null,
			comparisons: [] as never[],
			reports: [] as never[]
		};
	}

	if (!isPoldaOrKaro(user!.role)) {
		redirect(302, '/dashboard');
	}

	const poldaId = user!.unitId!;
	const polresList = listPolresUnderPolda(poldaId);
	const satwil = url.searchParams.get('satwil');
	const wid = satwil ? parseInt(satwil, 10) : NaN;
	const polresFilter = !isNaN(wid) && polresList.some((p) => p.id === wid) ? wid : null;

	const base = db
		.select({
			id: rengiat.id,
			judul: rengiat.judul,
			kategori: rengiat.kategori,
			status: rengiat.status,
			urgency: rengiat.urgency,
			requiresPoldaApproval: rengiat.requiresPoldaApproval,
			targetPointId: rengiat.targetPointId,
			jumlahRencanaPlotting: rengiat.jumlahRencanaPlotting,
			polresNama: units.nama,
			polresId: rengiat.polresId
		})
		.from(rengiat)
		.leftJoin(units, eq(rengiat.polresId, units.id));

	const list = (polresFilter ? base.where(eq(rengiat.polresId, polresFilter)) : base)
		.orderBy(desc(rengiat.updatedAt))
		.all();

	const rengiatIds = list.filter((r) => r.status === 'Approved').map((r) => r.id);
	const reports =
		rengiatIds.length === 0
			? []
			: db
					.select({
						id: activityReports.id,
						rengiatId: activityReports.rengiatId,
						jumlahTerploting: activityReports.jumlahTerploting,
						isBuktiLapangan: activityReports.isBuktiLapangan,
						lat: activityReports.lat,
						lng: activityReports.lng,
						deskripsi: activityReports.deskripsi,
						diLuarRadius: activityReports.diLuarRadius,
						distanceMeters: activityReports.distanceMeters,
						createdAt: activityReports.createdAt,
						userNama: users.nama
					})
					.from(activityReports)
					.leftJoin(users, eq(activityReports.userId, users.id))
					.where(inArray(activityReports.rengiatId, rengiatIds))
					.orderBy(desc(activityReports.createdAt))
					.all();

	const byRengiat = new Map<
		number,
		{ sumPlot: number; count: number; buktiCount: number; withGps: number; outRadiusCount: number }
	>();
	for (const id of rengiatIds) {
		byRengiat.set(id, { sumPlot: 0, count: 0, buktiCount: 0, withGps: 0, outRadiusCount: 0 });
	}
	for (const rep of reports) {
		const agg = byRengiat.get(rep.rengiatId);
		if (!agg) continue;
		agg.sumPlot += rep.jumlahTerploting ?? 0;
		agg.count += 1;
		if (rep.isBuktiLapangan) agg.buktiCount += 1;
		if (rep.lat != null && rep.lng != null) agg.withGps += 1;
		if (rep.diLuarRadius) agg.outRadiusCount += 1;
	}

	const comparisons = list
		.filter((r) => r.status === 'Approved')
		.map((r) => {
			const agg = byRengiat.get(r.id) ?? {
				sumPlot: 0,
				count: 0,
				buktiCount: 0,
				withGps: 0,
				outRadiusCount: 0
			};
			const target = r.jumlahRencanaPlotting ?? 0;
			const ok =
				target === 0 ? agg.count > 0 : agg.sumPlot >= target && agg.buktiCount > 0;
			return { ...r, ...agg, ok };
		});

	const pendingReview = list
		.filter((r) => r.status === 'PendingReview' || r.status === 'PendingKabo')
		.sort((a, b) => {
			const ua = a.urgency === 'HIGH' ? 0 : 1;
			const ub = b.urgency === 'HIGH' ? 0 : 1;
			return ua - ub;
		});

	const targetPointIds = list
		.map((r) => r.targetPointId)
		.filter((id): id is number => id != null);
	const vulnPointsMap: Record<number, { id: number; lat: number; lng: number; jenisKejahatan: string; frekuensi: number; keterangan: string | null }> = {};
	if (targetPointIds.length > 0) {
		const pts = db
			.select({
				id: vulnerabilityPoints.id,
				lat: vulnerabilityPoints.lat,
				lng: vulnerabilityPoints.lng,
				jenisKejahatan: vulnerabilityPoints.jenisKejahatan,
				frekuensi: vulnerabilityPoints.frekuensi,
				keterangan: vulnerabilityPoints.keterangan
			})
			.from(vulnerabilityPoints)
			.where(inArray(vulnerabilityPoints.id, targetPointIds))
			.all();
		for (const p of pts) {
			vulnPointsMap[p.id] = p;
		}
	}

	return {
		mode: 'polda' as const,
		fieldActive: [] as ReturnType<typeof listActiveFieldSessionsForPolres>,
		polresList,
		polresFilter,
		comparisons,
		pendingReview,
		vulnPointsMap,
		reports: reports.slice(0, 50)
	};
};
