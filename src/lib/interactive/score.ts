/**
 * The composite score: six indicators, each from a different statistics table, folded into one
 * 0–100 figure per municipality.
 *
 * Kept pure — no Svelte, no geometry, no fetching — so the formula is unit-testable on its own
 * and so adding a domain (education, economy, housing) is an edit to one array rather than to a
 * component. `liveData.ts` joins the figures; this module only ranks and weights them.
 *
 * **Percentile rank, not z-score or min–max.** Each indicator becomes "better than X % of the
 * areas ranked". The measures being combined are on wildly different units (a percentage, a
 * per-mille change) and at least one has a long tail — Kökar's −75,8 per 1 000 is four times the
 * next value down — so min–max would let a single municipality compress everything else into a
 * narrow band, and a z-score would pin the tail at whatever clamp it was given. Ranking throws
 * away magnitude, which is the accepted cost: the panel shows every raw figure beside its
 * percentile so the number behind the rank is always in view.
 *
 * Ranks are computed over whatever set of areas is passed in, so a caller decides what "of 308"
 * means. Finland's own national figures are *not* in that set — they are placed into it after
 * the fact by `placeValue`, so the country appearing as a reference row doesn't shift any
 * municipality's rank.
 */

import { NO_DATA_COLOR } from './unemployment';

export type Indicator<A> = {
	/** Stable key, used for `{#each}` and in tests. */
	key: string;
	/** What the panel calls this domain — "Jobs", "People". */
	label: string;
	/** The raw figure for an area, or null where the source suppresses/omits it. */
	valueOf: (area: A) => number | null;
	/** Renders that raw figure for the panel, e.g. `percent` or `signed` from `format.ts`. */
	format: (value: number | null) => string;
	/** False for measures where less is better, like an unemployment rate. */
	higherIsBetter: boolean;
	/**
	 * Relative importance. Equal across domains for now — the site has no basis for saying that
	 * one matters more, and an arbitrary weighting dressed up as a finding would be worse than
	 * an obviously neutral one. It's a field rather than a constant so a future UI can vary it
	 * without the formula changing shape.
	 */
	weight: number;
};

/** One indicator's contribution to an area's score, as the panel renders it. */
export type ScorePart = {
	key: string;
	label: string;
	/** 0–100, or null where this area has no figure for this indicator. */
	percentile: number | null;
	/** 1 = best on this indicator alone. Null where the figure is. Competition ranking, so ties
	 *  share a rank and the next one skips — the same rule the overall `rank` uses. */
	rank: number | null;
	/** How many areas have a figure for this indicator — the "of 304" beside `rank`. */
	ranked: number;
	value: number | null;
	/** `value` through the indicator's own formatter. */
	formatted: string;
};

export type ScoreBreakdown = {
	/** 0–100, or null when the area is below `MIN_COVERAGE`. */
	score: number | null;
	/**
	 * Where that score sits among the other scored areas, 0–100 — **what the map colours by**.
	 *
	 * Not the same thing as `score`, and the difference is why this field exists. A score is the
	 * mean of several percentile ranks, and a mean of ranks is not itself rank-distributed: it
	 * clusters towards the middle, harder with every indicator added. Over the real exports the
	 * top-10 % band held 9 municipalities with two indicators and **1** with six, so a class
	 * labelled "top 10 %" was describing 0,3 % of the country. Ranking the score itself makes the
	 * bands mean what they say by construction, whatever gets added next.
	 */
	scorePercentile: number | null;
	/** 1 = best. Null whenever `score` is. */
	rank: number | null;
	/** How many areas got a score — the "of 308" the panel prints beside the rank. */
	ranked: number;
	parts: ScorePart[];
	/** True when the area was scored on less than the full set of indicators. */
	isPartial: boolean;
};

/**
 * The share of total weight an area must have figures for before it gets a score at all.
 *
 * **1 — every indicator, no exceptions — and that is a deliberate choice, not a stub.** Scoring
 * an area on the subset it happens to have is not conservative: it silently re-weights that
 * area's remaining indicators up to 100 %. Run over the real exports with two indicators and a
 * "rescale over what's present" rule, Föglö came out **first of 308** — it has no published
 * unemployment rate (four Åland municipalities don't), so its score was its population change
 * alone, which is near the top of the country. A ranking whose winner is an artefact of a
 * suppressed cell discredits the whole page.
 *
 * With five domains a partial score becomes defensible and this can drop to ~0.6; the code path
 * for it (`isPartial`, and the panel's note) is built and tested, it just can't trigger at 1.
 */
export const MIN_COVERAGE = 1;

