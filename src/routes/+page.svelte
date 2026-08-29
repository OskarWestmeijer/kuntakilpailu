<script lang="ts">
	import { onMount } from 'svelte';
	import Header from '$lib/app/Header.svelte';
	import IndicatorRail from '$lib/app/IndicatorRail.svelte';
	import MapCard from '$lib/app/MapCard.svelte';
	import DetailCard from '$lib/app/DetailCard.svelte';
	import ListCard from '$lib/app/ListCard.svelte';
	import {
		emptyCompare,
		loadCompare,
		metaFor,
		indicatorName,
		indicatorDesc,
		FINLAND_CODE,
		INDICATORS,
		type Compare,
		type CompareArea,
		type IndicatorMeta
	} from '$lib/interactive/liveData';
	import { percentileColor } from '$lib/interactive/score';
	import {
		binEdges,
		figureText,
		percentileOf,
		ranked,
		rankingOf,
		SCORE_KEY
	} from '$lib/app/columns';
	import { lang, mapLabel, rankOf, restoreLang, t } from '$lib/i18n.svelte';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	// Null until the fetch resolves. Derived rather than seeded into state so the outline map is
	// built from the current geometry prop rather than from whatever it was at first render.
	let loaded = $state<Compare | null>(null);
	const compare = $derived(loaded ?? emptyCompare(data));

	let activeKey = $state(SCORE_KEY);
	let selectedCode = $state<string | null>(null);
	let mode = $state<'map' | 'table'>('map');
	let sortBy = $state(SCORE_KEY);
	let sortDir = $state<'best' | 'worst'>('best');
	let drawerOpen = $state(false);
	// Only meaningful below IndicatorRail's own 640px breakpoint, where it leaves the grid and
	// becomes an off-canvas drawer like `.side` — see IndicatorRail.svelte.
	let railOpen = $state(false);

	onMount(() => {
		restoreLang();
		loadCompare(data).then((result) => (loaded = result));
	});

	const meta = $derived(metaFor(activeKey));
	const areas = $derived(compare.areas);

	const selected = $derived(
		selectedCode === FINLAND_CODE
			? compare.finland
			: (areas.find((area) => area.code === selectedCode) ?? null)
	);

	/**
	 * The list, in whatever order the current mode asks for. Ranking mode is always best-first on
	 * the active indicator; the table sorts on whichever column was clicked. Municipalities with
	 * no figure for the sort column fall to the bottom either way rather than being dropped —
	 * this is the one view where every municipality has to appear.
	 */
	const rows = $derived.by(() => {
		if (mode !== 'table') return ranked(areas, activeKey);

		const withFigure = ranked(areas, sortBy);
		const without = areas.filter((area) => rankingOf(area, sortBy).rank === null);

		return [...(sortDir === 'best' ? withFigure : withFigure.slice().reverse()), ...without];
	});

	const edges = $derived(
		binEdges(areas, activeKey, INDICATORS.find((i) => i.key === activeKey)?.higherIsBetter ?? true)
	);

	function select(code: string | null) {
		selectedCode = code;

		// On the narrow layout the panel is off-canvas, so a selection that doesn't open it
		// would look like nothing happened.
		if (code) drawerOpen = true;
	}

	function closeDrawer() {
		drawerOpen = false;

		// In table mode the map isn't rendered at all (see `main` below), so on the narrow layout
		// — where this panel *is* the only thing on screen — closing it with nothing behind it
		// would leave a blank page with no way back in. Map mode always has something to return
		// to; table mode doesn't, so closing falls back to it.
		mode = 'map';
	}

	function pickIndicator(picked: IndicatorMeta) {
		activeKey = picked.key;
		sortBy = picked.key;
		sortDir = 'best';

		// On the narrow layout the rail is a drawer opened over the map; a pick is what a reader
		// came in for, so it closes itself rather than waiting for a second tap back at the map.
		railOpen = false;
	}

	function sortColumn(key: string) {
		if (sortBy === key) sortDir = sortDir === 'best' ? 'worst' : 'best';
		else {
			sortBy = key;
			sortDir = 'best';
		}
	}

	const fillFor = (area: CompareArea) => {
		const percentile = percentileOf(area, activeKey);

		return percentile === null ? 'url(#no-data)' : percentileColor(percentile);
	};

	const valueLabel = (area: CompareArea) => figureText(area, activeKey, lang.value);

	const rankLabel = (area: CompareArea) => {
		const ranking = rankingOf(area, activeKey);

		return ranking.rank === null ? '' : rankOf(ranking.rank, ranking.ranked);
	};
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			select(null);
			railOpen = false;
		}
	}}
/>

