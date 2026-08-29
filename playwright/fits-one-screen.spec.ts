import { expect, test, type Page } from '@playwright/test';

// The page is meant to sit in a single viewport on a desktop screen: no vertical scrollbar,
// and the search box + rail visible without scrolling. The budget is `100dvh` (see `app.css`),
// which is what lets the header be the only thing that ever competes with the grid for height —
// so anything added around the grid has to be paid for there, and this is what catches
// forgetting to.
const desktops = [
	{ name: '1280x720 (small laptop)', width: 1280, height: 720 },
	{ name: '1440x900 (macbook)', width: 1440, height: 900 },
	{ name: '1920x1080 (desktop)', width: 1920, height: 1080 }
];

async function expectFitsOneScreen(page: Page) {
	// Measure only once the figures have arrived from /data/ — a panel full of em dashes is
	// shorter than one full of numbers, so measuring mid-fetch would let real overflow past. The
	// rail's "Lähde" button only renders once the sources are known, in both map and table mode,
	// which makes it the signal.
	await expect(
		page.getByRole('navigation', { name: 'Mittari' }).getByRole('button', { name: 'Lähde' })
	).toBeVisible();

	const overflow = await page.evaluate(
		() => document.documentElement.scrollHeight - window.innerHeight
	);

	expect(overflow, `page overflows viewport by ${overflow}px`).toBeLessThanOrEqual(0);

	// The document not overflowing is necessary but not sufficient: the side panel is a fixed
	// `100dvh` column, so a list card taller than it spills *over* the bottom without making the
	// page any taller — the rows at the bottom are simply cut off, silently. Measuring the list
	// card against `main` is what catches that; the card scrolls internally instead.
	const spill = await page.evaluate(() => {
		const card = document.querySelector('main aside section.list-card');
		const main = document.querySelector('main');

		if (!card || !main) throw new Error('list card or main not found');

		return Math.round(card.getBoundingClientRect().bottom - main.getBoundingClientRect().bottom);
	});

	expect(spill, `list card spills ${spill}px past the map area`).toBeLessThanOrEqual(0);

	// The search box and the indicator rail are the things most likely to be pushed below the
	// fold — the rail because it is the leftmost, tallest column.
	await expect(page.getByPlaceholder('Etsi kuntaa…')).toBeInViewport();
	await expect(page.getByRole('navigation', { name: 'Mittari' })).toBeInViewport();
}

for (const size of desktops) {
	test(`the page fits one screen at ${size.name}`, async ({ page }) => {
		await page.setViewportSize({ width: size.width, height: size.height });
		await page.goto('./');

		await expectFitsOneScreen(page);

		// Table mode drops the map and widens the list card to seven columns of figures — a
		// differently-shaped layout, checked separately since switching is a client-side toggle
		// rather than a full page reload that would already be covered above.
		await page.getByRole('button', { name: 'Taulukko', exact: true }).click();
		await expectFitsOneScreen(page);
	});
}
