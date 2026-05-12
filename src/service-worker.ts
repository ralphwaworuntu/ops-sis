/// <reference lib="webworker" />

const TILE_CACHE = 'osm-tiles-v3';
const ASSET_CACHE = 'app-assets-v1';
const API_CACHE = 'api-cache-v1';
const OFFLINE_URL = '/offline.html';

const worker = self as unknown as ServiceWorkerGlobalScope;

worker.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			// Precache offline page (defensive: jika fetch gagal, install tetap lanjut).
			try {
				const cache = await caches.open(ASSET_CACHE);
				await cache.addAll([OFFLINE_URL, '/manifest.webmanifest', '/LOGO_OPS-SIS.png']);
			} catch {
				/* noop */
			}
			await worker.skipWaiting();
		})()
	);
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

function isSameOrigin(url: URL) {
	return url.origin === worker.location.origin;
}

function isApi(url: URL) {
	return isSameOrigin(url) && url.pathname.startsWith('/api/');
}

function isAsset(url: URL) {
	if (!isSameOrigin(url)) return false;
	// SvelteKit build assets
	if (url.pathname.startsWith('/_app/')) return true;
	// Static files we serve (icons/markers/etc.)
	if (url.pathname.startsWith('/markers/')) return true;
	if (url.pathname === '/manifest.webmanifest') return true;
	if (url.pathname.startsWith('/icons/')) return true;
	if (url.pathname === '/LOGO_OPS-SIS.png') return true;
	if (url.pathname === '/landing/hero-bg.jpg') return true;
	if (url.pathname === '/landing/kapolda-ntt-3d.png') return true;
	if (url.pathname === '/landing/kapolda-rudy-darmoko.jpg') return true;
	if (url.pathname === OFFLINE_URL) return true;
	return false;
}

async function staleWhileRevalidate(req: Request, cacheName: string): Promise<Response> {
	const cache = await caches.open(cacheName);
	const hit = await cache.match(req);
	const fetchPromise = fetch(req)
		.then((res) => {
			if (res.ok) void cache.put(req, res.clone());
			return res;
		})
		.catch(() => null);
	if (hit) {
		void fetchPromise;
		return hit;
	}
	const res = await fetchPromise;
	return res ?? new Response('Offline', { status: 503 });
}

async function networkFirst(req: Request, cacheName: string): Promise<Response> {
	const cache = await caches.open(cacheName);
	try {
		const res = await fetch(req);
		if (res.ok) await cache.put(req, res.clone());
		return res;
	} catch {
		const hit = await cache.match(req);
		return (
			hit ??
			new Response(JSON.stringify({ error: 'Offline' }), {
				status: 503,
				headers: { 'Content-Type': 'application/json' }
			})
		);
	}
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
		return;
	}

	// App shell & static assets: cache-first with stale-while-revalidate.
	if (isAsset(url)) {
		event.respondWith(staleWhileRevalidate(event.request, ASSET_CACHE));
		return;
	}

	// API GET: network-first with cache fallback (useful for monitoring/peta reads when offline).
	if (isApi(url)) {
		event.respondWith(networkFirst(event.request, API_CACHE));
		return;
	}

	// Navigation fallback: if offline and no cache, show offline page.
	if (event.request.mode === 'navigate') {
		event.respondWith(
			(async () => {
				try {
					return await fetch(event.request);
				} catch {
					const cache = await caches.open(ASSET_CACHE);
					const cached = await cache.match(OFFLINE_URL);
					return cached ?? new Response('Offline', { status: 503 });
				}
			})()
		);
	}
});
