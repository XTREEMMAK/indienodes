<script>
	/**
	 * Horizontal multi-step progress bar with an ember/particle trail off the
	 * leading edge, ported from lbhq.kjnet.us's request form
	 * (`src/lib/components/StepProgress.svelte` there). The mechanic is
	 * copied faithfully: same gradient-reveal trick, same canvas particle
	 * emitter, same responsive label collapse. What changed crossing over is
	 * only the palette, remapped to this app's own tokens (see the CSS
	 * below) rather than lbhq's literal brand colors, and `reduce` now reads
	 * this project's existing `reducedMotion` store instead of taking a prop
	 * the caller would otherwise have to derive itself.
	 *
	 * **The fill reveals a fixed cool→warm→ember gradient as it grows**
	 * (rather than recoloring it), so the bar visibly warms up as a
	 * submitter advances and lands on solid gold when every step is done.
	 * Embers spawn off the leading edge on a canvas layered over the track.
	 */
	import { reducedMotion } from '$lib/motion.svelte.js';

	/**
	 * @typedef {object} Props
	 * @property {number} step Zero-based index of the current step among `labels`.
	 * @property {number} total
	 * @property {string[]} [labels]
	 * @property {boolean[]} [reachable] Parallel to `labels`: whether each step can be jumped to directly right now. Defaults to every step being reachable when omitted.
	 * @property {(index: number) => void} [onStepClick] Omit to keep the bar read-only, matching its original behavior.
	 */
	/** @type {Props} */
	let { step, total, labels = [], reachable, onStepClick } = $props();

	/** @param {number} i */
	function isReachable(i) {
		return reachable ? reachable[i] : true;
	}

	const pct = $derived(Math.min(1, Math.max(0, (step + 1) / total)));
	const complete = $derived(pct >= 1);

	// The gradient child is sized so it always spans the FULL track no matter
	// how narrow the fill is: 33% fill needs a 300%-wide gradient to show the
	// first third of it. Without this the gradient would squash into the
	// fill and every step would look identical.
	const gradWidth = $derived(pct > 0 ? 100 / pct : 100);

	/** @type {HTMLDivElement | undefined} */
	let track = $state();
	/** @type {HTMLCanvasElement | undefined} */
	let canvas = $state();
	/** @type {HTMLDivElement | undefined} */
	let fill = $state();
	/** @type {HTMLOListElement | undefined} */
	let labelsEl = $state();

	// Keeps the current step's label in view as `step` changes, so a
	// visitor advancing through up to 8 steps never has to scroll the strip
	// by hand to see which one they're on. `inline: 'center'` does the
	// horizontal work; `block: 'nearest'` is load-bearing, not a default
	// left in place — without it this can trigger an unwanted page-level
	// vertical scroll to bring the whole element into the viewport
	// (the same reason `scrollNewRowIntoView` in the join page uses it).
	$effect(() => {
		if (!labelsEl || step < 0) return;
		const el = labelsEl.querySelector('li.current');
		el?.scrollIntoView({
			inline: 'center',
			block: 'nearest',
			behavior: reducedMotion.current ? 'instant' : 'smooth'
		});
	});

	$effect(() => {
		if (reducedMotion.current || !track || !canvas || !fill) return;

		const trackEl = track;
		const canvasEl = canvas;
		const fillEl = fill;

		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;
		let w = 0;
		let h = 0;

		// How far the canvas extends past the track's own edges, generously
		// to the left since spray drifts that way. Mirrored by the static
		// top/left offsets in the .embers CSS below.
		const SPREAD_TOP = 22;
		const SPREAD_RIGHT = 14;
		const SPREAD_BOTTOM = 10;
		const SPREAD_LEFT = 78;

		const resize = () => {
			const dpr = window.devicePixelRatio || 1;
			// <canvas> is a replaced element: CSS's "stretch to fill when both
			// left and right are set" auto-width rule does not apply to it the
			// way it does to a <div>, so an explicit width/height has to be
			// set here for the canvas to actually extend past the track the
			// way the CSS implies. Position (top/left) still comes from CSS,
			// since that works fine on a replaced element.
			const trackRect = trackEl.getBoundingClientRect();
			w = trackRect.width + SPREAD_LEFT + SPREAD_RIGHT;
			h = trackRect.height + SPREAD_TOP + SPREAD_BOTTOM;
			canvasEl.style.width = `${w}px`;
			canvasEl.style.height = `${h}px`;
			canvasEl.width = Math.max(1, Math.round(w * dpr));
			canvasEl.height = Math.max(1, Math.round(h * dpr));
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};

		const ro = new ResizeObserver(resize);
		ro.observe(trackEl);
		resize();

		/**
		 * @typedef {{ x: number, y: number, vx: number, vy: number, r: number, life: number, decay: number, color: string }} Ember
		 */

		/** @type {Ember[]} */
		const embers = [];
		const computed = getComputedStyle(trackEl);

		// Named, not `const cssVar = (/** @type {string} */ name) => ...`: a
		// JSDoc type-cast written directly inside an arrow function's own
		// parameter parens is mishandled by Svelte's compiler in `.svelte`
		// files (it wraps the parameter in an extra layer of parens and
		// produces invalid "parenthesized pattern" syntax once compiled,
		// which only breaks under strict-mode evaluation — SSR in dev, not
		// the production build, which is what made this easy to miss until
		// it actually loaded here). A `@param` above a named function's own
		// declaration gives the same inference without tripping it.
		/** @param {string} name */
		function cssVar(name) {
			return computed.getPropertyValue(name).trim();
		}

		const palette = [cssVar('--step-warm'), cssVar('--step-ember'), cssVar('--step-gold')];
		const goldPalette = [cssVar('--step-gold'), cssVar('--step-gold-light'), cssVar('--step-warm')];

		/**
		 * @param {number} edgeX
		 * @param {number} trackMidY
		 * @param {number} trackH
		 * @param {number} count
		 * @param {boolean} gold
		 */
		const spawn = (edgeX, trackMidY, trackH, count, gold) => {
			const colors = gold ? goldPalette : palette;
			for (let i = 0; i < count; i++) {
				embers.push({
					x: edgeX + (Math.random() - 0.5) * 3,
					// Confined to the bar's own thickness (with a touch of give
					// either side), so sparks read as coming off the bar
					// itself rather than scattered anywhere across the
					// canvas's drift margin.
					y: trackMidY + (Math.random() - 0.5) * (trackH * 1.6),
					// Sprays left, trailing off behind the fill's direction of
					// travel rather than drifting evenly in both directions.
					vx: -(Math.random() * 1.1 + 0.25),
					vy: -(Math.random() * 0.5 + 0.15),
					r: Math.random() * 1.6 + 0.6,
					life: 1,
					decay: Math.random() * 0.016 + 0.009,
					color: colors[Math.floor(Math.random() * colors.length)]
				});
			}
		};

		// Burst when the fill jumps to a new step. Compared against the
		// rendered fraction rather than `step` so the burst tracks what's
		// actually on screen.
		let lastPct = -1;
		/** @type {number} */
		let raf;

		const tick = () => {
			ctx.clearRect(0, 0, w, h);

			// canvas/track/fill rects, all measured fresh this frame rather
			// than cached from resize(). ResizeObserver only fires on SIZE
			// changes, so a cached position goes stale the moment the page
			// scrolls or anything above this component reflows without the
			// track itself resizing, at which point the fill (measured
			// fresh) and the canvas (measured once, stale) disagree about
			// where "the edge" is even though neither has actually moved
			// relative to the other. Reading all three together every frame
			// means they can never fall out of sync.
			const canvasRect = canvasEl.getBoundingClientRect();
			const trackRect = trackEl.getBoundingClientRect();
			const fillRect = fillEl.getBoundingClientRect();
			const edgeX = fillRect.right - canvasRect.left;
			const trackMidY = trackRect.top - canvasRect.top + trackRect.height / 2;
			const trackH = trackRect.height;
			const gold = complete;

			// The bar is done and the visitor has moved on to the last
			// step's fields; stop throwing new sparks at it. Whatever's
			// already in flight keeps drifting and fading out on its own.
			if (!complete) {
				if (lastPct !== pct) {
					if (lastPct >= 0) spawn(edgeX, trackMidY, trackH, 26, gold);
					lastPct = pct;
				}
				// Idle trickle so the edge never looks dead.
				if (Math.random() < 0.3) spawn(edgeX, trackMidY, trackH, 1, gold);
			} else {
				lastPct = pct;
			}

			for (let i = embers.length - 1; i >= 0; i--) {
				const p = embers[i];
				p.x += p.vx;
				p.y += p.vy;
				p.vy *= 0.985;
				p.life -= p.decay;

				if (p.life <= 0) {
					embers.splice(i, 1);
					continue;
				}

				ctx.globalAlpha = Math.max(0, p.life);
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
				ctx.fill();
			}

			ctx.globalAlpha = 1;
			raf = requestAnimationFrame(tick);
		};

		tick();

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	});
</script>

