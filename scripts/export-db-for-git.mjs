import { copyFileSync, existsSync, unlinkSync } from 'fs';
import Database from 'better-sqlite3';

const src = process.argv[2] ?? 'data/ops-sis.db';
const out = process.argv[3] ?? 'data/ops-sis.db';

const staging = `${out}.export`;
const ro = new Database(src, { readonly: true });
await ro.backup(staging);
ro.close();

for (const suffix of ['-wal', '-shm', '-journal']) {
	const p = `${staging}${suffix}`;
	if (existsSync(p)) unlinkSync(p);
}

copyFileSync(staging, out);
unlinkSync(staging);

const verify = new Database(out, { readonly: true });
const summary = {
	out,
	users: verify.prepare('SELECT COUNT(*) AS c FROM users').get()?.c ?? 0,
	vulnerability_points:
		verify.prepare('SELECT COUNT(*) AS c FROM vulnerability_points').get()?.c ?? 0
};
verify.close();
console.log(JSON.stringify(summary, null, 2));
