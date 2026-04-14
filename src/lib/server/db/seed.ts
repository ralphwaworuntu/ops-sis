import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import bcryptjs from 'bcryptjs';
const { hashSync } = bcryptjs;
import { existsSync, mkdirSync } from 'fs';
import * as schema from './schema';
import { runSqliteMigrations } from './migrate';

const dir = './data';
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

const sqlite = new Database('./data/ops-sis.db');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
runSqliteMigrations(sqlite);

const db = drizzle(sqlite, { schema });

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    tipe TEXT NOT NULL CHECK(tipe IN ('POLSEK','POLRES','POLDA')),
    parent_id INTEGER REFERENCES units(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nama TEXT NOT NULL,
    pangkat TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('POLSEK','POLRES','POLDA','KARO OPS')),
    unit_id INTEGER REFERENCES units(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS vulnerability_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    jenis_kejahatan TEXT NOT NULL,
    frekuensi INTEGER NOT NULL DEFAULT 1,
    keterangan TEXT,
    polres_id INTEGER NOT NULL REFERENCES units(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS rengiat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    judul TEXT NOT NULL,
    deskripsi TEXT NOT NULL,
    file_path TEXT,
    status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','PendingReview','PendingKabo','Approved','Rejected')),
    ai_analysis TEXT,
    final_plan TEXT,
    rejection_note TEXT,
    polres_id INTEGER NOT NULL REFERENCES units(id),
    created_by INTEGER NOT NULL REFERENCES users(id),
    reviewed_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS activity_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rengiat_id INTEGER NOT NULL REFERENCES rengiat(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    deskripsi TEXT NOT NULL,
    foto_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const hash = (pw: string) => hashSync(pw, 10);

const existingUnits = db.select().from(schema.units).all();
if (existingUnits.length > 0) {
	console.log('Database already seeded. Skipping.');
	process.exit(0);
}

db.insert(schema.units)
	.values([
		{ id: 1, nama: 'POLDA Metro Jaya', tipe: 'POLDA' },
		{ id: 2, nama: 'POLRES Jakarta Selatan', tipe: 'POLRES', parentId: 1 },
		{ id: 3, nama: 'POLRES Jakarta Timur', tipe: 'POLRES', parentId: 1 },
		{ id: 4, nama: 'POLSEK Kebayoran Baru', tipe: 'POLSEK', parentId: 2 },
		{ id: 5, nama: 'POLSEK Pancoran', tipe: 'POLSEK', parentId: 2 },
		{ id: 6, nama: 'POLSEK Matraman', tipe: 'POLSEK', parentId: 3 }
	])
	.run();

db.insert(schema.users)
	.values([
		{
			username: 'karoops_admin',
			passwordHash: hash('karoops123'),
			nama: 'Brigjen Pol. Ahmad Sudrajat',
			nrp: '88001234',
			pangkat: 'Brigjen',
			role: 'KARO OPS',
			unitId: 1
		},
		{
			username: 'polda_admin',
			passwordHash: hash('polda123'),
			nama: 'AKBP Rina Hartati',
			nrp: '77005678',
			pangkat: 'AKBP',
			role: 'POLDA',
			unitId: 1
		},
		{
			username: 'polres_jaksel',
			passwordHash: hash('polres123'),
			nama: 'Kompol Budi Santoso',
			nrp: '66110001',
			pangkat: 'Kompol',
			role: 'POLRES',
			unitId: 2
		},
		{
			username: 'polres_jaktim',
			passwordHash: hash('polres123'),
			nama: 'Kompol Dewi Lestari',
			nrp: '66110002',
			pangkat: 'Kompol',
			role: 'POLRES',
			unitId: 3
		},
		{
			username: 'polsek_kebayoran',
			passwordHash: hash('polsek123'),
			nama: 'AKP Hendra Gunawan',
			nrp: '55120001',
			pangkat: 'AKP',
			role: 'POLSEK',
			unitId: 4
		},
		{
			username: 'polsek_pancoran',
			passwordHash: hash('polsek123'),
			nama: 'AKP Siti Nurhaliza',
			nrp: '55120002',
			pangkat: 'AKP',
			role: 'POLSEK',
			unitId: 5
		}
	])
	.run();

db.insert(schema.vulnerabilityPoints)
	.values([
		{
			lat: -6.2615,
			lng: 106.7816,
			jenisKejahatan: 'C3',
			frekuensi: 5,
			keterangan: 'Area pasar Blok M - sering terjadi pencurian',
			polresId: 2,
			createdBy: 3
		},
		{
			lat: -6.2503,
			lng: 106.8441,
			jenisKejahatan: 'Narkoba',
			frekuensi: 3,
			keterangan: 'Kawasan perbatasan Jaksel-Jaktim',
			polresId: 2,
			createdBy: 3
		},
		{
			lat: -6.2139,
			lng: 106.8801,
			jenisKejahatan: 'Tawuran',
			frekuensi: 7,
			keterangan: 'Area sekolah daerah Matraman',
			polresId: 3,
			createdBy: 4
		}
	])
	.run();

db.insert(schema.rengiat)
	.values([
		{
			judul: 'Operasi Anti C3 Blok M',
			deskripsi:
				'Rencana patroli gabungan di area Blok M untuk menekan angka kejahatan pencurian (C3). Melibatkan 20 personil dari Polres Jaksel.',
			status: 'Approved',
			polresId: 2,
			createdBy: 3,
			aiAnalysis:
				'Rencana relevan dengan titik rawan C3 di area Blok M. Disarankan menambah shift malam hari (22.00-04.00).',
			finalPlan:
				'Patroli gabungan 3 shift, fokus area pasar Blok M. Pelibatan Babinkamtibmas setempat.'
		},
		{
			judul: 'Razia Narkoba Perbatasan',
			deskripsi:
				'Operasi razia rutin di kawasan perbatasan Jakarta Selatan - Jakarta Timur. Target: 2 minggu.',
			status: 'PendingReview',
			polresId: 2,
			createdBy: 3
		}
	])
	.run();

console.log('Database seeded successfully!');
process.exit(0);
