import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	rengiat,
	activityReports,
	vulnerabilityPoints,
	units,
	users,
	notableIncidents
} from '$lib/server/db/schema';
import { eq, and, count, sql, desc, gte, inArray } from 'drizzle-orm';
import { fail, type Actions } from '@sveltejs/kit';
import { saveFile } from '$lib/server/storage';
import { sseBroadcaster } from '$lib/server/sse';
import { auditFromRequest } from '$lib/server/audit';

function kpiFromReportsWeek(
	reportsWeek: { isBuktiLapangan: boolean; lat: number | null; lng: number | null }[]
) {
	const n = reportsWeek.length;
	const bukti = reportsWeek.filter((x) => x.isBuktiLapangan).length;
	const gps = reportsWeek.filter((x) => x.lat != null && x.lng != null).length;
	const volumeScore = Math.min(100, n * 15);
	const buktiScore = n ? Math.round((bukti / n) * 100) : 0;
	const gpsScore = n ? Math.round((gps / n) * 100) : 0;
	return { volume: volumeScore, bukti: buktiScore, gps: gpsScore, sampleSize: n };
}

export const load: PageServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!user) {
		return {
			roleView: 'other' as const,
			stats: { statusCounts: {}, totalVulnerability: 0, totalReports: 0 },
			recentRengiat: [],
			polsekAwareness: null,
			polresLeaderboard: null,
			lhpAwaitingCount: null
		};
	}

	if (
		(user.role === 'ADMIN POLSEK' ||
			user.role === 'KATIM PATROLI' ||
			user.role === 'KAPOLSEK' ||
			user.role === 'WAKAPOLSEK' ||
			user.role === 'KANIT SAMAPTA') &&
		user.polresId != null
	) {
		const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

		const pendingAccRow = db
			.select({ c: count() })
			.from(rengiat)
			.where(
				and(
					eq(rengiat.polresId, user.polresId),
					inArray(rengiat.status, ['PendingReview', 'PendingKabo'])
				)
			)
			.get();

		const readyExecuteRow = db
			.select({ c: count() })
			.from(rengiat)
			.where(and(eq(rengiat.polresId, user.polresId), eq(rengiat.status, 'Approved')))
			.get();

		const giatHariIniRow = db
			.select({ c: count() })
			.from(rengiat)
			.where(
				and(
					eq(rengiat.polresId, user.polresId),
					eq(rengiat.status, 'Approved'),
					gte(rengiat.updatedAt, since24h)
				)
			)
			.get();

		const approved = db
			.select()
			.from(rengiat)
			.where(and(eq(rengiat.polresId, user.polresId), eq(rengiat.status, 'Approved')))
			.all();

		const myReports = db
			.select({ rengiatId: activityReports.rengiatId })
			.from(activityReports)
			.where(eq(activityReports.userId, user.id))
			.all();
		const reported = new Set(myReports.map((r) => r.rengiatId));
		const now = Date.now();
		let laporanTertunda = 0;
		for (const r of approved) {
			if (reported.has(r.id)) continue;
			const end = r.operasiSelesai ? new Date(r.operasiSelesai).getTime() : NaN;
			if (!Number.isNaN(end) && now > end) {
				laporanTertunda += 1;
				continue;
			}
			if (Number.isNaN(end) || !r.operasiSelesai) {
				const appr = new Date(r.updatedAt).getTime();
				if (now - appr > 72 * 60 * 60 * 1000) laporanTertunda += 1;
			}
		}

		const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
		const reportsWeek = db
			.select()
			.from(activityReports)
			.where(and(eq(activityReports.userId, user.id), gte(activityReports.createdAt, weekAgo)))
			.all();
		const kpiRadar = kpiFromReportsWeek(reportsWeek);

		const polsekUnitIds = db
			.select({ id: units.id })
			.from(units)
			.where(and(eq(units.tipe, 'POLSEK'), eq(units.parentId, user.polresId)))
			.all()
			.map((r) => r.id);
		const peerUserIds =
			polsekUnitIds.length === 0
				? []
				: db
						.select({ id: users.id })
						.from(users)
						.where(inArray(users.unitId, polsekUnitIds))
						.all()
						.map((r) => r.id)
						.filter((id) => id !== user.id);

		const peerKpis: number[] = [];
		for (const uid of peerUserIds) {
			const rw = db
				.select()
				.from(activityReports)
				.where(and(eq(activityReports.userId, uid), gte(activityReports.createdAt, weekAgo)))
				.all();
			const k = kpiFromReportsWeek(rw);
			if (k.sampleSize > 0) {
				peerKpis.push((k.volume + k.bukti + k.gps) / 3);
			}
		}
		const kpiPolresRata =
			peerKpis.length > 0 ? Math.round(peerKpis.reduce((a, b) => a + b, 0) / peerKpis.length) : null;
		const kpiPolsekCombined =
			kpiRadar.sampleSize > 0
				? Math.round((kpiRadar.volume + kpiRadar.bukti + kpiRadar.gps) / 3)
				: null;

		const polsekRow = user.unitId
			? db.select().from(units).where(eq(units.id, user.unitId)).get()
			: undefined;
		const polresRow = db.select().from(units).where(eq(units.id, user.polresId)).get();
		const miniCenter = {
			lat: polsekRow?.lat ?? polresRow?.lat ?? -6.2,
			lng: polsekRow?.lng ?? polresRow?.lng ?? 106.85
		};

		const lpHotspots = db
			.select({
				id: vulnerabilityPoints.id,
				lat: vulnerabilityPoints.lat,
				lng: vulnerabilityPoints.lng,
				jenisKejahatan: vulnerabilityPoints.jenisKejahatan,
				frekuensi: vulnerabilityPoints.frekuensi,
				origin: vulnerabilityPoints.origin,
				updatedAt: vulnerabilityPoints.updatedAt
			})
			.from(vulnerabilityPoints)
			.where(
				and(eq(vulnerabilityPoints.polresId, user.polresId), eq(vulnerabilityPoints.origin, 'polres'))
			)
			.orderBy(desc(vulnerabilityPoints.updatedAt))
			.limit(14)
			.all();

		const recentRengiatPolsek = db
			.select()
			.from(rengiat)
			.where(eq(rengiat.polresId, user.polresId))
			.orderBy(desc(rengiat.updatedAt))
			.limit(6)
			.all();

		const titikRawanWilayah = db
			.select({ c: count() })
			.from(vulnerabilityPoints)
			.where(eq(vulnerabilityPoints.polresId, user.polresId))
			.get();

		return {
			roleView: 'polsek' as const,
			stats: { statusCounts: {}, totalVulnerability: 0, totalReports: 0 },
			recentRengiat: recentRengiatPolsek,
			polresLeaderboard: null as null,
			lhpAwaitingCount: null as null,
			polsekAwareness: {
				pendingAcc: pendingAccRow?.c ?? 0,
				readyExecute: readyExecuteRow?.c ?? 0,
				giatHariIni: giatHariIniRow?.c ?? 0,
				laporanTertunda,
				kpiRadar,
				kpiPolsekCombined,
				kpiPolresRata,
				polresNama: user.polresNama ?? 'POLRES',
				polsekNama: user.unitNama ?? 'POLSEK',
				titikRawanCount: titikRawanWilayah?.c ?? 0,
				miniMapCenter: miniCenter,
				lpHotspots
			}
		};
	}

	if (
		(user.role === 'ADMIN POLRES' ||
			user.role === 'KABAG OPS' ||
			user.role === 'KAPOLRES' ||
			user.role === 'WAKAPOLRES') &&
		user.unitId != null
	) {
		const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
		const polsekRows = db
			.select({ id: units.id, nama: units.nama })
			.from(units)
			.where(and(eq(units.tipe, 'POLSEK'), eq(units.parentId, user.unitId)))
			.all();

		const polresLeaderboard = polsekRows
			.map((pu) => {
				const uids = db
					.select({ id: users.id })
					.from(users)
					.where(eq(users.unitId, pu.id))
					.all()
					.map((u) => u.id);
				if (uids.length === 0) {
					return {
						polsekId: pu.id,
						polsekNama: pu.nama,
						score: null as number | null,
						sampleSize: 0
					};
				}
				const rw = db
					.select()
					.from(activityReports)
					.where(
						and(
							inArray(activityReports.userId, uids),
							gte(activityReports.createdAt, weekAgo),
							eq(activityReports.verificationStatus, 'verified')
						)
					)
					.all();
				const k = kpiFromReportsWeek(rw);
				const combined =
					k.sampleSize > 0 ? Math.round((k.volume + k.bukti + k.gps) / 3) : null;
				return {
					polsekId: pu.id,
					polsekNama: pu.nama,
					score: combined,
					sampleSize: k.sampleSize
				};
			})
			.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

		const awaitingRow = db
			.select({ c: count() })
			.from(activityReports)
			.innerJoin(rengiat, eq(activityReports.rengiatId, rengiat.id))
			.where(
				and(
					eq(rengiat.polresId, user.unitId),
					eq(activityReports.verificationStatus, 'awaiting_polres')
				)
			)
			.get();

		const statusCounts = db
			.select({
				status: rengiat.status,
				count: count()
			})
			.from(rengiat)
			.where(eq(rengiat.polresId, user.unitId))
			.groupBy(rengiat.status)
			.all();

		const totalVulnerability = db
			.select({ count: count() })
			.from(vulnerabilityPoints)
			.where(eq(vulnerabilityPoints.polresId, user.unitId))
			.get();

		const totalReports = db
			.select({ count: count() })
			.from(activityReports)
			.innerJoin(rengiat, eq(activityReports.rengiatId, rengiat.id))
			.where(eq(rengiat.polresId, user.unitId))
			.get();

		const recentRengiat = db
			.select()
			.from(rengiat)
			.where(eq(rengiat.polresId, user.unitId))
			.orderBy(sql`${rengiat.createdAt} DESC`)
			.limit(5)
			.all();

		return {
			roleView: 'polres' as const,
			stats: {
				statusCounts: Object.fromEntries(statusCounts.map((r) => [r.status, r.count])),
				totalVulnerability: totalVulnerability?.count ?? 0,
				totalReports: totalReports?.count ?? 0
			},
			recentRengiat,
			polsekAwareness: null,
			polresLeaderboard,
			lhpAwaitingCount: awaitingRow?.c ?? 0
		};
	}

	const statusCounts = db
		.select({
			status: rengiat.status,
			count: count()
		})
		.from(rengiat)
		.groupBy(rengiat.status)
		.all();

	const totalVulnerability = db.select({ count: count() }).from(vulnerabilityPoints).get();

	const totalReports = db.select({ count: count() }).from(activityReports).get();

	const recentRengiat = db
		.select()
		.from(rengiat)
		.orderBy(sql`${rengiat.createdAt} DESC`)
		.limit(5)
		.all();

	return {
		roleView: 'other' as const,
		stats: {
			statusCounts: Object.fromEntries(statusCounts.map((r) => [r.status, r.count])),
			totalVulnerability: totalVulnerability?.count ?? 0,
			totalReports: totalReports?.count ?? 0
		},
		recentRengiat,
		polsekAwareness: null,
		polresLeaderboard: null as null,
		lhpAwaitingCount: null as null
	};
};

