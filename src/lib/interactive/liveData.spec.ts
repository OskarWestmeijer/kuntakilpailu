import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import register from '../../../data/fixtures/unemployment_register_kunnat_12r5.json';
import population from '../../../data/fixtures/population_register_kunnat_121w.json';
import income from '../../../data/fixtures/income_register_kunnat_14ww.json';
import education from '../../../data/fixtures/education_register_kunnat_12bs.json';
import age from '../../../data/fixtures/age_register_kunnat_11ra.json';
import sex from '../../../data/fixtures/sex_register_kunnat_11re.json';
import {
	emptyAgeViews,
	emptyCompare,
	emptyEducationViews,
	emptyIncomeViews,
	emptyPopulationViews,
	emptyBalanceViews,
	loadAgeViews,
	loadCompare,
	loadEducationViews,
	loadIncomeViews,
	loadPopulationViews,
	loadBalanceViews,
	type AgeGeometry,
	type CompareGeometry,
	type EducationGeometry,
	type IncomeGeometry,
	type PopulationGeometry
} from './liveData';
import { EMPTY_POPULATION_STATS } from './population';
import { EMPTY_INCOME_STATS } from './income';
import { EMPTY_EDUCATION_STATS } from './education';
import { EMPTY_AGE_STATS } from './age';
import type { FinlandMap, Kunta } from './finland';
import type { PopulationStats } from './population';

/**
 * These run against the *real* exports in `data/fixtures` — PxWeb's own bytes, in the shape
 * the browser fetches them — so the whole client-side path is covered: fetch, parse, join onto
 * geometry, roll up. The per-parser specs next door cover the parsing in isolation; what's
 * tested here is everything that used to happen in the build-time loader.
 *
 * The fixture rather than `static/data`, because that directory is gitignored build output the
 * deploy workflow fetches fresh — these assertions need a vintage that holds still.
 */
/**
 * Written by `scripts/fetch_statfi.py` on every run, so it isn't committed — its poll
 * timestamp would churn on every local run. Synthesized here rather than imported, so a fresh
 * clone can run the tests without fetching anything first.
 */
const manifest = {
	polled: '2026-08-11T18:39:44Z',
	files: {
		'unemployment_register_kunnat_12r5.json': {
			period: '2026M06',
			updated: '2026-07-21T05:00:00Z',
			polled: '2026-08-11T18:39:44Z'
		},
		'population_register_kunnat_121w.json': {
			period: '2025',
			updated: '2026-05-27T05:00:00Z',
			polled: '2026-08-11T18:39:44Z'
		},
		'income_register_kunnat_14ww.json': {
			period: '2024',
			updated: '2025-12-16T06:00:00Z',
			polled: '2026-08-11T18:39:44Z'
		},
		'education_register_kunnat_12bs.json': {
			period: '2025',
			updated: '2026-06-18T05:00:00Z',
			polled: '2026-08-11T18:39:44Z'
		},
		'age_register_kunnat_11ra.json': {
			period: '2025',
			updated: '2026-05-29T05:00:00Z',
			polled: '2026-08-11T18:39:44Z'
		},
		'sex_register_kunnat_11re.json': {
			period: '2025',
			updated: '2026-04-01T05:00:00Z',
			polled: '2026-08-11T18:39:44Z'
		}
	}
};

const DATA_DIR: Record<string, unknown> = {
	'unemployment_register_kunnat_12r5.json': register,
	'population_register_kunnat_121w.json': population,
	'income_register_kunnat_14ww.json': income,
	'education_register_kunnat_12bs.json': education,
	'age_register_kunnat_11ra.json': age,
	'sex_register_kunnat_11re.json': sex,
	'manifest.json': manifest
};

/** Stands in for nginx: serves the data directory, 404s anything else. */
function serveDataDir(overrides: Record<string, Response | null> = {}) {
	return vi.fn(async (url: string | URL) => {
		const name = String(url).split('/').pop() ?? '';

		if (name in overrides) {
			const override = overrides[name];

			// null stands for the request never completing — the offline case.
			if (override === null) throw new TypeError('network error');

			return override;
		}

		if (!(name in DATA_DIR)) return new Response('not found', { status: 404 });

		return new Response(JSON.stringify(DATA_DIR[name]), { status: 200 });
	});
}

