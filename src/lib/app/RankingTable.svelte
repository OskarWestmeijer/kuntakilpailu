<!--
  The ranking for one indicator: every municipality that has a figure for it, best first, with
  Finland pinned under the header.

  Pinned rather than sorted into place because the country is not a 309th municipality — it is
  the reference the ranking is read against, and it would be useless halfway down a scroll. The
  "≈" on its rank says the position is where it *would* sit.
-->
<script lang="ts">
	import { percentileColor } from '$lib/interactive/score';
	import { count } from '$lib/interactive/format';
	import { metaFor, indicatorName, type CompareArea } from '$lib/interactive/liveData';
	import { percentileOf, rankingOf, figureText } from './columns';
	import { lang, t } from '$lib/i18n.svelte';

	type Props = {
		rows: CompareArea[];
		finland: CompareArea | null;
		activeKey: string;
		selectedCode: string | null;
		onselect: (code: string) => void;
	};

	const { rows, finland, activeKey, selectedCode, onselect }: Props = $props();

	const meta = $derived(metaFor(activeKey));
</script>

<table>
	<thead>
		<tr>
			<th class="rank" scope="col"><span class="stat-label">{t('rank')}</span></th>
			<th scope="col"><span class="stat-label">{t('name')}</span></th>
			<th class="num" scope="col"><span class="stat-label">{t('population')}</span></th>
			<th class="num" scope="col">
				<span class="stat-label">{indicatorName(meta, lang.value)}</span>
			</th>
		</tr>
	</thead>

	<tbody>
		{#if finland}
			<tr class="finland">
				<!-- The country's rank on the indicator being ranked, not its overall score rank —
				     the column has to mean the same thing in every row. -->
				<td class="rank">≈{rankingOf(finland, activeKey).rank ?? '—'}</td>
				<th scope="row" class="name">{t('finland')}</th>
				<td class="num faint">{count(finland.population)}</td>
				<td class="num figure">
					<i style:background={percentileColor(percentileOf(finland, activeKey))}></i>
					{figureText(finland, activeKey, lang.value)}
				</td>
			</tr>
		{/if}

		{#each rows as area (area.code)}
			<tr class:is-selected={area.code === selectedCode} onclick={() => onselect(area.code)}>
				<td class="rank">{rankingOf(area, activeKey).rank}</td>
				<th scope="row" class="name">
					<button type="button" onclick={() => onselect(area.code)}>{area.name}</button>
				</th>
				<td class="num faint">{count(area.population)}</td>
				<td class="num figure">
					<i style:background={percentileColor(percentileOf(area, activeKey))}></i>
					{figureText(area, activeKey, lang.value)}
				</td>
			</tr>
		{/each}
	</tbody>
</table>

<style>
	table {
		width: 100%;
		table-layout: fixed;
		border-collapse: collapse;
		font-size: 12.5px;
	}

	thead th {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--surface);
		text-align: left;
		padding: 6px 8px;
		border-bottom: 1px solid var(--line);
		font-weight: inherit;
	}

	.rank {
		width: 44px;
		color: var(--ink-faint);
		font-size: 11.5px;
	}

	.num {
		text-align: right;
	}

	thead .num:nth-child(3) {
		width: 74px;
	}

	thead .num:nth-child(4) {
		width: 116px;
	}

	/* The indicator names run long in both languages ("Kokonaispisteet", "Higher education"), so
	   the header wraps rather than spilling past the card's edge. `break-word` rather than
	   `anywhere`: the latter also splits words that would have fitted, giving "RAN K". */
	thead .stat-label {
		display: block;
		line-height: 1.15;
		overflow-wrap: break-word;
	}

	tbody th,
	tbody td {
		padding: 5px 8px;
		border-bottom: 1px solid transparent;
	}

	.name {
		font-weight: 500;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.name button {
		font: inherit;
		font-weight: inherit;
		background: none;
		border: 0;
		padding: 0;
		color: inherit;
		cursor: pointer;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.faint {
		color: var(--ink-faint);
	}

	.figure {
		font-weight: 700;
		white-space: nowrap;
	}

	.figure i {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 2px;
		margin-right: 5px;
	}

	tbody tr {
		cursor: pointer;
	}

	tbody tr:hover {
		background: var(--hover);
	}

	.is-selected {
		background: color-mix(in srgb, var(--color-accent) 12%, var(--surface));
		box-shadow: inset 3px 0 0 0 var(--color-accent);
	}

	/* The reference row keeps its own tint through hover and selection — it is a different kind
	   of row, and losing that distinction is how it gets misread as a municipality. */
	.finland,
	.finland:hover {
		position: sticky;
		top: 27px;
		z-index: 1;
		background: var(--surface-2);
		cursor: default;
	}

	.finland th,
	.finland td {
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
	}
</style>
