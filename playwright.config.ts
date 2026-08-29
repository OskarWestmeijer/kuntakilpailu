import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		// The fixtures go in first, every run: `static/data` is gitignored build output, so it is
		// either absent on a fresh clone or holding whatever was last fetched by hand. Seeding it
		// pins the vintage `compare.spec.ts` asserts against.
		command: 'npm run data:fixtures && npm run build && npm run preview',
		port: 4173
	},
	testDir: 'playwright'
});