/** Geometry as `+page.server.ts` ships it: shapes with every stat field present and null. */
function area<S>(code: string, name: string, empty: S, landArea = 100): Kunta<S> {
	return {
		code,
		name,
		nameSwedish: null,
		landArea,
		d: 'M0,0L1,1Z',
		bbox: [0, 0, 1, 1],
		...empty
	};
}

function map<S>(kuntas: Kunta<S>[]): FinlandMap<S> {
	return { kuntas, viewBox: '0 0 100 100' };
}

const populationGeometry: PopulationGeometry = {
	finland: map([
		area('091', 'Helsinki', EMPTY_POPULATION_STATS, 214.21),
		area('837', 'Tampere', EMPTY_POPULATION_STATS, 524.97)
	]),
	maakunta: map([area('06', 'Pirkanmaa', EMPTY_POPULATION_STATS, 0)]),
	tampere: map([area('837', 'Tampere', EMPTY_POPULATION_STATS, 524.97)]),
	membersOf: { '06': ['837'] }
};

let fetchMock: ReturnType<typeof serveDataDir>;

function install(overrides: Record<string, Response | null> = {}) {
	fetchMock = serveDataDir(overrides);
	vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => install());
afterEach(() => vi.unstubAllGlobals());

describe('loadPopulationViews', () => {
	it('joins the figures and derives change and density from them', async () => {
		const views = await loadPopulationViews(populationGeometry);
		const helsinki = views.finland.areas.find((a) => a.code === '091');

		expect(helsinki?.population).toBeGreaterThan(600_000);
		// Density needs the land area, which comes from the geometry rather than the export.
		expect(helsinki?.density).toBeCloseTo((helsinki?.population ?? 0) / 214.21, 3);
		expect(helsinki?.change).toBeCloseTo(
			((helsinki?.totalChange ?? 0) / (helsinki?.population ?? 1)) * 1000,
			6
		);
	});

	it('rolls the Region tab up from the municipalities in each maakunta', async () => {
		// The export has no region rows and the maakunta geometry has no land area, so both
		// have to come from `membersOf` — here, Pirkanmaa standing in for Tampere alone.
		const views = await loadPopulationViews(populationGeometry);
		const pirkanmaa = views.maakunta.areas.find((a) => a.code === '06');
		const tampere = views.finland.areas.find((a) => a.code === '837');

		expect(pirkanmaa?.population).toBe(tampere?.population);
		expect(pirkanmaa?.landArea).toBe(524.97);
		expect(pirkanmaa?.density).toBeCloseTo(tampere?.density ?? 0, 6);
	});

	it('keeps the national total as the Region tab headline', async () => {
		const views = await loadPopulationViews(populationGeometry);

		expect(views.maakunta.total).toEqual(views.finland.total);
		expect(views.finland.total.population).toBeGreaterThan(5_000_000);
	});

	it('gives Tampere Metro its own roll-up instead of the national total', async () => {
		const views = await loadPopulationViews(populationGeometry);

		expect(views.tampere.total.name).not.toBe('Finland');
		expect(views.tampere.total.population).toBe(
			views.finland.areas.find((a) => a.code === '837')?.population
		);
	});

	it('compares against Finland on every tab', async () => {
		const views = await loadPopulationViews(populationGeometry);

		expect(views.tampere.countryChange).toBe(views.finland.countryChange);
		expect(views.maakunta.countryChange).toBe(views.finland.countryChange);
	});

	it('falls back to empty views when the export is missing', async () => {
		install({ 'population_register_kunnat_121w.json': new Response('', { status: 404 }) });

		const views = await loadPopulationViews(populationGeometry);

		expect(views.finland.period).toBe('');
		expect(views.finland.areas.every((a) => a.change === null)).toBe(true);
		expect(views.finland.areas).toHaveLength(2);
	});
});

const incomeGeometry: IncomeGeometry = {
	finland: map([
		area('091', 'Helsinki', EMPTY_INCOME_STATS),
		area('837', 'Tampere', EMPTY_INCOME_STATS),
		area('536', 'Nokia', EMPTY_INCOME_STATS)
	]),
	maakunta: map([area('06', 'Pirkanmaa', EMPTY_INCOME_STATS)]),
	tampere: map([
		area('837', 'Tampere', EMPTY_INCOME_STATS),
		area('536', 'Nokia', EMPTY_INCOME_STATS)
	]),
	membersOf: { '06': ['837', '536'] }
};

