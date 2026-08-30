/**
 * Marks a scroll container with whether it has anything hidden below.
 *
 * Written for the join and update forms, whose step navigation is now pinned
 * to the bottom of the scrolling step rather than sitting at the end of it.
 * A pinned bar solves "the buttons are always reachable" and creates a new
 * problem in the same move: it covers the bottom edge of the content, so a
 * step that continues past the fold looks exactly like one that ends there.
 * The bar has to say which it is, and that needs a fact only the DOM knows.
 *
 * Two classes, both on the container:
 *
 * - `has-overflow` — the content is taller than the box.
 * - `at-bottom` — and the reader has reached the end of it.
 *
 * So "there is more below" is `has-overflow` and not `at-bottom`, which is
 * what the pinned bar draws its edge and fade for.
 *
 * Plain classes rather than reactive state on purpose: the only consumer is
 * CSS, and routing this through a store would re-render a form on every
 * scroll event to change something no template reads.
 *
 * @param {HTMLElement} node
 */
export function scrollAffordance(node) {
	function update() {
		// Sub-pixel layout makes an exactly-full container read as
		// overflowing by a fraction, and a scrolled-to-the-end one as a
		// fraction short, so both comparisons carry a pixel of slack.
		const overflow = node.scrollHeight - node.clientHeight;
		const scrollable = overflow > 1;
		node.classList.toggle('has-overflow', scrollable);
		node.classList.toggle('at-bottom', scrollable && node.scrollTop >= overflow - 1);
	}

	update();
	node.addEventListener('scroll', update, { passive: true });

	// The box resizing and its content growing are different events and both
	// change the answer: a viewport resize is the first, adding a link row to
	// a form is the second, and a ResizeObserver on the container alone would
	// miss it entirely.
	const resized = new ResizeObserver(update);
	resized.observe(node);
	const mutated = new MutationObserver(update);
	mutated.observe(node, { childList: true, subtree: true });

	return {
		destroy() {
			node.removeEventListener('scroll', update);
			resized.disconnect();
			mutated.disconnect();
		}
	};
}
