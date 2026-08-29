<!--
  FI/EN, as a two-button segmented control. Two buttons rather than a `<select>` or a checkbox
  because both options are always visible, which is what tells a reader the page *has* another
  language — the whole reason the control exists.
-->
<script lang="ts">
	import { lang, t, type Lang } from '$lib/i18n.svelte';

	const options: Lang[] = ['fi', 'en'];
</script>

<div class="seg" role="group" aria-label={t('language')}>
	{#each options as option (option)}
		<button
			type="button"
			class="seg-btn"
			class:is-active={lang.value === option}
			aria-pressed={lang.value === option}
			onclick={() => (lang.value = option)}
		>
			{option.toUpperCase()}
		</button>
	{/each}
</div>

<style>
	.seg {
		display: flex;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		overflow: hidden;
		flex: none;
	}

	.seg-btn {
		font: inherit;
		font-size: 11.5px;
		font-weight: 650;
		letter-spacing: 0.04em;
		padding: 5px 9px;
		background: none;
		border: 0;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.6);
	}

	.seg-btn:hover {
		color: #fff;
	}

	.is-active {
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
	}

	.seg-btn:focus-visible {
		outline: 2px solid #fff;
		outline-offset: -2px;
	}
</style>
