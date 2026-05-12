import type Database from 'better-sqlite3';

/** Tambah kolom / tabel jika DB lama belum punya (idempotent). */
export function runSqliteMigrations(sqlite: Database.Database) {
	const statements = [
		'ALTER TABLE units ADD COLUMN lat REAL',
		'ALTER TABLE units ADD COLUMN lng REAL',
		'ALTER TABLE rengiat ADD COLUMN jumlah_rencana_plotting INTEGER NOT NULL DEFAULT 0',
		'ALTER TABLE rengiat ADD COLUMN anchor_lat REAL',
		'ALTER TABLE rengiat ADD COLUMN anchor_lng REAL',
		'ALTER TABLE activity_reports ADD COLUMN lat REAL',
		'ALTER TABLE activity_reports ADD COLUMN lng REAL',
		'ALTER TABLE activity_reports ADD COLUMN jumlah_terploting INTEGER NOT NULL DEFAULT 0',
		'ALTER TABLE activity_reports ADD COLUMN is_bukti_lapangan INTEGER NOT NULL DEFAULT 0',
		'ALTER TABLE activity_reports ADD COLUMN di_luar_radius INTEGER NOT NULL DEFAULT 0',
		'ALTER TABLE activity_reports ADD COLUMN distance_meters REAL',
		'ALTER TABLE users ADD COLUMN nrp TEXT NOT NULL DEFAULT \'\'',
		'ALTER TABLE vulnerability_points ADD COLUMN origin TEXT NOT NULL DEFAULT \'polres\'',
		'ALTER TABLE vulnerability_points ADD COLUMN radius_m INTEGER NOT NULL DEFAULT 500',
		'ALTER TABLE vulnerability_points ADD COLUMN polsek_unit_id INTEGER REFERENCES units(id)',
		"ALTER TABLE rengiat ADD COLUMN kategori TEXT NOT NULL DEFAULT 'Rengiat Harian'",
		'ALTER TABLE rengiat ADD COLUMN file_path TEXT',
		'ALTER TABLE rengiat ADD COLUMN operasi_selesai TEXT',
		"ALTER TABLE activity_reports ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'awaiting_polres'",
		'ALTER TABLE activity_reports ADD COLUMN returned_note TEXT',
		'ALTER TABLE field_giat_sessions ADD COLUMN end_lat REAL',
		'ALTER TABLE field_giat_sessions ADD COLUMN end_lng REAL',
		'ALTER TABLE rengiat ADD COLUMN requires_polda_approval INTEGER NOT NULL DEFAULT 0',
		"ALTER TABLE rengiat ADD COLUMN urgency TEXT NOT NULL DEFAULT 'NORMAL'",
		'ALTER TABLE rengiat ADD COLUMN target_point_id INTEGER REFERENCES vulnerability_points(id)',
		'ALTER TABLE rengiat ADD COLUMN instansi_terkait TEXT',
		'ALTER TABLE rengiat ADD COLUMN nama_tamu TEXT',
		'ALTER TABLE rengiat ADD COLUMN tingkat_kerawanan TEXT',
		'ALTER TABLE rengiat ADD COLUMN analisa_singkat_ancaman TEXT'
	];
	for (const sql of statements) {
		try {
			sqlite.exec(sql);
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			// Idempotent migrations: ignore when the column already exists or
			// when running against a fresh DB that doesn't have the table yet.
			if (msg.includes('duplicate column')) continue;
			if (msg.includes('no such table')) continue;
			throw e;
		}
	}

	try {
		sqlite.exec(`
			CREATE TABLE IF NOT EXISTS audit_logs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER REFERENCES users(id),
				action TEXT NOT NULL,
				entity_type TEXT,
				entity_id INTEGER,
				detail_json TEXT,
				ip TEXT NOT NULL,
				user_agent TEXT,
				device_id TEXT,
				created_at TEXT NOT NULL
			);
		`);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		if (!msg.includes('already exists')) throw e;
	}

	try {
		sqlite.exec(`
			CREATE TABLE IF NOT EXISTS idempotency_keys (
				key TEXT PRIMARY KEY,
				state TEXT NOT NULL DEFAULT 'started',
				created_at TEXT NOT NULL
			);
		`);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		if (!msg.includes('already exists')) throw e;
	}

	try {
		sqlite.exec(`
			CREATE TABLE IF NOT EXISTS notable_incidents (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				jenis TEXT NOT NULL,
				deskripsi TEXT NOT NULL,
				foto_path TEXT,
				lat REAL,
				lng REAL,
				accuracy_meters REAL,
				role TEXT NOT NULL CHECK(role IN ('POLSEK','POLRES')),
				unit_id INTEGER NOT NULL REFERENCES units(id),
				polres_id INTEGER NOT NULL REFERENCES units(id),
				created_by INTEGER NOT NULL REFERENCES users(id),
				created_at TEXT NOT NULL
			);
		`);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		if (!msg.includes('already exists')) throw e;
	}

	try {
		sqlite.exec(`
			CREATE TABLE IF NOT EXISTS field_giat_sessions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id INTEGER NOT NULL REFERENCES users(id),
				rengiat_id INTEGER NOT NULL REFERENCES rengiat(id),
				polsek_unit_id INTEGER NOT NULL REFERENCES units(id),
				polres_id INTEGER NOT NULL REFERENCES units(id),
				start_lat REAL NOT NULL,
				start_lng REAL NOT NULL,
				started_at TEXT NOT NULL,
				ended_at TEXT,
				last_heartbeat_at TEXT NOT NULL
			);
		`);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		if (!msg.includes('already exists')) throw e;
	}

	try {
		sqlite.exec(`
			CREATE TABLE IF NOT EXISTS polsek_intel_notes (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				polres_id INTEGER NOT NULL REFERENCES units(id),
				polsek_unit_id INTEGER NOT NULL REFERENCES units(id),
				teks TEXT NOT NULL,
				created_by INTEGER NOT NULL REFERENCES users(id),
				validated INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL
			);
		`);
	} catch (e: unknown) {
		const msg = e instanceof Error ? e.message : String(e);
		if (!msg.includes('already exists')) throw e;
	}
}
