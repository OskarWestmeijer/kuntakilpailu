/**
 * The statistics half of the comparison map, fetched in the browser.
 *
 * These figures used to be `import`ed and baked into the prerendered page. They are now read
 * from `/data/` when the page opens, which is what lets a refresh of the figures be a matter
 * of overwriting those files (`scripts/fetch_statfi.py`) rather than a code change. See
 * `loadGeometry.ts` for the half that still runs at build time.
 *
 * The parsing itself lives in the per-domain modules (`unemployment.ts`, `population.ts`,
 * `income.ts`, `education.ts`, `age.ts`, `balance.ts`) — this module only fetches, and then
 * does the joining and rolling-up that `+page.server.ts` used to do.
 *
 * Nothing here throws. A file that 404s or arrives malformed leaves its figures null, which
 * every consumer already renders as a hatched area and an em dash — the same state the page
 * is in before the fetch resolves.
 */

import { base } from '$app/paths';
import type { FinlandMap, Kunta, KuntaBase } from './finland';
import { toUnemploymentData, type PxWebExport } from './unemployment';
import {
	aggregatePopulationStats,
	changePer1000,
	densityOf,
	toPopulationData,
	EMPTY_POPULATION_STATS,
	type PopulationStats
} from './population';
import { toIncomeData, EMPTY_INCOME_STATS, type IncomeStats } from './income';
import {
	aggregateEducationStats,
	medianShare,
	toEducationData,
	EMPTY_EDUCATION_STATS,
	type EducationStats
} from './education';
import { aggregateAgeStats, medianAge, toAgeData, EMPTY_AGE_STATS, type AgeStats } from './age';
import {
	aggregateBalanceStats,
	imbalance,
	toBalanceData,
	EMPTY_BALANCE_STATS,
	type BalanceStats
} from './balance';
import {
	MIN_COVERAGE,
	placeValue,
	scoreAreas,
	type Indicator,
	type ScoreBreakdown,
	type ScorePart
} from './score';
import { count, decimal, percent, signedDecimal, type Lang } from './format';
import { TAMPERE_REGION } from './regions';

/** What `scripts/fetch_statfi.py` writes into `static/data`. Filenames carry the PxWeb table
 *  id, not the period — they are overwritten in place, and every parser reads the period
 *  from the file. */
/** For the synthetic roll-up rows below, which have no geometry: nothing draws them, so there
 *  is no box to fit. Real areas get theirs from `toPathData`. */
const NO_BBOX: [number, number, number, number] = [0, 0, 0, 0];

const FILES = {
	unemployment: 'unemployment_register_kunnat_12r5.json',
	population: 'population_register_kunnat_121w.json',
	income: 'income_register_kunnat_14ww.json',
	education: 'education_register_kunnat_12bs.json',
	age: 'age_register_kunnat_11ra.json',
	sex: 'sex_register_kunnat_11re.json',
	manifest: 'manifest.json'
} as const;

/**
 * Written by `scripts/fetch_statfi.py` on every run. Per file, because the four tables are on
 * independent release cycles.
 *
 * Three dates, three questions: `period` is what the figures describe ("2026M06"), `updated`
 * is when Statistics Finland published them, `polled` is when we last asked. Only `polled`
 * moves on a run that changes nothing, which is what makes a stale `updated` beside a fresh
 * `polled` readable as "checked today, still June's release".
 *
 * Only `polled` is rendered (above the Sources button); the other two are there for anyone
 * inspecting `/data/manifest.json` directly.
 */
type Manifest = {
	polled?: string;
	files?: Record<string, { polled?: string; updated?: string | null; period?: string }>;
};

/**
 * Fetch one export. Returns null — never throws — on a 404, a network failure or malformed
 * JSON, so one missing file degrades its own figures instead of blanking the page.
 */
async function fetchExport(filename: string): Promise<unknown | null> {
	try {
		const response = await fetch(`${base}/data/${filename}`);

		if (!response.ok) return null;

		return await response.json();
	} catch {
		return null;
	}
}

/** Applies a parser to a fetched file, treating a parse error like a missing file. */
function parse<T>(payload: unknown | null, parser: (px: PxWebExport) => T): T | null {
	if (payload === null) return null;

	try {
		return parser(payload as PxWebExport);
	} catch {
		return null;
	}
}

function polledFor(manifest: Manifest | null, filename: string): string | null {
	return manifest?.files?.[filename]?.polled ?? manifest?.polled ?? null;
}

/** When Statistics Finland itself published the file — as opposed to `polled`, when we last
 *  asked. Per file only; there is no site-wide fallback because a run that changes nothing
 *  moves `polled` on every file but `updated` on none of them. */
function updatedFor(manifest: Manifest | null, filename: string): string | null {
	return manifest?.files?.[filename]?.updated ?? null;
}

/** Replaces every area's stats with the freshly parsed ones, keeping name/code/path/landArea. */
function merge<A extends { code: string }, S>(
	areas: A[],
	stats: Map<string, S>,
	empty: S
): (A & S)[] {
	return areas.map((area) => ({ ...area, ...(stats.get(area.code) ?? empty) }));
}

/** What every geometry payload carries for the region lookup below. */
type WithMembership = {
	maakunta: { kuntas: { code: string; name: string }[] };
	/** maakunta code -> its municipalities, derived geometrically at build time (`membership.ts`). */
	membersOf: Record<string, string[]>;
};

/**
 * kunta code -> the maakunta it's in, inverted from the `membersOf` grouping the geometry
 * ships. All three maps name the region of whatever municipality is hovered, and this is the
 * only place that membership exists: the PxWeb exports carry region *totals* (`MK` rows), never
 * a list of which municipalities are in one.
 *
 * Geometry-derived, so it's known before any figures are fetched — the empty views set it, and
 * `merge` carries it through untouched when the statistics land.
 */
function regionNames(geometry: WithMembership): Map<string, string> {
	const labels = new Map(geometry.maakunta.kuntas.map((region) => [region.code, region.name]));
	const names = new Map<string, string>();

	for (const [region, members] of Object.entries(geometry.membersOf)) {
		const label = labels.get(region);

		if (!label) continue;

		for (const member of members) names.set(member, label);
	}

	return names;
}

