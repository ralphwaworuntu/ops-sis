import { describe, expect, it } from 'vitest';
import { distanceMeters, GEO_FENCE_RADIUS_M } from '$lib/server/geo';

describe('geo-fence distanceMeters', () => {
	it('returns ~0 for same coordinates', () => {
		expect(distanceMeters(-6.2, 106.8, -6.2, 106.8)).toBeLessThan(0.5);
	});

	it('flags outside GEO_FENCE_RADIUS_M for far points', () => {
		// ~220m north (approx): 0.002 degrees lat ≈ 222m
		const d = distanceMeters(-6.2, 106.8, -6.198, 106.8);
		expect(d).toBeGreaterThan(200);
		expect(d > GEO_FENCE_RADIUS_M).toBe(true);
	});
});

