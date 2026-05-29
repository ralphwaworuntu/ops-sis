/**
 * Seed demo: POLDA NTT, POLRES Kupang Kota, akun POLRES, dan 20 titik rawan (radius 500 m).
 * Aman dijalankan berulang — idempotent.
 *
 *   npm run db:seed:kupang
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, and, sql } from 'drizzle-orm';
import bcryptjs from 'bcryptjs';
const { hashSync } = bcryptjs;
import * as schema from './schema';
import { runSqliteMigrations } from './migrate';
import { ensureParentDir, resolveSqlitePath } from '../paths.js';

const DEMO_TAG = '[DEMO-KUPANG]';
const POLRES_NAME = 'POLRES Kupang Kota';
const POLDA_NAME = 'POLDA Nusa Tenggara Timur';
const POLRES_USERNAME = 'polres_kupang_kota';
const POLRES_PASSWORD = 'polres123';

/** Markas POLRES / pusat Kota Kupang */
const KUPANG_CENTER = { lat: -10.1572, lng: 123.624 };

const CRIME_TYPES = [
	'C3',
	'Narkoba',
	'Tawuran',
	'Pencurian',
	'Penipuan',
	'Penganiayaan',
	'Kerumunan',
	'Lainnya'
] as const;

/** 20 lokasi kasus di sekitar Kupang Kota (variasi koordinat) */
const KUPANG_CASES: { lat: number; lng: number; jenis: string; frekuensi: number; lokasi: string }[] = [
	{ lat: -10.1521, lng: 123.6188, jenis: 'C3', frekuensi: 4, lokasi: 'Kel. Fatululi' },
	{ lat: -10.1612, lng: 123.6295, jenis: 'Narkoba', frekuensi: 3, lokasi: 'Kel. Oesapa' },
	{ lat: -10.1489, lng: 123.6312, jenis: 'Pencurian', frekuensi: 5, lokasi: 'Pasar Oesapa' },
	{ lat: -10.1655, lng: 123.615, jenis: 'Tawuran', frekuensi: 2, lokasi: 'Kompleks BTN' },
	{ lat: -10.154, lng: 123.642, jenis: 'Penipuan', frekuensi: 3, lokasi: 'Jl. El Tari' },
	{ lat: -10.171, lng: 123.628, jenis: 'Penganiayaan', frekuensi: 4, lokasi: 'Kel. Naikoten I' },
	{ lat: -10.1435, lng: 123.6195, jenis: 'C3', frekuensi: 6, lokasi: 'Kel. Bonipoi' },
	{ lat: -10.1598, lng: 123.6055, jenis: 'Narkoba', frekuensi: 2, lokasi: 'Kel. Oebobo' },
	{ lat: -10.1682, lng: 123.6385, jenis: 'Kerumunan', frekuensi: 5, lokasi: 'Lapangan Merdeka' },
	{ lat: -10.151, lng: 123.651, jenis: 'Lainnya', frekuensi: 1, lokasi: 'Pelabuhan Tenau' },
	{ lat: -10.1755, lng: 123.612, jenis: 'C3', frekuensi: 3, lokasi: 'Kel. Naikoten II' },
	{ lat: -10.1462, lng: 123.6348, jenis: 'Pencurian', frekuensi: 4, lokasi: 'Mall Kupang' },
	{ lat: -10.1625, lng: 123.6465, jenis: 'Tawuran', frekuensi: 3, lokasi: 'Kel. Lai-Besi' },
	{ lat: -10.1398, lng: 123.626, jenis: 'Penipuan', frekuensi: 2, lokasi: 'Kel. Alak' },
	{ lat: -10.1565, lng: 123.592, jenis: 'Narkoba', frekuensi: 5, lokasi: 'Jl. Timor Raya' },
	{ lat: -10.1728, lng: 123.645, jenis: 'Penganiayaan', frekuensi: 2, lokasi: 'Kel. Solor' },
	{ lat: -10.1495, lng: 123.608, jenis: 'C3', frekuensi: 7, lokasi: 'Terminal Oebobo' },
	{ lat: -10.164, lng: 123.622, jenis: 'Lainnya', frekuensi: 2, lokasi: 'Kantor Walikota' },
	{ lat: -10.1585, lng: 123.655, jenis: 'Kerumunan', frekuensi: 4, lokasi: 'Pantai Lasiana' },
	{ lat: -10.141, lng: 123.641, jenis: 'Pencurian', frekuensi: 3, lokasi: 'Kel. Namosain' }
];

const dbPath = resolveSqlitePath();
ensureParentDir(dbPath);

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
runSqliteMigrations(sqlite);

const db = drizzle(sqlite, { schema });
const hash = (pw: string) => hashSync(pw, 10);

