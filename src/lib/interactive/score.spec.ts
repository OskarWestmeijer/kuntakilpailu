import { describe, it, expect } from 'vitest';
import {
	MIN_COVERAGE,
	percentileColor,
	percentileRanks,
	placeValue,
	SCORE_PALETTE,
	scoreAreas,
	type Indicator
} from './score';
import { NO_DATA_COLOR } from './unemployment';

describe('percentileRanks', () => {
	it('puts the best value at 100 and the worst at 0', () => {
		expect(percentileRanks([10, 20, 30], true)).toEqual([0, 50, 100]);
	});

	it('flips the scale when less is better, as for an unemployment rate', () => {
		// 2,5 % is the *best* rate here, so it must score 100 despite being the smallest number.
		expect(percentileRanks([2.5, 12.8, 20], false)).toEqual([100, 50, 0]);
	});

	it('gives tied values the average of the ranks they span', () => {
		// Without this, whichever of the two 20s came first in the array would outrank the other.
		expect(percentileRanks([10, 20, 20, 30], true)).toEqual([0, 50, 50, 100]);
	});

	it('keeps nulls null and leaves them out of the denominator', () => {
		// Four values, one suppressed: the remaining three are ranked as if the null weren't there.
		expect(percentileRanks([10, null, 20, 30], true)).toEqual([0, null, 50, 100]);
	});

	it('preserves input order, since callers zip the result back onto their areas', () => {
		expect(percentileRanks([30, 10, 20], true)).toEqual([100, 0, 50]);
	});

	it('scores a lone value at the midpoint rather than dividing by zero', () => {
		expect(percentileRanks([42, null], true)).toEqual([50, null]);
		expect(percentileRanks([null, null], true)).toEqual([null, null]);
	});
});

type Area = { code: string; name: string; rate: number | null; change: number | null };

const INDICATORS: Indicator<Area>[] = [
	{
		key: 'jobs',
		label: 'Jobs',
		valueOf: (a) => a.rate,
		format: (v) => (v === null ? 'no data' : `${v} %`),
		higherIsBetter: false,
		weight: 1
	},
	{
		key: 'people',
		label: 'People',
		valueOf: (a) => a.change,
		format: (v) => (v === null ? 'no data' : `${v}`),
		higherIsBetter: true,
		weight: 1
	}
];

const areas: Area[] = [
	{ code: '001', name: 'Best', rate: 5, change: 20 },
	{ code: '002', name: 'Middle', rate: 10, change: 10 },
	{ code: '003', name: 'Worst', rate: 15, change: 0 }
];

describe('scoreAreas', () => {
	const result = scoreAreas(areas, INDICATORS);

	it('averages the indicators, each weighted, onto one 0-100 figure', () => {
		expect(result.get('001')?.score).toBe(100);
		expect(result.get('002')?.score).toBe(50);
		expect(result.get('003')?.score).toBe(0);
	});

	it('ranks best first and says what the rank is out of', () => {
		expect(result.get('001')?.rank).toBe(1);
		expect(result.get('003')?.rank).toBe(3);
		expect(result.get('002')?.ranked).toBe(3);
	});

	it('carries each indicator through to the panel with its raw figure', () => {
		// The panel shows the number behind the percentile, which is what stops a rank-based
		// score being unaccountable.
		expect(result.get('002')?.parts).toEqual([
			{
				key: 'jobs',
				label: 'Jobs',
				percentile: 50,
				rank: 2,
				ranked: 3,
				value: 10,
				formatted: '10 %'
			},
			{
				key: 'people',
				label: 'People',
				percentile: 50,
				rank: 2,
				ranked: 3,
				value: 10,
				formatted: '10'
			}
		]);
	});

	it('honours weights rather than treating every indicator alike', () => {
		const weighted = scoreAreas(areas, [INDICATORS[0], { ...INDICATORS[1], weight: 3 }]);

		// Middle is 50/50 either way; a lopsided area is what shows the weight biting. Give one
		// area the best jobs figure and the worst population one: 100 and 0, weighted 1:3 => 25.
		const lopsided = scoreAreas(
			[
				{ code: 'a', name: 'A', rate: 5, change: 0 },
				{ code: 'b', name: 'B', rate: 10, change: 10 },
				{ code: 'c', name: 'C', rate: 15, change: 20 }
			],
			[INDICATORS[0], { ...INDICATORS[1], weight: 3 }]
		);

		expect(weighted.get('002')?.score).toBe(50);
		expect(lopsided.get('a')?.score).toBe(25);
	});

	it('gives tied scores the same rank, and skips the rank they share', () => {
		const tied = scoreAreas(
			[
				{ code: 'a', name: 'A', rate: 5, change: 20 },
				{ code: 'b', name: 'B', rate: 10, change: 10 },
				{ code: 'c', name: 'C', rate: 10, change: 10 }
			],
			INDICATORS
		);

		expect(tied.get('b')?.rank).toBe(2);
		expect(tied.get('c')?.rank).toBe(2);
		expect(tied.get('a')?.rank).toBe(1);
	});
});

