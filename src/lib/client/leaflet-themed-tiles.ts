import type { Map, TileLayer } from 'leaflet';

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

function documentIsDark(): boolean {
	if (typeof document === 'undefined') return false;
	return document.documentElement.classList.contains('dark');
}

/**
 * Adds a raster base map that follows `html.dark` (ops-sis theme).
 * Call the returned teardown before `map.remove()`.
 */
export function installThemedRasterBaseLayer(L: typeof import('leaflet'), map: Map): () => void {
	let layer: TileLayer | null = null;

	const apply = () => {
		const dark = documentIsDark();
		const url = dark ? CARTO_DARK : OSM_URL;
		const attribution = dark
			? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
			: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
		if (layer) {
			map.removeLayer(layer);
			layer = null;
		}
		layer = L.tileLayer(url, { attribution, maxZoom: 19 }).addTo(map);
	};

	apply();

	let obs: MutationObserver | null = null;
	if (typeof MutationObserver !== 'undefined') {
		obs = new MutationObserver(() => {
			apply();
		});
		obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
	}

	return () => {
		obs?.disconnect();
		if (layer) {
			map.removeLayer(layer);
			layer = null;
		}
	};
}
