<!--
  The choropleth: 308 paths, a wheel/drag viewport over them, and a cursor tooltip.

  **Zoom and pan move the `viewBox`, not a `<g transform>`.** The transform is the obvious
  implementation and it is quietly broken here: these coordinates are EPSG:3067 metres, so they
  run to 7 800 000, and a `scale(15)` about a point that far from the origin composes a matrix
  with a translate near 1e8. Chrome rasterises SVG transforms through float32 — seven significant
  digits — so recovering a 1e3-precision position out of a 1e8 translate loses it, and past about
  6× the whole country slid off the top of the frame. Driving the viewBox keeps every number at
  coordinate magnitude and the arithmetic in double precision.

  The cost is that `viewBox` can't be CSS-transitioned, so the fly-to is animated here instead.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { NO_DATA_COLOR } from '$lib/interactive/unemployment';
	import { t } from '$lib/i18n.svelte';
	import type { CompareArea } from '$lib/interactive/liveData';

	type Props = {
		areas: CompareArea[];
		viewBox: string;
		/** Accessible name for the whole map, e.g. "Kokonaispisteet — Kunta". */
		label: string;
		fillFor: (area: CompareArea) => string;
		/** The figure read out beside a municipality's name, in the tooltip and the label. */
		valueLabel: (area: CompareArea) => string;
		/** Rank line under the tooltip's figure. Empty to omit it. */
		rankLabel: (area: CompareArea) => string;
		selectedCode: string | null;
		onselect: (code: string | null) => void;
	};

	const { areas, viewBox, label, fillFor, valueLabel, rankLabel, selectedCode, onselect }: Props =
		$props();

	/** How much of the frame a selected municipality is zoomed to fill. Above 1 it keeps the
	 *  surroundings in view — the point of flying to a municipality is to see where it *is*. */
	const SELECTION_PADDING = 3.2;
	const MAX_ZOOM = 48;
	const FLY_MS = 450;

	type Rect = { x: number; y: number; w: number; h: number };

	const base = $derived.by<Rect>(() => {
		const [x, y, w, h] = viewBox.split(' ').map(Number);

		return { x, y, w, h };
	});

	let container = $state<HTMLDivElement | null>(null);
	let svg = $state<SVGSVGElement | null>(null);
	let view = $state<Rect | null>(null);
	let hovered = $state<CompareArea | null>(null);
	let tip = $state({ x: 0, y: 0 });

	const current = $derived(view ?? base);
	const box = $derived(`${current.x} ${current.y} ${current.w} ${current.h}`);

	/** The hatch is sized against the *current* view, so it stays the same size on screen at
	 *  every zoom rather than combing out as the view narrows. */
	const hatch = $derived(Math.max(1, current.w / 160));

	let frame = 0;

	function stopFlight() {
		if (frame) cancelAnimationFrame(frame);

		frame = 0;
	}

	/** Eased over `FLY_MS`, since `viewBox` is an attribute and CSS can't transition it. */
	function flyToRect(target: Rect) {
		const from = { ...current };
		const start = performance.now();

		stopFlight();

		const step = (now: number) => {
			const p = Math.min(1, (now - start) / FLY_MS);
			// Same curve as the CSS `cubic-bezier(.4, 0, .2, 1)` the rest of the page eases with.
			const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

			view = {
				x: from.x + (target.x - from.x) * e,
				y: from.y + (target.y - from.y) * e,
				w: from.w + (target.w - from.w) * e,
				h: from.h + (target.h - from.h) * e
			};

			frame = p < 1 ? requestAnimationFrame(step) : 0;
		};

		frame = requestAnimationFrame(step);
	}

	/** A view of the given zoom, centred on a map point. Aspect ratio always matches the base,
	 *  so `preserveAspectRatio` letterboxes identically however deep the zoom goes. */
	function rectAt(cx: number, cy: number, zoom: number): Rect {
		const k = Math.min(MAX_ZOOM, Math.max(1, zoom));

		return { x: cx - base.w / k / 2, y: cy - base.h / k / 2, w: base.w / k, h: base.h / k };
	}

	function toMap(event: { clientX: number; clientY: number }) {
		const ctm = svg?.getScreenCTM();

		if (!svg || !ctm) return { x: 0, y: 0 };

		const point = svg.createSVGPoint();

		point.x = event.clientX;
		point.y = event.clientY;

		const mapped = point.matrixTransform(ctm.inverse());

		return { x: mapped.x, y: mapped.y };
	}

	/** Scales about a fixed map point, so whatever is under the cursor stays under the cursor. */
	function zoomAbout(x: number, y: number, factor: number) {
		const zoom = Math.min(MAX_ZOOM, Math.max(1, (base.w / current.w) * factor));
		const w = base.w / zoom;
		const h = base.h / zoom;
		// The point keeps its relative position in the frame, which is what "toward the cursor"
		// means; centring on it instead would drag the map out from under the pointer.
		const rx = (x - current.x) / current.w;
		const ry = (y - current.y) / current.h;

		view = { x: x - rx * w, y: y - ry * h, w, h };
	}

	function step(factor: number) {
		stopFlight();
		zoomAbout(current.x + current.w / 2, current.y + current.h / 2, factor);
	}

	// Selection drives the viewport: picking a municipality anywhere — map, search, either
	// table — flies to it, and clearing returns to the whole country.
	//
	// The flight itself is untracked. `flyToRect` reads the current view to ease away from it and
	// writes the view on every frame, so tracking it would make this effect its own dependency:
	// each frame would restart the flight from wherever it had just got to, and the map would sit
	// a few metres from where it started forever.
	$effect(() => {
		const area = areas.find((candidate) => candidate.code === selectedCode);
		const frame = base;

		untrack(() => {
			if (area && area.d) {
				const [x0, y0, x1, y1] = area.bbox;
				const zoom = Math.min(frame.w / Math.max(x1 - x0, 1), frame.h / Math.max(y1 - y0, 1));

				flyToRect(rectAt((x0 + x1) / 2, (y0 + y1) / 2, zoom / SELECTION_PADDING));
			} else if (!selectedCode) {
				flyToRect(frame);
			}
		});
	});

	let dragging = $state(false);
	let dragged = false;
	let origin = { px: 0, py: 0, vx: 0, vy: 0 };

	function onwheel(event: WheelEvent) {
		event.preventDefault();
		stopFlight();

		const { x, y } = toMap(event);

		zoomAbout(x, y, Math.pow(1.0015, -event.deltaY));
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;

		const { x, y } = toMap(event);

		stopFlight();
		dragging = true;
		dragged = false;
		origin = { px: x, py: y, vx: current.x, vy: current.y };
	}

	function onpointermove(event: PointerEvent) {
		const rect = container?.getBoundingClientRect();

		// Tooltip position comes from the container, not the hovered path: `offsetX` on a path is
		// measured from that path's own box, which puts the tooltip somewhere else for every
		// municipality.
		if (rect) tip = { x: event.clientX - rect.left, y: event.clientY - rect.top };

		if (!dragging) return;

		const { x, y } = toMap(event);
		const dx = x - origin.px;
		const dy = y - origin.py;

		// A fraction of the frame is a click, not a drag — measured against the current view, so
		// the threshold stays the same few screen pixels at every zoom.
		if (!dragged && (Math.abs(dx) > current.w / 200 || Math.abs(dy) > current.h / 200)) {
			dragged = true;

			// Captured only now, never on pointerdown. Capturing early would work for panning, but
			// it also retargets the `click` that ends a *stationary* press onto the <svg>, so
			// clicking a municipality would never reach its path and nothing would select.
			(event.currentTarget as Element).setPointerCapture(event.pointerId);
		}

		if (dragged) view = { ...current, x: origin.vx - dx, y: origin.vy - dy };
	}

	function onpointerup(event: PointerEvent) {
		const target = event.currentTarget as Element;

		if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);

		dragging = false;
	}

	/** Only a press that didn't turn into a drag selects. */
	function choose(code: string) {
		if (dragged) return;

		onselect(code === selectedCode ? null : code);
	}
