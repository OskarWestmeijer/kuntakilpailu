/**
 * Reading one indicator's column off a scored municipality.
 *
 * The composite score and the six domains are one list in the UI — the rail, the map, the detail
 * card and both tables all address them by the same key — but they live in different places on
 * `ScoreBreakdown`: the score has its own `score`/`scorePercentile`/`rank` fields, while each
 * domain is a `ScorePart`. These four functions are the seam, so no component has to know that.
 */

import { metaFor, type CompareArea } from '$lib/interactive/liveData';
import type { Lang } from '$lib/interactive/format';

export const SCORE_KEY = 'score';

/** 0–100, or null where this municipality has no figure (or no score at all). */
export function percentileOf(area: CompareArea, key: string): number | null {
	if (key === SCORE_KEY) return area.score.scorePercentile;

	return area.score.parts.find((part) => part.key === key)?.percentile ?? null;
}

/** Position and denominator. The denominator differs per indicator — four municipalities
 *  publish no unemployment rate — which is why it travels with the rank. */
export function rankingOf(area: CompareArea, key: string): { rank: number | null; ranked: number } {
	if (key === SCORE_KEY) return { rank: area.score.rank, ranked: area.score.ranked };

	const part = area.score.parts.find((entry) => entry.key === key);

	return { rank: part?.rank ?? null, ranked: part?.ranked ?? 0 };
}

/** The number the reader sees — not always the number the score ranks. See `CompareArea.balance`. */
export function figureOf(area: CompareArea, key: string): number | null {
	return metaFor(key).figureOf(area);
}

/** That number, rendered in the active language. */
export function figureText(area: CompareArea, key: string, lang: Lang): string {
	return metaFor(key).display(figureOf(area, key), lang);
}

/**
 * The municipalities that have a figure for this indicator, best first.
 *
 * Sorted on rank rather than on the raw value so ties keep the shared position `score.ts` gave
 * them, and so "lower is better" needs no special case here.
 */
export function ranked(areas: CompareArea[], key: string): CompareArea[] {
	return areas
		.filter((area) => rankingOf(area, key).rank !== null)
		.slice()
		.sort((a, b) => (rankingOf(a, key).rank as number) - (rankingOf(b, key).rank as number));
}

/**
 * The six inner edges of the legend's seven bins, as raw values.
 *
 * Septiles of the published figures, to match how `percentileColor` bins the percentile: the
 * strip's colours and the numbers under it then describe the same cut points. Reversed for a
 * "lower is better" indicator, so the strip always reads weak on the left.
 */
export function binEdges(areas: CompareArea[], key: string, higherIsBetter: boolean): number[] {
	const values = areas
		.map((area) => figureOf(area, key))
		.filter((value): value is number => value !== null)
		.sort((a, b) => a - b);

	if (values.length === 0) return [];

	const edges = [];

	for (let i = 1; i < 7; i += 1) edges.push(values[Math.floor((i / 7) * values.length)]);

	return higherIsBetter ? edges : edges.reverse();
}

/** Prefix-then-substring over Finnish and Swedish names, capped like the design's dropdown. */
export function searchAreas(areas: CompareArea[], query: string, limit = 8): CompareArea[] {
	const q = query.trim().toLowerCase();

	if (!q) return [];

	const starts = (value: string | null) => !!value && value.toLowerCase().startsWith(q);
	const contains = (value: string | null) => !!value && value.toLowerCase().includes(q);

	const prefix = areas.filter((area) => starts(area.name) || starts(area.nameSwedish));
	const rest = areas.filter(
		(area) => !prefix.includes(area) && (contains(area.name) || contains(area.nameSwedish))
	);

	return [...prefix, ...rest].slice(0, limit);
}