/** Tags each area with its maakunta. Empty for the Region tab, whose areas *are* maakunnat. */
function withRegion<A extends { code: string }>(
	areas: A[],
	names: Map<string, string>
): (A & { regionName: string })[] {
	return areas.map((area) => ({ ...area, regionName: names.get(area.code) ?? '' }));
}

// ----------------------------------------------------------------------- population

export type PopulationArea = Kunta<PopulationStats> & {
	/** Last year's change per 1 000 inhabitants — the mapped figure. */
	change: number | null;
	/** Inhabitants per km² of land. Shown in the panel; no longer what colours the map. */
	density: number | null;
	/** The maakunta this municipality is in. Empty on the Region tab and on a roll-up. */
	regionName: string;
};

export type PopulationGeometry = {
	finland: FinlandMap<PopulationStats>;
	maakunta: FinlandMap<PopulationStats>;
	tampere: FinlandMap<PopulationStats>;
	/** maakunta code -> the municipalities inside it, derived geometrically at build time
	 *  (see `membership.ts`). Shipped because the population export has no region rows and the
	 *  maakunta geometry has no land area, so the Region tab has to be rolled up from
	 *  municipalities — and doing that in the browser must not mean shipping the GeoJSON. */
	membersOf: Record<string, string[]>;
};

export type PopulationView = {
	areas: PopulationArea[];
	viewBox: string;
	/** The area's own totals: the `SSS` row for Finland, a roll-up for anything smaller.
	 *  Shaped like an area so the panel reads one type whether or not something is selected. */
	total: PopulationArea;
	/** Finland's own change per 1 000, carried on *every* view, so the panel's "vs Finland"
	 *  row means the same thing on every tab. */
	countryChange: number | null;
	period: string;
	source: string;
	polled: string | null;
};

export type PopulationViews = Record<'finland' | 'maakunta' | 'tampere', PopulationView>;

function withDerived(area: Kunta<PopulationStats> & { regionName?: string }): PopulationArea {
	return {
		...area,
		regionName: area.regionName ?? '',
		change: changePer1000(area.totalChange, area.population),
		density: densityOf(area.population, area.landArea)
	};
}

/**
 * A whole view's fallback figures, shaped like an area — `d` is empty because nothing draws
 * it. Both derived figures are recomputed from the summed counts rather than averaged across
 * members: municipalities differ hugely in size, so an average would misweight them.
 */
function rollUp(name: string, areas: PopulationArea[]): PopulationArea {
	const stats = aggregatePopulationStats(areas);
	const landArea = areas.reduce((sum, a) => sum + (a.landArea ?? 0), 0) || null;

	return {
		...stats,
		name,
		code: '',
		nameSwedish: null,
		bbox: NO_BBOX,
		landArea,
		d: '',
		// A roll-up spans regions (or is the whole country), so it belongs to none.
		regionName: '',
		change: changePer1000(stats.totalChange, stats.population),
		density: densityOf(stats.population, landArea)
	};
}

export function emptyPopulationViews(geometry: PopulationGeometry): PopulationViews {
	const names = regionNames(geometry);
	const empty = (map: FinlandMap<PopulationStats>, name: string): PopulationView => {
		const areas = withRegion(map.kuntas, names).map(withDerived);

		return {
			areas,
			viewBox: map.viewBox,
			total: rollUp(name, areas),
			countryChange: null,
			period: '',
			source: '',
			polled: null
		};
	};

	return {
		finland: empty(geometry.finland, 'Finland'),
		maakunta: empty(geometry.maakunta, 'Finland'),
		tampere: empty(geometry.tampere, TAMPERE_REGION.label)
	};
}

export async function loadPopulationViews(geometry: PopulationGeometry): Promise<PopulationViews> {
	const [raw, manifest] = await Promise.all([
		fetchExport(FILES.population),
		fetchExport(FILES.manifest) as Promise<Manifest | null>
	]);

	const data = parse(raw, toPopulationData);

	if (!data) return emptyPopulationViews(geometry);

	const polled = polledFor(manifest, FILES.population);
	const names = regionNames(geometry);
	const municipal = merge(geometry.finland.kuntas, data.stats, EMPTY_POPULATION_STATS);
	const areas = withRegion(municipal, names).map(withDerived);
	const byCode = new Map(areas.map((a) => [a.code, a]));

	// The Region tab: municipal figures grouped by the maakunta each municipality's geometry
	// falls in, since neither the export nor the maakunta file supplies them. The land area
	// has to be summed too — the maakunta geometry carries none of its own.
	const regionStats = new Map<string, PopulationStats & { landArea: number }>();

	for (const [region, members] of Object.entries(geometry.membersOf)) {
		const parts = members.map((code) => byCode.get(code)).filter((a) => a !== undefined);

		regionStats.set(region, {
			...aggregatePopulationStats(parts),
			landArea: parts.reduce((sum, a) => sum + (a.landArea ?? 0), 0)
		});
	}

	const regionAreas = merge(geometry.maakunta.kuntas, regionStats, {
		...EMPTY_POPULATION_STATS,
		landArea: 0
	}).map(withDerived);

	const tampereAreas = withRegion(
		merge(geometry.tampere.kuntas, data.stats, EMPTY_POPULATION_STATS),
		names
	).map(withDerived);

	// Finland's own total comes from the export's whole-country row; the land area behind it is
	// the sum of the municipalities', the same figure the map is drawn from.
	const countryLandArea = areas.reduce((sum, a) => sum + (a.landArea ?? 0), 0);
	const countryTotal: PopulationArea = {
		...data.national,
		name: 'Finland',
		code: '',
		nameSwedish: null,
		bbox: NO_BBOX,
		landArea: countryLandArea,
		d: '',
		regionName: '',
		change: changePer1000(data.national.totalChange, data.national.population),
		density: densityOf(data.national.population, countryLandArea)
	};

	const common = {
		countryChange: countryTotal.change,
		period: data.period,
		source: data.source,
		polled
	};

	return {
		finland: { areas, viewBox: geometry.finland.viewBox, total: countryTotal, ...common },
		// Same country, coarser areas — so the Region tab's headline stays the national total.
		maakunta: {
			areas: regionAreas,
			viewBox: geometry.maakunta.viewBox,
			total: countryTotal,
			...common
		},
		tampere: {
			areas: tampereAreas,
			viewBox: geometry.tampere.viewBox,
			total: rollUp(TAMPERE_REGION.label, tampereAreas),
			...common
		}
	};
}