export const actions: Actions = {
	notableIncident: async (event) => {
		const { locals, request, getClientAddress } = event;
		if (
			!locals.user ||
			![
				'ADMIN POLSEK',
				'KATIM PATROLI',
				'KAPOLSEK',
				'WAKAPOLSEK',
				'KANIT SAMAPTA',
				'ADMIN POLRES',
				'KABAG OPS',
				'KAPOLRES',
				'WAKAPOLRES'
			].includes(locals.user.role)
		) {
			return fail(403, { error: 'Unauthorized' });
		}
		const data = await request.formData();
		const jenis = data.get('jenis')?.toString()?.trim() ?? '';
		const deskripsi = data.get('deskripsi')?.toString()?.trim() ?? '';
		const foto = data.get('foto') as File | null;

		const latRaw = data.get('lat')?.toString()?.trim() ?? '';
		const lngRaw = data.get('lng')?.toString()?.trim() ?? '';
		const accRaw = data.get('accuracy_m')?.toString()?.trim() ?? '';
		const lat = latRaw ? parseFloat(latRaw) : null;
		const lng = lngRaw ? parseFloat(lngRaw) : null;
		const accuracyMeters = accRaw ? parseFloat(accRaw) : null;

		const allowedJenis = [
			'Tawuran',
			'Kebakaran',
			'Kecelakaan',
			'Bencana',
			'Kriminalitas',
			'Lainnya'
		] as const;
		if (!allowedJenis.includes(jenis as (typeof allowedJenis)[number])) {
			return fail(400, { error: 'Jenis kejadian tidak valid.' });
		}
		if (!deskripsi) {
			return fail(400, { error: 'Deskripsi singkat wajib diisi.' });
		}
		if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
			return fail(400, { error: 'Koordinat GPS belum tersedia. Aktifkan lokasi lalu coba lagi.' });
		}

		let fotoPath: string | null = null;
		if (foto && foto.size > 0) {
			if (foto.size > 7 * 1024 * 1024) {
				return fail(400, { error: 'Ukuran foto maksimal 7MB.' });
			}
			fotoPath = await saveFile(foto, 'kejadian-menonjol');
		}

		const role = locals.user.role as
			| 'ADMIN POLSEK'
			| 'KATIM PATROLI'
			| 'KAPOLSEK'
			| 'WAKAPOLSEK'
			| 'KANIT SAMAPTA'
			| 'ADMIN POLRES'
			| 'KABAG OPS'
			| 'KAPOLRES'
			| 'WAKAPOLRES';
		const unitId = locals.user.unitId!;
		const polresId =
			role === 'ADMIN POLRES' ||
			role === 'KABAG OPS' ||
			role === 'KAPOLRES' ||
			role === 'WAKAPOLRES'
				? locals.user.unitId!
				: (locals.user.polresId ?? locals.user.unitId!);
		const incidentRole =
			role === 'ADMIN POLRES' || role === 'KABAG OPS' || role === 'KAPOLRES' || role === 'WAKAPOLRES'
				? ('POLRES' as const)
				: ('POLSEK' as const);

		const inserted = db
			.insert(notableIncidents)
			.values({
				jenis,
				deskripsi,
				fotoPath,
				lat,
				lng,
				accuracyMeters: accuracyMeters != null && !Number.isNaN(accuracyMeters) ? accuracyMeters : null,
				role: incidentRole,
				unitId,
				polresId,
				createdBy: locals.user.id
			})
			.returning({ id: notableIncidents.id, createdAt: notableIncidents.createdAt })
			.all();
		const incidentId = inserted[0]?.id ?? null;
		const createdAt = inserted[0]?.createdAt ?? new Date().toISOString();

		auditFromRequest(locals.user.id, request, getClientAddress, {
			action: 'NOTABLE_INCIDENT_CREATE',
			entityType: 'notable_incident',
			entityId: incidentId ?? undefined,
			detail: { jenis, hasFoto: Boolean(fotoPath), polresId }
		});

		const polresRow = db.select({ nama: units.nama }).from(units).where(eq(units.id, polresId)).get();
		const unitRow = db.select({ nama: units.nama }).from(units).where(eq(units.id, unitId)).get();

		sseBroadcaster.emit({
			type: 'notable_incident',
			data: {
				id: incidentId,
				jenis,
				deskripsi,
				fotoPath,
				lat,
				lng,
				createdAt,
				role: incidentRole,
				unitId,
				unitNama: unitRow?.nama ?? '',
				polresId,
				polresNama: polresRow?.nama ?? '',
				userNama: locals.user.nama,
				message: 'Laporan kejadian menonjol baru masuk'
			}
		});

		return { success: true };
	}
};
