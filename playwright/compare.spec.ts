import { expect, test } from '@playwright/test';

/**
 * The page as a whole: the rail picks an indicator, the map and both lists follow it, and the
 * detail card explains one municipality.
 *
 * Nothing here is a published figure — every number is derived from the six exports at page
 * load — so these assertions double as the end-to-end check that the formula in `score.ts`
 * survives the fetch, the join and the render. They run against `data/fixtures`, a vintage that
 * does not move (`playwright.config.ts` seeds it before every build), which is what lets them
 * name exact numbers.
 *
 * The page defaults to Finnish; the tests that aren't about language stay in it.
 */

test('every municipality is drawn, and the ranking leads with the best of them', async ({
	page
}) => {
	await page.goto('./');

	const map = page.getByRole('img', { name: 'Kokonaispisteet kunnittain' });
	await expect(map.getByRole('button')).toHaveCount(308);

	const panel = page.getByRole('complementary');
	await expect(panel.getByText('308 kuntaa')).toBeVisible();

	// Best first, on the composite score. 304 of 308 are scored — the other four publish no
	// unemployment rate, and the coverage floor leaves them out rather than scoring them on five.
	await expect(panel.getByRole('row').nth(2)).toContainText('Mustasaari');
	await expect(panel.getByRole('row').nth(2)).toContainText('90,0');
	await expect(panel.getByRole('row').nth(5)).toContainText('Pirkkala');
});

test('the detail card shows every indicator, its figure and its rank', async ({ page }) => {
	await page.goto('./');

	const panel = page.getByRole('complementary');

	// Pirkkala: 9,5 % unemployment (113th of the 304 that publish one — lower is better),
	// +1,5 % population change (7th), 34 886 € (13th), 44,6 % with a degree (4th), a mean age of
	// 41,3 (18th) and 49,8 % men (39th), for a score of 89,5 and 4th of the 304 scored.
	await page.getByRole('button', { name: /^Pirkkala,/ }).click();

	await expect(panel.getByRole('heading', { name: 'Pirkkala' })).toBeVisible();
	// The Swedish name, the headcount and the land area — all three from outside the exports.
	await expect(panel.getByText(/Birkala · 21 373 asukasta · 81 km²/)).toBeVisible();

	const row = (name: string) => panel.locator('.statrow').filter({ hasText: name });

	await expect(row('KOKONAISPISTEET')).toContainText('89,5');
	await expect(row('KOKONAISPISTEET')).toContainText('4. / 304');
	await expect(row('TYÖTTÖMYYSASTE')).toContainText('9,5 %');
	await expect(row('TYÖTTÖMYYSASTE')).toContainText('113. / 304');
	await expect(row('VÄESTÖNMUUTOS')).toContainText('+1,5 %');
	await expect(row('MEDIAANITULOT')).toContainText('34 886 €');
	await expect(row('KORKEAKOULUTETUT')).toContainText('44,6 %');
	await expect(row('KESKI-IKÄ')).toContainText('41,3 v');
	// The share of men, not the distance from parity the score actually ranks.
	await expect(row('MIESTEN OSUUS')).toContainText('49,8 %');
});

test('a municipality missing an indicator is left unscored, not scored on the rest', async ({
	page
}) => {
	await page.goto('./');

	const panel = page.getByRole('complementary');

	// The regression the coverage floor exists to prevent. Föglö's unemployment rate is
	// suppressed; on its population change alone it would rank near the top of the country.
	await page.getByRole('button', { name: /^Föglö,/ }).click();

	await expect(panel.getByRole('heading', { name: 'Föglö' })).toBeVisible();

	const row = (name: string) => panel.locator('.statrow').filter({ hasText: name });

	await expect(row('KOKONAISPISTEET')).toContainText('ei pisteitä');
	// No rank either, since a rank counts only the areas that have a figure.
	await expect(row('TYÖTTÖMYYSASTE')).toContainText('ei tietoa');
	// The figures it does have are still shown.
	await expect(row('VÄESTÖNMUUTOS')).toContainText('%');

	// And it is hatched on the map, like every other area with no figure.
	await expect(page.getByRole('button', { name: /^Föglö,/ })).toHaveAttribute(
		'fill',
		'url(#no-data)'
	);
});

test('municipalities are coloured from the palette, weak through to strong', async ({ page }) => {
	await page.goto('./');

	const fill = (name: string) =>
		expect(page.getByRole('button', { name: new RegExp(`^${name},`) })).toHaveAttribute(
			'fill',
			/^#/
		);

	await fill('Mustasaari');
	await fill('Tampere');

	// Equal sevenths of the percentile, so rank 1 takes the deepest green and the bottom the
	// deepest red — whatever the indicator's own units are.
	await expect(page.getByRole('button', { name: /^Mustasaari,/ })).toHaveAttribute(
		'fill',
		'#4a9a5c'
	);
});

