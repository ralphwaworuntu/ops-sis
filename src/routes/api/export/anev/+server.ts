import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { db } from '$lib/server/db';
import { rengiat, activityReports } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { listPolresUnderPolda } from '$lib/server/polda-scope';
import { auditFromRequest } from '$lib/server/audit';

function computeRengiatOk(
	target: number,
	sumPlot: number,
	count: number,
	buktiCount: number
): boolean {
	if (target === 0) return count > 0;
	return sumPlot >= target && buktiCount > 0;
}

type Row = {
	polres: string;
	totalRengiat: number;
	totalDisetujui: number;
	totalLhp: number;
	skorKpi: number;
};

function buildRows(poldaUnitId: number): Row[] {
	const polresList = listPolresUnderPolda(poldaUnitId);
	if (polresList.length === 0) return [];

	const polresIds = polresList.map((p) => p.id);
	const allRengiat = db
		.select()
		.from(rengiat)
		.where(inArray(rengiat.polresId, polresIds))
		.all();

	const reportsJoined = db
		.select({
			rengiatId: activityReports.rengiatId,
			jumlahTerploting: activityReports.jumlahTerploting,
			isBuktiLapangan: activityReports.isBuktiLapangan,
			polresId: rengiat.polresId,
			rengiatStatus: rengiat.status,
			jumlahRencanaPlotting: rengiat.jumlahRencanaPlotting
		})
		.from(activityReports)
		.innerJoin(rengiat, eq(activityReports.rengiatId, rengiat.id))
		.where(inArray(rengiat.polresId, polresIds))
		.all();

	const rows: Row[] = [];

	for (const pr of polresList) {
		const pid = pr.id;
		const rList = allRengiat.filter((r) => r.polresId === pid);
		const totalRengiat = rList.length;
		const approvedList = rList.filter((r) => r.status === 'Approved');
		const totalDisetujui = approvedList.length;

		const lhpForPolres = reportsJoined.filter((x) => x.polresId === pid);
		const totalLhp = lhpForPolres.length;

		let kpiSum = 0;
		let kpiN = 0;
		for (const ar of approvedList) {
			const reps = lhpForPolres.filter((x) => x.rengiatId === ar.id);
			let sumPlot = 0;
			let count = 0;
			let bukti = 0;
			for (const rep of reps) {
				sumPlot += rep.jumlahTerploting ?? 0;
				count += 1;
				if (rep.isBuktiLapangan) bukti += 1;
			}
			const ok = computeRengiatOk(
				ar.jumlahRencanaPlotting ?? 0,
				sumPlot,
				count,
				bukti
			);
			kpiSum += ok ? 100 : 0;
			kpiN += 1;
		}
		const skorKpi = kpiN === 0 ? 0 : Math.round(kpiSum / kpiN);

		rows.push({
			polres: pr.nama,
			totalRengiat,
			totalDisetujui,
			totalLhp,
			skorKpi
		});
	}

	return rows;
}

