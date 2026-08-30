/**
 * Which text entry the full-sample reader is showing, if any.
 *
 * A store with a single mount at the root layout, mirroring
 * `comicViewerStore` and its own reasoning: the reader is a full-screen
 * surface that would otherwise need one instance per node, and it has to
 * outlive the card that opened it, since `FieldSlot` rotates its entry on a
 * timer and keys on entry id — a viewer owned by the card would be torn down
 * mid-read the moment its node moved on. Kept as its own store rather than
 * folded into `comicViewerStore`: that one's shape (`pages`, `kind`) and the
 * component it backs are image/page-specific, with nothing for prose to
 * reuse.
 */

/** @typedef {import('./ring.js').RingEntry} RingEntry */

function createTextViewerStore() {
	/** @type {RingEntry | null} */
	let entry = $state(null);

	return {
		get entry() {
			return entry;
		},
		get open() {
			return entry !== null;
		},
		/** @param {RingEntry} value */
		show(value) {
			entry = value;
		},
		hide() {
			entry = null;
		}
	};
}

export const textViewerStore = createTextViewerStore();