// --------------------------------------------------------------------------- income

export type IncomeArea = Kunta<IncomeStats> & {
	/** The maakunta this municipality is in. Empty on the Region tab and on the metro tab's
	 *  areas' behalf only where a roll-up would span several — here every area has one. */
	regionName: string;
};

export type IncomeGeometry = {
	finland: FinlandMap<IncomeStats>;
	maakunta: FinlandMap<IncomeStats>;
	tampere: FinlandMap<IncomeStats>;
	/** Only for naming each municipality's maakunta in the panel. Unlike the population map,
	 *  nothing here is rolled up from it: 14ww publishes its own `MK` rows, and a median could
	 *  not be aggregated even if it didn't. */
	membersOf: Record<string, string[]>;
};

export type IncomeView = {
	areas: IncomeArea[];
	viewBox: string;
	/**
	 * The area's own published figures — the `SSS` row on the Finland and Region tabs, which
	 * both cover the whole country.
	 *
	 * **Null on the Tampere Metro tab, on purpose.** Every other map rolls a hand-picked region
	 * up from its municipalities, because their measures are ratios of counts. A median is not:
	 * it needs the household-level distribution, which the export doesn't ship (see the note in
	 * `income.ts`). Statistics Finland publishes no row for these eight municipalities either —
	 * the seutukunta row `SK064` covers eleven. So that tab has no headline figure and the panel
	 * says so rather than inventing one.
	 */
	total: IncomeArea | null;
	/** Finland's own median, carried on *every* view: it's what the diverging scale pivots
	 *  around and what the panel's chip compares against, so a municipality keeps its colour
	 *  when the tab flips. */
	countryMedian: number | null;
	period: string;
	source: string;
	polled: string | null;
};

export type IncomeViews = Record<'finland' | 'maakunta' | 'tampere', IncomeView>;

/** The whole-country figures shaped like an area, so the panel reads one type either way. */
function asArea(name: string, stats: IncomeStats): IncomeArea {
	return {
		...stats,
		name,
		code: '',
		nameSwedish: null,
		landArea: null,
		d: '',
		bbox: NO_BBOX,
		regionName: ''
	};
}

export function emptyIncomeViews(geometry: IncomeGeometry): IncomeViews {
	const names = regionNames(geometry);
	const empty = (map: FinlandMap<IncomeStats>, total: IncomeArea | null): IncomeView => ({
		areas: withRegion(map.kuntas, names),
		viewBox: map.viewBox,
		total,
		countryMedian: null,
		period: '',
		source: '',
		polled: null
	});

	return {
		finland: empty(geometry.finland, asArea('Finland', EMPTY_INCOME_STATS)),
		maakunta: empty(geometry.maakunta, asArea('Finland', EMPTY_INCOME_STATS)),
		tampere: empty(geometry.tampere, null)
	};
}

export async function loadIncomeViews(geometry: IncomeGeometry): Promise<IncomeViews> {
	const [raw, manifest] = await Promise.all([
		fetchExport(FILES.income),
		fetchExport(FILES.manifest) as Promise<Manifest | null>
	]);

	const municipal = parse(raw, (px) => toIncomeData(px, 'KU'));

	if (!municipal) return emptyIncomeViews(geometry);

	// The Region tab reads the export's own MK rows — Statistics Finland computed those from the
	// microdata, which is the only way a regional median can be had.
	const regional = parse(raw, (px) => toIncomeData(px, 'MK'));
	const names = regionNames(geometry);
	const polled = polledFor(manifest, FILES.income);
	const country = asArea('Finland', municipal.national);

	const common = {
		countryMedian: municipal.national.medianIncome,
		period: municipal.period,
		source: municipal.source,
		polled
	};

	const build = (
		map: FinlandMap<IncomeStats>,
		stats: Map<string, IncomeStats>,
		total: IncomeArea | null
	): IncomeView => ({
		areas: withRegion(merge(map.kuntas, stats, EMPTY_INCOME_STATS), names),
		viewBox: map.viewBox,
		total,
		...common
	});

	return {
		finland: build(geometry.finland, municipal.stats, country),
		// Same country, coarser areas — so the Region tab's headline stays the national figure.
		maakunta: build(geometry.maakunta, regional?.stats ?? new Map(), country),
		// No published row for these eight, and no way to derive one. See `IncomeView.total`.
		tampere: build(geometry.tampere, municipal.stats, null)
	};
}

// ------------------------------------------------------------------------ education

export type EducationArea = Kunta<EducationStats> & {
	/** The maakunta this municipality is in. Empty on the Region tab, whose areas *are* maakunnat. */
	regionName: string;
};

export type EducationGeometry = {
	finland: FinlandMap<EducationStats>;
	maakunta: FinlandMap<EducationStats>;
	tampere: FinlandMap<EducationStats>;
	/** Only for naming each municipality's maakunta in the panel — 12bs publishes its own `MK`
	 *  rows, so nothing on this map is rolled up from the grouping. */
	membersOf: Record<string, string[]>;
};

export type EducationView = {
	areas: EducationArea[];
	viewBox: string;
	/**
	 * The area's own figures: the published `SSS` row on the Finland and Region tabs, and a
	 * roll-up of the eight municipalities on Tampere Metro.
	 *
	 * Never null, which is the one structural difference from `IncomeView` and worth the contrast:
	 * a share of a headcount *is* aggregable — sum the degree-holders, sum the 15+ population,
	 * divide — so the metro tab has an exact headline where the income map honestly has none.
	 */
	total: EducationArea;
	/** Finland's own share. Not what the scale pivots on — see `medianShare` — but the figure the
	 *  panel names when it explains why not. */
	countryShare: number | null;
	/**
	 * The **median municipality's** share, which the diverging scale and the panel's chip both
	 * pivot on, carried on every view so an area keeps its colour when the tab flips.
	 *
	 * Always computed from the 308 municipal figures, including on the Region tab whose own areas
	 * are maakunnat: a region compared against the median *municipality* is the same comparison
	 * every other area on the site gets. Why the median rather than Finland's own 34,5 % is in
	 * `education.ts` — only 42 of 308 municipalities reach the national figure.
	 */
	medianShare: number | null;
	period: string;
	source: string;
	polled: string | null;
};