<div class="step-progress">
	<div
		class="track"
		class:complete
		bind:this={track}
		role="progressbar"
		aria-valuenow={step + 1}
		aria-valuemin={1}
		aria-valuemax={total}
		aria-label="Submission progress"
	>
		<div
			class="fill"
			class:complete
			class:reduce={reducedMotion.current}
			style="width: {pct * 100}%"
			bind:this={fill}
		>
			<div class="fill-grad" style="width: {gradWidth}%"></div>
		</div>
		{#if !reducedMotion.current}
			<canvas class="embers" bind:this={canvas} aria-hidden="true"></canvas>
		{/if}
	</div>

	{#if labels.length}
		<ol class="labels" bind:this={labelsEl} role="tablist" aria-label="Submission steps">
			{#each labels as label, i (label)}
				<li class:done={i < step} class:current={i === step} class:locked={!isReachable(i)}>
					<button
						type="button"
						role="tab"
						aria-selected={i === step}
						disabled={!isReachable(i)}
						onclick={() => onStepClick?.(i)}
					>
						<span class="num">{i < step ? '✓' : i + 1}</span>
						<span class="txt">{label}</span>
					</button>
				</li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	.step-progress {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.track {
		position: relative;
		height: 6px;
		border-radius: 999px;
		background: var(--border);
		/* Embers drift above the bar, so the canvas must not be clipped. */
		overflow: visible;

		/* This component's own semantic palette: a cool-to-warm-to-gold
		   journey as the bar fills, independent of --accent (which is warm
		   in light mode but cool-toned blue in dark mode, and would break
		   the "warms up as you go" story if reused directly here). Reusing
		   --accent/--accent-hover for --step-warm/--step-ember in light mode
		   only, since they happen to already sit in the right part of the
		   story there. */
		--step-cool: #5b7fa6;
		--step-warm: #b5502f;
		--step-ember: #8a3319;
		--step-gold: #ca8a04;
		--step-gold-light: #e0a838;
	}

	@media (prefers-color-scheme: dark) {
		:root:not([data-theme='light']) .track {
			--step-cool: #6ea8f0;
			--step-warm: #e0935f;
			--step-ember: #c76a3a;
			--step-gold: #eab308;
			--step-gold-light: #f4cf6a;
		}
	}

	:root[data-theme='dark'] .track {
		--step-cool: #6ea8f0;
		--step-warm: #e0935f;
		--step-ember: #c76a3a;
		--step-gold: #eab308;
		--step-gold-light: #f4cf6a;
	}

	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		border-radius: 999px;
		overflow: hidden;
		transition: width 0.55s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.fill.reduce {
		transition: none;
	}

	.fill-grad {
		position: absolute;
		inset: 0 auto 0 0;
		height: 100%;
		background: linear-gradient(90deg, var(--step-cool), var(--step-warm) 62%, var(--step-ember));
		transition: background 0.5s ease;
	}

	.fill.complete .fill-grad {
		background: linear-gradient(
			90deg,
			var(--step-warm),
			var(--step-gold) 45%,
			var(--step-gold-light)
		);
	}

	.fill.complete {
		animation: barPulse 1.9s ease-in-out infinite;
	}

	@keyframes barPulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgb(202 138 4 / 0.5);
		}
		50% {
			box-shadow:
				0 0 14px 2px rgb(202 138 4 / 0.55),
				0 0 30px 6px rgb(181 80 47 / 0.28);
		}
	}

	.embers {
		position: absolute;
		/* Only the position, not the size: canvas is a replaced element, so
		   right/bottom offsets here would be silently ignored (see the long
		   comment in the resize() function above). Width/height are set
		   explicitly in JS instead; this only anchors the top-left corner. */
		top: -22px;
		left: -78px;
		pointer-events: none;
	}

	.labels {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		list-style: none;
		margin: 0;
		padding: 0;
		/* Safety net alongside .labels li's own white-space: nowrap: with
		   enough steps at a narrow-but-not-quite-mobile width, nowrap labels
		   can add up to more than the container's width. Scrolling that
		   overflow is what stands in for wrapping, so a crowded row never
		   forces the page itself wider or clips a label outright.

		   overflow-y must be set explicitly: a lone overflow-x: auto still
		   leaves the y-axis computing to `visible`, and the CSS overflow spec
		   forces a `visible` paired against a non-`visible` sibling axis to
		   resolve to `auto` too — so without this, the intended single-row
		   horizontal scroller picks up its own unwanted vertical scrollbar. */
		overflow-x: auto;
		overflow-y: hidden;
		/* Overflowed labels fade out at the edges instead of clipping hard —
		   the scroll itself stays live, only the visual edge reads as
		   hidden. */
		mask-image: linear-gradient(
			to right,
			transparent 0,
			black 24px,
			black calc(100% - 24px),
			transparent 100%
		);
		-webkit-mask-image: linear-gradient(
			to right,
			transparent 0,
			black 24px,
			black calc(100% - 24px),
			transparent 100%
		);
	}

	.labels li {
		display: flex;
		white-space: nowrap;
	}

	/* Reset to a plain, unstyled hit target: the visual language (color,
	   opacity, spacing) all lives here now instead of on <li>, since the
	   clickable element is the button, not the list item. */
	.labels li button {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		border: none;
		background: none;
		margin: 0;
		padding: 0.2rem 0.1rem;
		font: inherit;
		font-family: var(--font-body);
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-faint);
		opacity: 0.6;
		cursor: pointer;
		transition:
			opacity 0.3s,
			color 0.3s;
	}

	.labels li.done button,
	.labels li.current button {
		opacity: 1;
	}

	.labels li.current button {
		color: var(--accent);
		font-weight: 600;
	}

	.labels li button:not(:disabled):hover,
	.labels li button:not(:disabled):focus-visible {
		color: var(--accent);
	}

	/* A step ahead of what's actually reachable yet: still visible (the
	   whole point of the bar is showing the shape of what's left), but not
	   a real target — no hover/focus color change, no pointer cursor. */
	.labels li.locked button {
		cursor: not-allowed;
	}

	.labels li.locked button:disabled {
		opacity: 0.35;
	}

	.num {
		display: grid;
		place-items: center;
		width: 1.3rem;
		height: 1.3rem;
		flex-shrink: 0;
		border-radius: 50%;
		border: 1px solid var(--border);
		font-size: var(--text-xs);
		/* Otherwise inherits .labels li's uppercase-label letter-spacing,
		   which pads the glyph's own box on the right (letter-spacing trails
		   every character, including the last), so place-items: center then
		   centers glyph-plus-padding instead of the glyph — the digit reads
		   visibly left-of-center in the circle. */
		letter-spacing: normal;
		/* Otherwise inherits whatever line-height the surrounding text
		   stack sets (well over 1), which makes the *line box* place-items
		   is actually centering taller than the circle itself — the glyph
		   then centers within that oversized line box, not within the
		   visible circle, and reads as sitting above center. A line-height
		   of 1 makes the line box match the glyph's own em-square, which is
		   what place-items needs to center against the circle correctly. */
		line-height: 1;
	}

	.labels li.current .num {
		border-color: var(--accent);
		color: var(--accent);
	}

	.labels li.done .num {
		border-color: var(--step-gold, var(--accent));
		color: var(--step-gold, var(--accent));
	}

	/* Below ~30rem the labels crowd; keep only the active one legible,
	   matching how the previous vertical sidebar's mobile breakpoint also
	   hid step text and kept just the number badges. */
	@media (max-width: 30rem) {
		.labels li .txt {
			display: none;
		}

		.labels li.current .txt {
			display: inline;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}

		.fill.complete {
			animation: none;
			box-shadow: 0 0 10px 1px rgb(202 138 4 / 0.4);
		}
	}
</style>
