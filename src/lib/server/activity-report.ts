import { fail, type ActionFailure } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { activityReports, rengiat, units, users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

/** Waktu simpan lokal / klik kirim — dipakai sebagai created_at agar KPI tetap adil setelah sync tertunda. */
export function parseCapturedAtForLhp(raw: string | null | undefined): string | null {
	if (!raw?.trim()) return null;
	const d = new Date(raw.trim());
	if (Number.isNaN(d.getTime())) return null;
	const now = Date.now();
	const t = d.getTime();
	if (t > now + 5 * 60 * 1000) return null;
	if (t < now - 30 * 24 * 60 * 60 * 1000) return null;
	return new Date(t).toISOString();
}
import { saveFile } from '$lib/server/storage';
import { distanceMeters, GEO_FENCE_RADIUS_M } from '$lib/server/geo';
import { watermarkLaporanFoto } from '$lib/server/watermark-laporan';
import { auditFromRequest } from '$lib/server/audit';
import { sseBroadcaster } from '$lib/server/sse';
import { endFieldGiatSessionForUser } from '$lib/server/field-giat';

export type SubmitReportResult = { success: true } | ActionFailure<{ error: string }>;

export async function submitPolsekActivityReport(
	locals: App.Locals,
	formData: FormData,
	event: Pick<RequestEvent, 'getClientAddress' | 'request'>
): Promise<SubmitReportResult> {
	if (!locals.user || locals.user.role !== 'POLSEK') {
		return fail(403, { error: 'Hanya POLSEK yang dapat melapor.' });
	}

	const rengiatId = parseInt(formData.get('rengiat_id')?.toString() ?? '');
	const deskripsi = formData.get('deskripsi')?.toString()?.trim() ?? '';
	const foto = formData.get('foto') as File | null;
	const jumlahTerploting = parseInt(formData.get('jumlah_terploting')?.toString() ?? '0', 10);
	const latStr = formData.get('lat')?.toString()?.trim() ?? '';
	const lngStr = formData.get('lng')?.toString()?.trim() ?? '';
	const lat = latStr === '' ? null : parseFloat(latStr);
	const lng = lngStr === '' ? null : parseFloat(lngStr);
	const editReportIdRaw = formData.get('edit_report_id')?.toString()?.trim() ?? '';
	const editReportId = editReportIdRaw ? parseInt(editReportIdRaw, 10) : null;
	const isBuktiLapangan =
		formData.get('bukti_lapangan') === 'on' || formData.get('bukti_lapangan') === 'true';

	if (isNaN(rengiatId) || !deskripsi) {
		return fail(400, { error: 'Rengiat dan deskripsi wajib diisi.' });
	}

	const rg = db.select().from(rengiat).where(eq(rengiat.id, rengiatId)).get();
	if (!rg || rg.status !== 'Approved') {
		return fail(400, { error: 'Rengiat tidak valid atau belum disetujui.' });
	}
	if (locals.user.unitId) {
		const polsek = db.select().from(units).where(eq(units.id, locals.user.unitId)).get();
		if (polsek?.tipe === 'POLSEK' && polsek.parentId && polsek.parentId !== rg.polresId) {
			return fail(403, { error: 'Rengiat ini di luar wilayah POLSEK Anda.' });
		}
	}

	let anchorLat = rg.anchorLat ?? null;
	let anchorLng = rg.anchorLng ?? null;
	if (anchorLat == null || anchorLng == null) {
		const pol = db.select().from(units).where(eq(units.id, rg.polresId)).get();
		anchorLat = pol?.lat ?? null;
		anchorLng = pol?.lng ?? null;
	}

	let diLuarRadius = false;
	let dist: number | null = null;
	if (
		lat != null &&
		lng != null &&
		!isNaN(lat) &&
		!isNaN(lng) &&
		anchorLat != null &&
		anchorLng != null &&
		!isNaN(anchorLat) &&
		!isNaN(anchorLng)
	) {
		dist = distanceMeters(lat, lng, anchorLat, anchorLng);
		diLuarRadius = dist > GEO_FENCE_RADIUS_M;
	}

	const urow = db.select({ nrp: users.nrp }).from(users).where(eq(users.id, locals.user.id)).get();
	const nrp = urow?.nrp?.trim() || 'NRP-TIDAK-DISET';

	const capturedAtIso =
		parseCapturedAtForLhp(formData.get('captured_at_iso')?.toString()) ??
		parseCapturedAtForLhp(formData.get('captured_at')?.toString());
	const reportCreatedAt = capturedAtIso ?? new Date().toISOString();

	let fotoPath: string | null = null;
	if (foto && foto.size > 0) {
		if (foto.size > 5 * 1024 * 1024) {
			return fail(400, { error: 'Ukuran foto maksimal 5MB.' });
		}
		fotoPath = await saveFile(foto, 'laporan');
		try {
			const waktu = new Date(reportCreatedAt).toLocaleString('id-ID', {
				dateStyle: 'short',
				timeStyle: 'medium'
			});
			const line1 = `${nrp} — ${waktu}`;
			const line2 =
				lat != null && lng != null && !isNaN(lat) && !isNaN(lng)
					? `Lat ${lat.toFixed(6)}  Lng ${lng.toFixed(6)}`
					: 'Tanpa koordinat GPS pada laporan';
			await watermarkLaporanFoto(fotoPath, line1, line2);
		} catch {
			// watermark gagal → foto tetap tersimpan
		}
	}

	let reportId: number | null = null;
	let action: 'LHP_SUBMIT' | 'LHP_RESUBMIT' = 'LHP_SUBMIT';

	if (editReportId != null && !isNaN(editReportId)) {
		const old = db
			.select()
			.from(activityReports)
			.where(eq(activityReports.id, editReportId))
			.get();
		if (
			!old ||
			old.userId !== locals.user.id ||
			old.rengiatId !== rengiatId ||
			old.verificationStatus !== 'returned'
		) {
			return fail(400, { error: 'Laporan yang diperbaiki tidak valid atau tidak dapat diubah.' });
		}
		// Jika user tidak upload foto baru, pertahankan foto lama.
		const nextFotoPath = fotoPath ?? old.fotoPath ?? null;

		db.update(activityReports)
			.set({
				deskripsi,
				fotoPath: nextFotoPath,
				lat: lat != null && !isNaN(lat) ? lat : null,
				lng: lng != null && !isNaN(lng) ? lng : null,
				jumlahTerploting: isNaN(jumlahTerploting) ? 0 : Math.max(0, jumlahTerploting),
				isBuktiLapangan,
				diLuarRadius,
				distanceMeters: dist,
				verificationStatus: 'awaiting_polres',
				returnedNote: null,
				createdAt: reportCreatedAt
			})
			.where(eq(activityReports.id, editReportId))
			.run();
		reportId = editReportId;
		action = 'LHP_RESUBMIT';
	} else {
		const insertedRows = db
			.insert(activityReports)
			.values({
				rengiatId,
				userId: locals.user.id,
				deskripsi,
				fotoPath,
				lat: lat != null && !isNaN(lat) ? lat : null,
				lng: lng != null && !isNaN(lng) ? lng : null,
				jumlahTerploting: isNaN(jumlahTerploting) ? 0 : Math.max(0, jumlahTerploting),
				isBuktiLapangan,
				diLuarRadius,
				distanceMeters: dist,
				verificationStatus: 'awaiting_polres',
				createdAt: reportCreatedAt
			})
			.returning({ id: activityReports.id })
			.all();
		reportId = insertedRows[0]?.id ?? null;
	}

	auditFromRequest(locals.user.id, event.request, event.getClientAddress, {
		action,
		entityType: 'activity_report',
		entityId: reportId,
		detail: {
			rengiatId,
			diLuarRadius,
			distanceMeters: dist,
			hasFoto: Boolean(fotoPath)
		}
	});

	const hasEndCoords =
		lat != null && lng != null && !isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0);
	endFieldGiatSessionForUser(locals.user.id, {
		rengiatId,
		...(hasEndCoords ? { endLat: lat, endLng: lng } : {})
	});

	if (reportId != null) {
		const polRow = db.select({ nama: units.nama }).from(units).where(eq(units.id, rg.polresId)).get();
		const base = {
			id: reportId,
			rengiatId,
			diLuarRadius,
			distanceMeters: dist,
			deskripsi,
			judul: rg.judul,
			polresNama: polRow?.nama ?? '',
			userNama: locals.user.nama,
			createdAt: reportCreatedAt,
			message:
				lat != null && lng != null && !isNaN(lat) && !isNaN(lng)
					? 'LHP baru masuk'
					: 'LHP baru masuk (tanpa koordinat peta)'
		};
		sseBroadcaster.emit({
			type: 'lhp_new',
			data:
				lat != null && lng != null && !isNaN(lat) && !isNaN(lng)
					? { ...base, lat, lng }
					: { ...base, lat: undefined, lng: undefined }
		});
	}

	return { success: true };
}
