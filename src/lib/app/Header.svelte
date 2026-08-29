<!--
  The 54px navy bar above everything: brand, search, language, theme.

  It is the page's only chrome — there is no footer and no navigation, because there is only one
  page. The repository link stays from the old navbar so attribution doesn't vanish with it.
-->
<script lang="ts">
	import SearchBox from './SearchBox.svelte';
	import LangToggle from './LangToggle.svelte';
	import ThemeToggle from '$lib/ThemeToggle.svelte';
	import { t } from '$lib/i18n.svelte';
	import type { CompareArea } from '$lib/interactive/liveData';

	type Props = {
		areas: CompareArea[];
		activeKey: string;
		onpick: (area: CompareArea) => void;
		/** Opens the indicator rail's drawer. Only rendered — via CSS — on the narrow layout,
		 *  where the rail leaves the grid and becomes off-canvas; see IndicatorRail.svelte. */
		onmenu?: () => void;
	};

	const { areas, activeKey, onpick, onmenu }: Props = $props();
</script>

<header>
	{#if onmenu}
		<button type="button" class="rail-toggle" aria-label={t('indicator')} onclick={onmenu}>
			<span></span><span></span><span></span>
		</button>
	{/if}

	<h1 class="brand">
		<span class="display-wide name">Kuntakilpailu</span>
		<span class="tagline">{t('tagline')}</span>
	</h1>

	<SearchBox {areas} {activeKey} {onpick} />
	<LangToggle />

	<div class="chrome">
		<ThemeToggle />
		<a
			class="mobile-hide repo"
			href="https://github.com/OskarWestmeijer/kuntakilpailu"
			rel="noreferrer noopener"
			target="_blank"
		>
			GitHub
		</a>
	</div>
</header>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 16px;
		height: 54px;
		flex: none;
		padding: 0 16px;
		background: var(--navy);
		color: #fff;
	}

	/* Named .rail-toggle rather than the more obvious .menu: DaisyUI ships a global,
	   un-namespaced `.menu` utility class (list/nav styling) that would otherwise silently win
	   over every rule below it — the same collision that briefly broke MapCard's own
	   .panel-toggle button (it used to be .drawer-toggle, DaisyUI's hidden-checkbox class). */
	.rail-toggle {
		display: none;
		flex: none;
		flex-direction: column;
		justify-content: center;
		gap: 4px;
		width: 30px;
		height: 30px;
		padding: 0;
		border: 0;
		border-radius: 8px;
		background: none;
		cursor: pointer;
	}

	.rail-toggle span {
		width: 16px;
		height: 2px;
		border-radius: 1px;
		background: #fff;
	}

	.rail-toggle:hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.brand {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 0;
		min-width: 0;
		/* The brand can shrink past its text's own width (that's the point, on a narrow phone) —
		   without this the name would spill out over the search box instead of eliding. */
		overflow: hidden;
	}

	.name {
		font-size: 17px;
		font-weight: 700;
		letter-spacing: -0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tagline {
		font-size: 12.5px;
		font-weight: 400;
		opacity: 0.55;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.chrome {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: none;
		color: #fff;
	}

	.repo {
		font-size: 11.5px;
		font-weight: 600;
		letter-spacing: 0.02em;
		padding: 5px 8px;
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.6);
		text-decoration: none;
	}

	.repo:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.12);
	}

	@media (max-width: 720px) {
		.tagline {
			display: none;
		}
	}

	/* Below this the rail leaves the grid (see IndicatorRail.svelte) and this button is what
	   reopens it. */
	@media (max-width: 640px) {
		.rail-toggle {
			display: flex;
		}

		header {
			gap: 10px;
			padding: 0 10px;
		}
	}

	/* The brand name loses out to the search box first — a reader can still tell what site this
	   is from the tab/URL, but can't search without the box. An ellipsised sliver of the
	   wordmark ("K…") reads worse than no wordmark at all, so it goes rather than shrinks. */
	@media (max-width: 460px) {
		.name {
			display: none;
		}
	}
</style>
