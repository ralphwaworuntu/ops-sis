import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { getUploadPath } from '$lib/server/storage';

function escXml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Watermark teks permanen di bagian bawah foto LHP (NRP — WAKTU — KOORDINAT). */
export async function watermarkLaporanFoto(relativePath: string, line1: string, line2: string) {
	const abs = getUploadPath(relativePath.startsWith('/') ? relativePath : `/${relativePath}`);
	const buf = readFileSync(abs);
	const meta = await sharp(buf).metadata();
	const w = meta.width ?? 1200;
	const h = meta.height ?? 800;
	const barH = Math.min(88, Math.round(h * 0.12));
	const svg = `
<svg width="${w}" height="${barH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)"/>
  <text x="12" y="28" font-family="system-ui,sans-serif" font-size="15" font-weight="600" fill="#ffffff">${escXml(line1)}</text>
  <text x="12" y="52" font-family="system-ui,sans-serif" font-size="13" fill="#e2e8f0">${escXml(line2)}</text>
</svg>`;
	const overlay = Buffer.from(svg);
	const base = sharp(buf).composite([{ input: overlay, gravity: 'south' }]);
	const fmt = meta.format === 'png' ? await base.png().toBuffer() : await base.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
	writeFileSync(abs, fmt);
}
