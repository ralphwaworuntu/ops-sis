import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { runSqliteMigrations } from './migrate';
import { ensureParentDir, resolveSqlitePath } from '$lib/server/paths';

const dbPath = resolveSqlitePath();
ensureParentDir(dbPath);

type GlobalDbCache = {
	sqlite?: Database.Database;
	db?: ReturnType<typeof drizzle<typeof schema>>;
	migrated?: boolean;
};

const g = globalThis as unknown as GlobalDbCache;

if (!g.sqlite) {
	// `timeout` (ms) adalah cara paling reliable untuk menunggu lock di better-sqlite3.
	g.sqlite = new Database(dbPath, { timeout: 60000 });
	g.sqlite.pragma('journal_mode = WAL');
	// Avoid transient 500 "database is locked" on concurrent writes / HMR reloads.
	g.sqlite.pragma('busy_timeout = 60000');
	g.sqlite.pragma('foreign_keys = ON');
}

if (!g.migrated) {
	runSqliteMigrations(g.sqlite);
	g.migrated = true;
}

if (!g.db) {
	g.db = drizzle(g.sqlite, { schema });
}

export const db = g.db;
