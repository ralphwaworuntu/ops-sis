import { describe, expect, it, vi, beforeEach } from 'vitest';
import { enqueueLhp, listOutbox, syncOutbox } from '$lib/client/lhp-outbox';

describe('lhp-outbox sync retry logic', () => {
	beforeEach(async () => {
		vi.restoreAllMocks();
		// Clear IndexedDB between tests (fake-indexeddb exposes indexedDB databases list only indirectly).
		// Easiest: open with same name and delete.
		await new Promise<void>((resolve) => {
			const req = indexedDB.deleteDatabase('ops-sis-pwa');
			req.onsuccess = () => resolve();
			req.onerror = () => resolve();
			req.onblocked = () => resolve();
		});
	});

	it('on HTTP 500 schedules exponential backoff and keeps item in outbox', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				return new Response(JSON.stringify({ error: 'server down' }), { status: 500 });
			})
		);

		await enqueueLhp({
			id: 'r1',
			rengiatId: 1,
			deskripsi: 'test',
			jumlahTerploting: 0,
			buktiLapangan: false,
			lat: '-6.2',
			lng: '106.8',
			fotoBase64: null,
			fotoName: null,
			fotoMime: null,
			createdAt: new Date().toISOString()
		});

		const before = await listOutbox();
		expect(before).toHaveLength(1);
		expect(before[0].retryCount ?? 0).toBe(0);

		await syncOutbox();

		const after = await listOutbox();
		expect(after).toHaveLength(1);
		const row = after[0];
		expect(row.retryCount).toBe(1);
		expect(row.status).toBe('pending');
		expect(typeof row.nextRetryAt === 'number' || row.nextRetryAt === null).toBe(true);
		expect((row.nextRetryAt ?? 0) > Date.now()).toBe(true);
	});
});

