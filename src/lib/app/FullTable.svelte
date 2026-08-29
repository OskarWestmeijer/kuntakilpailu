<!--
  Every municipality against every indicator at once, sortable by any column.

  The two leftmost columns are frozen and the header is sticky, so a rank and a name are always
  in view while the seven indicator columns scroll sideways — without that, a figure five columns
  in belongs to nobody.
-->
<script lang="ts">
	import { percentileColor } from '$lib/interactive/score';
	import { count } from '$lib/interactive/format';
	import { INDICATOR_META, indicatorName, type CompareArea } from '$lib/interactive/liveData';
	import { percentileOf, figureText, rankingOf } from './columns';
	import { lang, t } from '$lib/i18n.svelte';

	type Props = {
		rows: CompareArea[];
		finland: CompareArea | null;
		sortBy: string;
		/** 'best' puts rank 1 at the top; a second click on the same column flips it. */
		sortDir: 'best' | 'worst';
		selectedCode: string | null;
		onselect: (code: string) => void;
		onsort: (key: string) => void;
	};

	const { rows, finland, sortBy, sortDir, selectedCode, onselect, onsort }: Props = $props();

	const arrow = (key: string) => (sortBy !== key ? '' : sortDir === 'best' ? ' ↓' : ' ↑');
</script>

<div class="scroll">
	<table>
		<thead>
			<tr>
				<th class="rank frozen" scope="col"><span class="stat-label">{t('rank')}</span></th>
				<th class="name frozen" scope="col"><span class="stat-label">{t('name')}</span></th>
				<th class="num" scope="col"><span class="stat-label">{t('population')}</span></th>

				{#each INDICATOR_META as meta (meta.key)}
					<th class="num" scope="col" aria-sort={sortBy === meta.key ? 'other' : 'none'}>
						<button type="button" class="stat-label" onclick={() => onsort(meta.key)}>
							{indicatorName(meta, lang.value)}{arrow(meta.key)}
						</button>
					</th>
				{/each}
			</tr>
		</thead>

		<tbody>
			{#if finland}
				<tr class="finland">
					<td class="rank frozen">≈{rankingOf(finland, sortBy).rank ?? '—'}</td>
					<th class="name frozen" scope="row">{t('finland')}</th>
					<td class="num faint">{count(finland.population)}</td>

					{#each INDICATOR_META as meta (meta.key)}
						<td class="num figure">
							<i style:background={percentileColor(percentileOf(finland, meta.key))}></i>
							{figureText(finland, meta.key, lang.value)}
						</td>
					{/each}
				</tr>
			{/if}

			{#each rows as area, i (area.code)}
				<tr class:is-selected={area.code === selectedCode} onclick={() => onselect(area.code)}>
					<td class="rank frozen">{i + 1}</td>
					<th class="name frozen" scope="row">
						<button type="button" onclick={() => onselect(area.code)}>{area.name}</button>
					</th>
					<td class="num faint">{count(area.population)}</td>

					{#each INDICATOR_META as meta (meta.key)}
						<td class="num figure">
							<i style:background={percentileColor(percentileOf(area, meta.key))}></i>
							{figureText(area, meta.key, lang.value)}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.scroll {
		overflow: auto;
		height: 100%;
	}

	table {
		border-collapse: separate;
		border-spacing: 0;
		font-size: 12.5px;
		white-space: nowrap;
	}

	thead th {
		position: sticky;
		top: 0;
		z-index: 3;
		background: var(--surface);
		text-align: left;
		padding: 6px 8px;
		border-bottom: 1px solid var(--line);
		font-weight: inherit;
	}

	/* Frozen columns sit above the scrolling ones; in the header they have to sit above both. */
	.frozen {
		position: sticky;
		background: var(--surface);
		z-index: 2;
	}

	thead .frozen {
		z-index: 4;
	}

	.rank {
		left: 0;
		width: 46px;
		min-width: 46px;
		color: var(--ink-faint);
		font-size: 11.5px;
	}

	.name {
		left: 46px;
		min-width: 130px;
		text-align: left;
		font-weight: 500;
	}

	.num {
		text-align: right;
	}

	thead button {
		font: inherit;
		font-stretch: 88%;
		font-weight: 650;
		font-size: 10.5px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-faint);
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
	}

	thead button:hover {
		color: var(--ink);
	}

	tbody th,
	tbody td {
		padding: 5px 8px;
	}

	.name button {
		font: inherit;
		font-weight: inherit;
		background: none;
		border: 0;
		padding: 0;
		color: inherit;
		cursor: pointer;
	}

	.faint {
		color: var(--ink-faint);
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

	tbody tr:hover td,
	tbody tr:hover th {
		background: var(--hover);
	}

	.is-selected td,
	.is-selected th {
		background: color-mix(in srgb, var(--color-accent) 12%, var(--surface));
	}

	.is-selected .rank {
		box-shadow: inset 3px 0 0 0 var(--color-accent);
	}

	.finland {
		position: sticky;
		top: 27px;
		z-index: 2;
	}

	.finland th,
	.finland td,
	.finland:hover th,
	.finland:hover td {
		background: var(--surface-2);
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		cursor: default;
	}

	.finland .frozen {
		z-index: 3;
	}
</style>