/**
 * Percentile rank of each value within the array, 0–100, preserving input order.
 *
 * - Nulls stay null and are excluded from the denominator, so suppressed areas don't drag the
 *   scale or occupy ranks.
 * - Ties share the average of the ranks they span — otherwise the order the areas happened to
 *   arrive in would decide which of two identical figures scored higher.
 * - The denominator is `n - 1`, so the best value is exactly 100 and the worst exactly 0.
 * - A single ranked value has no spread to sit in and scores 50 (the neutral midpoint) rather
 *   than dividing by zero.
 */
export function percentileRanks(
	values: (number | null)[],
	higherIsBetter: boolean
): (number | null)[] {
	const known = values
		.map((value, index) => ({ value, index }))
		.filter((entry): entry is { value: number; index: number } => entry.value !== null);

	const result: (number | null)[] = values.map(() => null);

	if (known.length === 0) return result;
	if (known.length === 1) {
		result[known[0].index] = 50;

		return result;
	}

	// Ascending, so position 0 is the lowest value: that's the best end when less is better.
	known.sort((a, b) => a.value - b.value);

	let start = 0;

	while (start < known.length) {
		let end = start;

		while (end + 1 < known.length && known[end + 1].value === known[start].value) end += 1;

		// Average position across the tie, mapped onto 0–100 and flipped for "lower is better".
		const position = (start + end) / 2 / (known.length - 1);
		const percentile = (higherIsBetter ? position : 1 - position) * 100;

		for (let i = start; i <= end; i += 1) result[known[i].index] = percentile;

		start = end + 1;
	}

	return result;
}

/**
 * Position of each value within the array, 1 = best, preserving input order.
 *
 * Competition ranking: equal values share a rank and the next one skips, so a rank always answers
 * "how many areas are ahead of me". Nulls stay null and don't occupy a position.
 */
export function competitionRanks(
	values: (number | null)[],
	higherIsBetter: boolean
): { rank: (number | null)[]; ranked: number } {
	const known = values
		.map((value, index) => ({ value, index }))
		.filter((entry): entry is { value: number; index: number } => entry.value !== null);

	// Best first: highest value when more is better, lowest when less is.
	known.sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value));

	const rank: (number | null)[] = values.map(() => null);
	let start = 0;

	while (start < known.length) {
		let end = start;

		while (end + 1 < known.length && known[end + 1].value === known[start].value) end += 1;

		for (let i = start; i <= end; i += 1) rank[known[i].index] = start + 1;

		start = end + 1;
	}

	return { rank, ranked: known.length };
}

/**
 * Scores every area against the others in the same list.
 *
 * Returned keyed by area code because callers join it back onto their own area objects.
 */
export function scoreAreas<A extends { code: string }>(
	areas: A[],
	indicators: Indicator<A>[]
): Map<string, ScoreBreakdown> {
	const totalWeight = indicators.reduce((sum, indicator) => sum + indicator.weight, 0);

	// One pass per indicator, ranking the whole column at once — percentile is a property of the
	// distribution, so it can't be computed area by area.
	const percentiles = indicators.map((indicator) =>
		percentileRanks(
			areas.map((area) => indicator.valueOf(area)),
			indicator.higherIsBetter
		)
	);

	// The same columns as positions rather than shares: "116th of 304 on jobs" is the thing a
	// reader can act on, where a percentile is the thing the score is actually built from. The
	// panel shows both.
	const ranks = indicators.map((indicator) =>
		competitionRanks(
			areas.map((area) => indicator.valueOf(area)),
			indicator.higherIsBetter
		)
	);

	const scored = areas.map((area, areaIndex) => {
		const parts: ScorePart[] = indicators.map((indicator, i) => {
			const value = indicator.valueOf(area);

			return {
				key: indicator.key,
				label: indicator.label,
				percentile: percentiles[i][areaIndex],
				rank: ranks[i].rank[areaIndex],
				ranked: ranks[i].ranked,
				value,
				formatted: indicator.format(value)
			};
		});

		const present = indicators.filter((_, i) => parts[i].percentile !== null);
		const coverage = totalWeight
			? present.reduce((sum, indicator) => sum + indicator.weight, 0) / totalWeight
			: 0;

		// Weighted mean over the indicators that *are* present. Below the coverage floor this
		// never reaches the reader — but the arithmetic is the same either way, so the panel's
		// partial branch renders a real number rather than a special case.
		const weighted = parts.reduce(
			(sum, part, i) =>
				part.percentile === null ? sum : sum + part.percentile * indicators[i].weight,
			0
		);
		const presentWeight = present.reduce((sum, indicator) => sum + indicator.weight, 0);

		return {
			code: area.code,
			breakdown: {
				score: coverage >= MIN_COVERAGE && presentWeight ? weighted / presentWeight : null,
				scorePercentile: null as number | null,
				rank: null as number | null,
				ranked: 0,
				parts,
				isPartial: coverage < 1
			} satisfies ScoreBreakdown
		};
	});

	// Rank descending: 1 is the best score. Ties take the same rank, and the next rank skips
	// accordingly ("competition ranking"), so a rank always answers "how many are ahead of me".
	const ordered = scored
		.filter((entry) => entry.breakdown.score !== null)
		.sort((a, b) => (b.breakdown.score as number) - (a.breakdown.score as number));

	ordered.forEach((entry, index) => {
		const previous = ordered[index - 1];

		entry.breakdown.rank =
			previous && previous.breakdown.score === entry.breakdown.score
				? (previous.breakdown.rank as number)
				: index + 1;
		entry.breakdown.ranked = ordered.length;
	});

	// `ranked` is a property of the whole set, so unscored areas carry it too — their panel still
	// says what they were measured against.
	for (const entry of scored) entry.breakdown.ranked = ordered.length;

	// One more ranking pass, over the scores themselves — see `scorePercentile`. Reuses the same
	// tie and null handling as the per-indicator ranks, so 1st of 304 is exactly 100.
	const spread = percentileRanks(
		scored.map((entry) => entry.breakdown.score),
		true
	);

	scored.forEach((entry, index) => {
		entry.breakdown.scorePercentile = spread[index];
	});

	return new Map(scored.map((entry) => [entry.code, entry.breakdown]));
}