describe('coverage floor', () => {
	// The regression this whole design exists to prevent: with a "rescale over what's present"
	// rule, an area whose only published indicator happens to be strong wins the country. Run
	// over the real exports, that was Föglö — no unemployment rate, top-quartile population
	// change, first of 308.
	const withSuppressed: Area[] = [...areas, { code: '062', name: 'Föglö', rate: null, change: 25 }];

	const result = scoreAreas(withSuppressed, INDICATORS);

	it('refuses to score an area that is missing an indicator', () => {
		expect(MIN_COVERAGE).toBe(1);
		expect(result.get('062')?.score).toBeNull();
		expect(result.get('062')?.rank).toBeNull();
	});

	it('flags the area as partial, and still shows the figures it does have', () => {
		const foglo = result.get('062');

		expect(foglo?.isPartial).toBe(true);
		expect(foglo?.parts[0]).toMatchObject({ key: 'jobs', percentile: null, formatted: 'no data' });
		// Its population figure is the best of the four, and is shown as such — it just doesn't
		// become a score on its own.
		expect(foglo?.parts[1].percentile).toBe(100);
	});

	it('still ranks the fully covered areas against each other, and says so', () => {
		expect(result.get('001')?.rank).toBe(1);
		expect(result.get('001')?.ranked).toBe(3);
		// An unscored area is measured against the same set, so its panel can say "of 3".
		expect(result.get('062')?.ranked).toBe(3);
	});

	it('still counts a partial area in the rankings for the indicators it does have', () => {
		// It is excluded only from the *jobs* ranking, where it has no figure — not from the
		// population one, where its +25 is a real published number and the best of the four. So
		// Best drops from 100 to 1st-of-2-below-it on population (66,7) while keeping 100 on
		// jobs. Dropping a partial area out of every distribution would be the wrong fix: it
		// would quietly overstate everyone ranked below it.
		expect(result.get('001')?.parts[1].percentile).toBeCloseTo(66.7, 1);
		expect(result.get('001')?.score).toBeCloseTo(83.3, 1);
		expect(result.get('002')?.score).toBeCloseTo(41.7, 1);
		expect(result.get('003')?.score).toBe(0);
	});

	it('scores nothing at all when every indicator is missing', () => {
		const blank = scoreAreas([{ code: 'x', name: 'X', rate: null, change: null }], INDICATORS);

		expect(blank.get('x')?.score).toBeNull();
		expect(blank.get('x')?.ranked).toBe(0);
	});
});

describe('percentileColor', () => {
	it('cuts the palette into equal sevenths, so each colour holds a seventh of the areas', () => {
		// The bin edges the legend prints are septiles of the figures for exactly this reason —
		// the strip and the numbers under it have to describe the same cut points.
		expect(percentileColor(0)).toBe(SCORE_PALETTE[0]);
		expect(percentileColor(100 / 7 - 0.01)).toBe(SCORE_PALETTE[0]);
		expect(percentileColor(100 / 7)).toBe(SCORE_PALETTE[1]);
		expect(percentileColor(50)).toBe(SCORE_PALETTE[3]);
		expect(percentileColor(100)).toBe(SCORE_PALETTE[6]);
	});

	it('runs light at the middle to dark at both ends, so magnitude survives CVD', () => {
		// Each arm is monotone in lightness outwards from the yellow — the property that keeps a
		// red-green-blind reader able to rank two areas by depth alone.
		const luminance = (hex: string) => {
			const channel = (i: number) => {
				const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;

				return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
			};

			return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
		};
		const light = SCORE_PALETTE.map(luminance);

		// Index 3 is the yellow midpoint; both directions get darker away from it.
		expect(light[3]).toBeGreaterThan(Math.max(light[2], light[4]));
		expect(light[2]).toBeGreaterThan(light[1]);
		expect(light[1]).toBeGreaterThan(light[0]);
		expect(light[4]).toBeGreaterThan(light[5]);
		expect(light[5]).toBeGreaterThan(light[6]);
	});

	it('hands an unscored area the hatch backing rather than a flat grey of its own', () => {
		expect(percentileColor(null)).toBe(NO_DATA_COLOR);
	});
});

