import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

/** SQLite path from `DATABASE_URL` (format `file:./data/ops-sis.db`). */
export function resolveSqlitePath(): string {
	const raw = process.env.DATABASE_URL ?? 'file:./data/ops-sis.db';
	let relative: string;
	if (raw.startsWith('file:')) {
		relative = raw.slice('file:'.length);
	} else if (!raw.includes('://')) {
		relative = raw;
	} else {
		throw new Error(
			'DATABASE_URL harus berformat file:./path/to.db — MySQL belum didukung di build ini.'
		);
	}
	return resolve(process.cwd(), relative);
}

/** Absolute upload root from `UPLOAD_DIR` (default `./uploads`). */
export function resolveUploadDir(): string {
	const raw = process.env.UPLOAD_DIR ?? './uploads';
	return resolve(process.cwd(), raw);
}

export function ensureParentDir(filePath: string): void {
	const dir = dirname(filePath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}
