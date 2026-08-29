import { expect, test } from '@playwright/test';

// The map is meant to sit in a single viewport on a desktop screen: no vertical scrollbar,
// and the search box + info button visible without scrolling. The budget is `100dvh` minus
// `--map-chrome` (see `MapShell.svelte`), which here falls back to the navbar + footer height
// because there is no other chrome — so anything added around the map has to be paid for by
// setting that variable, and this is what catches forgetting to.
const desktops = [
	{ name: '1280x720 (small laptop)', width: 1280, height: 720 },
	{ name: '1440x900 (macbook)', width: 1440, height: 900 },
	{ name: '1920x1080 (desktop)', width: 1920, height: 1080 }
];

async function expectFitsOneScreen(page: import('@playwright/test').Page) {
	// Measure only once the figures have arrived from /data/. A panel full of em dashes is
	// shorter than one full of numbers, so measuring mid-fetch would let real overflow past.
	// The period line is blank until the register file lands, which makes it the signal.
	await expect(page.getByText(/^Data from /)).toBeVisible();

	const overflow = await page.evaluate(
		() => document.documentElement.scrollHeight - window.innerHeight
	);

	expect(overflow, `page overflows viewport by ${overflow}px`).toBeLessThanOrEqual(0);

	// The document not overflowing is necessary but not sufficient: the panel column is a fixed
	// `100dvh` box, so a panel taller than it spills *over* the footer without making the page
	// any taller — the figures at the bottom are simply cut off, silently. Measuring the card
	// against `main` is what catches that; the card scrolls internally instead (`MapShell`).
	const spill = await page.evaluate(() => {
		const card = document.querySelector('main aside > div:last-child');
		const main = document.querySelector('main');

		if (!card || !main) throw new Error('panel card or main not found');

		return Math.round(card.getBoundingClientRect().bottom - main.getBoundingClientRect().bottom);
	});

	expect(spill, `info panel spills ${spill}px past the map area`).toBeLessThanOrEqual(0);

	// The search box and Sources popover are the things most likely to be pushed below the fold.
	await expect(page.getByPlaceholder('Search municipality…')).toBeInViewport();
	await expect(page.getByRole('group').filter({ hasText: 'Sources' })).toBeInViewport();
}

for (const size of desktops) {
	test(`the map fits one screen at ${size.name}`, async ({ page }) => {
		await page.setViewportSize({ width: size.width, height: size.height });
		await page.goto('./');

		await expectFitsOneScreen(page);

		// The Tampere view has a differently-shaped panel — check it separately, since switching
		// is a client-side toggle rather than a full page reload that would already be covered
		// above.
		await page.getByRole('tab', { name: 'Tampere Metro' }).click();
		await expectFitsOneScreen(page);
	});
}