</script>

<div class="map" class:is-dragging={dragging} bind:this={container}>
	<svg
		bind:this={svg}
		viewBox={box}
		role="img"
		aria-label={label}
		preserveAspectRatio="xMidYMid meet"
		{onwheel}
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		onpointerleave={() => (hovered = null)}
	>
		<defs>
			<pattern
				id="no-data"
				width={hatch}
				height={hatch}
				patternUnits="userSpaceOnUse"
				patternTransform="rotate(45)"
			>
				<rect width={hatch} height={hatch} fill={NO_DATA_COLOR} />
				<line x1="0" y1="0" x2="0" y2={hatch} stroke="#c9ced6" stroke-width={hatch / 3} />
			</pattern>
		</defs>

		{#each areas as area (area.code)}
			<path
				class="kunta"
				class:is-dimmed={selectedCode !== null && area.code !== selectedCode}
				class:is-selected={area.code === selectedCode}
				class:is-hovered={hovered?.code === area.code}
				d={area.d}
				fill={fillFor(area)}
				vector-effect="non-scaling-stroke"
				role="button"
				tabindex="0"
				aria-label="{area.name}, {valueLabel(area)}"
				aria-pressed={area.code === selectedCode}
				onmouseenter={() => (hovered = area)}
				onfocus={() => (hovered = area)}
				onblur={() => (hovered = null)}
				onclick={() => choose(area.code)}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						onselect(area.code === selectedCode ? null : area.code);
					}
				}}
			></path>
		{/each}
	</svg>

	{#if hovered}
		<div class="tip" style:left="{tip.x + 12}px" style:top="{tip.y + 12}px">
			<strong>{hovered.name}</strong>
			<span>{valueLabel(hovered)}</span>
			{#if rankLabel(hovered)}<span class="rank">{rankLabel(hovered)}</span>{/if}
		</div>
	{/if}

	<div class="zoom">
		<button type="button" aria-label={t('zoomIn')} onclick={() => step(1.6)}>+</button>
		<button type="button" aria-label={t('zoomOut')} onclick={() => step(1 / 1.6)}>−</button>
		<button type="button" aria-label={t('recenter')} onclick={() => onselect(null)}>⤢</button>
	</div>
</div>

<style>
	.map {
		position: relative;
		flex: 1;
		min-height: 0;
		margin: 4px 12px 6px;
		touch-action: none;
		cursor: grab;
	}

	.is-dragging {
		cursor: grabbing;
	}

	svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	.kunta {
		stroke: #ffffff;
		stroke-width: 0.6;
		outline: none;
		/* Overrides the `.map` container's `grab`, which otherwise wins on the paths too — this is
		   what marks them as clickable rather than as more of the pannable surface. */
		cursor: pointer;
	}

	.is-dimmed {
		opacity: 0.55;
	}

	.kunta:hover,
	.is-hovered {
		stroke: var(--navy);
		stroke-width: 1.4;
	}

	.is-selected,
	.kunta:focus-visible {
		stroke: var(--navy);
		stroke-width: 2;
	}

	.tip {
		position: absolute;
		z-index: 20;
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 6px 9px;
		border-radius: 7px;
		background: #101a2b;
		color: #fff;
		font-size: 12px;
		line-height: 1.35;
		pointer-events: none;
		white-space: nowrap;
		box-shadow: 0 6px 18px rgba(16, 26, 43, 0.28);
	}

	.tip .rank {
		opacity: 0.6;
		font-size: 11px;
	}

	.zoom {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.zoom button {
		width: 30px;
		height: 30px;
		font: inherit;
		font-size: 15px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 8px;
		color: var(--ink);
		cursor: pointer;
		box-shadow: 0 1px 3px rgba(16, 26, 43, 0.06);
	}

	.zoom button:hover {
		background: var(--surface-2);
	}
</style>