/**
 * The seven-step diverging palette every choropleth on this page uses, weak → strong.
 *
 * Applied to a **percentile**, not to a raw figure, and binned into equal sevenths of the
 * percentile range — so each colour holds a seventh of the areas by construction, whichever
 * indicator is on screen. That is what lets one palette serve six indicators on wildly
 * different units plus the composite score, and what makes the legend's bin edges honest.
 *
 * Direction is already handled upstream: `percentileRanks` flips for `higherIsBetter: false`,
 * so an unemployment rate's red end is its high end without anything here knowing that.
 *
 * Green through yellow to red rather than the site's older green–grey–red: on this page the
 * midpoint is "middling", which is a verdict rather than an absence, and yellow is the idiom
 * every reader already knows for it. Each arm stays monotone in lightness out from the yellow,
 * which is what keeps magnitude legible under red–green colour blindness.
 */
export const SCORE_PALETTE = [
	'#c2453b',
	'#e06d4a',
	'#f3a862',
	'#f7d97f',
	'#cfdc7a',
	'#8fc06a',
	'#4a9a5c'
] as const;

/**
 * Colour for a percentile, 0–100. Areas with no figure are hatched rather than given a flat
 * grey — see the `no-data` pattern in the map — so this returns the hatch's backing colour for
 * null and callers switch to the pattern themselves.
 *
 * @param percentile A `ScorePart.percentile`, or `ScoreBreakdown.scorePercentile` for the
 *   composite — never a raw `score`, which is a mean of ranks and clusters centrally.
 */
export function percentileColor(percentile: number | null): string {
	if (percentile === null) return NO_DATA_COLOR;

	return SCORE_PALETTE[Math.min(6, Math.floor((percentile / 100) * 7))];
}

/**
 * Where a figure would sit in a distribution it is not part of — how Finland's national figure
 * is placed among the 308 municipalities without competing with them.
 *
 * Kept separate from `percentileRanks` on purpose: the national figure is not a 309th area, and
 * folding it in would shift every municipality's rank by its presence. Everywhere the result is
 * shown it carries an "≈" for the same reason.
 *
 * @returns `rank` counts the areas strictly better, plus one; `percentile` is the share of areas
 *   this figure is at least as good as, 0–100. Null for both when there is nothing to place, or
 *   nothing to place it among.
 */
export function placeValue(
	values: (number | null)[],
	value: number | null,
	higherIsBetter: boolean
): { percentile: number | null; rank: number | null; ranked: number } {
	const known = values.filter((v): v is number => v !== null);

	if (value === null || known.length === 0) {
		return { percentile: null, rank: null, ranked: known.length };
	}

	const better = known.filter((v) => (higherIsBetter ? v > value : v < value)).length;

	return {
		percentile: ((known.length - better) / known.length) * 100,
		rank: better + 1,
		ranked: known.length
	};
}