describe('placeValue', () => {
	const values = [10, 20, 30, 40];

	it('places a figure without letting it occupy a rank of its own', () => {
		// 35 beats three of the four and is beaten by one, so it would come second.
		expect(placeValue(values, 35, true)).toEqual({ percentile: 75, rank: 2, ranked: 4 });
	});

	it('flips for a lower-is-better indicator', () => {
		expect(placeValue(values, 15, false)).toEqual({ percentile: 75, rank: 2, ranked: 4 });
	});

	it('counts a tie as beaten, so an exactly-average figure is not ranked ahead of its equals', () => {
		expect(placeValue(values, 30, true).rank).toBe(2);
	});

	it('leaves the whole placement null when there is no figure to place', () => {
		expect(placeValue(values, null, true)).toEqual({ percentile: null, rank: null, ranked: 4 });
	});

	it('ignores areas with no figure, and reports how many were actually ranked', () => {
		expect(placeValue([10, null, 30], 20, true)).toEqual({ percentile: 50, rank: 2, ranked: 2 });
	});

	it('has nothing to place a figure among when every area is missing one', () => {
		expect(placeValue([null, null], 5, true)).toEqual({
			percentile: null,
			rank: null,
			ranked: 0
		});
	});
});

describe('scorePercentile', () => {
	/** n areas whose indicator values are all distinct, so every score is distinct too. */
	const spread = (n: number) =>
		Array.from({ length: n }, (_, i) => ({ code: String(i), a: i, b: i * 2 }));
	const two: Indicator<{ code: string; a: number; b: number }>[] = [
		{ key: 'a', label: 'A', valueOf: (x) => x.a, format: String, higherIsBetter: true, weight: 1 },
		{ key: 'b', label: 'B', valueOf: (x) => x.b, format: String, higherIsBetter: true, weight: 1 }
	];

	it('ranks the score itself, so the best is 100 and the worst 0', () => {
		const scored = scoreAreas(spread(11), two);

		expect(scored.get('10')?.scorePercentile).toBe(100);
		expect(scored.get('0')?.scorePercentile).toBe(0);
		expect(scored.get('5')?.scorePercentile).toBe(50);
	});

	it('is null wherever the score is', () => {
		const scored = scoreAreas(
			[{ code: 'x', a: 1, b: null as unknown as number }, ...spread(3)],
			two
		);

		expect(scored.get('x')?.score).toBeNull();
		expect(scored.get('x')?.scorePercentile).toBeNull();
	});

	it('is what the colour bands are meant to be read against, not the raw score', () => {
		// The regression this exists for. A score is a *mean* of percentile ranks, and a mean of
		// ranks clusters towards the middle — harder with every indicator added. Colouring by the
		// raw score put exactly one municipality of 304 in the class labelled "top 10 %"; ranking
		// the score first restores a tenth of the areas to each tail, whatever gets added next.
		const areas = spread(101);
		const scored = scoreAreas(areas, two);
		const percentiles = areas.map((a) => scored.get(a.code)?.scorePercentile ?? 0);

		const inTopBand = percentiles.filter((p) => p >= 90).length;
		const inBottomBand = percentiles.filter((p) => p < 10).length;

		expect(inTopBand).toBeGreaterThanOrEqual(10);
		expect(inBottomBand).toBeGreaterThanOrEqual(10);
	});

	it('spreads a uniform ranking evenly across the palette', () => {
		// The pay-off of ranking the score before colouring it: with 7 equal bins over a
		// percentile, every colour on the map holds a seventh of the country by construction.
		// Colouring the raw score instead put one municipality of 304 in the darkest green.
		const areas = spread(210);
		const scored = scoreAreas(areas, two);
		const colors = areas.map((a) => percentileColor(scored.get(a.code)?.scorePercentile ?? null));

		for (const color of SCORE_PALETTE) {
			expect(colors.filter((c) => c === color).length).toBeCloseTo(30, -1);
		}
	});
});