describe('loadIncomeViews', () => {
	it('joins the published municipal medians onto the shapes', async () => {
		const views = await loadIncomeViews(incomeGeometry);
		const tampere = views.finland.areas.find((a) => a.code === '837');

		expect(tampere?.medianIncome).toBeGreaterThan(0);
		expect(tampere?.gini).toBeGreaterThan(0);
		expect(tampere?.householdPopulation).toBeGreaterThan(0);
		expect(views.finland.period).toBe('2024');
	});

	it('names each municipality’s maakunta under the panel heading', async () => {
		const views = await loadIncomeViews(incomeGeometry);

		expect(views.finland.areas.find((a) => a.code === '837')?.regionName).toBe('Pirkanmaa');
	});

	it('reads the Region tab from the export’s own MK rows', async () => {
		// Not a roll-up, and it can't be one: a median isn't additive. The published figure need
		// not sit between its members', which is the tell that it wasn't derived.
		const views = await loadIncomeViews(incomeGeometry);
		const pirkanmaa = views.maakunta.areas.find((a) => a.code === '06');
		const contents = income.columns.filter((c) => c.type === 'c').map((c) => c.code);
		const published = income.data.find((r) => r.key[0] === 'MK06');

		expect(pirkanmaa?.medianIncome).toBe(
			Number(published?.values[contents.indexOf('tjt-ekvikturaha_med')])
		);
	});

	it('gives the whole country a headline but the metro none', async () => {
		const views = await loadIncomeViews(incomeGeometry);

		// The Region tab is the same country at a coarser granularity, so it keeps the national
		// headline. Tampere Metro is a genuinely smaller area with no published row — and no
		// way to derive one — so it has no headline at all rather than an averaged stand-in.
		expect(views.finland.total?.medianIncome).toBeGreaterThan(0);
		expect(views.maakunta.total?.medianIncome).toBe(views.finland.total?.medianIncome);
		expect(views.tampere.total).toBeNull();
		// Its municipalities still carry their own published figures.
		expect(views.tampere.areas.every((a) => a.medianIncome !== null)).toBe(true);
	});

	it('carries the national median on every tab, so colours don’t move', async () => {
		const views = await loadIncomeViews(incomeGeometry);

		expect(views.tampere.countryMedian).toBe(views.finland.countryMedian);
		expect(views.maakunta.countryMedian).toBe(views.finland.countryMedian);
	});

	it('falls back to empty views when the export is missing', async () => {
		install({ 'income_register_kunnat_14ww.json': new Response('', { status: 404 }) });

		const views = await loadIncomeViews(incomeGeometry);

		expect(views.finland.period).toBe('');
		expect(views.finland.areas.every((a) => a.medianIncome === null)).toBe(true);
		expect(views.finland.areas).toHaveLength(3);
	});
});

const educationGeometry: EducationGeometry = {
	finland: map([
		area('091', 'Helsinki', EMPTY_EDUCATION_STATS),
		area('837', 'Tampere', EMPTY_EDUCATION_STATS),
		area('536', 'Nokia', EMPTY_EDUCATION_STATS)
	]),
	maakunta: map([area('06', 'Pirkanmaa', EMPTY_EDUCATION_STATS)]),
	tampere: map([
		area('837', 'Tampere', EMPTY_EDUCATION_STATS),
		area('536', 'Nokia', EMPTY_EDUCATION_STATS)
	]),
	membersOf: { '06': ['837', '536'] }
};

