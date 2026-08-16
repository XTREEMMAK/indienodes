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
 * @param {Element} node
 * @param {{ duration?: number }} [options]
 */
export function outFade(node, { duration = 120 } = {}) {
	return {
		duration,
		css: (/** @type {number} */ t) => `position: absolute; inset: 0; opacity: ${t};`
	};
}
