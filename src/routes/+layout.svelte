<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.ico';
	import github from '$lib/assets/github.svg';
	import ThemeToggle from '$lib/ThemeToggle.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<!-- Imported rather than written as `/favicon.ico`: the site is served from a project
	     sub-path on GitHub Pages, and a bundled asset carries the base path with it. -->
	<link rel="icon" href={favicon} />
</svelte:head>

<!--
	Flex column wrapper. Its height is what `MapShell`'s `--map-chrome` fallback (9.5rem) is
	measured against — navbar plus footer — so changing the size of either owes the map that
	variable. `fits-one-screen.spec.ts` is what catches it if you don't.
-->
<div class="flex min-h-screen flex-col bg-base-100">
	<!-- Navbar -->
	<div class="navbar bg-secondary text-white shadow-sm">
		<div class="navbar-start">
			<span
				class="display-wide btn rounded-lg btn-ghost text-lg font-bold text-white hover:bg-transparent"
			>
				&#9878;&#65039; Kuntakilpailu
			</span>
		</div>
		<div class="navbar-end gap-2">
			<ThemeToggle />
			<div class="mobile-hide">
				<a
					href="https://github.com/OskarWestmeijer/kuntakilpailu"
					aria-label="Oskar Westmeijer Github kuntakilpailu repository"
				>
					<button class="btn rounded-lg border-white/15 bg-white/10 text-white hover:bg-white/20">
						<img alt="Github logo" class="size-6 invert" src={github} />
					</button>
				</a>
			</div>
		</div>
	</div>

	<!-- Main grows to push footer down -->
	<main class="flex-grow">
		{@render children?.()}
	</main>

	<!-- Footer -->
	<footer class="footer footer-center py-6">
		<a href="https://oskar-westmeijer.com" class="text-base">
			Created by Oskar Westmeijer 🐨 2026
		</a>
	</footer>
</div>