export type EducationViews = Record<'finland' | 'maakunta' | 'tampere', EducationView>;

/** Figures shaped like an area, so the panel reads one type whether or not something is selected. */
function asEducationArea(name: string, stats: EducationStats): EducationArea {
	return {
		...stats,
		name,
		code: '',
		nameSwedish: null,
		landArea: null,
		d: '',
		bbox: NO_BBOX,
		regionName: ''
	};
}

export function emptyEducationViews(geometry: EducationGeometry): EducationViews {
	const names = regionNames(geometry);
	const empty = (map: FinlandMap<EducationStats>, name: string): EducationView => ({
		areas: withRegion(map.kuntas, names),
		viewBox: map.viewBox,
		total: asEducationArea(name, EMPTY_EDUCATION_STATS),
		countryShare: null,
		medianShare: null,
		period: '',
		source: '',
		polled: null
	});

	return {
		finland: empty(geometry.finland, 'Finland'),
		maakunta: empty(geometry.maakunta, 'Finland'),
		tampere: empty(geometry.tampere, TAMPERE_REGION.label)
	};
}

export async function loadEducationViews(geometry: EducationGeometry): Promise<EducationViews> {
	const [raw, manifest] = await Promise.all([
		fetchExport(FILES.education),
		fetchExport(FILES.manifest) as Promise<Manifest | null>
	]);

	const municipal = parse(raw, (px) => toEducationData(px, 'KU'));

	if (!municipal) return emptyEducationViews(geometry);

	// The Region tab reads the export's own MK rows. They could be rolled up exactly from the
	// municipalities — unlike the income map's — but the published figure is the one to show when
	// there is one.
	const regional = parse(raw, (px) => toEducationData(px, 'MK'));
	const names = regionNames(geometry);
	const polled = polledFor(manifest, FILES.education);
	const country = asEducationArea('Finland', municipal.national);

	const common = {
		countryShare: municipal.national.tertiaryShare,
		// From the municipal figures on every tab — see `EducationView.medianShare`.
		medianShare: medianShare([...municipal.stats.values()].map((s) => s.tertiaryShare)),
		period: municipal.period,
		source: municipal.source,
		polled
	};

	const build = (
		map: FinlandMap<EducationStats>,
		stats: Map<string, EducationStats>,
		total: (areas: EducationArea[]) => EducationArea
	): EducationView => {
		const areas = withRegion(merge(map.kuntas, stats, EMPTY_EDUCATION_STATS), names);

		return { areas, viewBox: map.viewBox, total: total(areas), ...common };
	};

	return {
		finland: build(geometry.finland, municipal.stats, () => country),
		// Same country, coarser areas — so the Region tab's headline stays the national figure.
		maakunta: build(geometry.maakunta, regional?.stats ?? new Map(), () => country),
		// No published row for these eight, but this measure can be combined into one exactly.
		tampere: build(geometry.tampere, municipal.stats, (areas) =>
			asEducationArea(TAMPERE_REGION.label, aggregateEducationStats(areas))
		)
	};
}

// ------------------------------------------------------------------------------ age

export type AgeArea = Kunta<AgeStats> & {
	/** The maakunta this municipality is in. Empty on the Region tab, whose areas *are* maakunnat. */
	regionName: string;
};

export type AgeGeometry = {
	finland: FinlandMap<AgeStats>;
	maakunta: FinlandMap<AgeStats>;
	tampere: FinlandMap<AgeStats>;
	/** Only for naming each municipality's maakunta in the panel — 11ra publishes its own `MK`
	 *  rows, so nothing on this map is rolled up from the grouping. */
	membersOf: Record<string, string[]>;
};

export type AgeView = {
	areas: AgeArea[];
	viewBox: string;
	/** Published `SSS` on Finland and Region, a population-weighted roll-up on Tampere Metro.
	 *  Never null: a mean combines exactly when it's weighted, unlike the income map's median. */
	total: AgeArea;
	/** Finland's own mean age. Not what the scale pivots on — see `medianAge` — but the figure
	 *  the panel names when it explains why not. */
	countryAge: number | null;
	/** The **median municipality's** mean age, which the diverging scale and the panel's chip both
	 *  pivot on, carried on every view so an area keeps its colour when the tab flips. Only 58 of
	 *  the 308 municipalities sit below the national figure, which is why it isn't that. */
	medianAge: number | null;
	period: string;
	source: string;
	polled: string | null;
};

export type AgeViews = Record<'finland' | 'maakunta' | 'tampere', AgeView>;

/** Figures shaped like an area, so the panel reads one type whether or not something is selected. */
function asAgeArea(name: string, stats: AgeStats): AgeArea {
	return {
		...stats,
		name,
		code: '',
		nameSwedish: null,
		landArea: null,
		d: '',
		bbox: NO_BBOX,
		regionName: ''
	};
}

export function emptyAgeViews(geometry: AgeGeometry): AgeViews {
	const names = regionNames(geometry);
	const empty = (map: FinlandMap<AgeStats>, name: string): AgeView => ({
		areas: withRegion(map.kuntas, names),
		viewBox: map.viewBox,
		total: asAgeArea(name, EMPTY_AGE_STATS),
		countryAge: null,
		medianAge: null,
		period: '',
		source: '',
		polled: null
	});

	return {
		finland: empty(geometry.finland, 'Finland'),
		maakunta: empty(geometry.maakunta, 'Finland'),
		tampere: empty(geometry.tampere, TAMPERE_REGION.label)
	};
}

export async function loadAgeViews(geometry: AgeGeometry): Promise<AgeViews> {
	const [raw, manifest] = await Promise.all([
		fetchExport(FILES.age),
		fetchExport(FILES.manifest) as Promise<Manifest | null>
	]);

	const municipal = parse(raw, (px) => toAgeData(px, 'KU'));

	if (!municipal) return emptyAgeViews(geometry);

	const regional = parse(raw, (px) => toAgeData(px, 'MK'));
	const names = regionNames(geometry);
	const polled = polledFor(manifest, FILES.age);
	const country = asAgeArea('Finland', municipal.national);

	const common = {
		countryAge: municipal.national.averageAge,
		// From the municipal figures on every tab — see `AgeView.medianAge`.
		medianAge: medianAge([...municipal.stats.values()].map((s) => s.averageAge)),
		period: municipal.period,
		source: municipal.source,
		polled
	};

	const build = (
		map: FinlandMap<AgeStats>,
		stats: Map<string, AgeStats>,
		total: (areas: AgeArea[]) => AgeArea
	): AgeView => {
		const areas = withRegion(merge(map.kuntas, stats, EMPTY_AGE_STATS), names);

		return { areas, viewBox: map.viewBox, total: total(areas), ...common };
	};

	return {
		finland: build(geometry.finland, municipal.stats, () => country),
		maakunta: build(geometry.maakunta, regional?.stats ?? new Map(), () => country),
		// No published row for these eight, but a population-weighted mean of them is exact.
		tampere: build(geometry.tampere, municipal.stats, (areas) =>
			asAgeArea(TAMPERE_REGION.label, aggregateAgeStats(areas))
		)
	};
}

