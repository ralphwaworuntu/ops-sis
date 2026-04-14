import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

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
	const dir = join(UPLOAD_DIR, subfolder);
	ensureDir(dir);

	const ext = file.name.split('.').pop() ?? 'bin';
	const filename = `${crypto.randomUUID()}.${ext}`;
	const filepath = join(dir, filename);

	const buffer = Buffer.from(await file.arrayBuffer());
	writeFileSync(filepath, buffer);

	return `/${subfolder}/${filename}`;
}

/** Path relatif seperti `/laporan/uuid.jpg` atau `laporan/uuid.jpg` */
export function getUploadPath(relativePath: string): string {
	const clean = relativePath.replace(/^\//, '');
	return join(UPLOAD_DIR, clean);
}
