/**
 * The FI/EN dictionary and the language the page is currently in.
 *
 * Finnish is the default: this is a site about Finnish municipalities, its brand is a Finnish
 * word, and every place name on it is Finnish already. The choice is remembered in
 * `localStorage` beside the theme, and `src/app.html` reads it back before first paint so the
 * page doesn't render in one language and swap to the other.
 *
 * Copy lives here rather than beside each component so that adding a language is one more
 * object, and so a missing key is a type error rather than a blank on screen. Indicator names,
 * descriptions and group headings are the exception — they belong with the indicator
 * definitions in `liveData.ts`, next to the figures they describe.
 */

import type { Lang } from './interactive/format';

export type { Lang };

export const LANG_STORAGE_KEY = 'kuntakilpailu-lang';
export const DEFAULT_LANG: Lang = 'fi';

/** Every string the chrome needs. Ported from the design handoff's `kk-core.js` dictionary. */
const COPY = {
	fi: {
		tagline: 'Suomen kunnat vertailussa',
		search: 'Etsi kuntaa…',
		searchLabel: 'Etsi kuntaa',
		noMatches: 'Ei osumia',
		language: 'Kieli',

		indicator: 'Mittari',
		indicatorNote: 'Kaikki mittarit lasketaan kokonaispisteisiin.',

		map: 'Kartta',
		table: 'Taulukko',
		legendLow: 'heikko',
		legendHigh: 'vahva',
		zoomIn: 'Lähennä',
		zoomOut: 'Loitonna',
		recenter: 'Koko maa',

		detail: 'Kunnan tiedot',
		pick: 'Valitse kunta kartalta tai taulukosta.',
		clear: 'Tyhjennä valinta',
		finland: 'Suomi',
		finlandRef: 'koko maa vertailukohtana',

		rank: 'Sija',
		name: 'Kunta',
		population: 'Väkiluku',
		noData: 'ei tietoa',
		noScore: 'ei pisteitä',
		unranked: 'sijoittamatta',

		panel: 'Sijoitukset',
		close: 'Sulje',
		dataUnavailable: 'Tietoja ei saatavilla',
		polled: 'haettu',
		boundaries: 'Rajat: Maanmittauslaitos',
		source: 'Lähde',
		sourceLabel: 'Julkaisija',
		periodLabel: 'Ajanjakso',
		published: 'Julkaistu'
	},
	en: {
		tagline: 'Finnish municipalities compared',
		search: 'Search municipality…',
		searchLabel: 'Search municipality',
		noMatches: 'No matches',
		language: 'Language',

		indicator: 'Indicator',
		indicatorNote: 'Every indicator counts towards the score.',

		map: 'Map',
		table: 'Table',
		legendLow: 'weak',
		legendHigh: 'strong',
		zoomIn: 'Zoom in',
		zoomOut: 'Zoom out',
		recenter: 'Whole country',

		detail: 'Municipality',
		pick: 'Pick a municipality on the map or in the table.',
		clear: 'Clear selection',
		finland: 'Finland',
		finlandRef: 'whole country as reference',

		rank: 'Rank',
		name: 'Municipality',
		population: 'Population',
		noData: 'no data',
		noScore: 'no score',
		unranked: 'unranked',

		panel: 'Rankings',
		close: 'Close',
		dataUnavailable: 'Live figures unavailable',
		polled: 'polled',
		boundaries: 'Boundaries: National Land Survey',
		source: 'Source',
		sourceLabel: 'Publisher',
		periodLabel: 'Period',
		published: 'Published'
	}
} as const satisfies Record<Lang, Record<string, string>>;

export type CopyKey = keyof (typeof COPY)['fi'];

let current = $state<Lang>(DEFAULT_LANG);

/** The active language. Assigning to `.value` persists it and updates `<html lang>`. */
export const lang = {
	get value(): Lang {
		return current;
	},
	set value(next: Lang) {
		current = next;

		if (typeof document === 'undefined') return;

		document.documentElement.lang = next;

		try {
			localStorage.setItem(LANG_STORAGE_KEY, next);
		} catch {
			// Private browsing, or storage disabled. The choice just doesn't outlive the tab.
		}
	}
};

/** Reads back what `src/app.html` already applied, so the two can't disagree after hydration. */
export function restoreLang(): void {
	if (typeof document === 'undefined') return;

	current = document.documentElement.lang === 'en' ? 'en' : DEFAULT_LANG;
}

/** One string, in the active language. Reactive — it reads the `lang` rune. */
export function t(key: CopyKey): string {
	return COPY[current][key];
}

/** The map's accessible name: "Kokonaispisteet kunnittain" / "Score by municipality". */
export function mapLabel(indicator: string): string {
	return current === 'fi' ? `${indicator} kunnittain` : `${indicator} by municipality`;
}

/** "308 kuntaa" / "308 municipalities" — a count, so it can't be a static dictionary entry. */
export function municipalityCount(n: number): string {
	return current === 'fi' ? `${n} kuntaa` : `${n} municipalities`;
}

/**
 * "11. / 308" — a rank against how many areas were ranked on that indicator. The denominator
 * varies per indicator (four municipalities publish no unemployment rate), which is why it's
 * printed per row rather than once in a header.
 */
export function rankOf(rank: number | null, ranked: number): string {
	if (rank === null) return current === 'fi' ? `— / ${ranked}` : `— / ${ranked}`;

	return `${rank}. / ${ranked}`;
}