export const GET: RequestHandler = async (event) => {
	const { locals, url, request, getClientAddress } = event;
	const user = locals.user;
	if (!user || !['KARO OPS', 'POLDA'].includes(user.role)) {
		error(403, 'Hanya KARO OPS / POLDA');
	}
	if (user.unitId == null) error(400, 'Unit tidak valid');

	const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx';
	auditFromRequest(user.id, request, getClientAddress, {
		action: 'ANEV_EXPORT_DOWNLOAD',
		entityType: 'export',
		entityId: null,
		detail: { format }
	});
	const rows = buildRows(user.unitId);

	const now = new Date();
	const stamp = now.toISOString().slice(0, 10);
	const title = 'LAPORAN ANALISIS DAN EVALUASI (ANEV) — OPS SIS';

	if (format === 'xlsx') {
		const wb = new ExcelJS.Workbook();
		wb.creator = 'OPS-SIS';
		wb.created = now;

		const ringkas = wb.addWorksheet('Ringkasan', {
			properties: { defaultRowHeight: 18 }
		});
		ringkas.mergeCells('A1:D1');
		ringkas.getCell('A1').value = title;
		ringkas.getCell('A1').font = { bold: true, size: 14 };
		ringkas.getCell('A3').value = 'Tanggal cetak';
		ringkas.getCell('B3').value = now.toLocaleString('id-ID');
		ringkas.getCell('A4').value = 'Total Rengiat (seluruh Satwil)';
		ringkas.getCell('B4').value = rows.reduce((a, r) => a + r.totalRengiat, 0);
		ringkas.getCell('A5').value = 'Total LHP (Laporan Hasil Pelaksanaan)';
		ringkas.getCell('B5').value = rows.reduce((a, r) => a + r.totalLhp, 0);
		ringkas.getCell('A6').value = 'Rata-rata Skor KPI Satwil';
		const avgKpi =
			rows.length === 0
				? 0
				: Math.round(rows.reduce((a, r) => a + r.skorKpi, 0) / rows.length);
		ringkas.getCell('B6').value = avgKpi;

		const ws = wb.addWorksheet('Per POLRES', {
			properties: { defaultRowHeight: 18 }
		});
		ws.columns = [
			{ header: 'POLRES / Satwil', key: 'polres', width: 36 },
			{ header: 'Total Rengiat', key: 'tr', width: 14 },
			{ header: 'Rengiat Disetujui', key: 'td', width: 18 },
			{ header: 'Total LHP', key: 'lhp', width: 12 },
			{ header: 'Skor KPI (0–100)', key: 'kpi', width: 18 }
		];
		ws.getRow(1).font = { bold: true };
		for (const r of rows) {
			ws.addRow({
				polres: r.polres,
				tr: r.totalRengiat,
				td: r.totalDisetujui,
				lhp: r.totalLhp,
				kpi: r.skorKpi
			});
		}

		const buf = await wb.xlsx.writeBuffer();
		return new Response(buf, {
			headers: {
				'Content-Type':
					'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="anev-ops-sis-${stamp}.xlsx"`
			}
		});
	}

	const pdf = await PDFDocument.create();
	const page = pdf.addPage([595.28, 841.89]);
	const { height } = page.getSize();
	const font = await pdf.embedFont(StandardFonts.Helvetica);
	const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
	let y = height - 48;
	const line = 14;
	const left = 48;

	page.drawText(title, { x: left, y, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.15) });
	y -= line * 2;
	page.drawText(`Tanggal: ${now.toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`, {
		x: left,
		y,
		size: 9,
		font,
		color: rgb(0.2, 0.2, 0.25)
	});
	y -= line * 2;

	const totalR = rows.reduce((a, r) => a + r.totalRengiat, 0);
	const totalL = rows.reduce((a, r) => a + r.totalLhp, 0);
	page.drawText(`Ringkasan — Total Rengiat: ${totalR}  |  Total LHP: ${totalL}`, {
		x: left,
		y,
		size: 9,
		font: fontBold
	});
	y -= line * 2;

	page.drawText('POLRES', { x: left, y, size: 8, font: fontBold });
	page.drawText('Ren.', { x: left + 220, y, size: 8, font: fontBold });
	page.drawText('App.', { x: left + 260, y, size: 8, font: fontBold });
	page.drawText('LHP', { x: left + 300, y, size: 8, font: fontBold });
	page.drawText('KPI', { x: left + 340, y, size: 8, font: fontBold });
	y -= line * 1.2;

	for (const r of rows) {
		if (y < 72) break;
		const nama = r.polres.length > 34 ? r.polres.slice(0, 31) + '...' : r.polres;
		page.drawText(nama, { x: left, y, size: 8, font });
		page.drawText(String(r.totalRengiat), { x: left + 220, y, size: 8, font });
		page.drawText(String(r.totalDisetujui), { x: left + 260, y, size: 8, font });
		page.drawText(String(r.totalLhp), { x: left + 300, y, size: 8, font });
		page.drawText(String(r.skorKpi), { x: left + 340, y, size: 8, font });
		y -= line;
	}

	y -= line;
	page.drawText(
		'Dokumen ini dihasilkan otomatis dari OPS-SIS untuk keperluan pelaporan formal.',
		{ x: left, y, size: 7, font, color: rgb(0.35, 0.35, 0.4) }
	);

	const pdfBytes = await pdf.save();
	return new Response(pdfBytes as unknown as BodyInit, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="anev-ops-sis-${stamp}.pdf"`
		}
	});
};
