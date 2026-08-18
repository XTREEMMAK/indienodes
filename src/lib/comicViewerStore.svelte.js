/**
 * Which comic the reader is showing, if any.
 *
 * A store with a single mount at the root layout, mirroring
 * `aboutModalStore`, rather than each card rendering its own viewer. Three
 * reasons, in order of weight:
 *
 * 1. The reader is a full-screen surface. Rendering one per node would mean a
 *    dozen of them in the tree at once, all but one closed, each carrying its
 *    own key handlers and scroll-lock effect.
 * 2. It has to outlive the card that opened it. A node rotates its entry on a
 *    timer, and `FieldSlot` keys on entry id, so a viewer owned by the card
 *    would be torn down mid-read the moment its node moved on.
 * 3. Both the field and Lists render `FieldNode`, so a shared store means
 *    the reader opens the same way from either without either page knowing
 *    the reader exists.
 */

/** @typedef {import('./ring.js').RingEntry} RingEntry */

function createComicViewerStore() {
	/** @type {RingEntry | null} */
	let entry = $state(null);
	let initialPage = $state(0);

	return {
		get entry() {
			return entry;
		},
		get open() {
			return entry !== null;
		},
		get initialPage() {
			return initialPage;
		},
		/**
		 * @param {RingEntry} value
		 * @param {number} [page]
		 */
		show(value, page = 0) {
			entry = value;
			initialPage = page;
		},
		hide() {
			entry = null;
			initialPage = 0;
		}
	};
}

export const comicViewerStore = createComicViewerStore();