function findUnitByName(nama: string, tipe: 'POLDA' | 'POLRES' | 'POLSEK') {
	return db
		.select()
		.from(schema.units)
		.where(and(eq(schema.units.nama, nama), eq(schema.units.tipe, tipe)))
		.get();
}

function findPolresKupang() {
	const exact = findUnitByName(POLRES_NAME, 'POLRES');
	if (exact) return exact;
	return db
		.select()
		.from(schema.units)
		.where(
			and(
				eq(schema.units.tipe, 'POLRES'),
				sql`lower(${schema.units.nama}) LIKE '%kupang%'`
			)
		)
		.get();
}

// --- POLDA NTT ---
let polda = findUnitByName(POLDA_NAME, 'POLDA');
if (!polda) {
	const inserted = db
		.insert(schema.units)
		.values({
			nama: POLDA_NAME,
			tipe: 'POLDA',
			lat: -10.1777143,
			lng: 123.5976401
		})
		.returning()
		.get();
	polda = inserted!;
	console.log(`Created ${POLDA_NAME} (id=${polda.id})`);
} else {
	console.log(`Found ${POLDA_NAME} (id=${polda.id})`);
}

// --- POLRES Kupang Kota ---
let polres = findPolresKupang();
if (!polres) {
	const inserted = db
		.insert(schema.units)
		.values({
			nama: POLRES_NAME,
			tipe: 'POLRES',
			parentId: polda.id,
			lat: KUPANG_CENTER.lat,
			lng: KUPANG_CENTER.lng
		})
		.returning()
		.get();
	polres = inserted!;
	console.log(`Created ${POLRES_NAME} (id=${polres.id})`);
} else {
	if (polres.lat == null || polres.lng == null) {
		db.update(schema.units)
			.set({ lat: KUPANG_CENTER.lat, lng: KUPANG_CENTER.lng, parentId: polda.id })
			.where(eq(schema.units.id, polres.id))
			.run();
	}
	console.log(`Found ${POLRES_NAME} (id=${polres.id})`);
}

// --- User Admin POLRES ---
let polresUser = db.select().from(schema.users).where(eq(schema.users.username, POLRES_USERNAME)).get();
if (!polresUser) {
	const inserted = db
		.insert(schema.users)
		.values({
			username: POLRES_USERNAME,
			passwordHash: hash(POLRES_PASSWORD),
			nama: 'Kompol Agus Wijaya',
			nrp: '66120001',
			pangkat: 'Kompol',
			role: 'ADMIN POLRES',
			unitId: polres.id
		})
		.returning()
		.get();
	polresUser = inserted!;
	console.log(`Created user ${POLRES_USERNAME} (id=${polresUser.id})`);
} else {
	db.update(schema.users)
		.set({ unitId: polres.id, role: 'ADMIN POLRES' })
		.where(eq(schema.users.id, polresUser.id))
		.run();
	console.log(`Found user ${POLRES_USERNAME} (id=${polresUser.id})`);
}

const createdBy = polresUser.id;

// --- Hapus demo lama (re-seed aman) ---
const deleted = sqlite
	.prepare(
		`DELETE FROM vulnerability_points WHERE polres_id = ? AND keterangan LIKE ?`
	)
	.run(polres.id, `${DEMO_TAG}%`);
if (deleted.changes > 0) {
	console.log(`Removed ${deleted.changes} previous demo point(s).`);
}

// --- 20 titik rawan ---
const points = KUPANG_CASES.map((c, i) => ({
	lat: c.lat,
	lng: c.lng,
	jenisKejahatan: c.jenis,
	frekuensi: c.frekuensi,
	keterangan: `${DEMO_TAG} Kasus #${i + 1} — ${c.lokasi}, Kupang Kota`,
	radiusM: 500,
	origin: 'polres' as const,
	polresId: polres.id,
	createdBy
}));

db.insert(schema.vulnerabilityPoints).values(points).run();

const countRow = db
	.select({ c: sql<number>`count(*)` })
	.from(schema.vulnerabilityPoints)
	.where(eq(schema.vulnerabilityPoints.polresId, polres.id))
	.get();

console.log('');
console.log('=== Seed Kupang Kota selesai ===');
console.log(`POLRES id: ${polres.id}`);
console.log(`Login: ${POLRES_USERNAME} / ${POLRES_PASSWORD}`);
console.log(`Titik rawan POLRES Kupang Kota (total): ${countRow?.c ?? 0}`);
console.log(`Titik demo baru: ${points.length} (masing-masing radius 500 m)`);
console.log('');
console.log('Dashboard: login sebagai polres_kupang_kota → /dashboard dan /dashboard/peta');

process.exit(0);
