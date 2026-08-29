/**
 * Number formatting for the page's panels, in both languages.
 *
 * Done by hand rather than with `toLocaleString` on purpose: these strings are prerendered
 * in Node and then hydrated in the browser, and ICU group separators differ between the two
 * builds — a locale-formatted figure risks a hydration mismatch.
 *
 * Only the decimal separator actually differs between Finnish and English. Thousands stay
 * thin-space grouped in both: it is the site's existing device, and it sidesteps the trap where
 * `1,234` means one thing to a Finnish reader and another to an English one.
 */

export type Lang = 'fi' | 'en';

/** The one thing that differs by language. */
function decimalSeparator(lang: Lang): string {
	return lang === 'fi' ? ',' : '.';
}

/** Thin-space grouped integer, or an em dash when the figure isn't published. */
export function count(value: number | null): string {
	return value === null ? '—' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function percent(value: number | null, lang: Lang = 'fi'): string {
	return value === null ? 'no data' : `${decimal(value, 1, lang)} %`;
}

/**
 * One decimal by default, grouped integer part. Used for figures running from 0,2 to 3 236,1 —
 * four orders of magnitude, so the grouping earns its keep.
 */
export function decimal(value: number | null, digits = 1, lang: Lang = 'fi'): string {
	if (value === null) return '—';

	const [whole, fraction] = value.toFixed(digits).split('.');

	// `digits: 0` leaves no fractional part to join on — without this it renders "3,undefined".
	// Used for percentiles, where a decimal place would be false precision.
	return fraction === undefined
		? count(Number(whole))
		: `${count(Number(whole))}${decimalSeparator(lang)}${fraction}`;
}

/** Always signed, with a real minus sign — so a pair of them reads as one scale. */
export function signed(value: number | null): string {
	if (value === null) return '—';

	return `${value > 0 ? '+' : value < 0 ? '−' : ''}${count(Math.abs(value))}`;
}

/** A signed decimal — the shape a change figure takes. Real minus, explicit plus. */
export function signedDecimal(value: number | null, digits = 1, lang: Lang = 'fi'): string {
	if (value === null) return '—';

	const sign = value > 0 ? '+' : value < 0 ? '−' : '';

	return `${sign}${decimal(Math.abs(value), digits, lang)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "2026-08-11T05:31:04Z" -> "11 Aug 2026" in English, "11.8.2026" in Finnish. Empty for anything
 * unparseable, so a malformed or missing manifest drops the date rather than rendering
 * "Invalid Date".
 *
 * Hand-rolled like everything else here, and deliberately reading the string rather than
 * constructing a `Date`: the timestamp is a UTC instant, and a local-timezone `Date` would
 * shift it across a day boundary for anyone west of Greenwich.
 */
export function formatDate(iso: string | null | undefined, lang: Lang = 'en'): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');

	if (!match) return '';

	const day = Number(match[3]);
	const monthNumber = Number(match[2]);

	if (monthNumber < 1 || monthNumber > 12) return '';

	return lang === 'fi'
		? `${day}.${monthNumber}.${match[1]}`
		: `${day} ${MONTHS[monthNumber - 1]} ${match[1]}`;
}

/**
 * Joins the provenance fragments under the map — publisher, periods, poll date — skipping
 * whichever aren't known yet. Before the live figures land, only the ones that come from the
 * page itself are present, and the separators must not be left dangling.
 */
export function sourceLine(...parts: (string | null | undefined)[]): string {
	return parts.filter((part) => part).join(' · ');
}

/**
 * "2026M06" -> "2026/06"; an annual period like "2025" is already in its final form.
 *
 * Numeric rather than a month name, which is what lets one provenance line serve both
 * languages — and it drops the `toLocaleString` call this module's own header warns against.
 */
export function formatPeriod(period: string): string {
	const match = /^(\d{4})M(\d{2})$/.exec(period);

	return match ? `${match[1]}/${match[2]}` : period;
}