// ------------------------------------------------------------------------------ sex

export type BalanceArea = Kunta<BalanceStats> & {
	/** The maakunta this municipality is in. Empty on the Region tab and on a roll-up. */
	regionName: string;
};

/** Geometry plus the grouping the Region tab is rolled up with — 11re has no `MK` rows, so this
 *  map needs `membersOf` for figures, not only for labels. Same shape as the population map's. */
export type BalanceGeometry = PopulationGeometry;

export type BalanceView = {
	areas: BalanceArea[];
	viewBox: string;
	/** Published whole-country figures on Finland and Region, a roll-up on Tampere Metro. */
	total: BalanceArea;
	period: string;
	source: string;
	polled: string | null;
};

export type BalanceViews = Record<'finland' | 'maakunta' | 'tampere', BalanceView>;

/**
 * No `countryShare` or `medianShare` here, unlike the other maps: the scale pivots on 50 %, a
 * constant, so there is no reference figure to carry across tabs at all.
 */
function asBalanceArea(name: string, stats: BalanceStats): BalanceArea {
	return {
		...stats,
		name,
		code: '',
		nameSwedish: null,
		landArea: null,
		d: '',
		bbox: NO_BBOX,
		regionName: ''
	};
}

export function emptyBalanceViews(geometry: BalanceGeometry): BalanceViews {
	const names = regionNames(geometry);
	const empty = (map: FinlandMap<PopulationStats>, name: string): BalanceView => ({
		areas: withRegion(map.kuntas, names).map((a) => ({ ...a, ...EMPTY_BALANCE_STATS })),
		viewBox: map.viewBox,
		total: asBalanceArea(name, EMPTY_BALANCE_STATS),
		period: '',
		source: '',
		polled: null
	});

	return {
		finland: empty(geometry.finland, 'Finland'),
		maakunta: empty(geometry.maakunta, 'Finland'),
		tampere: empty(geometry.tampere, TAMPERE_REGION.label)
	};
}

export async function loadBalanceViews(geometry: BalanceGeometry): Promise<BalanceViews> {
	const [raw, manifest] = await Promise.all([
		fetchExport(FILES.sex),
		fetchExport(FILES.manifest) as Promise<Manifest | null>
	]);

	const data = parse(raw, toBalanceData);

	if (!data) return emptyBalanceViews(geometry);

	const names = regionNames(geometry);
	const polled = polledFor(manifest, FILES.sex);
	const common = { period: data.period, source: data.source, polled };

	const municipal = withRegion(
		merge(geometry.finland.kuntas, data.stats, EMPTY_BALANCE_STATS),
		names
	).map((a) => ({ ...a, regionName: a.regionName }));
	const byCode = new Map(municipal.map((a) => [a.code, a]));

	// The Region tab is rolled up, not read: 11re publishes no MK rows — 309 areas, the whole
	// country and the 308 municipalities. Counts sum, and the share is recomputed from the sums.
	const regionAreas = geometry.maakunta.kuntas.map((region) => {
		const members = (geometry.membersOf[region.code] ?? [])
			.map((code) => byCode.get(code))
			.filter((a) => a !== undefined);

		return { ...region, ...aggregateBalanceStats(members), regionName: '' };
	});

	const tampereAreas = withRegion(
		merge(geometry.tampere.kuntas, data.stats, EMPTY_BALANCE_STATS),
		names
	);

	return {
		finland: {
			areas: municipal,
			viewBox: geometry.finland.viewBox,
			total: asBalanceArea('Finland', data.national),
			...common
		},
		maakunta: {
			areas: regionAreas,
			viewBox: geometry.maakunta.viewBox,
			total: asBalanceArea('Finland', data.national),
			...common
		},
		tampere: {
			areas: tampereAreas,
			viewBox: geometry.tampere.viewBox,
			total: asBalanceArea(TAMPERE_REGION.label, aggregateBalanceStats(tampereAreas)),
			...common
		}
	};
}

// -------------------------------------------------------------------------- compare

/**
 * One municipality, with a figure per domain and the breakdown `score.ts` computes from them.
 * Adding a domain means one more field here and one more `INDICATORS` entry.
 */
export type CompareArea = KuntaBase & {
	/** Registered unemployment rate, from 12r5. Lower is better. */
	rate: number | null;
	/** Population change over the year as a percentage of the population, from 121w. */
	change: number | null;
	/** Median disposable income per consumption unit, from 14ww. Higher is better. */
	income: number | null;
	/** Share of the 15+ population with a tertiary degree, from 12bs. Higher is better. */
	education: number | null;
	/** Mean age of the population, from 11ra. Lower is better. */
	age: number | null;
	/**
	 * Points away from an even split of women and men, from 11re. Lower is better.
	 *
	 * This is the figure the *score* uses; `menShare` is the figure the panel *shows*. Splitting
	 * them is what lets the reader see "50,1 %" — a number that means something on its own —
	 * while the ranking still treats 47 % and 53 % as equally lopsided. A share alone can't be
	 * ranked, because neither end of it is the good end.
	 */
	balance: number | null;
	/** Men as a share of the population, from 11re. Shown, never ranked — see `balance`. */
	menShare: number | null;
	/** Headcount at the end of the period, from 11ra. Shown in the list and detail card. */
	population: number | null;
	score: ScoreBreakdown;
	/** True only for the Finland reference row, which is placed in the ranking rather than
	 *  competing in it. Everywhere it shows, it carries an "≈". */
	isReference?: boolean;
};

