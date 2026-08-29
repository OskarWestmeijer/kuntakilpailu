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
npm run data:fixtures   # the map has no figures without this — see below
npm run dev             # http://localhost:5173
npm run build           # -> build/
npm run preview
```

| Command                           | What                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| `npm run data:fixtures`           | copy `data/fixtures` into `static/data`                      |
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

## The statistics are not in this repo

`static/data/` is build output, and gitignored. `scripts/fetch_statfi.py` pulls the six tables
from Statistics Finland's PxWeb API into it. Standard library only — no venv, no pip.

```sh
python3 scripts/fetch_statfi.py --dry-run --verbose   # show what would change
python3 scripts/fetch_statfi.py                       # write static/data
python3 -m unittest discover -s scripts -p 'test_*.py'
```

It validates every response before writing and exits non-zero without touching the existing
files if anything looks wrong, so a bad upstream release fails loudly rather than blanking the
map. `manifest.json` records, per file, what period the figures describe, when Statistics
Finland published them, and when we last asked — the last of which is the "polled" date the page
shows.

**`data/fixtures/` is a frozen copy**, and the one set of figures that _is_ committed. It is what
`npm run data:fixtures` puts into `static/data`, which is how a fresh clone gets a working map and
how the e2e suite gets a vintage that never moves — `playwright/compare.spec.ts` asserts exact
numbers (Pirkkala at 89,5, rank 4 of 304), and against live data those would rot within the month.
`playwright.config.ts` seeds the fixtures before every e2e build for exactly that reason, so the
suite ignores whatever you last fetched by hand.

Moving the frozen vintage forward is deliberate — `python3 scripts/fetch_statfi.py --out
data/fixtures`, with the revised `compare.spec.ts` assertions in the same commit.

## Deployment

`.github/workflows/deploy.yml` publishes through the official GitHub Pages actions, on every push
to `main` and **daily at 07:17 UTC**. The scheduled run is the data refresh: it runs the fetch
script, and the build packages what that wrote into the artifact it uploads. So the figures move
without a commit, and a deploy is the only thing that moves them.

If Statistics Finland is down or returns something the validator rejects, the script exits
non-zero and the job stops before the build. Pages goes on serving the last successful deploy —
yesterday's figures stay up rather than being replaced by an empty map — and the run goes red.

The build sets `BASE_PATH=/kuntakilpailu`, since Pages serves the repo from a project sub-path;
everything else — dev, preview, the e2e suite — runs at `/`.

One-time setup on a fresh repo: **Settings → Pages → Source → GitHub Actions**. Note that GitHub
disables a workflow schedule after 60 days without repo activity; it emails first, and
`workflow_dispatch` is still there.

## Data sources

All from [Statistics Finland](https://stat.fi) (PxWeb API), licensed CC BY 4.0. Municipality and
region geometries are from the same source, generalised to 2 km (whole country), 500 m (regions)
and 20 m (Tampere metro).
