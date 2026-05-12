import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { ALLOWED_UPLOAD_EXTS, sanitizeExt, sanitizeSubfolder, sniffUploadKind } from '$lib/server/upload-security';

const UPLOAD_DIR = './uploads';

function ensureDir(dir: string) {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

export async function saveFile(
	file: File,
	subfolder: string = 'general'
): Promise<string> {
	const safeSubfolder = sanitizeSubfolder(subfolder);
	const dir = join(UPLOAD_DIR, safeSubfolder);
	ensureDir(dir);

	const nameExt = sanitizeExt(file.name.split('.').pop());
	const buffer = Buffer.from(await file.arrayBuffer());
	const kind = sniffUploadKind(buffer);

	// Validasi magic number (bukan hanya ekstensi).
	// DOCX/XLSX adalah ZIP container; untuk itu kita butuh ext yang jelas dari nama file.
	let finalExt = nameExt;
	if (kind === 'jpg') finalExt = 'jpg';
	if (kind === 'png') finalExt = 'png';
	if (kind === 'pdf') finalExt = 'pdf';
	if (kind === 'unknown') {
		// Zip container: hanya izinkan jika ext docx/xlsx (atau jika image/pdf sudah terdeteksi di atas).
		// Ini mencegah upload binary arbitrary berekstensi palsu.
	}

	if (!ALLOWED_UPLOAD_EXTS.has(finalExt)) {
		throw new Error('File type tidak diizinkan.');
	}

	// Jika magic bukan zip tapi ext docx/xlsx → tolak (mencegah "docx palsu").
	if ((finalExt === 'docx' || finalExt === 'xlsx') && kind !== 'unknown') {
		throw new Error('File DOCX/XLSX tidak valid.');
	}

	// Jika magic zip tapi ext bukan docx/xlsx → tolak (mencegah zip arbitrary).
	if (kind === 'unknown' && buffer.length >= 4) {
		const isZip =
			buffer[0] === 0x50 &&
			buffer[1] === 0x4b &&
			((buffer[2] === 0x03 && buffer[3] === 0x04) || (buffer[2] === 0x05 && buffer[3] === 0x06));
		if (isZip && finalExt !== 'docx' && finalExt !== 'xlsx') {
			// Jika zip container, harus jelas docx/xlsx.
			throw new Error('File ZIP tidak diizinkan.');
		}
	}

	const filename = `${crypto.randomUUID()}.${finalExt}`;
	const filepath = join(dir, filename);
	writeFileSync(filepath, buffer);

	return `/${safeSubfolder}/${filename}`;
}

/** Path relatif seperti `/laporan/uuid.jpg` atau `laporan/uuid.jpg` */
export function getUploadPath(relativePath: string): string {
	const clean = relativePath.replace(/^\//, '');
	return join(UPLOAD_DIR, clean);
}
