import { browser } from '$app/environment';
import { SESSION_KEYS, STORAGE_KEYS, safeReadJson, safeWriteJson } from './storageKeys.js';

/**
 * Counts visits, and remembers that the one-time rating prompt has been
 * answered so it never appears again.
 *
 * THE BOUNDARY, and it is the same one `journalStore.svelte.js` states for
 * itself: nothing that decides what a visitor is SHOWN may read this. The
 * count gates one dialog, once, and reaches nothing else — not a deck, not a
 * pool, not a filter. A rating this app collected is never attached to a
 * creator, a Node, or a work, is never used to rank or recommend anything,
 * and never comes back into the app as a number a visitor can see. It answers
 * one question for the maintainer ("are repeat visitors enjoying this?") and
 * has no other reader.
 *
 * It is deliberately not a streak, a total, or a score. The count is never
 * displayed, there is no target to reach, nothing accumulates after the
 * threshold, and passing the threshold happens exactly once in the lifetime of
 * this browser's storage. See docs/decisions.md for why that is compatible
 * with section 11's ban on return-prompting mechanics, which was argued rather
 * than assumed.
 *
 * Two keys rather than one object: the visit count is a plain signal about
 * this browser, while the prompt state is specific to this feature, and
 * Settings' "Your data" panel lists each by its own name instead of one opaque
 * blob.
 */
const VISITS_KEY = STORAGE_KEYS.visitCount.key;
const PROMPT_KEY = STORAGE_KEYS.feedbackPrompt.key;
const VERSION = 1;

/**
 * Visits before the prompt becomes eligible. Someone has used this app ten
 * separate times before it asks them for anything at all.
 */
export const PROMPT_AFTER_VISITS = 10;

/**
 * Counted once per session rather than per navigation: this is a SvelteKit
 * app where moving between routes is a client-side render, so counting
 * navigations would reach ten in one sitting and measure something else
 * entirely. `sessionStorage` is the right tier for "this tab, this visit" and
 * is deliberately not in the storage catalog, which is about persistent data.
 */
const SESSION_FLAG = SESSION_KEYS.visitCounted;

/**
 * Backstop for the session flag. `sessionStorage` can throw on write (a
 * private window, a full quota) and then the flag never sticks, so a
 * storage-only guard would let the same page load count a visit more than
 * once. This module-scope boolean cannot fail, and holds for the life of the
 * JS context, which is exactly the span "this page load" means.
 */
let countedThisLoad = false;

/** @returns {number} */
function loadVisits() {
	if (!browser) return 0;
	const parsed = safeReadJson(VISITS_KEY, /** @type {{ count?: unknown }} */ ({}));
	const count = Number(parsed?.count);
	return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}

/** @returns {{ answered: boolean }} */
function loadPrompt() {
	if (!browser) return { answered: false };
	const parsed = safeReadJson(PROMPT_KEY, /** @type {{ answered?: unknown }} */ ({}));
	return { answered: parsed?.answered === true };
}

function createFeedbackStore() {
	let visits = $state(loadVisits());
	let answered = $state(loadPrompt().answered);

	return {
		get visits() {
			return visits;
		},

		/** Whether the prompt has already been shown and dealt with. */
		get answered() {
			return answered;
		},

		/**
		 * True when this browser has earned the one-time prompt. Read by the
		 * layout and by nothing that selects content.
		 */
		get eligible() {
			return browser && !answered && visits >= PROMPT_AFTER_VISITS;
		},

		/**
		 * Called once per session from the root layout. A tab that is already
		 * counted is a no-op, so reloading does not inflate the number.
		 */
		countVisit() {
			if (!browser || countedThisLoad) return;
			countedThisLoad = true;
			try {
				if (sessionStorage.getItem(SESSION_FLAG) === 'true') return;
				sessionStorage.setItem(SESSION_FLAG, 'true');
			} catch {
				// A blocked or full sessionStorage costs the cross-reload half
				// of this guard, so a reload may count again. That is worth an
				// early prompt at worst, and `countedThisLoad` above still
				// guarantees once per page load — which is what stops a caller
				// in a reactive context from counting in a loop.
			}
			visits += 1;
			safeWriteJson(VISITS_KEY, { version: VERSION, count: visits });
		},

		/**
		 * Marks the prompt done, whichever way it ended — submitted, skipped,
		 * or dismissed. Called BEFORE the network request, so a failed submit
		 * cannot bring the dialog back a second time.
		 */
		markAnswered() {
			if (!browser || answered) return;
			answered = true;
			safeWriteJson(PROMPT_KEY, { version: VERSION, answered: true });
		}
	};
}

export const feedbackStore = createFeedbackStore();
