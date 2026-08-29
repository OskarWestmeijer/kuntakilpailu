<!--
  The lower half of the side panel: the Map/Table switch, the count, and whichever list that
  switch selects. In Table mode the map column is hidden entirely and this card takes the width.
-->
<script lang="ts">
	import RankingTable from './RankingTable.svelte';
	import FullTable from './FullTable.svelte';
	import { t, municipalityCount } from '$lib/i18n.svelte';
	import type { CompareArea } from '$lib/interactive/liveData';

	type Props = {
		mode: 'map' | 'table';
		onmode: (mode: 'map' | 'table') => void;
		rows: CompareArea[];
		finland: CompareArea | null;
		total: number;
		activeKey: string;
		sortBy: string;
		sortDir: 'best' | 'worst';
		selectedCode: string | null;
		onselect: (code: string) => void;
		onsort: (key: string) => void;
	};

	const {
		mode,
		onmode,
		rows,
		finland,
		total,
		activeKey,
		sortBy,
		sortDir,
		selectedCode,
		onselect,
		onsort
	}: Props = $props();
</script>

<section class="panel list-card">
	<div class="head">
		<div class="seg" role="group" aria-label={t('map')}>
			<button
				type="button"
				class:is-active={mode === 'map'}
				aria-pressed={mode === 'map'}
				onclick={() => onmode('map')}
			>
				{t('map')}
			</button>
			<button
				type="button"
				class:is-active={mode === 'table'}
				aria-pressed={mode === 'table'}
				onclick={() => onmode('table')}
			>
				{t('table')}
			</button>
		</div>

		<span class="stat-label">{municipalityCount(total)}</span>
	</div>

	<div class="body">
		{#if mode === 'table'}
			<FullTable {rows} {finland} {sortBy} {sortDir} {selectedCode} {onselect} {onsort} />
		{:else}
			<RankingTable {rows} {finland} {activeKey} {selectedCode} {onselect} />
		{/if}
	</div>
</section>

<style>
	/* Named .list-card rather than .list: DaisyUI ships a global `.list` utility
	   (flex-direction/font-size) that silently wins ties against a same-named component rule —
	   see the note on .panel-toggle in MapCard.svelte for the bug that taught us this. */
	.list-card {
		display: flex;
		flex-direction: column;
		flex: 1;
		overflow: hidden;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 12px;
	}

	.seg {
		display: flex;
		gap: 2px;
		padding: 2px;
		border-radius: 9px;
		background: var(--surface-2);
	}

	.seg button {
		font: inherit;
		font-size: 12.5px;
		padding: 4px 12px;
		border: 0;
		border-radius: 7px;
		background: none;
		color: var(--ink-muted);
		cursor: pointer;
	}

	.seg .is-active {
		background: var(--surface);
		color: var(--ink);
		font-weight: 600;
		box-shadow: 0 1px 3px rgba(16, 26, 43, 0.1);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
</style>
