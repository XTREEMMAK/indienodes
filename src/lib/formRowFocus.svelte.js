/**
 * Taking the visitor to a repeatable row that was just added.
 *
 * `/join` and `/update` both build entries out of repeatable rows — tracks,
 * pages, excerpts, social links — and both had their own byte-identical copy
 * of this, including the reasoning below. The audit called out that
 * duplication; this is it, stated once.
 *
 * Kept as an action rather than an `$effect` keyed on the pending uid for a
 * specific reason: the row's DOM has to exist before anything can focus or
 * scroll to it, and an action runs exactly when its node mounts. An effect
 * would fire on the state change and race the render.
 */

/**
 * Focuses a heading when it mounts, so moving between steps takes screen
 * reader and keyboard users to the new step rather than leaving them where
 * the old step's markup used to be.
 * @param {HTMLElement} node
 */
export function focusHeading(node) {
	node.focus();
}

/**
 * One form's "which row did we just add" state, plus the action that acts on it.
 *
 * Returned as a pair to be destructured, because Svelte's `use:` directive
 * takes a plain identifier: `use:scrollNewRowIntoView={row.uid}`.
 */
export function createNewRowFocus() {
	let pending = $state('');

	return {
		/**
		 * Records that this uid's row is the one just created. Called by the
		 * add handlers, which is why they are named functions rather than
		 * inline arrows — an inline arrow discards the new row's uid the
		 * instant the assignment finishes, leaving nothing to scroll to.
		 * @param {string} uid
		 */
		mark(uid) {
			pending = uid;
		},

		/**
		 * Svelte action for a repeatable row.
		 *
		 * Every "Add a track" / "Add a page" / "Add a link" button appends to
		 * an array that already has rows above it, inside a scroll region, so
		 * a new row routinely lands below the fold. Nothing about clicking a
		 * plain `<button>` scrolls anything into view on its own.
		 *
		 * Focus happens first, with `preventScroll`. Calling `scrollIntoView()`
		 * and then focusing a descendant queues two competing scroll intents on
		 * the same container in the same tick — the browser's own implicit
		 * "scroll the newly focused element into view" cancels the explicit
		 * smooth scroll before its animation starts, leaving the container at
		 * scrollTop 0 with the row still clipped below it. Only one of the two
		 * gets to run; this makes sure it is the intended one.
		 *
		 * @param {HTMLElement} node
		 * @param {string} uid
		 */
		scrollNewRowIntoView(node, uid) {
			if (uid !== pending) return;
			pending = '';
			/** @type {HTMLElement | null} */
			const target = node.querySelector('input, textarea, select');
			target?.focus({ preventScroll: true });
			node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	};
}
