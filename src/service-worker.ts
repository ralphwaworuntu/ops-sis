/// <reference lib="webworker" />

const TILE_CACHE = 'osm-tiles-v2';

const worker = self as unknown as ServiceWorkerGlobalScope;

worker.addEventListener('install', (event) => {
	event.waitUntil(worker.skipWaiting());
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(worker.clients.claim());
});

function isOsmTile(url: URL) {
	return (
		url.hostname === 'tile.openstreetmap.org' ||
		url.hostname.endsWith('.tile.openstreetmap.org')
	);
}

worker.addEventListener('fetch', (event: FetchEvent) => {
	const url = new URL(event.request.url);
	if (event.request.method !== 'GET') return;

	if (isOsmTile(url)) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(TILE_CACHE);
				const hit = await cache.match(event.request);
				if (hit) return hit;
				try {
					const res = await fetch(event.request);
					if (res.ok) await cache.put(event.request, res.clone());
					return res;
				} catch {
					const fallback = await cache.match(event.request);
					return fallback ?? new Response('Offline', { status: 503 });
				}
			})()
		);
	}
});