/**
 * The domains the score folds together, in panel order. Equal weights — see `MIN_COVERAGE` in
 * `score.ts` for why an area missing any of them isn't scored at all.
 *
 * `label` here is an internal handle, not display copy: it is baked into `ScorePart` at scoring
 * time, and the score must not have to be recomputed when the reader switches language. What
 * the page actually prints comes from `INDICATOR_META` below, which takes a language.
 */
export const INDICATORS: Indicator<CompareArea>[] = [
	{
		key: 'jobs',
		label: 'Unemployment',
		valueOf: (area) => area.rate,
		format: percent,
		higherIsBetter: false,
		weight: 1
	},
	{
		key: 'people',
		label: 'Population change',
		valueOf: (area) => area.change,
		format: (value) => (value === null ? 'no data' : `${signedDecimal(value)} %`),
		higherIsBetter: true,
		weight: 1
	},
	{
		key: 'income',
		label: 'Median income',
		valueOf: (area) => area.income,
		format: (value) => (value === null ? 'no data' : `${count(value)} €`),
		higherIsBetter: true,
		weight: 1
	},
	{
		key: 'education',
		label: 'Higher education',
		valueOf: (area) => area.education,
		format: percent,
		higherIsBetter: true,
		weight: 1
	},
	{
		key: 'age',
		label: 'Average age',
		valueOf: (area) => area.age,
		format: (value) => (value === null ? 'no data' : `${decimal(value)} v`),
		// A judgement rather than a fact, and the only indicator where the direction is arguable:
		// a younger population is counted as the better side here.
		higherIsBetter: false,
		weight: 1
	},
	{
		key: 'balance',
		label: 'Share of men',
		valueOf: (area) => area.balance,
		format: (value) => (value === null ? 'no data' : `${decimal(value)} pts`),
		// Distance from an even split, so less is better.
		//
		// Caveat this one carries and the others don't: it correlates -0,47 with log population,
		// because in a municipality of 101 people one person is a whole percentage point. The
		// smallest places are mechanically more lopsided, and this indicator charges them for it.
		// It earns its place anyway by being the *least* redundant of the six — correlation with
		// the score built from the other five is only -0,24, against age's -0,77.
		higherIsBetter: false,
		weight: 1
	}
];

/**
 * Display metadata: what the rail, the map header and the detail card call each indicator, in
 * both languages, and how its figure is rendered.
 *
 * Separate from `INDICATORS` because scoring is language-independent and must stay that way —
 * switching to English re-renders the page but never re-ranks the country. The composite score
 * leads the list and belongs to no group, which is exactly how the rail draws it.
 *
 * `figureOf` is the number the reader sees, which is not always the number the score ranks:
 * see `CompareArea.balance`.
 */
export type IndicatorMeta = {
	key: string;
	fi: string;
	en: string;
	descFi: string;
	descEn: string;
	/** Rail grouping. Empty for the score, which sits above the groups. */
	groupFi: string;
	groupEn: string;
	figureOf: (area: CompareArea) => number | null;
	display: (value: number | null, lang: Lang) => string;
};

const noData = (lang: Lang) => (lang === 'fi' ? 'ei tietoa' : 'no data');

export const INDICATOR_META: IndicatorMeta[] = [
	{
		key: 'score',
		fi: 'Kokonaispisteet',
		en: 'Score',
		descFi: 'Kuusi mittaria yhdistettynä yhdeksi pisteluvuksi (0–100).',
		descEn: 'Six indicators combined into a single score (0–100).',
		groupFi: '',
		groupEn: '',
		figureOf: (area) => area.score.score,
		display: (value, lang) =>
			value === null ? (lang === 'fi' ? 'ei pisteitä' : 'no score') : decimal(value, 1, lang)
	},
	{
		key: 'jobs',
		fi: 'Työttömyysaste',
		en: 'Unemployment',
		descFi: 'Työttömien työnhakijoiden osuus työvoimasta.',
		descEn: 'Registered jobseekers as a share of the labour force.',
		groupFi: 'Työ',
		groupEn: 'Jobs',
		figureOf: (area) => area.rate,
		display: (value, lang) => (value === null ? noData(lang) : percent(value, lang))
	},
	{
		key: 'people',
		fi: 'Väestönmuutos',
		en: 'Population change',
		descFi: 'Väkiluvun kokonaismuutos edellisestä vuodesta.',
		descEn: 'Total change in population over the past year.',
		groupFi: 'Väestö',
		groupEn: 'People',
		figureOf: (area) => area.change,
		display: (value, lang) => (value === null ? noData(lang) : `${signedDecimal(value, 1, lang)} %`)
	},
	{
		key: 'income',
		fi: 'Mediaanitulot',
		en: 'Median income',
		descFi: '18 vuotta täyttäneiden käytettävissä olevien rahatulojen mediaani.',
		descEn: 'Median disposable income of residents aged 18 and over.',
		groupFi: 'Talous',
		groupEn: 'Economy',
		figureOf: (area) => area.income,
		display: (value, lang) => (value === null ? noData(lang) : `${count(value)} €`)
	},
	{
		key: 'education',
		fi: 'Korkeakoulutetut',
		en: 'Higher education',
		descFi: 'Korkea-asteen tutkinnon suorittaneiden osuus 15 vuotta täyttäneistä.',
		descEn: 'Share of residents aged 15 and over with a tertiary degree.',
		groupFi: 'Koulutus',
		groupEn: 'Education',
		figureOf: (area) => area.education,
		display: (value, lang) => (value === null ? noData(lang) : percent(value, lang))
	},
	{
		key: 'age',
		fi: 'Keski-ikä',
		en: 'Average age',
		descFi: 'Asukkaiden keski-ikä vuosina.',
		descEn: 'Mean age of residents, in years.',
		groupFi: 'Väestö',
		groupEn: 'People',
		figureOf: (area) => area.age,
		display: (value, lang) =>
			value === null ? noData(lang) : `${decimal(value, 1, lang)} ${lang === 'fi' ? 'v' : 'yr'}`
	},
	{
		key: 'balance',
		fi: 'Miesten osuus',
		en: 'Share of men',
		descFi: 'Miesten osuus väestöstä; tasapaino on 50 %:ssa.',
		descEn: 'Men as a share of the population; balance sits at 50 %.',
		groupFi: 'Väestö',
		groupEn: 'People',
		// The share, not the deviation the score ranks — see `CompareArea.balance`.
		figureOf: (area) => area.menShare,
		display: (value, lang) => (value === null ? noData(lang) : percent(value, lang))
	}
];

