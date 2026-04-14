import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { rengiat, units, users } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { listPolresUnderPolda, isPoldaOrKaro } from '$lib/server/polda-scope';

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();

	const polresList = isPoldaOrKaro(user!.role)
		? listPolresUnderPolda(user!.unitId!)
		: [];
	const satwil = url.searchParams.get('satwil');
	const wid = satwil ? parseInt(satwil, 10) : NaN;
	const polresFilter =
		polresList.length && !isNaN(wid) && polresList.some((p) => p.id === wid) ? wid : null;

	const base = db
		.select({
			id: rengiat.id,
			judul: rengiat.judul,
			deskripsi: rengiat.deskripsi,
			status: rengiat.status,
			jumlahRencanaPlotting: rengiat.jumlahRencanaPlotting,
			polresNama: units.nama,
			createdByNama: users.nama,
			createdAt: rengiat.createdAt,
			updatedAt: rengiat.updatedAt
		})
		.from(rengiat)
		.leftJoin(units, eq(rengiat.polresId, units.id))
		.leftJoin(users, eq(rengiat.createdBy, users.id));

	const list = (polresFilter ? base.where(eq(rengiat.polresId, polresFilter)) : base)
		.orderBy(desc(rengiat.updatedAt))
		.all();

	return {
		rengiatList: list,
		polresList,
		showSatwilFilter: isPoldaOrKaro(user!.role)
	};
};
