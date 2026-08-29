<!--
  Type-ahead over the 308 municipalities, in the header.

  Matches Finnish and Swedish names, prefix before substring — "Kor" should reach Korsholm
  before Pyhäjärvi's substring hit. Wired as a real combobox (`aria-expanded`,
  `aria-activedescendant`, arrow keys, Enter, Escape) rather than an input with a list under it,
  because without that a keyboard reader gets a text field that silently changes the page.
-->
<script lang="ts">
	import { searchAreas, figureText } from './columns';
	import { lang, t } from '$lib/i18n.svelte';
	import type { CompareArea } from '$lib/interactive/liveData';

	type Props = {
		areas: CompareArea[];
		/** Which indicator's figure to show beside each suggestion. */
		activeKey: string;
		onpick: (area: CompareArea) => void;
	};

	const { areas, activeKey, onpick }: Props = $props();

	let query = $state('');
	let open = $state(false);
	let highlighted = $state(0);

	const matches = $derived(open ? searchAreas(areas, query) : []);

	function pick(area: CompareArea | undefined) {
		if (!area) return;

		onpick(area);
		query = '';
		open = false;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			open = false;

			return;
		}

		if (!matches.length) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlighted = (highlighted + 1) % matches.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlighted = (highlighted - 1 + matches.length) % matches.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			pick(matches[highlighted]);
		}
	}
</script>

<div class="wrap">
	<input
		class="box"
		type="text"
		role="combobox"
		aria-expanded={matches.length > 0}
		aria-controls="search-suggestions"
		aria-autocomplete="list"
		aria-activedescendant={matches.length ? `suggestion-${highlighted}` : undefined}
		aria-label={t('searchLabel')}
		placeholder={t('search')}
		autocomplete="off"
		bind:value={query}
		oninput={() => {
			open = true;
			highlighted = 0;
		}}
		onfocus={() => (open = true)}
		onblur={() => (open = false)}
		{onkeydown}
	/>

	{#if matches.length}
		<ul class="suggest" id="search-suggestions" role="listbox" aria-label={t('searchLabel')}>
			<!-- `onmousedown` is prevented on each row: the input's blur fires first otherwise, and
			     the list would be gone before the click landed. -->
			{#each matches as area, i (area.code)}
				<li id="suggestion-{i}" role="option" aria-selected={i === highlighted}>
					<button
						type="button"
						class="row"
						class:is-active={i === highlighted}
						onmouseenter={() => (highlighted = i)}
						onmousedown={(event) => event.preventDefault()}
						onclick={() => pick(area)}
					>
						<span class="name">{area.name}</span>
						<span class="figure">{figureText(area, activeKey, lang.value)}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
		margin-left: auto;
		flex: none;
	}

	.box {
		width: 230px;
		max-width: 40vw;
		font: inherit;
		font-size: 13px;
		padding: 8px 12px;
		border-radius: 9px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #fff;
	}

	.box::placeholder {
		color: rgba(255, 255, 255, 0.55);
	}

	.box:focus {
		background: #fff;
		color: var(--map-ink);
		outline: 2px solid rgba(255, 255, 255, 0.35);
		outline-offset: 1px;
	}

	.suggest {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		left: 0;
		z-index: 40;
		margin: 0;
		padding: 4px;
		list-style: none;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 10px;
		box-shadow: 0 14px 34px rgba(16, 26, 43, 0.2);
	}

	.row {
		display: flex;
		align-items: baseline;
		gap: 8px;
		width: 100%;
		font: inherit;
		font-size: 13px;
		text-align: left;
		padding: 8px 11px;
		border: 0;
		border-radius: 7px;
		background: none;
		color: var(--ink);
		cursor: pointer;
	}

	.row:hover,
	.is-active {
		background: var(--surface-2);
	}

	.name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.figure {
		color: var(--ink-muted);
		font-size: 12px;
	}
</style>