export const metaFor = (key: string): IndicatorMeta =>
	INDICATOR_META.find((meta) => meta.key === key) ?? INDICATOR_META[0];

export const indicatorName = (meta: IndicatorMeta, lang: Lang): string =>
	lang === 'fi' ? meta.fi : meta.en;

export const indicatorDesc = (meta: IndicatorMeta, lang: Lang): string =>
	lang === 'fi' ? meta.descFi : meta.descEn;

/**
 * The rail's shape: the score first and groupless, then one block per group in the order the
 * groups first appear. Grouping by first appearance rather than by a fixed list is what keeps
 * "Väestö" holding population change, average age and the sex ratio together while they stay in
 * panel order everywhere else.
 */
export function indicatorGroups(lang: Lang): { group: string; items: IndicatorMeta[] }[] {
	const out: { group: string; items: IndicatorMeta[] }[] = [];

	for (const meta of INDICATOR_META) {
		const group = lang === 'fi' ? meta.groupFi : meta.groupEn;
		const existing = out.find((entry) => entry.group === group);

		if (existing) existing.items.push(meta);
		else out.push({ group, items: [meta] });
	}

	return out;
}

const EMPTY_SCORE: ScoreBreakdown = {
	score: null,
	scorePercentile: null,
	rank: null,
	ranked: 0,
	parts: INDICATORS.map((indicator) => ({
		key: indicator.key,
		label: indicator.label,
		percentile: null,
		rank: null,
		ranked: 0,
		value: null,
		formatted: indicator.format(null)
	})),
	isPartial: true
};

/** One of the six tables behind the score, for the source popover: which indicator it feeds,
 *  who published it, what period it covers, and the two dates that answer "is this current" —
 *  when Statistics Finland released it and when this site last asked. */
export type SourceFile = {
	key: string;
	source: string;
	period: string;
	updated: string | null;
	polled: string | null;
};

export type Compare = {
	areas: CompareArea[];
	/** The whole country, placed among the municipalities rather than competing with them.
	 *  Null until the figures land. */
	finland: CompareArea | null;
	viewBox: string;
	/** Every table's period, deduplicated and newest first — the tables are on independent
	 *  release cycles, so quoting one of them would silently misdate the others. */
	periods: string[];
	/** The organisations behind those tables — publishers only, see `publishersOf`. */
	sources: string[];
	/** When the refresh last asked Statistics Finland, over all six files (ISO, UTC). The only
	 *  signal that the daily deploy is still running. */
	polled: string | null;
	/** The six tables individually — what the aggregated `periods`/`sources`/`polled` above
	 *  collapse into one line, kept apart for the source popover's per-file detail. Empty until
	 *  the figures load, same as everything else. */
	files: SourceFile[];
	/** False when any of the six files is missing or unreadable. Every indicator feeds the
	 *  score, so one missing table blanks the map rather than quietly re-ranking on five. */
	ok: boolean;
};

export type CompareGeometry = { finland: FinlandMap<PopulationStats> };

function blankArea(area: KuntaBase): CompareArea {
	return {
		name: area.name,
		code: area.code,
		nameSwedish: area.nameSwedish,
		landArea: area.landArea,
		d: area.d,
		bbox: area.bbox,
		rate: null,
		change: null,
		income: null,
		education: null,
		age: null,
		balance: null,
		menShare: null,
		population: null,
		score: EMPTY_SCORE
	};
}

export function emptyCompare(geometry: CompareGeometry): Compare {
	return {
		areas: geometry.finland.kuntas.map(blankArea),
		finland: null,
		viewBox: geometry.finland.viewBox,
		periods: [],
		sources: [],
		polled: null,
		files: [],
		ok: false
	};
}

/** Newest first, so the provenance line leads with the most recent release. */
const distinct = (values: (string | null | undefined)[]): string[] =>
	[...new Set(values.filter((value): value is string => !!value))].sort().reverse();

/**
 * The organisations behind the six tables, from PxWeb's own source strings.
 *
 * Those strings name the table as well as its publisher — "Tilastokeskus, väestörakenne" — and
 * one of them names two publishers at once ("Tilastokeskus, siviilisäädyn muutokset & KEHA-keskus,
 * työnvälitystilasto"). Six of them printed whole is a paragraph. Splitting on the ampersand
 * first and then taking what precedes each comma leaves the two names the footer actually needs.
 */
function publishersOf(sources: string[]): string[] {
	const names = sources
		.flatMap((source) => source.split('&'))
		.map((fragment) => fragment.split(',')[0].trim())
		.filter(Boolean);

	return [...new Set(names)];
}