describe('loadEducationViews', () => {
	it('joins the published municipal shares onto the shapes', async () => {
		const views = await loadEducationViews(educationGeometry);
		const tampere = views.finland.areas.find((a) => a.code === '837');

		expect(tampere?.tertiaryShare).toBeGreaterThan(0);
		expect(tampere?.population15).toBeGreaterThan(0);
		expect(tampere?.levelIndex).toBeGreaterThan(0);
		expect(views.finland.period).toBe('2025');
	});

	it('names each municipality’s maakunta under the panel heading', async () => {
		const views = await loadEducationViews(educationGeometry);

		expect(views.finland.areas.find((a) => a.code === '837')?.regionName).toBe('Pirkanmaa');
	});

	it('reads the Region tab from the export’s own MK rows', async () => {
		const views = await loadEducationViews(educationGeometry);
		const pirkanmaa = views.maakunta.areas.find((a) => a.code === '06');
		const contents = education.columns.filter((c) => c.type === 'c').map((c) => c.code);
		const published = education.data.find((r) => r.key[1] === 'MK06');

		expect(pirkanmaa?.tertiaryShare).toBe(
			Number(published?.values[contents.indexOf('kaste5T8osuus')])
		);
	});

	it('gives the metro tab an exact headline, unlike the income map', async () => {
		// The contrast worth pinning: a share of a headcount combines, a median doesn't. The
		// roll-up is the summed degree-holders over the summed 15+ population, so it lands between
		// its two members rather than being one of them.
		const views = await loadEducationViews(educationGeometry);
		const shares = views.tampere.areas.map((a) => a.tertiaryShare as number);
		const total = views.tampere.total.tertiaryShare as number;

		expect(views.tampere.total.name).toBe('Tampere Metro');
		expect(total).toBeGreaterThan(Math.min(...shares));
		expect(total).toBeLessThan(Math.max(...shares));
	});

	it('leaves the education level index out of the metro roll-up', async () => {
		// It averages the 20+ population and only the 15+ headcount is published to weight it by.
		const views = await loadEducationViews(educationGeometry);

		expect(views.tampere.total.levelIndex).toBeNull();
		expect(views.finland.total.levelIndex).toBeGreaterThan(0);
	});

	it('keeps the whole-country headline on the Region tab', async () => {
		const views = await loadEducationViews(educationGeometry);

		expect(views.maakunta.total.tertiaryShare).toBe(views.finland.total.tertiaryShare);
	});

	it('carries both reference figures on every tab, so colours never move', async () => {
		const views = await loadEducationViews(educationGeometry);

		expect(views.tampere.countryShare).toBe(views.finland.countryShare);
		expect(views.maakunta.countryShare).toBe(views.finland.countryShare);
		// The one the scale actually pivots on — the median of the 308 municipalities, computed
		// from the export rather than from whichever areas the tab happens to show.
		expect(views.tampere.medianShare).toBe(views.finland.medianShare);
		expect(views.maakunta.medianShare).toBe(views.finland.medianShare);
	});

	it('pivots on the median municipality, well below the national share', async () => {
		// The reason this map doesn't diverge around Finland: the national figure counts people,
		// so it sits far above the middle municipality and only 42 of 308 reach it.
		const views = await loadEducationViews(educationGeometry);

		expect(views.finland.medianShare).toBeCloseTo(24.5, 1);
		expect(views.finland.countryShare).toBeGreaterThan((views.finland.medianShare as number) + 9);
	});

	it('falls back to empty views when the export is missing', async () => {
		install({ 'education_register_kunnat_12bs.json': new Response('', { status: 404 }) });

		const views = await loadEducationViews(educationGeometry);

		expect(views.finland.period).toBe('');
		expect(views.finland.areas.every((a) => a.tertiaryShare === null)).toBe(true);
		expect(views.finland.areas).toHaveLength(3);
	});
});

describe('loadBalanceViews', () => {
	it('joins the municipal split onto the shapes', async () => {
		const views = await loadBalanceViews(populationGeometry);
		const helsinki = views.finland.areas.find((a) => a.code === '091');

		expect(helsinki?.womenShare).toBeGreaterThan(50);
		expect(helsinki?.women).toBeGreaterThan(0);
		expect(helsinki?.men).toBeGreaterThan(0);
		expect(views.finland.period).toBe('2025');
	});

	it('rolls the Region tab up, because this export publishes no MK rows', async () => {
		// 309 areas: the whole country and the 308 municipalities, and nothing in between — so
		// unlike the age and education maps there is no published regional figure to read.
		const views = await loadBalanceViews(populationGeometry);
		const pirkanmaa = views.maakunta.areas.find((a) => a.code === '06');
		const tampere = views.finland.areas.find((a) => a.code === '837');

		// The fixture puts only Tampere in Pirkanmaa, so the roll-up must reproduce it exactly.
		expect(pirkanmaa?.women).toBe(tampere?.women);
		expect(pirkanmaa?.womenShare).toBeCloseTo(tampere?.womenShare as number, 10);
	});

	it('recomputes the share from summed counts rather than averaging shares', async () => {
		const views = await loadBalanceViews(populationGeometry);
		const total = views.tampere.total;

		expect(total.womenShare).toBeCloseTo(
			((total.women as number) / (total.population as number)) * 100,
			10
		);
	});

	it('keeps the whole country as the headline on Finland and Region', async () => {
		const views = await loadBalanceViews(populationGeometry);

		expect(views.finland.total.womenShare).toBeCloseTo(50.48, 2);
		expect(views.maakunta.total.womenShare).toBe(views.finland.total.womenShare);
	});

	it('falls back to empty views when the export is missing', async () => {
		install({ 'sex_register_kunnat_11re.json': new Response('', { status: 404 }) });

		const views = await loadBalanceViews(populationGeometry);

		expect(views.finland.period).toBe('');
		expect(views.finland.areas.every((a) => a.womenShare === null)).toBe(true);
	});
});

