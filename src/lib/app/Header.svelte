<!--
  The 54px navy bar above everything: brand, search, language, theme.

  It is the page's only chrome — there is no footer and no navigation, because there is only one
  page. The repository link stays from the old navbar so attribution doesn't vanish with it.
-->
<script lang="ts">
	import SearchBox from './SearchBox.svelte';
	import LangToggle from './LangToggle.svelte';
	import ThemeToggle from '$lib/ThemeToggle.svelte';
	import { t } from '$lib/i18n.svelte';
	import type { CompareArea } from '$lib/interactive/liveData';

	type Props = {
		areas: CompareArea[];
		activeKey: string;
		onpick: (area: CompareArea) => void;
	};

	const { areas, activeKey, onpick }: Props = $props();
</script>

<header>
	<h1 class="brand">
		<span class="display-wide name">Kuntakilpailu</span>
		<span class="tagline">{t('tagline')}</span>
	</h1>

	<SearchBox {areas} {activeKey} {onpick} />
	<LangToggle />

	<div class="chrome">
		<ThemeToggle />
		<a
			class="mobile-hide repo"
			href="https://github.com/OskarWestmeijer/kuntakilpailu"
			rel="noreferrer noopener"
			target="_blank"
		>
			GitHub
		</a>
	</div>
</header>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 16px;
		height: 54px;
		flex: none;
		padding: 0 16px;
		background: var(--navy);
		color: #fff;
	}

	.brand {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 0;
		min-width: 0;
	}

	.name {
		font-size: 17px;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.tagline {
		font-size: 12.5px;
		font-weight: 400;
		opacity: 0.55;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.chrome {
		display: flex;
		align-items: center;
		gap: 4px;
		flex: none;
		color: #fff;
	}

	.repo {
		font-size: 11.5px;
		font-weight: 600;
		letter-spacing: 0.02em;
		padding: 5px 8px;
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.6);
		text-decoration: none;
	}

	.repo:hover {
		color: #fff;
		background: rgba(255, 255, 255, 0.12);
	}

	@media (max-width: 720px) {
		.tagline {
			display: none;
		}
	}
</style>
