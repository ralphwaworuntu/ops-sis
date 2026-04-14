const DB = 'ops-sis-pwa';
const STORE = 'lhp-outbox';
const VER = 1;

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
		};
	});
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
	const row: QueuedLhp = {
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
	};
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
		q.onsuccess = () => resolve((q.result as QueuedLhp[]) ?? []);
		q.onerror = () => reject(q.error);
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

function deviceIdHeader(): string {
	if (typeof localStorage === 'undefined') return '';
	let id = localStorage.getItem('ops-sis-device-id');
	if (!id) {
		id = crypto.randomUUID();
		localStorage.setItem('ops-sis-device-id', id);
	}
	return id;
}

export async function syncOutbox(): Promise<{ synced: number; errors: string[] }> {
	const items = await listOutbox();
	let synced = 0;
	const errors: string[] = [];
	for (const row of items) {
		try {
			const res = await fetch('/api/lhp/sync', {
				method: 'POST',
				credentials: 'include',
				headers: {
					'Content-Type': 'application/json',
					'X-Device-Id': deviceIdHeader()
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
			const j = await res.json().catch(() => ({}));
			if (res.ok) {
				await removeOutbox(row.id);
				synced += 1;
			} else {
				errors.push((j as { error?: string }).error ?? `HTTP ${res.status}`);
			}
		} catch (e) {
			errors.push(e instanceof Error ? e.message : 'Jaringan');
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
