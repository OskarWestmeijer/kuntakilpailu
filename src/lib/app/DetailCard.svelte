<!--
  The upper half of the side panel: one municipality, all seven indicators at once.

  Each row is a percentile bar rather than the raw figure alone, because the figures are on six
  incompatible units — a rate, a euro amount, an age — and only their positions in the country
  can be read against each other. The raw figure stays on the right so the bar never has to be
  taken on trust, and a navy tick marks where Finland as a whole sits on the same scale.
-->
<script lang="ts">
	import { INDICATOR_META, indicatorName, type CompareArea } from '$lib/interactive/liveData';
	import { percentileColor } from '$lib/interactive/score';
	import { count } from '$lib/interactive/format';
	import { percentileOf, rankingOf, figureText } from './columns';
	import { lang, t, rankOf } from '$lib/i18n.svelte';

	type Props = {
		area: CompareArea | null;
		finland: CompareArea | null;
		onclear: () => void;
	};

	const { area, finland, onclear }: Props = $props();

	const subtitle = $derived.by(() => {
		if (!area) return '';

		const parts: string[] = [];

		if (area.isReference) parts.push(t('finlandRef'));
		else if (area.nameSwedish && area.nameSwedish !== area.name) parts.push(area.nameSwedish);

		if (area.population !== null)
			parts.push(`${count(area.population)} ${lang.value === 'fi' ? 'asukasta' : 'residents'}`);

		if (area.landArea !== null) parts.push(`${count(Math.round(area.landArea))} km²`);

		return parts.join(' · ');
	});
</script>

<section class="panel detail" aria-label={t('detail')}>
	{#if !area}
		<p class="stat-label">{t('detail')}</p>
		<p class="prompt">{t('pick')}</p>
	{:else}
		<div class="head">
			<div class="who">
				<h2 class="display-wide">{area.isReference ? t('finland') : area.name}</h2>
				<p class="sub">{subtitle}</p>
			</div>

			<button type="button" class="clear" onclick={onclear}>✕ {t('clear')}</button>
		</div>

		<div class="rows">
			{#each INDICATOR_META as meta (meta.key)}
				{@const percentile = percentileOf(area, meta.key)}
				{@const ranking = rankingOf(area, meta.key)}
				{@const reference = finland ? percentileOf(finland, meta.key) : null}
				<div class="statrow">
					<span class="stat-label">{indicatorName(meta, lang.value)}</span>

					<span class="bar">
						{#if percentile !== null}
							<i
								class="fill"
								style:width="{percentile}%"
								style:background={percentileColor(percentile)}
							></i>
						{/if}
						{#if reference !== null && !area.isReference}
							<i class="tick" style:left="{reference}%"></i>
						{/if}
					</span>

					<span class="figure">
						<b>{figureText(area, meta.key, lang.value)}</b>
						<em
							>{area.isReference
								? `≈ ${rankOf(ranking.rank, ranking.ranked)}`
								: rankOf(ranking.rank, ranking.ranked)}</em
						>
					</span>
				</div>
			{/each}
		</div>

		<div class="foot">
			<span class="key"><i></i>{t('finland')}</span>
		</div>
	{/if}
</section>

<style>
	.detail {
		padding: 13px 15px;
		flex: none;
	}

	.prompt {
		margin: 6px 0 0;
		font-size: 12.5px;
		color: var(--ink-muted);
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	h2 {
		margin: 0;
		font-size: 19px;
		font-weight: 700;
	}

	.sub {
		margin: 2px 0 0;
		font-size: 11.5px;
		color: var(--ink-faint);
	}

	.clear {
		flex: none;
		font: inherit;
		font-size: 11px;
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 5px 9px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface-2);
		color: var(--ink-muted);
		cursor: pointer;
	}

	.clear:hover {
		color: var(--ink);
	}

	.rows {
		margin-top: 10px;
	}

	.statrow {
		display: grid;
		/* 130px rather than the handoff's 104: "Korkeakoulutetut" and "Työttömyysaste" are single
		   words with no wrap point, and anything narrower either clips them or breaks off a
		   trailing letter onto a second line. */
		grid-template-columns: 130px 1fr 78px;
		gap: 10px;
		align-items: center;
		padding: 4px 0;
	}

	.statrow .stat-label {
		line-height: 1.2;
		overflow-wrap: break-word;
	}

	.bar {
		position: relative;
		height: 6px;
		border-radius: 3px;
		background: var(--surface-2);
		overflow: hidden;
	}

	.fill {
		display: block;
		height: 100%;
		border-radius: 3px;
	}

	/* Finland's own percentile on the same scale — the row's answer to "compared with what?". */
	.tick {
		position: absolute;
		top: -2px;
		width: 2px;
		height: 10px;
		background: var(--navy);
		transform: translateX(-1px);
	}

	.figure {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		line-height: 1.2;
	}

	.figure b {
		font-size: 13px;
		font-weight: 700;
	}

	.figure em {
		font-size: 10px;
		font-style: normal;
		color: var(--ink-faint);
	}

	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--line);
	}

	.key {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
		color: var(--ink-muted);
	}

	.key i {
		width: 2px;
		height: 10px;
		background: var(--navy);
	}
</style>