<Header
	areas={compare.finland ? [compare.finland, ...areas] : areas}
	{activeKey}
	onpick={(area) => select(area.code)}
	onmenu={() => (railOpen = !railOpen)}
/>

<main class:is-wide={mode === 'table'}>
	<IndicatorRail
		{activeKey}
		files={compare.files}
		polled={compare.polled}
		onpick={pickIndicator}
		open={railOpen}
	/>

	{#if mode !== 'table'}
		<MapCard
			title={indicatorName(meta, lang.value)}
			description={compare.ok ? indicatorDesc(meta, lang.value) : t('dataUnavailable')}
			{edges}
			formatEdge={(value) => meta.display(value, lang.value)}
			{areas}
			viewBox={compare.viewBox}
			label={mapLabel(indicatorName(meta, lang.value))}
			{fillFor}
			{valueLabel}
			{rankLabel}
			{selectedCode}
			onselect={select}
			{drawerOpen}
			ondrawer={() => (drawerOpen = !drawerOpen)}
		/>
	{/if}

	<aside class="side" class:is-open={drawerOpen}>
		<!-- Only meaningful on the narrow layout, where this panel is a drawer covering the map —
		     and, in table mode, covering the only other thing on screen. Without it there is no
		     way back: the button that opened it (MapCard's panel-toggle) sits underneath, and in
		     table mode isn't rendered at all. A normal flow item, not an overlay — DetailCard has
		     its own top-right button (clear selection), and the two would sit right on top of
		     each other if this one floated over the corner instead. -->
		<button type="button" class="side-close" onclick={closeDrawer}>✕ {t('close')}</button>

		{#if !compare.ok}
			<p class="unavailable panel">{t('dataUnavailable')}</p>
		{/if}

		<DetailCard area={selected} finland={compare.finland} onclear={() => select(null)} />

		<ListCard
			{mode}
			onmode={(next) => (mode = next)}
			{rows}
			finland={compare.finland}
			total={areas.length}
			{activeKey}
			{sortBy}
			{sortDir}
			{selectedCode}
			onselect={select}
			onsort={sortColumn}
		/>
	</aside>
</main>

<style>
	main {
		flex: 1;
		display: grid;
		grid-template-columns: 216px minmax(0, 1fr) 480px;
		gap: 12px;
		padding: 12px;
		min-height: 0;
	}

	/* Table mode drops the map entirely: seven columns of figures need the width more than a
	   choropleth of a single indicator does. */
	.is-wide {
		grid-template-columns: 216px minmax(0, 1fr);
	}

	.side {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 0;
	}

	.unavailable {
		margin: 0;
		padding: 10px 14px;
		font-size: 12.5px;
		color: var(--ink-muted);
		flex: none;
	}

	/* Only shown once the panel becomes a drawer (see the 1060px breakpoint below) — on the wide
	   layout the panel never covers anything, so there's nothing to close. */
	.side-close {
		display: none;
	}

	@media (max-width: 1320px) {
		main {
			grid-template-columns: 192px minmax(340px, 1fr) 380px;
			gap: 10px;
			padding: 10px;
		}

		.is-wide {
			grid-template-columns: 192px minmax(0, 1fr);
		}
	}

	/*
	  Below this the three columns stop fitting, so the panel leaves the flow and becomes a
	  drawer over the map. It opens by itself the moment something is selected — see `select`.
	*/
	@media (max-width: 1060px) {
		main,
		.is-wide {
			grid-template-columns: 176px minmax(0, 1fr);
		}

		.side {
			position: fixed;
			top: 54px;
			right: 0;
			bottom: 0;
			width: 360px;
			max-width: 92vw;
			z-index: 30;
			padding: 10px;
			background: var(--surface-2);
			transform: translateX(100%);
			transition: transform 0.25s ease;
			box-shadow: 0 14px 40px rgba(16, 26, 43, 0.18);
		}

		.side.is-open {
			transform: none;
		}

		/* The drawer covers whatever opened it — MapCard's own panel-toggle included — so this
		   is the one way back once it's open. */
		.side-close {
			display: block;
			align-self: flex-end;
			font: inherit;
			font-size: 11.5px;
			font-weight: 600;
			padding: 6px 12px;
			border: 0;
			border-radius: 8px;
			background: var(--navy);
			color: #fff;
			cursor: pointer;
			flex: none;
		}
	}

	/*
	  Below this a fixed rail column has nowhere left to take its 176px from without crushing the
	  map (or the table) into a sliver, so the rail leaves the grid entirely and becomes its own
	  off-canvas drawer — same mechanism as `.side` above, opened from the header's menu button
	  instead of by a selection. See IndicatorRail.svelte.
	*/
	@media (max-width: 640px) {
		main,
		.is-wide {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
