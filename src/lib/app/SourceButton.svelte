<!--
  Where the figures came from, said once rather than spelled out in every panel's footer.

  One row per table rather than the six sources and three periods flattened into a single line:
  the six are on independent release cycles — Rauma's income is a year older than its
  unemployment rate — so "2026/06 · 2025 · 2024" answered "when" without saying *of what*.

  A plain button rather than `<details>`: the popover has to open on hover as well as on focus,
  and `<details>` only gives the second of those for free. There is no click handler — a mouse
  click already fires `mouseenter` on its way in, so toggling on click as well would as often
  close the popover a hover had just opened as open one.
-->
<script lang="ts">
	import { INDICATOR_META, indicatorName, type SourceFile } from '$lib/interactive/liveData';
	import { lang, t } from '$lib/i18n.svelte';
	import { formatDate, formatPeriod } from '$lib/interactive/format';

	type Props = { files: SourceFile[]; polled: string | null };

	const { files, polled }: Props = $props();

	const labelOf = (key: string) => {
		const meta = INDICATOR_META.find((meta) => meta.key === key);

		return meta ? indicatorName(meta, lang.value) : key;
	};

	let open = $state(false);
	// Where the popover lands. The rail this button lives in clips its own overflow — to keep
	// the scrollable indicator list from spilling past its rounded corners — so an absolutely
	// positioned popover would be cut off along with it. Fixed positioning, aimed from the
	// trigger's own rect, escapes that clip; there's nothing to keep in sync afterwards because
	// the page itself never scrolls (see `app.css`).
	let popStyle = $state('');
	let trigger: HTMLButtonElement | undefined = $state();

	function show() {
		open = true;

		if (!trigger) return;

		const rect = trigger.getBoundingClientRect();

		popStyle = `left:${rect.left}px; bottom:${window.innerHeight - rect.top + 6}px;`;
	}

	function hide() {
		open = false;
	}
</script>

{#if files.length}
	<div class="source" role="group" onmouseenter={show} onmouseleave={hide}>
		<button
			bind:this={trigger}
			type="button"
			class="trigger stat-label"
			aria-expanded={open}
			aria-describedby="source-pop"
			onfocus={show}
			onblur={hide}
		>
			{t('source')}
		</button>

		{#if open}
			<div id="source-pop" class="pop" style={popStyle} role="group" aria-label={t('source')}>
				<table>
					<thead>
						<tr>
							<th>{t('indicator')}</th>
							<th>{t('sourceLabel')}</th>
							<th>{t('periodLabel')}</th>
							<th>{t('published')}</th>
						</tr>
					</thead>
					<tbody>
						{#each files as file (file.key)}
							<tr>
								<td>{labelOf(file.key)}</td>
								<td>{file.source}</td>
								<td>{formatPeriod(file.period)}</td>
								<td>{file.updated ? formatDate(file.updated, lang.value) : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>

				<div class="foot">
					{#if polled}<span>{t('polled')} {formatDate(polled, lang.value)}</span>{/if}
					<span>{t('boundaries')}</span>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.trigger {
		font: inherit;
		padding: 4px 8px;
		margin: -4px -8px;
		border: 0;
		border-radius: 6px;
		background: none;
		cursor: pointer;
	}

	.trigger:hover,
	.trigger[aria-expanded='true'] {
		color: var(--ink-muted);
		background: var(--hover);
	}

	.pop {
		position: fixed;
		z-index: 10;
		width: max-content;
		max-width: 90vw;
		padding: 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-card);
		background: var(--surface);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
	}

	table {
		border-collapse: collapse;
		font-size: 11.5px;
		white-space: nowrap;
	}

	th {
		padding: 0 12px 5px 0;
		font-stretch: 88%;
		font-weight: 650;
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		text-align: left;
		color: var(--ink-faint);
	}

	td {
		padding: 4px 12px 4px 0;
		border-top: 1px solid var(--line);
	}

	td:first-child {
		font-weight: 600;
	}

	td:last-child,
	th:last-child {
		padding-right: 0;
	}

	.foot {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 8px;
		padding-top: 6px;
		border-top: 1px solid var(--line);
		font-size: 10.5px;
		color: var(--ink-faint);
	}
</style>
