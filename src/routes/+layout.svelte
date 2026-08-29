<script lang="ts">
	import '../app.css';

	const { children } = $props();
</script>

<!--
  Deliberately bare. The page is a single full-viewport application with its own header
  (`$lib/app/Header.svelte`) and no footer, so there is no chrome left for a layout to own —
  only the global stylesheet, which has to be imported somewhere.
-->
{@render children?.()}
