const DB = 'ops-sis-pwa';
const STORE = 'lhp-outbox';
const FAILED_STORE = 'lhp-outbox-failed';
const VER = 2;

type OutboxStatus = 'pending' | 'syncing' | 'failed';

type OutboxTelemetry = {
	sync_success: number;
	sync_failed: number;
	poison_moved: number;
};

const telemetry: OutboxTelemetry = {
	sync_success: 0,
	sync_failed: 0,
	poison_moved: 0
};

export function getOutboxTelemetry(): OutboxTelemetry {
	return { ...telemetry };
}

// Field debugging helper (DevTools): window.__OPS_SIS_OUTBOX_TELEMETRY__()
if (typeof window !== 'undefined') {
	(window as unknown as { __OPS_SIS_OUTBOX_TELEMETRY__?: () => OutboxTelemetry }).__OPS_SIS_OUTBOX_TELEMETRY__ =
		() => getOutboxTelemetry();
}

export type QueuedLhp = {
	id: string;
	rengiatId: number;
	deskripsi: string;
	jumlahTerploting: number;
	buktiLapangan: boolean;
	lat: string;
	lng: string;
	fotoBase64: string | null;
	fotoName: string | null;
	fotoMime: string | null;
	createdAt: string;
	/** Reliability fields (backward compatible: default saat baca). */
	retryCount?: number;
	nextRetryAt?: number | null;
	status?: OutboxStatus;
	/** Hint error terakhir (untuk failed queue UI). */
	lastError?: string | null;
	lastHttpStatus?: number | null;
	lastTriedAt?: number | null;
};

type StoredQueuedLhp = Omit<QueuedLhp, 'retryCount' | 'nextRetryAt' | 'status'> & {
	retryCount: number;
	nextRetryAt: number | null;
	status: OutboxStatus;
};

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, VER);
		req.onerror = () => reject(req.error);
		req.onsuccess = () => resolve(req.result);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE, { keyPath: 'id' });
			}
			if (!db.objectStoreNames.contains(FAILED_STORE)) {
				db.createObjectStore(FAILED_STORE, { keyPath: 'id' });
			}
		};
	});
}

function withDefaults(row: QueuedLhp): StoredQueuedLhp {
	return {
		...row,
		retryCount: typeof row.retryCount === 'number' ? row.retryCount : 0,
		nextRetryAt: row.nextRetryAt == null ? null : Number(row.nextRetryAt),
		status: row.status ?? 'pending',
		lastError: row.lastError ?? null,
		lastHttpStatus: row.lastHttpStatus == null ? null : Number(row.lastHttpStatus),
		lastTriedAt: row.lastTriedAt == null ? null : Number(row.lastTriedAt)
	};
}

export async function outboxCount(): Promise<number> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readonly');
		const q = tx.objectStore(STORE).count();
		q.onsuccess = () => resolve(q.result);
		q.onerror = () => reject(q.error);
	});
}

export async function enqueueLhp(
	item: Omit<QueuedLhp, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): Promise<void> {
	const db = await openDb();
	const row: StoredQueuedLhp = withDefaults({
		id: item.id ?? crypto.randomUUID(),
		rengiatId: item.rengiatId,
		deskripsi: item.deskripsi,
		jumlahTerploting: item.jumlahTerploting,
		buktiLapangan: item.buktiLapangan,
		lat: item.lat,
		lng: item.lng,
		fotoBase64: item.fotoBase64,
		fotoName: item.fotoName,
		fotoMime: item.fotoMime,
		createdAt: item.createdAt ?? new Date().toISOString()
	});
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(row);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function listOutbox(): Promise<QueuedLhp[]> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readonly');
		const q = tx.objectStore(STORE).getAll();
		q.onsuccess = () => resolve((((q.result as QueuedLhp[]) ?? []).map(withDefaults) as QueuedLhp[]) ?? []);
		q.onerror = () => reject(q.error);
	});
}

async function putOutbox(row: StoredQueuedLhp): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).put(row);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function removeOutbox(id: string): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE, 'readwrite');
		tx.objectStore(STORE).delete(id);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

async function moveToFailed(row: StoredQueuedLhp): Promise<void> {
	telemetry.poison_moved += 1;
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction([STORE, FAILED_STORE], 'readwrite');
		tx.objectStore(FAILED_STORE).put({ ...row, status: 'failed' });
		tx.objectStore(STORE).delete(row.id);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

function deviceIdHeader(): string {
	if (typeof localStorage === 'undefined') return '';
	let id = localStorage.getItem('ops-sis-device-id');
	if (!id) {
		id = crypto.randomUUID();
		localStorage.setItem('ops-sis-device-id', id);
	}
	return id;
}

function backoffDelayMs(retryCount: number): number {
	return Math.min(1000 * Math.pow(2, retryCount), 30000);
}

let schedulerStarted = false;
export function startOutboxScheduler() {
	if (schedulerStarted) return;
	if (typeof window === 'undefined') return;
	schedulerStarted = true;
	setInterval(() => {
		void syncOutbox();
	}, 30000);
}

export async function failedOutboxCount(): Promise<number> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(FAILED_STORE, 'readonly');
		const q = tx.objectStore(FAILED_STORE).count();
		q.onsuccess = () => resolve(q.result);
		q.onerror = () => reject(q.error);
	});
}

