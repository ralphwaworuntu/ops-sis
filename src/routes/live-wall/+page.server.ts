import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { activityReports, rengiat, units, users, notableIncidents } from '$lib/server/db/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import { listPolresUnderPolda, isPoldaOrKaro } from '$lib/server/polda-scope';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!user || !isPoldaOrKaro(user.role)) {
		redirect(302, '/dashboard');
	}

	const polresIds = listPolresUnderPolda(user.unitId!).map((p) => p.id);
	if (polresIds.length === 0) {
		return {
			recent: [] as const,
			incidents: [] as const,
			dailySeries: [] as { label: string; count: number; dayKey: string }[],
			movingAvg7Prev: 0,
			todayCount: 0,
			scopedPolresIds: [] as number[]
		};
	}

	const recent = db
		.select({
			id: activityReports.id,
			rengiatId: activityReports.rengiatId,
			lat: activityReports.lat,
			lng: activityReports.lng,
			deskripsi: activityReports.deskripsi,
			judul: rengiat.judul,
			kategori: rengiat.kategori,
			urgency: rengiat.urgency,
			userNama: users.nama,
			diLuarRadius: activityReports.diLuarRadius,
			distanceMeters: activityReports.distanceMeters,
			createdAt: activityReports.createdAt,
			polresNama: units.nama
		})
		.from(activityReports)
		.innerJoin(rengiat, eq(activityReports.rengiatId, rengiat.id))
		.leftJoin(users, eq(activityReports.userId, users.id))
		.leftJoin(units, eq(rengiat.polresId, units.id))
		.where(inArray(rengiat.polresId, polresIds))
		.orderBy(desc(activityReports.createdAt))
		.limit(120)
		.all();

	const allForTrend = db
		.select({ createdAt: activityReports.createdAt })
		.from(activityReports)
		.innerJoin(rengiat, eq(activityReports.rengiatId, rengiat.id))
		.where(inArray(rengiat.polresId, polresIds))
		.all();

	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);

	let todayCount = 0;
	for (const r of allForTrend) {
		if (new Date(r.createdAt) >= todayStart) todayCount += 1;
	}

	const dailySeries: { label: string; count: number; dayKey: string }[] = [];
	for (let i = 7; i >= 1; i--) {
		const start = new Date(todayStart);
		start.setDate(start.getDate() - i);
		const end = new Date(start);
		end.setDate(end.getDate() + 1);
		let c = 0;
		for (const r of allForTrend) {
			const d = new Date(r.createdAt);
			if (d >= start && d < end) c += 1;
		}
		dailySeries.push({
			label: start.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }),
			count: c,
			dayKey: start.toISOString().slice(0, 10)
		});
	}

	const movingAvg7Prev =
		dailySeries.length > 0
			? dailySeries.reduce((a, b) => a + b.count, 0) / dailySeries.length
			: 0;

	const incidents = db
		.select({
			id: notableIncidents.id,
			jenis: notableIncidents.jenis,
			deskripsi: notableIncidents.deskripsi,
			fotoPath: notableIncidents.fotoPath,
			lat: notableIncidents.lat,
			lng: notableIncidents.lng,
			createdAt: notableIncidents.createdAt,
			polresId: notableIncidents.polresId,
			polresNama: units.nama,
			userNama: users.nama
		})
		.from(notableIncidents)
		.leftJoin(users, eq(notableIncidents.createdBy, users.id))
		.leftJoin(units, eq(notableIncidents.polresId, units.id))
		.where(inArray(notableIncidents.polresId, polresIds))
		.orderBy(desc(notableIncidents.createdAt))
		.limit(120)
		.all();

	return { recent, incidents, dailySeries, movingAvg7Prev, todayCount, scopedPolresIds: polresIds };
};
