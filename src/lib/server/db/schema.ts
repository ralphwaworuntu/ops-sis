import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const units = sqliteTable('units', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	nama: text('nama').notNull(),
	tipe: text('tipe', { enum: ['POLSEK', 'POLRES', 'POLDA'] }).notNull(),
	parentId: integer('parent_id'),
	lat: real('lat'),
	lng: real('lng'),
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	nama: text('nama').notNull(),
	nrp: text('nrp').notNull().default(''),
	pangkat: text('pangkat').notNull(),
	role: text('role', { enum: ['POLSEK', 'POLRES', 'POLDA', 'KARO OPS'] }).notNull(),
	unitId: integer('unit_id').references(() => units.id),
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id),
	expiresAt: text('expires_at').notNull()
});

export const vulnerabilityPoints = sqliteTable('vulnerability_points', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	lat: real('lat').notNull(),
	lng: real('lng').notNull(),
	jenisKejahatan: text('jenis_kejahatan').notNull(),
	frekuensi: integer('frekuensi').notNull().default(1),
	keterangan: text('keterangan'),
	/** `polres` = input POLRES/API (read-only di peta POLSEK); `polsek` = temuan lapangan POLSEK. */
	origin: text('origin', { enum: ['polres', 'polsek'] }).notNull().default('polres'),
	polsekUnitId: integer('polsek_unit_id').references(() => units.id),
	polresId: integer('polres_id')
		.notNull()
		.references(() => units.id),
	createdBy: integer('created_by')
		.notNull()
		.references(() => users.id),
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});

export const rengiat = sqliteTable('rengiat', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	kategori: text('kategori', {
		enum: [
			'Rengiat Harian',
			'Rengiat Penanganan Zona Merah',
			'Rengiat Pengamanan Objek Vital',
			'Rengiat Pengamanan Tamu VIP',
			'Rengiat Pengamanan Tamu VVIP'
		]
	})
		.notNull()
		.default('Rengiat Harian'),
	judul: text('judul').notNull(),
	deskripsi: text('deskripsi').notNull(),
	filePath: text('file_path'),
	status: text('status', {
		enum: ['Draft', 'PendingReview', 'PendingKabo', 'Approved', 'Rejected']
	})
		.notNull()
		.default('Draft'),
	aiAnalysis: text('ai_analysis'),
	finalPlan: text('final_plan'),
	rejectionNote: text('rejection_note'),
	jumlahRencanaPlotting: integer('jumlah_rencana_plotting').notNull().default(0),
	/** Titik acuan geo-fence LHP (opsional); jika kosong dipakai koordinat markas POLRES. */
	anchorLat: real('anchor_lat'),
	anchorLng: real('anchor_lng'),
	/** Batas waktu operasi (ISO); setelah ini LHP dianggap tertunda jika belum ada laporan. */
	operasiSelesai: text('operasi_selesai'),
	polresId: integer('polres_id')
		.notNull()
		.references(() => units.id),
	createdBy: integer('created_by')
		.notNull()
		.references(() => users.id),
	reviewedBy: integer('reviewed_by').references(() => users.id),
	approvedBy: integer('approved_by').references(() => users.id),
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});

export const activityReports = sqliteTable('activity_reports', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	rengiatId: integer('rengiat_id')
		.notNull()
		.references(() => rengiat.id),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id),
	deskripsi: text('deskripsi').notNull(),
	fotoPath: text('foto_path'),
	lat: real('lat'),
	lng: real('lng'),
	jumlahTerploting: integer('jumlah_terploting').notNull().default(0),
	isBuktiLapangan: integer('is_bukti_lapangan', { mode: 'boolean' }).notNull().default(false),
	/** True jika GPS lapangan &gt; 200 m dari titik acuan Rengiat / markas POLRES. */
	diLuarRadius: integer('di_luar_radius', { mode: 'boolean' }).notNull().default(false),
	distanceMeters: real('distance_meters'),
	/** Antrean verifikasi Kabag Ops / Polres sebelum disetujui untuk agregat Polda. */
	verificationStatus: text('verification_status', {
		enum: ['awaiting_polres', 'verified', 'returned']
	})
		.notNull()
		.default('awaiting_polres'),
	/** Alasan pengembalian ke POLSEK (Kabag Ops). */
	returnedNote: text('returned_note'),
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});

export const auditLogs = sqliteTable('audit_logs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').references(() => users.id),
	action: text('action').notNull(),
	entityType: text('entity_type'),
	entityId: integer('entity_id'),
	detailJson: text('detail_json'),
	ip: text('ip').notNull(),
	userAgent: text('user_agent'),
	deviceId: text('device_id'),
	createdAt: text('created_at').notNull()
});

/** Personil POLSEK sedang giat lapangan (check-in) — Monitoring POLRES via SSE. */
export const fieldGiatSessions = sqliteTable('field_giat_sessions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id),
	rengiatId: integer('rengiat_id')
		.notNull()
		.references(() => rengiat.id),
	polsekUnitId: integer('polsek_unit_id')
		.notNull()
		.references(() => units.id),
	polresId: integer('polres_id')
		.notNull()
		.references(() => units.id),
	startLat: real('start_lat').notNull(),
	startLng: real('start_lng').notNull(),
	startedAt: text('started_at').notNull(),
	endedAt: text('ended_at'),
	/** Titik akhir saat End Giat / kirim LHP (ringkasan jalur); opsional. */
	endLat: real('end_lat'),
	endLng: real('end_lng'),
	lastHeartbeatAt: text('last_heartbeat_at').notNull()
});

/**
 * Intel tekstual sementara (bukan titik peta). Hanya POLSEK + POLRES induk;
 * tidak dimuat di agregat Polda sampai divalidasi (kolom validated).
 */
export const polsekIntelNotes = sqliteTable('polsek_intel_notes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	polresId: integer('polres_id')
		.notNull()
		.references(() => units.id),
	polsekUnitId: integer('polsek_unit_id')
		.notNull()
		.references(() => units.id),
	teks: text('teks').notNull(),
	createdBy: integer('created_by')
		.notNull()
		.references(() => users.id),
	validated: integer('validated', { mode: 'boolean' }).notNull().default(false),
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});