const ageGeometry: AgeGeometry = {
	finland: map([
		area('091', 'Helsinki', EMPTY_AGE_STATS),
		area('837', 'Tampere', EMPTY_AGE_STATS),
		area('536', 'Nokia', EMPTY_AGE_STATS)
	]),
	maakunta: map([area('06', 'Pirkanmaa', EMPTY_AGE_STATS)]),
	tampere: map([area('837', 'Tampere', EMPTY_AGE_STATS), area('536', 'Nokia', EMPTY_AGE_STATS)]),
	membersOf: { '06': ['837', '536'] }
};

describe('loadAgeViews', () => {
	it('joins the published mean ages onto the shapes', async () => {
		const views = await loadAgeViews(ageGeometry);
		const tampere = views.finland.areas.find((a) => a.code === '837');

		expect(tampere?.averageAge).toBeGreaterThan(0);
		expect(tampere?.underFifteen).toBeGreaterThan(0);
		expect(views.finland.period).toBe('2025');
	});

	it('reads the Region tab from the export’s own MK rows', async () => {
		const views = await loadAgeViews(ageGeometry);
		const pirkanmaa = views.maakunta.areas.find((a) => a.code === '06');
		const contents = age.columns.filter((c) => c.type === 'c').map((c) => c.code);
		const published = age.data.find((r) => r.key[0] === 'MK06');

		expect(pirkanmaa?.averageAge).toBe(
			Number(published?.values[contents.indexOf('vaesto_keski_ika')])
		);
	});

	it('weights the metro roll-up by population', async () => {
		// Between its two members rather than the midpoint of them, because Tampere is far bigger
		// than Nokia — the property that separates a weighted mean from an averaged one.
		const views = await loadAgeViews(ageGeometry);
		const ages = views.tampere.areas.map((a) => a.averageAge as number);
		const total = views.tampere.total.averageAge as number;
		const unweighted = (ages[0] + ages[1]) / 2;

		expect(total).toBeGreaterThan(Math.min(...ages));
		expect(total).toBeLessThan(Math.max(...ages));
		expect(total).not.toBeCloseTo(unweighted, 2);
	});

	it('pivots on the median municipality, well above the national mean', async () => {
		// Mirror of the education map: the national figure counts people, young people live in
		// cities, so most municipalities are older than it.
		const views = await loadAgeViews(ageGeometry);

		expect(views.finland.medianAge).toBeCloseTo(48.6, 1);
		expect(views.finland.countryAge).toBeLessThan((views.finland.medianAge as number) - 4);
		expect(views.tampere.medianAge).toBe(views.finland.medianAge);
		expect(views.maakunta.medianAge).toBe(views.finland.medianAge);
	});

	it('falls back to empty views when the export is missing', async () => {
		install({ 'age_register_kunnat_11ra.json': new Response('', { status: 404 }) });

		const views = await loadAgeViews(ageGeometry);

		expect(views.finland.period).toBe('');
		expect(views.finland.areas.every((a) => a.averageAge === null)).toBe(true);
	});
});

/**
 * Föglö is in this fixture on purpose: its unemployment rate is suppressed in the real 12r5
 * export (four Åland municipalities are), which is exactly the case the coverage floor exists
 * for. See `MIN_COVERAGE` in `score.ts`.
 */