test('Finland is pinned in the ranking as a reference, never as a competitor', async ({ page }) => {
	await page.goto('./');

	const panel = page.getByRole('complementary');
	const finland = panel.getByRole('row').filter({ hasText: 'Suomi' });

	await expect(finland).toContainText('5 652 881');
	await expect(finland).toContainText('68,9');
	// "≈" throughout: the national figure is placed among the municipalities, not ranked with
	// them, so the first municipality is still 1st rather than 2nd.
	await expect(finland).toContainText('≈');
	await expect(panel.getByRole('row').nth(2)).toContainText('Mustasaari');
	await expect(panel.getByRole('row').nth(2)).toContainText('1');
});

test('the rail switches which indicator the map, legend and ranking are about', async ({
	page
}) => {
	await page.goto('./');

	const panel = page.getByRole('complementary');

	await page.getByRole('button', { name: 'Työttömyysaste', exact: true }).click();

	await expect(page.getByRole('heading', { name: 'Työttömyysaste' })).toBeVisible();
	await expect(page.getByText('Työttömien työnhakijoiden osuus työvoimasta.')).toBeVisible();
	await expect(page.getByRole('img', { name: 'Työttömyysaste kunnittain' })).toBeVisible();

	// Re-sorted, best first — and best is the *lowest* rate, since less is better here.
	await expect(panel.getByRole('row').nth(2)).toContainText('Luoto');
	await expect(panel.getByRole('row').nth(2)).toContainText('2,5 %');

	// The score's own ranking is undisturbed underneath: switching back restores it.
	await page.getByRole('button', { name: 'Kokonaispisteet', exact: true }).click();
	await expect(panel.getByRole('row').nth(2)).toContainText('Mustasaari');
});

test('the table shows every indicator at once and sorts on any of them', async ({ page }) => {
	await page.goto('./');

	const panel = page.getByRole('complementary');

	await panel.getByRole('button', { name: 'Taulukko', exact: true }).click();

	// The map column is dropped entirely — seven columns of figures need the width more.
	await expect(page.getByRole('img', { name: /kunnittain/ })).toHaveCount(0);
	await expect(panel.getByRole('row').nth(2)).toContainText('Mustasaari');

	await panel.getByRole('button', { name: /^Mediaanitulot/ }).click();
	await expect(panel.getByRole('row').nth(2)).toContainText('Kauniainen');

	// A second click on the same column reverses it.
	await panel.getByRole('button', { name: /^Mediaanitulot/ }).click();
	await expect(panel.getByRole('row').nth(2)).not.toContainText('Kauniainen');
});

test('picking a municipality anywhere selects it everywhere', async ({ page }) => {
	await page.goto('./');

	const panel = page.getByRole('complementary');

	// From the ranking list...
	await panel.getByRole('button', { name: 'Lieto', exact: true }).click();
	await expect(panel.getByRole('heading', { name: 'Lieto' })).toBeVisible();
	await expect(page.getByRole('button', { name: /^Lieto,/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	// ...and from the search box, which matches Swedish names too.
	await page.getByRole('combobox').fill('Korsholm');
	await page.getByRole('option', { name: /Mustasaari/ }).click();
	await expect(panel.getByRole('heading', { name: 'Mustasaari' })).toBeVisible();

	// Escape clears it, and the map stops dimming everything else.
	await page.keyboard.press('Escape');
	await expect(panel.getByText('Valitse kunta kartalta tai taulukosta.')).toBeVisible();
});

test('the map zooms to a selection and back out again', async ({ page }) => {
	await page.goto('./');

	const map = page.getByRole('img', { name: 'Kokonaispisteet kunnittain' });
	const viewBox = async () => (await map.getAttribute('viewBox')) ?? '';

	const whole = await viewBox();

	await page.getByRole('button', { name: /^Pirkkala,/ }).click();
	// The flight is eased over 450ms, so wait for it to land rather than for a fixed delay.
	await expect
		.poll(async () => Number((await viewBox()).split(' ')[2]))
		.toBeLessThan(Number(whole.split(' ')[2]) / 2);

	await page.getByRole('button', { name: 'Koko maa' }).click();
	await expect.poll(viewBox).toBe(whole);
});

test('the whole page swaps language, figures included', async ({ page }) => {
	await page.goto('./');

	await page.getByRole('button', { name: 'EN', exact: true }).click();

	await expect(page.getByRole('heading', { name: 'Score' })).toBeVisible();
	await expect(page.getByText('Finnish municipalities compared')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Higher education', exact: true })).toBeVisible();

	const panel = page.getByRole('complementary');
	await expect(panel.getByText('308 municipalities')).toBeVisible();

	// Decimal point rather than comma, and the reference row is "Finland".
	await expect(panel.getByRole('row').nth(2)).toContainText('90.0');
	await expect(panel.getByRole('row').filter({ hasText: 'Finland' })).toContainText('68.9');

	// `<html lang>` follows, so a screen reader switches voice with the copy.
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