export async function loadCompare(geometry: CompareGeometry): Promise<Compare> {
	const [registerRaw, populationRaw, incomeRaw, educationRaw, ageRaw, balanceRaw, manifest] =
		await Promise.all([
			fetchExport(FILES.unemployment),
			fetchExport(FILES.population),
			fetchExport(FILES.income),
			fetchExport(FILES.education),
			fetchExport(FILES.age),
			fetchExport(FILES.sex),
			fetchExport(FILES.manifest) as Promise<Manifest | null>
		]);

	const register = parse(registerRaw, (px) => toUnemploymentData(px, 'KU'));
	const population = parse(populationRaw, toPopulationData);
	const income = parse(incomeRaw, (px) => toIncomeData(px, 'KU'));
	const education = parse(educationRaw, (px) => toEducationData(px, 'KU'));
	const age = parse(ageRaw, (px) => toAgeData(px, 'KU'));
	const balance = parse(balanceRaw, toBalanceData);

	const blank = emptyCompare(geometry);

	// Every indicator feeds the score, so a single missing table is as bad as all six missing:
	// the coverage floor would leave every municipality unscored anyway. Fail the whole view
	// rather than render a country of hatched shapes with no explanation.
	if (!register || !population || !income || !education || !age || !balance) return blank;

	/** Population change as a percentage. Reuses the per-1 000 helper for its null handling and
	 *  its guard against a zero denominator, then rescales — the design shows a percentage. */
	const changePercentOf = (stats: PopulationStats | undefined) => {
		if (!stats) return null;

		const perThousand = changePer1000(stats.totalChange, stats.population);

		return perThousand === null ? null : perThousand / 10;
	};

	const figures = (code: string) => {
		const balanceStats = balance.stats.get(code);
		const womenShare = balanceStats?.womenShare ?? null;

		return {
			rate: register.stats.get(code)?.rate ?? null,
			change: changePercentOf(population.stats.get(code)),
			income: income.stats.get(code)?.medianIncome ?? null,
			education: education.stats.get(code)?.tertiaryShare ?? null,
			age: age.stats.get(code)?.averageAge ?? null,
			balance: imbalance(womenShare),
			menShare: womenShare === null ? null : 100 - womenShare,
			population: age.stats.get(code)?.population ?? null
		};
	};

	const joined = blank.areas.map((area) => ({ ...area, ...figures(area.code) }));
	const scores = scoreAreas(joined, INDICATORS);
	const areas = joined.map((area) => ({
		...area,
		score: scores.get(area.code) ?? EMPTY_SCORE
	}));

	const nationalWomenShare = balance.national.womenShare;
	const national: Omit<CompareArea, 'score'> = {
		name: 'Suomi',
		code: FINLAND_CODE,
		nameSwedish: 'Finland',
		// Summed from the municipalities rather than hardcoded: it is the same land area by
		// definition, and a constant here would be a second source of truth to keep current.
		landArea: areas.reduce((sum, area) => sum + (area.landArea ?? 0), 0) || null,
		d: '',
		bbox: NO_BBOX,
		rate: register.national.rate,
		change: changePercentOf(population.national),
		income: income.national.medianIncome,
		education: education.national.tertiaryShare,
		age: age.national.averageAge,
		balance: imbalance(nationalWomenShare),
		menShare: nationalWomenShare === null ? null : 100 - nationalWomenShare,
		population: age.national.population,
		isReference: true
	};

	const fileDates = (filename: string) => ({
		updated: updatedFor(manifest, filename),
		polled: polledFor(manifest, filename)
	});

	return {
		areas,
		finland: { ...national, score: placeReference(national, areas), isReference: true },
		viewBox: geometry.finland.viewBox,
		periods: distinct([
			register.period,
			population.period,
			income.period,
			education.period,
			age.period,
			balance.period
		]),
		sources: publishersOf([
			register.source,
			population.source,
			income.source,
			education.source,
			age.source,
			balance.source
		]),
		polled:
			distinct([
				polledFor(manifest, FILES.unemployment),
				polledFor(manifest, FILES.population),
				polledFor(manifest, FILES.income),
				polledFor(manifest, FILES.education),
				polledFor(manifest, FILES.age),
				polledFor(manifest, FILES.sex)
			])[0] ?? null,
		// Keyed like `INDICATOR_META` (`jobs`, `people`, …) so the popover can label each row
		// with the same name the rail and detail card already use for that indicator. The source
		// itself goes through `publishersOf` too — PxWeb's raw string names the table as well as
		// the publisher, which is more than a table row has room for.
		files: [
			{
				key: 'jobs',
				source: publishersOf([register.source]).join(' & '),
				period: register.period,
				...fileDates(FILES.unemployment)
			},
			{
				key: 'people',
				source: publishersOf([population.source]).join(' & '),
				period: population.period,
				...fileDates(FILES.population)
			},
			{
				key: 'income',
				source: publishersOf([income.source]).join(' & '),
				period: income.period,
				...fileDates(FILES.income)
			},
			{
				key: 'education',
				source: publishersOf([education.source]).join(' & '),
				period: education.period,
				...fileDates(FILES.education)
			},
			{
				key: 'age',
				source: publishersOf([age.source]).join(' & '),
				period: age.period,
				...fileDates(FILES.age)
			},
			{
				key: 'balance',
				source: publishersOf([balance.source]).join(' & '),
				period: balance.period,
				...fileDates(FILES.sex)
			}
		],
		ok: true
	};
}

/** The code the Finland reference row answers to. Not a natcode — no municipality can collide. */
export const FINLAND_CODE = 'FI';

/**
 * Builds a `ScoreBreakdown` for the whole country by *placing* its published figures among the
 * municipalities, rather than by adding a 309th area to the ranking.
 *
 * The distinction is the point. Finland's unemployment rate is a national aggregate, not another
 * municipality's rate; folding it in would shift every municipality below it down a rank on the
 * strength of a figure that is partly made of them. So `placeValue` answers "where would this
 * sit", every rank it produces is printed with an "≈", and the 308 never notice it is there.
 *
 * The composite is the mean of those placed percentiles — the same arithmetic `scoreAreas` uses,
 * over the same weights — and is then itself placed among the municipal scores.
 */
function placeReference(
	national: Omit<CompareArea, 'score'>,
	areas: CompareArea[]
): ScoreBreakdown {
	const area = national as CompareArea;

	const parts: ScorePart[] = INDICATORS.map((indicator) => {
		const value = indicator.valueOf(area);
		const placed = placeValue(
			areas.map((other) => indicator.valueOf(other)),
			value,
			indicator.higherIsBetter
		);

		return {
			key: indicator.key,
			label: indicator.label,
			percentile: placed.percentile,
			rank: placed.rank,
			ranked: placed.ranked,
			value,
			formatted: indicator.format(value)
		};
	});

	const totalWeight = INDICATORS.reduce((sum, indicator) => sum + indicator.weight, 0);
	const presentWeight = INDICATORS.reduce(
		(sum, indicator, i) => (parts[i].percentile === null ? sum : sum + indicator.weight),
		0
	);
	const weighted = parts.reduce(
		(sum, part, i) =>
			part.percentile === null ? sum : sum + part.percentile * INDICATORS[i].weight,
		0
	);

	// The same coverage floor the municipalities are held to. The country publishes all six, so
	// this never bites in practice — it is here so the two can't drift apart.
	const covered = totalWeight ? presentWeight / totalWeight : 0;
	const score = covered >= MIN_COVERAGE && presentWeight ? weighted / presentWeight : null;

	const placed = placeValue(
		areas.map((other) => other.score.score),
		score,
		true
	);

	return {
		score,
		scorePercentile: placed.percentile,
		rank: placed.rank,
		ranked: placed.ranked,
		parts,
		isPartial: covered < 1
	};
}