const compareGeometry: CompareGeometry = {
	finland: map([
		area('091', 'Helsinki', EMPTY_POPULATION_STATS, 214.21),
		area('837', 'Tampere', EMPTY_POPULATION_STATS, 524.97),
		area('536', 'Nokia', EMPTY_POPULATION_STATS, 289.44),
		area('062', 'Föglö', EMPTY_POPULATION_STATS, 135.37)
	])
};

describe('loadCompare', () => {
	it('joins every table onto one area and scores it', async () => {
		const compare = await loadCompare(compareGeometry);
		const tampere = compare.areas.find((a) => a.code === '837');

		// One figure from each export, and a score built from all of them.
		expect(tampere?.rate).toBeGreaterThan(0);
		expect(tampere?.change).not.toBeNull();
		expect(tampere?.income).toBeGreaterThan(0);
		expect(tampere?.population).toBeGreaterThan(0);
		expect(tampere?.score.score).toBeGreaterThanOrEqual(0);
		expect(tampere?.score.parts.map((p) => p.key)).toEqual([
			'jobs',
			'people',
			'income',
			'education',
			'age',
			'balance'
		]);
	});

	it('keeps the geometry’s Swedish name and land area on the area', async () => {
		// Both come from the GeoJSON rather than from any export, and both are the detail card's
		// subtitle — they used to be dropped on the way through here.
		const compare = await loadCompare(compareGeometry);

		expect(compare.areas.find((a) => a.code === '837')?.landArea).toBe(524.97);
		expect(compare.areas.find((a) => a.code === '837')?.bbox).toEqual([0, 0, 1, 1]);
	});

	it('shows the share of men but ranks the distance from an even split', async () => {
		// The two are deliberately different numbers: a share alone has no good end, so it can't
		// be ranked, but "50,1 %" is the only one of the two a reader can interpret.
		const compare = await loadCompare(compareGeometry);
		const tampere = compare.areas.find((a) => a.code === '837');

		expect(tampere?.menShare).toBeGreaterThan(40);
		expect(tampere?.menShare).toBeLessThan(60);
		expect(tampere?.balance).toBeCloseTo(Math.abs((tampere?.menShare ?? 0) - 50), 6);
	});

	it('reports population change as a percentage, not per mille', async () => {
		const compare = await loadCompare(compareGeometry);
		const change = compare.areas.find((a) => a.code === '837')?.change ?? 0;

		// Whole-number percents: no municipality in the country grows or shrinks by 50 % a year.
		expect(Math.abs(change)).toBeLessThan(50);
	});

	it('leaves a municipality with a suppressed indicator unscored', async () => {
		// The regression the coverage floor exists to prevent: scored on population change
		// alone, Föglö ranks first in the country.
		const compare = await loadCompare(compareGeometry);
		const foglo = compare.areas.find((a) => a.code === '062');

		expect(foglo?.rate).toBeNull();
		expect(foglo?.change).not.toBeNull();
		expect(foglo?.score.score).toBeNull();
		expect(foglo?.score.rank).toBeNull();
		expect(foglo?.score.isPartial).toBe(true);
	});

	it('places Finland among the municipalities without letting it take a rank from them', async () => {
		const compare = await loadCompare(compareGeometry);
		const before = compare.areas.map((a) => a.score.rank);

		expect(compare.finland?.code).toBe('FI');
		expect(compare.finland?.score.rank).not.toBeNull();
		// The country is ranked among the same set the municipalities are, and its presence
		// leaves every one of their ranks exactly where it was.
		expect(compare.finland?.score.ranked).toBe(compare.areas.filter((a) => a.score.score).length);
		expect(compare.areas.map((a) => a.score.rank)).toEqual(before);
		// It is never one of the areas the map draws.
		expect(compare.areas.some((a) => a.code === 'FI')).toBe(false);
	});

	it('gives Finland a figure per indicator, from each export’s whole-country row', async () => {
		const compare = await loadCompare(compareGeometry);

		expect(compare.finland?.rate).toBeGreaterThan(0);
		expect(compare.finland?.income).toBeGreaterThan(0);
		expect(compare.finland?.population).toBeGreaterThan(5_000_000);
		expect(compare.finland?.score.parts.every((p) => p.value !== null)).toBe(true);
		// Land area is summed from the municipalities rather than published, so on this
		// four-municipality fixture it is the sum of those four.
		expect(compare.finland?.landArea).toBeCloseTo(214.21 + 524.97 + 289.44 + 135.37, 2);
	});

	it('carries every period, since the tables are on independent cycles', async () => {
		const compare = await loadCompare(compareGeometry);

		expect(compare.periods).toContain('2026M06');
		expect(compare.periods).toContain('2025');
		expect(compare.periods).toContain('2024');
		// Deduplicated: four of the six tables are annual and share a period.
		expect(new Set(compare.periods).size).toBe(compare.periods.length);
	});

	it('carries the publishers and the latest poll date', async () => {
		const compare = await loadCompare(compareGeometry);

		expect(compare.sources.length).toBeGreaterThan(0);
		expect(compare.polled).toBe('2026-08-11T18:39:44Z');
		expect(compare.ok).toBe(true);
	});

	it('fails the whole view when any one file is missing', async () => {
		// Not a partial degrade, on purpose. Every indicator feeds the score and the coverage
		// floor needs all six, so one missing table would leave 308 unscored municipalities and
		// no explanation — the page says so instead.
		install({ 'sex_register_kunnat_11re.json': new Response('', { status: 404 }) });

		const compare = await loadCompare(compareGeometry);

		expect(compare.ok).toBe(false);
		expect(compare.finland).toBeNull();
		expect(compare.areas.every((a) => a.score.score === null)).toBe(true);
		// The shapes are still there, so the map renders as an outline rather than as nothing.
		expect(compare.areas).toHaveLength(4);
	});

	it('fails the same way when the network never answers', async () => {
		install({ 'income_register_kunnat_14ww.json': null });

		const compare = await loadCompare(compareGeometry);

		expect(compare.ok).toBe(false);
		expect(compare.areas.every((a) => a.income === null)).toBe(true);
	});
});

