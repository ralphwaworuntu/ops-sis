import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { rengiat } from '$lib/server/db/schema';
import { saveFile } from '$lib/server/storage';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (user!.role !== 'POLRES') {
		redirect(302, '/dashboard/rengiat');
	}
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'POLRES') {
			return fail(403, { error: 'Unauthorized' });
		}

		const data = await request.formData();
		const judul = data.get('judul')?.toString()?.trim() ?? '';
		const deskripsi = data.get('deskripsi')?.toString()?.trim() ?? '';
		const rengiatFile = data.get('rengiat_file');
		const jumlahRencanaPlotting = parseInt(data.get('jumlah_rencana_plotting')?.toString() ?? '0', 10);
		const alat = parseFloat(data.get('anchor_lat')?.toString() ?? '');
		const alng = parseFloat(data.get('anchor_lng')?.toString() ?? '');
		const opRaw = data.get('operasi_selesai')?.toString()?.trim() ?? '';
		let operasiSelesai: string | null = null;
		if (opRaw.length > 0) {
			const t = new Date(opRaw);
			operasiSelesai = isNaN(t.getTime()) ? null : t.toISOString();
		}

		if (!judul || !deskripsi) {
			return fail(400, { error: 'Judul dan deskripsi wajib diisi.' });
		}

		let filePath: string | null = null;
		if (rengiatFile instanceof File && rengiatFile.size > 0) {
			const maxBytes = 100 * 1024 * 1024;
			if (rengiatFile.size > maxBytes) {
				return fail(400, { error: 'Ukuran file maksimal 100MB.' });
			}
			const name = rengiatFile.name.toLowerCase();
			const okByExt = name.endsWith('.pdf') || name.endsWith('.doc') || name.endsWith('.docx');
			const okByMime =
				rengiatFile.type === 'application/pdf' ||
				rengiatFile.type === 'application/msword' ||
				rengiatFile.type ===
					'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
			if (!okByExt && !okByMime) {
				return fail(400, { error: 'Format file harus PDF, DOC, atau DOCX.' });
			}
			filePath = await saveFile(rengiatFile, 'rengiat');
		}

		const result = db
			.insert(rengiat)
			.values({
				judul,
				deskripsi,
				filePath,
				status: 'Draft',
				jumlahRencanaPlotting: isNaN(jumlahRencanaPlotting) ? 0 : Math.max(0, jumlahRencanaPlotting),
				anchorLat: isNaN(alat) ? null : alat,
				anchorLng: isNaN(alng) ? null : alng,
				operasiSelesai,
				polresId: locals.user.unitId!,
				createdBy: locals.user.id
			})
			.run();

		redirect(302, `/dashboard/rengiat/${result.lastInsertRowid}`);
	}
};
