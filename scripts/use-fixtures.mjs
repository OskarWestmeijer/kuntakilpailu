// Put the frozen PxWeb exports where the browser expects them.
//
// `static/data` is build output, not source: the deploy workflow fills it by running
// `fetch_statfi.py`, and it is gitignored. So a fresh clone has no figures at all, and this
// copies in the frozen set from `data/fixtures` instead.
//
// Playwright runs it before every e2e build (see `playwright.config.ts`), which is what lets
// `compare.spec.ts` assert exact figures — they are asserted against a vintage that never
// moves, rather than whatever was last fetched into the working tree.
//
// `npm run dev` deliberately does *not* run it: it overwrites, and clobbering a developer's
// live fetch on every start would be a surprise.

import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('static/data', { recursive: true });
cpSync('data/fixtures', 'static/data', { recursive: true });

console.log('static/data <- data/fixtures');