describe('the pre-fetch state', () => {
	it('leaves the period and poll date blank rather than inventing them', () => {
		const views = emptyPopulationViews(populationGeometry);

		expect(views.finland.period).toBe('');
		expect(views.finland.polled).toBeNull();
		expect(views.finland.total.density).toBeNull();
	});

	it('gives the compare map an unscored shape per area, with its rows already there', () => {
		// The panel renders the same seven rows before and after the fetch — labels present,
		// figures em-dashed — so nothing jumps into place when the score arrives.
		const compare = emptyCompare(compareGeometry);

		expect(compare.areas).toHaveLength(4);
		expect(compare.areas.every((a) => a.score.score === null)).toBe(true);
		expect(compare.areas[0].score.parts.map((p) => p.key)).toEqual([
			'jobs',
			'people',
			'income',
			'education',
			'age',
			'balance'
		]);
		expect(compare.areas[0].score.ranked).toBe(0);
		// No reference row until there are figures to place it among.
		expect(compare.finland).toBeNull();
		expect(compare.ok).toBe(false);
	});

	it('gives the income map a headline shape for the two tabs that can have one', () => {
		const views = emptyIncomeViews(incomeGeometry);

		expect(views.finland.total?.medianIncome).toBeNull();
		expect(views.maakunta.total?.medianIncome).toBeNull();
		// ...and none at all for the metro, before or after the fetch.
		expect(views.tampere.total).toBeNull();
	});

	it('gives the sex map a headline shape and no reference figures to carry', () => {
		// The only map whose scale pivots on a constant (50 %), so there is no countryX/medianX
		// on its view at all — nothing has to be kept stable across tabs.
		const views = emptyBalanceViews(populationGeometry);

		expect(views.finland.total.womenShare).toBeNull();
		expect(views.tampere.total.name).toBe('Tampere Metro');
		expect(Object.keys(views.finland).sort()).toEqual([
			'areas',
			'period',
			'polled',
			'source',
			'total',
			'viewBox'
		]);
	});

	it('gives the education map a headline shape on all three tabs', () => {
		// The counterpart to the income case above: every tab can have a total here, so every tab
		// has the shape of one before the figures land.
		const views = emptyEducationViews(educationGeometry);

		expect(views.finland.total.tertiaryShare).toBeNull();
		expect(views.maakunta.total.tertiaryShare).toBeNull();
		expect(views.tampere.total.name).toBe('Tampere Metro');
		// The maakunta label is geometry-derived, so it's on screen before any figures are.
		expect(views.finland.areas.find((a) => a.code === '837')?.regionName).toBe('Pirkanmaa');
	});
});
