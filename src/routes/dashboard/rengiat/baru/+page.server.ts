import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { rengiat, vulnerabilityPoints } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { saveFile } from '$lib/server/storage';

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (
		user!.role !== 'ADMIN POLRES' &&
		user!.role !== 'KABAG OPS' &&
		user!.role !== 'KAPOLRES' &&
		user!.role !== 'WAKAPOLRES'
	) {
		redirect(302, '/dashboard/rengiat');
	}

	const points = db
		.select({
			id: vulnerabilityPoints.id,
			lat: vulnerabilityPoints.lat,
			lng: vulnerabilityPoints.lng,
			jenisKejahatan: vulnerabilityPoints.jenisKejahatan,
			keterangan: vulnerabilityPoints.keterangan,
			origin: vulnerabilityPoints.origin,
			frekuensi: vulnerabilityPoints.frekuensi
		})
		.from(vulnerabilityPoints)
		.where(eq(vulnerabilityPoints.polresId, user!.unitId!))
		.all();

	return { vulnerabilityPoints: points };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (
			!locals.user ||
			(locals.user.role !== 'ADMIN POLRES' &&
				locals.user.role !== 'KABAG OPS' &&
				locals.user.role !== 'KAPOLRES' &&
				locals.user.role !== 'WAKAPOLRES')
		) {
			return fail(403, { error: 'Unauthorized' });
		}

		const data = await request.formData();
		const KATEGORI_OPTIONS = [
			'Rengiat Harian',
			'Rengiat Penanganan Zona Merah',
			'Rengiat Pengamanan Objek Vital',
			'Rengiat Pengamanan Tamu VIP',
			'Rengiat Pengamanan Tamu VVIP'
		] as const;
		type Kategori = (typeof KATEGORI_OPTIONS)[number];

		const kategoriRaw = data.get('kategori')?.toString()?.trim() ?? '';
		const kategori: Kategori =
			(KATEGORI_OPTIONS as readonly string[]).includes(kategoriRaw) && (kategoriRaw as Kategori)
				? (kategoriRaw as Kategori)
				: 'Rengiat Harian';
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

		const isVipVvip =
			kategori === 'Rengiat Pengamanan Tamu VIP' || kategori === 'Rengiat Pengamanan Tamu VVIP';
		const isZonaMerah = kategori === 'Rengiat Penanganan Zona Merah';
		const isObjekVital = kategori === 'Rengiat Pengamanan Objek Vital';

		const targetPointIdRaw = parseInt(data.get('target_point_id')?.toString() ?? '', 10);
		const targetPointId = isNaN(targetPointIdRaw) ? null : targetPointIdRaw;

		if ((isZonaMerah || isObjekVital) && !targetPointId) {
			return fail(400, { error: 'Lokasi/Target titik rawan wajib dipilih untuk kategori ini.' });
		}

		let instansiTerkait: string | null = null;
		let namaTamu: string | null = null;
		if (isVipVvip) {
			const instansiArr = data.getAll('instansi_terkait').map((v) => v.toString().trim()).filter(Boolean);
			instansiTerkait = instansiArr.length > 0 ? JSON.stringify(instansiArr) : null;
			namaTamu = data.get('nama_tamu')?.toString()?.trim() || null;
			if (!namaTamu) {
				return fail(400, { error: 'Nama tamu wajib diisi untuk kategori VIP/VVIP.' });
			}
		}

		let tingkatKerawanan: 'Low' | 'Medium' | 'High' | null = null;
		let analisaSingkatAncaman: string | null = null;
		if (isZonaMerah) {
			const tkRaw = data.get('tingkat_kerawanan')?.toString()?.trim() ?? '';
			tingkatKerawanan = (['Low', 'Medium', 'High'] as const).includes(tkRaw as 'Low')
				? (tkRaw as 'Low' | 'Medium' | 'High')
				: 'High';
			analisaSingkatAncaman = data.get('analisa_singkat_ancaman')?.toString()?.trim() || null;
		}

		const requiresPoldaApproval = isVipVvip;
		const urgency = (isVipVvip || isZonaMerah) ? 'HIGH' as const : 'NORMAL' as const;

		const result = db
			.insert(rengiat)
			.values({
				kategori,
				judul,
				deskripsi,
				filePath,
				status: 'Draft',
				jumlahRencanaPlotting: isNaN(jumlahRencanaPlotting) ? 0 : Math.max(0, jumlahRencanaPlotting),
				anchorLat: isNaN(alat) ? null : alat,
				anchorLng: isNaN(alng) ? null : alng,
				operasiSelesai,
				requiresPoldaApproval,
				urgency,
				targetPointId,
				instansiTerkait,
				namaTamu,
				tingkatKerawanan,
				analisaSingkatAncaman,
				polresId: locals.user.unitId!,
				createdBy: locals.user.id
			})
			.run();

		redirect(302, `/dashboard/rengiat/${result.lastInsertRowid}`);
	}
};
