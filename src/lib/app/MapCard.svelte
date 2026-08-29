<!--
  The middle column: what the map is showing, the map, and where the figures came from.
-->
<script lang="ts">
	import ZoomableMap from './ZoomableMap.svelte';
	import Legend from './Legend.svelte';
	import { t } from '$lib/i18n.svelte';
	import type { CompareArea } from '$lib/interactive/liveData';

	type Props = {
		title: string;
		description: string;
		edges: number[];
		formatEdge: (value: number) => string;
		areas: CompareArea[];
		viewBox: string;
		label: string;
		fillFor: (area: CompareArea) => string;
		valueLabel: (area: CompareArea) => string;
		rankLabel: (area: CompareArea) => string;
		selectedCode: string | null;
		onselect: (code: string | null) => void;
		/** Only rendered on the narrow layout, where the side panel is a drawer. */
		ondrawer?: () => void;
		drawerOpen?: boolean;
	};

	const {
		title,
		description,
		edges,
		formatEdge,
		areas,
		viewBox,
		label,
		fillFor,
		valueLabel,
		rankLabel,
		selectedCode,
		onselect,
		ondrawer,
		drawerOpen = false
	}: Props = $props();
</script>

<section class="panel col">
	<div class="head">
		<div class="titles">
			<h2 class="display-wide">{title}</h2>
			<p>{description}</p>
		</div>

		{#if edges.length}
			<Legend {edges} format={formatEdge} />
		{/if}
	</div>

	<ZoomableMap
		{areas}
		{viewBox}
		{label}
		{fillFor}
		{valueLabel}
		{rankLabel}
		{selectedCode}
		{onselect}
	/>

	{#if ondrawer}
		<div class="foot">
			<button type="button" class="drawer-toggle" onclick={ondrawer}>
				{drawerOpen ? t('close') : t('panel')}
			</button>
		</div>
	{/if}
</section>

<style>
	.col {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 12px 12px 0;
	}

	h2 {
		margin: 0;
		font-size: 19px;
		font-weight: 700;
	}

	.head p {
		margin: 4px 0 0;
		font-size: 12.5px;
		line-height: 1.45;
		max-width: 48ch;
		color: var(--ink-muted);
	}

	.foot {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 12px 10px;
	}

	.drawer-toggle {
		display: none;
		margin-left: auto;
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

	@media (max-width: 1060px) {
		.drawer-toggle {
			display: block;
		}
	}
</style>
