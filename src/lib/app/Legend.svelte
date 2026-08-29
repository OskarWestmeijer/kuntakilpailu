<!--
  The seven-step key above the map: the palette as a strip, with the raw values that separate
  its bins underneath.

  The bins are septiles of the published figures, so each colour holds a seventh of the
  municipalities. That is what makes the numbers under the strip readable as cut points rather
  than as an arbitrary scale — and why they change with every indicator.
-->
<script lang="ts">
	import { SCORE_PALETTE } from '$lib/interactive/score';
	import { t } from '$lib/i18n.svelte';

	type Props = { edges: number[]; format: (value: number) => string };

	const { edges, format }: Props = $props();
</script>

<div class="legend">
	<div class="ends">
		<span class="stat-label">{t('legendLow')}</span>
		<span class="stat-label">{t('legendHigh')}</span>
	</div>

	<div class="strip" aria-hidden="true">
		{#each SCORE_PALETTE as color (color)}
			<i style:background={color}></i>
		{/each}
	</div>

	<div class="edges" aria-hidden="true">
		{#each edges as edge, i (i)}
			<!-- Boundary i sits between segment i and i+1, so at (i+1)/7 of the strip. -->
			<span style:left="{((i + 1) / SCORE_PALETTE.length) * 100}%">{format(edge)}</span>
		{/each}
	</div>
</div>

<style>
	.legend {
		width: 260px;
		max-width: 100%;
		flex: none;
	}

	.ends {
		display: flex;
		justify-content: space-between;
		margin-bottom: 3px;
	}

	.strip {
		display: flex;
		height: 8px;
		border-radius: 2px;
		overflow: hidden;
	}

	.strip i {
		flex: 1;
	}

	.edges {
		position: relative;
		height: 14px;
		margin-top: 3px;
	}

	.edges span {
		position: absolute;
		transform: translateX(-50%);
		font-size: 10px;
		color: var(--ink-faint);
		white-space: nowrap;
	}
</style>
