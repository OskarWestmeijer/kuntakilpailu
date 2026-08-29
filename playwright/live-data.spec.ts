import { expect, test, type Page } from '@playwright/test';

// The comparison map reads its figures from /data/ when the page opens, rather than having
// them baked into the prerendered HTML — that is what lets `scripts/fetch_statfi.py` refresh
// them by rewriting a directory. These tests cover the two things that only matter because of that:
// new numbers on disk really do reach the page, and a directory that is missing or broken
// degrades instead of rendering nonsense.
//
// The page defaults to Finnish, so these stay in it — see `compare.spec.ts`.

const REGISTER = '**/data/unemployment_register_kunnat_12r5.json';

/** Serves the real file with one municipality's rate rewritten — a stand-in for a refresh. */
async function serveEditedRegister(page: Page, edit: (payload: RegisterExport) => void) {
	await page.route(REGISTER, async (route) => {
		const response = await route.fetch();
		const payload = (await response.json()) as RegisterExport;

		edit(payload);

		await route.fulfill({ json: payload });
	});
}

type RegisterExport = {
	columns: { code: string; type: string }[];
	data: { key: string[]; values: string[] }[];
};

/** The rate's index is resolved against the content columns only — `values` omits the keys. */
function setRate(payload: RegisterExport, area: string, rate: string) {
	const index = payload.columns
		.filter((c) => c.type === 'c')
		.findIndex((c) => c.code === 'TYOTOSUUS');
	const row = payload.data.find((r) => r.key[0] === area);

	if (!row) throw new Error(`no ${area} row in the register export`);

	row.values[index] = rate;
}

test('a refreshed file on disk changes what the page shows', async ({ page }) => {
	// Rauma reads 10,7 % from the fixture export; pretend a refresh fetched a month where it
	// is 3,1 % instead. Nothing is rebuilt — only the served file differs.
	await serveEditedRegister(page, (payload) => setRate(payload, 'KU684', '3.1'));

	await page.goto('./');

	const panel = page.getByRole('complementary');
	const rauma = page.getByRole('button', { name: /^Rauma,/ });

	// Wait for the figures to land before clicking. A click that arrives before hydration sets
	// no state and is never replayed, so the panel would sit on its no-selection state for the
	// rest of the test — an intermittent failure rather than a consistent one. A real fill colour
	// only appears once the fetch has resolved.
	await expect(rauma).toHaveAttribute('fill', /^#/);
	await rauma.click();

	await expect(panel.getByRole('heading', { name: 'Rauma' })).toBeVisible();
	// The unemployment row carries the published figure, so the new number is visible on its
	// own before anything derived from it is.
	const row = panel.locator('.statrow').filter({ hasText: 'TYÖTTÖMYYSASTE' });
	await expect(row).toContainText('3,1 %');
});

test('the poll date comes from the manifest the script writes', async ({ page }) => {
	await page.route('**/data/manifest.json', (route) =>
		route.fulfill({ json: { polled: '2026-08-11T05:31:04Z' } })
	);

	await page.goto('./');

	// Two different things, deliberately labelled apart: what the figures describe, and when we
	// last asked for them. Both sit behind the rail's "Lähde" button rather than spelled out on
	// the page, so it only renders once the figures — and with them the sources — have loaded.
	const source = page.getByRole('navigation', { name: 'Mittari' }).getByRole('button', {
		name: 'Lähde'
	});
	await expect(source).toBeVisible();
	await source.hover();

	await expect(page.getByText(/haettu 11\.8\.2026/)).toBeVisible();
});

test('a missing manifest drops the poll date instead of showing a placeholder', async ({
	page
}) => {
	await page.route('**/data/manifest.json', (route) => route.fulfill({ status: 404 }));

	await page.goto('./');

	// The figures still load and the source popover still opens...
	const source = page.getByRole('navigation', { name: 'Mittari' }).getByRole('button', {
		name: 'Lähde'
	});
	await source.hover();

	await expect(page.getByText('Tilastokeskus').first()).toBeVisible();
	// ...but with nothing to say when the figures were last polled.
	await expect(page.getByText('haettu')).toHaveCount(0);
});

test('an unreadable data directory leaves an outline map and says so', async ({ page }) => {
	await page.route('**/data/*.json', (route) => route.fulfill({ status: 500 }));

	await page.goto('./');

	const panel = page.getByRole('complementary');

	// The page itself is fine — geometry is baked in, so all 308 municipalities still render.
	const map = page.getByRole('img', { name: 'Kokonaispisteet kunnittain' });
	await expect(map.getByRole('button')).toHaveCount(308);

	// But they're hatched rather than coloured, and the panel says why instead of leaving a
	// screen of em dashes to be read as real data.
	await expect(page.getByRole('button', { name: /^Rauma,/ })).toHaveAttribute(
		'fill',
		'url(#no-data)'
	);
	await expect(panel.getByText('Tietoja ei saatavilla')).toBeVisible();
});

test('one missing file takes the whole score with it', async ({ page }) => {
	// The inverse of how a single-indicator map degrades, and the reason this page checks every
	// period rather than just its own: every table feeds the score, and the coverage floor in
	// `score.ts` means an area missing one category is unscored rather than scored on the rest.
	// So losing the sex export — nothing to do with jobs or income — has to blank the map and
	// say so, not quietly re-rank the country on five categories.
	await page.route('**/data/sex_register_kunnat_11re.json', (route) =>
		route.fulfill({ status: 404 })
	);

	await page.goto('./');

	const panel = page.getByRole('complementary');

	await expect(panel.getByText('Tietoja ei saatavilla')).toBeVisible();
	await expect(page.getByRole('button', { name: /^Rauma,/ })).toHaveAttribute(
		'fill',
		'url(#no-data)'
	);
});