export async function listFailedOutbox(): Promise<QueuedLhp[]> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(FAILED_STORE, 'readonly');
		const q = tx.objectStore(FAILED_STORE).getAll();
		q.onsuccess = () => resolve((((q.result as QueuedLhp[]) ?? []).map(withDefaults) as QueuedLhp[]) ?? []);
		q.onerror = () => reject(q.error);
	});
}

export async function deleteFailedOutbox(id: string): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(FAILED_STORE, 'readwrite');
		tx.objectStore(FAILED_STORE).delete(id);
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function clearFailedOutbox(): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(FAILED_STORE, 'readwrite');
		tx.objectStore(FAILED_STORE).clear();
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function retryFailedOutboxItem(id: string): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction([STORE, FAILED_STORE], 'readwrite');
		const failedStore = tx.objectStore(FAILED_STORE);
		const outboxStore = tx.objectStore(STORE);
		const getReq = failedStore.get(id);
		getReq.onerror = () => reject(getReq.error);
		getReq.onsuccess = () => {
			const raw = getReq.result as QueuedLhp | undefined;
			if (!raw) {
				resolve();
				return;
			}
			const row = withDefaults(raw);
			outboxStore.put({
				...row,
				status: 'pending',
				retryCount: 0,
				nextRetryAt: null,
				lastError: null,
				lastHttpStatus: null,
				lastTriedAt: null
			});
			failedStore.delete(id);
		};
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}

export async function syncOutbox(): Promise<{ synced: number; errors: string[] }> {
	startOutboxScheduler();

	const items = (await listOutbox()).map(withDefaults);
	let synced = 0;
	const errors: string[] = [];
	const now = Date.now();
	for (const row0 of items) {
		const row = withDefaults(row0);
		if (row.status === 'syncing') continue;
		if (row.nextRetryAt != null && row.nextRetryAt > now) continue;
		if (row.retryCount > 5) {
			console.warn(`[OUTBOX] Failed permanently: ${row.id} (moved to failed queue)`);
			await moveToFailed(row);
			continue;
		}

		try {
			const deviceId = deviceIdHeader();
			const idemKey = `${deviceId}_${row.id}`;
			await putOutbox({ ...row, status: 'syncing' });

			const res = await fetch('/api/lhp/sync', {
				method: 'POST',
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json',
					'X-Device-Id': deviceId,
					'X-Idempotency-Key': idemKey
				},
				body: JSON.stringify({
					rengiat_id: row.rengiatId,
					deskripsi: row.deskripsi,
					jumlah_terploting: row.jumlahTerploting,
					bukti_lapangan: row.buktiLapangan,
					lat: row.lat,
					lng: row.lng,
					foto_base64: row.fotoBase64,
					foto_name: row.fotoName,
					foto_mime: row.fotoMime,
					captured_at_iso: row.createdAt
				})
			});
			console.log(`[OUTBOX] Syncing item ${row.id} | retry ${row.retryCount} | HTTP ${res.status}`);
			const j = await res.json().catch(() => ({}));
			if (res.ok) {
				telemetry.sync_success += 1;
				await removeOutbox(row.id);
				synced += 1;
			} else {
				telemetry.sync_failed += 1;
				const msg = (j as { error?: string }).error ?? `HTTP ${res.status}`;
				errors.push(msg);

				if (res.status >= 400 && res.status <= 499) {
					console.warn(`[OUTBOX] Failed permanently: ${row.id} (moved to failed queue)`);
					await moveToFailed({
						...row,
						status: 'failed',
						nextRetryAt: null,
						lastError: msg,
						lastHttpStatus: res.status,
						lastTriedAt: Date.now()
					});
					continue;
				}

				const nextRetryCount = row.retryCount + 1;
				const delay = backoffDelayMs(row.retryCount);
				await putOutbox({
					...row,
					status: 'pending',
					retryCount: nextRetryCount,
					nextRetryAt: Date.now() + delay,
					lastError: msg,
					lastHttpStatus: res.status,
					lastTriedAt: Date.now()
				});
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Jaringan';
			errors.push(msg);
			console.log(`[OUTBOX] Syncing item ${row.id} | retry ${row.retryCount} | HTTP 0`);
			telemetry.sync_failed += 1;

			const nextRetryCount = row.retryCount + 1;
			const delay = backoffDelayMs(row.retryCount);
			await putOutbox({
				...row,
				status: 'pending',
				retryCount: nextRetryCount,
				nextRetryAt: Date.now() + delay,
				lastError: msg,
				lastHttpStatus: null,
				lastTriedAt: Date.now()
			});
		}
	}
	return { synced, errors };
}

export async function fileToBase64(file: File): Promise<{ base64: string; mime: string; name: string }> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => {
			const s = String(r.result);
			const i = s.indexOf(',');
			resolve({
				base64: i >= 0 ? s.slice(i + 1) : s,
				mime: file.type || 'image/jpeg',
				name: file.name || 'foto.jpg'
			});
		};
		r.onerror = () => reject(r.error);
		r.readAsDataURL(file);
	});
}
