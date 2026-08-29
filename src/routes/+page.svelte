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

	function pickIndicator(picked: IndicatorMeta) {
		activeKey = picked.key;
		sortBy = picked.key;
		sortDir = 'best';
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
		if (event.key === 'Escape') select(null);
	}}
/>

<Header
	areas={compare.finland ? [compare.finland, ...areas] : areas}
	{activeKey}
	onpick={(area) => select(area.code)}
/>

<main class:is-wide={mode === 'table'}>
	<IndicatorRail {activeKey} files={compare.files} polled={compare.polled} onpick={pickIndicator} />

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
	}
</style>
