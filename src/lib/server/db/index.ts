import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { runSqliteMigrations } from './migrate';
import { ensureParentDir, resolveSqlitePath } from '$lib/server/paths';

const dbPath = resolveSqlitePath();
ensureParentDir(dbPath);

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
runSqliteMigrations(sqlite);

export const db = drizzle(sqlite, { schema });
