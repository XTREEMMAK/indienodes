import { reducedMotion } from './motion.svelte.js';

/**
 * Fade combined with a short slide, as one transition rather than two
 * stacked directives, so there is a single duration/easing to reason about.
 *
 * Reads `prefers-reduced-motion` itself. "Respected" does not mean
 * "eliminated": a brief, small, one-shot opacity change is not the kind of
 * motion that preference exists to suppress (parallax, spinning, anything
 * looping or large-distance is). So under reduced motion this keeps a
 * short fade and collapses the spatial travel down to a few px instead of
 * cutting the transition to zero duration, which reads as broken rather
 * than respectful.
 * @param {Element} node
 * @param {{ x?: number, y?: number, duration?: number, delay?: number }} [options]
 */
export function flyFade(node, { x = 0, y = 0, duration = 220, delay = 0 } = {}) {
	const skip = reducedMotion.current;
	const dx = skip ? Math.sign(x) * Math.min(Math.abs(x), 4) : x;
	const dy = skip ? Math.sign(y) * Math.min(Math.abs(y), 4) : y;
	return {
		delay: skip ? 0 : delay,
		duration: skip ? Math.min(duration, 120) : duration,
		css: (/** @type {number} */ t) =>
			`opacity: ${t}; transform: translate(${(1 - t) * dx}px, ${(1 - t) * dy}px);`
	};
}

/**
 * A pure fade for outgoing content, meant to pair with `flyFade` on the
 * incoming element in a `{#key}`-driven crossfade. Svelte keeps both the
 * outgoing and incoming elements in the DOM for the length of their
 * transitions, so if both stay in normal document flow the page briefly
 * shows both stacked on top of each other, a visible "pop" as the old
 * content's box pushes the new one before it finishes fading out. Taking
 * the outgoing element out of flow for the duration of its own transition
 * (its container needs `position: relative`) fixes that: it overlays the
 * incoming content instead of sharing space with it, and the incoming
 * element, left in normal flow, is what actually determines layout height.
 *
 * `pointer-events: none` for the same reason the positioning matters: for
 * the length of the transition, Svelte keeps BOTH the outgoing and incoming
 * elements mounted, so anything interactive in the outgoing content (a
 * button whose text happens to match the incoming step's own button, for
 * instance) is still clickable while it fades, sitting invisibly on top of
 * or behind whatever the incoming content just placed there. Content on its
 * way out should never be the thing a click actually lands on.
 * @param {Element} node
 * @param {{ duration?: number }} [options]
 */
export function outFade(node, { duration = 120 } = {}) {
	return {
		duration,
		css: (/** @type {number} */ t) =>
			`position: absolute; inset: 0; opacity: ${t}; pointer-events: none;`
	};
}

/**
 * Reveals or removes a `flex: 1` item by animating its own flex-basis from
 * 0 up to its measured natural width, instead of the usual opacity/translate
 * a transition leaves to itself. The point isn't this element's own motion —
 * it's that continuously changing its width forces the browser to reflow
 * `flex: 1` siblings on every frame, so they visibly slide over to make room
 * (or close the gap on the way out) instead of snapping to their new size
 * the instant this one mounts or unmounts. Meant for exactly that one
 * situation: an item appearing inside a row of equal-share flex siblings
 * that should make room rather than jump.
 *
 * Reduced motion collapses the width change itself rather than shortening
 * it, unlike `flyFade`'s small in-place travel: this transition moves
 * *other* elements' positions across the row via continuous reflow, which is
 * closer to what that preference exists to suppress than a small one-shot
 * fade is. A brief opacity fade stays, so the change is not instant and
 * silent, just not a wave of neighboring content sliding sideways.
 * @param {Element} node
 * @param {{ duration?: number }} [options]
 */
export function flexReveal(node, { duration = 260 } = {}) {
	const width = node.getBoundingClientRect().width;
	const skip = reducedMotion.current;
	return {
		duration: skip ? 120 : duration,
		css: (/** @type {number} */ t) =>
			skip
				? `opacity: ${t};`
				: `flex: 0 1 ${t * width}px; min-width: 0; overflow: hidden; opacity: ${t};`
	};
}
