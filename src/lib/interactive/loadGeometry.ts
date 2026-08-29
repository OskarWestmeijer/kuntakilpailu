/**
 * The build-time half of the page: geometry, and nothing else.
 *
 * Statistics used to be imported here too and baked into the prerendered page. They aren't
 * any more — they're fetched from `/data/` when the page opens (see `liveData.ts`), so the
 * daily deploy can drop new figures into the bundle without touching the prerendered image.
 * Geometry stays here because it's the expensive part (a 475 kB GeoJSON becomes 308 SVG paths
 * and their bounding boxes) and because it never changes on a cron.
 *
 * So: this runs once at build time from `+page.server.ts` and ships shapes with every stat
 * field present and null. The map renders immediately as an outline, and fills in a moment
 * later.
 */

import { toFinlandMap, type FinlandMap, type KuntaCollection } from './finland';

export type GeometryOptions<S> = {
	/** Merged into every area, so each one carries the full shape of its metric's stats
	 *  (all null) before the live data lands. */
	emptyStats: S;
};

export function loadGeometry<S>(
	collection: KuntaCollection,
	{ emptyStats }: GeometryOptions<S>
): FinlandMap<S> {
	// An empty stats map: every area falls through to `emptyStats`.
	return toFinlandMap(collection, new Map<string, S>(), emptyStats);
}
