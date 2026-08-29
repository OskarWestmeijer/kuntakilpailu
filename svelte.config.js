import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: undefined,
			precompress: false,
			strict: true
		}),

		// GitHub Pages serves this repo from a project sub-path, so the built site has to know
		// it lives under `/kuntakilpailu`. Env-driven rather than hardcoded: `vite dev`, `vite
		// preview` and the Playwright suite all run at the root, and the deploy workflow is the
		// only thing that sets BASE_PATH. `liveData.ts` already reads `base` from `$app/paths`
		// for its `/data/` fetches; everything else is a bundled asset that Vite rebases itself.
		paths: { base: process.env.BASE_PATH ?? '' }
	}
};

export default config;
