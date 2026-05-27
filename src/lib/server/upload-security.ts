import path from 'path';
import { resolveUploadDir } from '$lib/server/paths';

export const ALLOWED_UPLOAD_EXTS = new Set(['jpg', 'jpeg', 'png', 'pdf', 'docx', 'xlsx']);

export type UploadKind = 'jpg' | 'png' | 'pdf' | 'docx' | 'xlsx' | 'unknown';

export function sniffUploadKind(buf: Buffer): UploadKind {
	// JPEG: FF D8 FF
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if (
		buf.length >= 8 &&
		buf[0] === 0x89 &&
		buf[1] === 0x50 &&
		buf[2] === 0x4e &&
		buf[3] === 0x47 &&
		buf[4] === 0x0d &&
		buf[5] === 0x0a &&
		buf[6] === 0x1a &&
		buf[7] === 0x0a
	)
		return 'png';
	// PDF: %PDF-
	if (buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d)
		return 'pdf';
	// ZIP container (DOCX/XLSX): PK\x03\x04 (atau empty archive PK\x05\x06)
	if (
		buf.length >= 4 &&
		buf[0] === 0x50 &&
		buf[1] === 0x4b &&
		((buf[2] === 0x03 && buf[3] === 0x04) || (buf[2] === 0x05 && buf[3] === 0x06))
	) {
		// Tidak bisa membedakan docx vs xlsx tanpa parse ZIP.
		return 'unknown';
	}
	return 'unknown';
}

export function sanitizeExt(inputExt: string | null | undefined): string {
	const ext = (inputExt ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
	return ext;
}

export function sanitizeSubfolder(input: string): string {
	// hanya izinkan segmen path sederhana agar tidak bisa escape uploads/
	const cleaned = input
		.split(/[\\/]+/g)
		.filter(Boolean)
		.map((s) => s.toLowerCase().replace(/[^a-z0-9-_]/g, ''))
		.filter(Boolean)
		.join('/');
	return cleaned || 'general';
}

export function resolveUploadReadPath(paramsPath: string): { ok: true; absPath: string; ext: string } | { ok: false } {
	// Reject cepat untuk pola traversal/absolute.
	if (!paramsPath) return { ok: false };
	if (paramsPath.startsWith('/')) return { ok: false };
	if (paramsPath.includes('..')) return { ok: false };

	const root = resolveUploadDir();
	const normalized = path.normalize(paramsPath).replace(/^([\\/])+/g, '');
	const abs = path.resolve(root, normalized);

	// Pastikan hasil resolve masih di dalam root uploads.
	if (abs !== root && !abs.startsWith(root + path.sep)) return { ok: false };

	const ext = sanitizeExt(path.extname(abs).slice(1));
	if (!ALLOWED_UPLOAD_EXTS.has(ext)) return { ok: false };

	return { ok: true, absPath: abs, ext };
}

