/**
 * Turns the EPSG:3067 (TM35FIN) municipality GeoJSON into ready-to-render SVG paths.
 * EPSG:3067 is already a planar projection in metres, so no reprojection is needed —
 * flipping the Y axis and letting the SVG viewBox do the scaling is enough.
 */

import type { KuntaStats } from './unemployment';

/**
 * The export also carries `id`, `gml_id` and the water/total area figures; none of those are
 * used. `landarea` (km², the official maa-pinta-ala) is — it's part of the detail card's
 * subtitle, and it lives in the geometry rather than in any of the PxWeb exports.
 *
 * `nameswe` is the Swedish name. It matters twice: it's the second line of the detail card for
 * a bilingual municipality (Mustasaari / Korsholm), and search matches against it, because
 * "Korsholm" is what a Swedish-speaking reader will type.
 */
export type KuntaProperties = {
	natcode: string;
	namefin: string;
	nameswe?: string;
	landarea?: number;
};

export type KuntaFeature = {
	type: 'Feature';
	properties: KuntaProperties;
	geometry: {
		type: 'MultiPolygon';
		coordinates: number[][][][];
	};
};

export type KuntaCollection = {
	type: 'FeatureCollection';
	features: KuntaFeature[];
};

/**
 * What every area carries regardless of which metric is being mapped. The per-metric
 * figures are merged in on top of this (see `toFinlandMap`'s `S` parameter) — the
 * unemployment map's `KuntaStats`, the population map's `PopulationStats`.
 */
export type KuntaBase = {
	name: string;
	code: string;
	/** Swedish name, where the export carries one. Equal to `name` for most municipalities —
	 *  the detail card only shows it when it actually differs. */
	nameSwedish: string | null;
	/** Land area in km², straight from the geometry. */
	landArea: number | null;
	/** SVG path data, one path per municipality (all its islands included). */
	d: string;
	/** `[minX, minY, maxX, maxY]` in the same flipped-Y space as `d` and the viewBox. What the
	 *  map zooms to when a municipality is selected; computed here because the coordinates are
	 *  already being walked, and because the GeoJSON never reaches the browser. */
	bbox: [number, number, number, number];
};

export type Kunta<S = KuntaStats> = KuntaBase & S;

export type FinlandMap<S> = {
	kuntas: Kunta<S>[];
	viewBox: string;
};

/**
 * Builds the `d` attribute for one MultiPolygon, and its bounding box along the way. Every ring
 * becomes its own subpath, so a municipality with islands still renders — and hovers — as a
 * single element.
 *
 * The bbox is measured off the *rounded* points rather than the source coordinates, so it is
 * exactly the box the rendered path occupies. Off by up to a metre from the true geometry,
 * which is nothing against a country 1 160 km tall and matters less than the two agreeing.
 */
function toPathData(coordinates: number[][][][]): {
	d: string;
	bbox: [number, number, number, number];
} {
	const subpaths: string[] = [];
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const polygon of coordinates) {
		for (const ring of polygon) {
			const points = ring.map(([x, y]) => {
				const px = Math.round(x);
				const py = Math.round(-y);

				if (px < minX) minX = px;
				if (px > maxX) maxX = px;
				if (py < minY) minY = py;
				if (py > maxY) maxY = py;

				return `${px},${py}`;
			});

			subpaths.push(`M${points.join('L')}Z`);
		}
	}

	return { d: subpaths.join(''), bbox: [minX, minY, maxX, maxY] };
}

/**
 * @param paddingRatio Fraction of the bbox's width/height to pad on every side, default 0
 *   (today's exact behaviour). Whole-country calls don't need this — the coastline's own
 *   irregularity gives visual breathing room — but a bbox tightly fitted to a handful of
 *   contiguous municipalities (e.g. a regional view) would otherwise touch the SVG edge.
 */
export function toFinlandMap<S>(
	geojson: KuntaCollection,
	stats: Map<string, S>,
	/** Merged into any area the `stats` map has no row for, so every field stays present
	 *  (and null) rather than missing. */
	emptyStats: S,
	paddingRatio = 0
): FinlandMap<S> {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;

	for (const feature of geojson.features) {
		for (const polygon of feature.geometry.coordinates) {
			for (const ring of polygon) {
				for (const [x, y] of ring) {
					if (x < minX) minX = x;
					if (x > maxX) maxX = x;
					if (y < minY) minY = y;
					if (y > maxY) maxY = y;
				}
			}
		}
	}

	const kuntas = geojson.features
		.map((feature) => {
			const p = feature.properties;
			const { d, bbox } = toPathData(feature.geometry.coordinates);

			return {
				name: p.namefin,
				code: p.natcode,
				nameSwedish: p.nameswe ?? null,
				landArea: p.landarea ?? null,
				...(stats.get(p.natcode) ?? emptyStats),
				d,
				bbox
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name, 'fi'));

	const padX = (maxX - minX) * paddingRatio;
	const padY = (maxY - minY) * paddingRatio;

	// Y is negated above, so the top edge of the viewBox is -maxY.
	const viewBox = [
		Math.round(minX - padX),
		Math.round(-maxY - padY),
		Math.round(maxX - minX + 2 * padX),
		Math.round(maxY - minY + 2 * padY)
	].join(' ');

	return { kuntas, viewBox };
}
