<!--
  The left rail: one button per indicator, grouped, with the composite score above the groups.

  The seven-bar swatch on each row is the same palette the map is painted in, so the rail doubles
  as a key: picking an indicator does not change what the colours mean, only what they are
  measuring. It is decorative here — the legend above the map carries the readable version — so
  it is hidden from assistive tech.
-->
<script lang="ts">
	import { SCORE_PALETTE } from '$lib/interactive/score';
	import {
		indicatorGroups,
		indicatorName,
		type IndicatorMeta,
		type SourceFile
	} from '$lib/interactive/liveData';
	import { lang, t } from '$lib/i18n.svelte';
	import SourceButton from './SourceButton.svelte';

	type Props = {
		activeKey: string;
		files: SourceFile[];
		polled: string | null;
		onpick: (meta: IndicatorMeta) => void;
	};

	const { activeKey, files, polled, onpick }: Props = $props();

	const groups = $derived(indicatorGroups(lang.value));
</script>

<nav class="panel rail" aria-label={t('indicator')}>
	<div class="head">
		<p class="stat-label">{t('indicator')}</p>
		<p class="note">{t('indicatorNote')}</p>
	</div>

	<div class="list">
		{#each groups as group (group.group)}
			{#if group.group}
				<p class="stat-label group">{group.group}</p>
			{/if}

			{#each group.items as meta (meta.key)}
				<button
					type="button"
					class="item"
					class:is-active={activeKey === meta.key}
					aria-pressed={activeKey === meta.key}
					onclick={() => onpick(meta)}
				>
					<span class="label">{indicatorName(meta, lang.value)}</span>
					<span class="dots" aria-hidden="true">
						{#each SCORE_PALETTE as color (color)}
							<i style:background={color}></i>
						{/each}
					</span>
				</button>
			{/each}
		{/each}
	</div>

	<div class="foot">
		<SourceButton {files} {polled} />
	</div>
</nav>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.head {
		padding: 12px 12px 10px;
	}

	.note {
		margin: 5px 0 0;
		font-size: 11.5px;
		line-height: 1.4;
		color: var(--ink-muted);
	}

	.list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0 8px 8px;
	}

	.group {
		margin: 12px 0 4px;
		padding: 0 4px;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		font: inherit;
		font-size: 13px;
		line-height: 1.25;
		text-align: left;
		padding: 8px 9px;
		margin-bottom: 1px;
		border: 0;
		border-radius: 9px;
		background: none;
		color: var(--ink);
		cursor: pointer;
	}

	.item:hover {
		background: var(--hover);
	}

	.item:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	/* `.item.is-active`, not `.is-active`: `.item:hover` is two classes' worth of specificity, so
	   a plain `.is-active` lost to it and the selected row went white-on-light under the cursor. */
	.item.is-active,
	.item.is-active:hover {
		background: var(--navy);
		color: #fff;
		font-weight: 600;
	}

	.label {
		flex: 1;
		/* A flex item's default `min-width: auto` refuses to shrink below its text, so without
		   this the ellipsis never engages and long names push the swatch out of the button —
		   which is what the 176px rail does at the narrow breakpoint. */
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dots {
		display: flex;
		gap: 1.5px;
		flex: none;
	}

	.dots i {
		width: 4px;
		height: 12px;
		border-radius: 1px;
		opacity: 0.9;
	}

	.is-active .dots i {
		opacity: 1;
	}

	.foot {
		padding: 8px 12px;
		border-top: 1px solid var(--line);
	}
</style>
