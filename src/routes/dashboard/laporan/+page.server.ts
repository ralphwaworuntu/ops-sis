import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { activityReports, rengiat, users, units } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { listPolresUnderPolda, isPoldaOrKaro } from '$lib/server/polda-scope';
import { submitPolsekActivityReport } from '$lib/server/activity-report';

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();

	if (user!.role === 'POLSEK') {
		redirect(302, '/dashboard/giat-saya');
	}

	const polresList = isPoldaOrKaro(user!.role)
		? listPolresUnderPolda(user!.unitId!)
		: [];
	const satwil = url.searchParams.get('satwil');
	const wid = satwil ? parseInt(satwil, 10) : NaN;
	const polresFilter =
		polresList.length > 0 && !isNaN(wid) && polresList.some((p) => p.id === wid) ? wid : null;

	const approvedWhere =
		polresFilter != null
			? and(eq(rengiat.status, 'Approved'), eq(rengiat.polresId, polresFilter))
			: eq(rengiat.status, 'Approved');

	const approvedRengiat = db
		.select({
			id: rengiat.id,
			judul: rengiat.judul,
			jumlahRencanaPlotting: rengiat.jumlahRencanaPlotting,
			polresNama: units.nama
		})
		.from(rengiat)
		.leftJoin(units, eq(rengiat.polresId, units.id))
		.where(approvedWhere)
		.all();

	const reportsBase = db
		.select({
			id: activityReports.id,
			deskripsi: activityReports.deskripsi,
			fotoPath: activityReports.fotoPath,
			jumlahTerploting: activityReports.jumlahTerploting,
			lat: activityReports.lat,
			lng: activityReports.lng,
			isBuktiLapangan: activityReports.isBuktiLapangan,
			diLuarRadius: activityReports.diLuarRadius,
			distanceMeters: activityReports.distanceMeters,
			createdAt: activityReports.createdAt,
			rengiatJudul: rengiat.judul,
			rengiatId: activityReports.rengiatId,
			userNama: users.nama,
			unitNama: units.nama
		})
		.from(activityReports)
		.leftJoin(rengiat, eq(activityReports.rengiatId, rengiat.id))
		.leftJoin(users, eq(activityReports.userId, users.id))
		.leftJoin(units, eq(users.unitId, units.id));

	const reportsFiltered =
		polresFilter != null ? reportsBase.where(eq(rengiat.polresId, polresFilter)) : reportsBase;

	const reports = reportsFiltered.orderBy(desc(activityReports.createdAt)).all();

	return {
		approvedRengiat,
		reports,
		canReport: false,
		polresList,
		showSatwilFilter: isPoldaOrKaro(user!.role)
	};
};

export const actions: Actions = {
	report: async (event) => {
		const fd = await event.request.formData();
		return submitPolsekActivityReport(event.locals, fd, event);
	}
};
