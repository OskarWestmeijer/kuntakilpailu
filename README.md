# kuntakilpailu

One score per Finnish municipality, built from six Statistics Finland registers: unemployment,
population change, median income, higher education, average age and gender balance.

Each indicator is turned into a percentile rank — how many municipalities it beats — and the
score is the mean of those ranks. Ranking rather than scaling keeps one extreme value from
squashing everything else. Any category can be switched out of the score, and the map re-ranks
without refetching anything. All 308 municipalities, the 19 maakunnat, and the Tampere metro
area sit behind three tabs.

Live at **https://oskarwestmeijer.github.io/kuntakilpailu/**.

The page was originally one of seven maps in [`maps`](https://github.com/OskarWestmeijer/maps),
which still hosts its own copy.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # -> build/
npm run preview
```

| Command                           | What                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| `npm run check`                   | `svelte-check` over the whole project                        |
| `npm run lint` / `npm run format` | Prettier                                                     |
| `npm run test:unit -- --run`      | vitest (node) — the parsers, the scoring, the fetch-and-join |
| `npm run test:e2e`                | Playwright — builds, previews, drives the real page          |
| `npm test`                        | both                                                         |

## How the page is put together

Two halves, on purpose:

- **Geometry, at build time.** `src/routes/+page.server.ts` reads the three GeoJSON files under
  `src/lib/interactive/`, projects them to SVG paths, and works out which municipality falls in
  which maakunta (a point-in-polygon job — one of the tables has no region rows). That runs once,
  during `npm run build`, and is baked into the prerendered HTML. The GeoJSON never ships.
- **Figures, at page load.** `src/lib/interactive/liveData.ts` fetches the six PxWeb exports from
  `/data/` in the browser and joins them onto that geometry. So refreshing the numbers is a
  matter of overwriting files in `static/data`, with no code change — and the map's null state
  (outline shapes, em-dashed figures) is also its loading state.

The site is fully prerendered (`adapter-static`, `prerender = true`) and has no server.

## Refreshing the statistics

`scripts/fetch_statfi.py` pulls the six tables from Statistics Finland's PxWeb API. Standard
library only — no venv, no pip.

```sh
python3 scripts/fetch_statfi.py --dry-run --verbose   # show what would change
python3 scripts/fetch_statfi.py                       # rewrite static/data
python3 -m unittest discover -s scripts -p 'test_*.py'
```

It validates every response before writing and exits non-zero without touching the existing
files if anything looks wrong, so a bad upstream release fails loudly rather than blanking the
map. `manifest.json` records, per file, what period the figures describe, when Statistics
Finland published them, and when we last asked — the last of which is the "polled" date the page
shows.

There is no scheduled refresh yet: because the site is served from GitHub Pages there is no host
to run the script on, so what it writes has to be committed. Note that `playwright/compare.spec.ts`
asserts exact figures against the committed data vintage, so a refresh will want those revisited.

## Deployment

`.github/workflows/deploy.yml` builds on every push to `main` and publishes through the official
GitHub Pages actions. The build sets `BASE_PATH=/kuntakilpailu`, since Pages serves the repo from
a project sub-path; everything else — dev, preview, the e2e suite — runs at `/`.

One-time setup on a fresh repo: **Settings → Pages → Source → GitHub Actions**.

## Data sources

All from [Statistics Finland](https://stat.fi) (PxWeb API), licensed CC BY 4.0. Municipality and
region geometries are from the same source, generalised to 2 km (whole country), 500 m (regions)
and 20 m (Tampere metro).
