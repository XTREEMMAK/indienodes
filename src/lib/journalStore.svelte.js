import { browser } from '$app/environment';
import { STORAGE_KEYS, safeReadJson, safeWriteJson } from './storageKeys.js';

/**
 * A local-only record of what this visitor has actually engaged with: entries
 * opened, liked, or listened through. Same storage tier as favorites, same
 * promise (brief section 8: nothing sent to any server).
 *
 * THE RULE THAT MAKES THIS LEGITIMATE, and it is not a style preference:
 * this store is WRITE-ONLY WITH RESPECT TO SELECTION. Nothing that decides
 * what a visitor is shown may read it. Not the shuffled decks in
 * `src/routes/+page.svelte`, not `audioSuggest.js`, not any pool or filter.
 *
 * Recording what someone did is a record. Feeding it back into what they are
 * shown next is "behavioral inference," which the brief forbids by name
 * (section 8: "draws only from declared `tags` data, never inferred
 * behavior"), and the entire difference between the two is whether anything
 * reads this file. It exists to be reflected back to the visitor when they
 * go looking for it, and for nothing else.
 *
 * It is also not a score. No totals, no streaks, no thresholds, nothing that
 * surfaces unprompted (section 11).
 */
const STORAGE_KEY = STORAGE_KEYS.journal.key;
const VERSION = 1;

/**
 * Oldest events are dropped past this. localStorage is a few MB per origin
 * and shared with the layout, favorites, and preferences, so an uncapped
 * append-only log is the one thing here that could actually grow into a
 * problem.
 */
const MAX_EVENTS = 500;

/** @typedef {'opened' | 'liked' | 'hidden' | 'listened'} JournalAction */

/**
 * @typedef {object} JournalEvent
 * @property {string} id Entry id, not the entry itself, so the record stays
 *   valid when an entry's other fields change upstream (same reasoning as
 *   favoritesStore).
 * @property {JournalAction} action
 * @property {number} at Epoch ms.
 */

const ACTIONS = ['opened', 'liked', 'hidden', 'listened'];

/**
 * @param {unknown} value
 * @returns {JournalEvent[]}
 */
function coerceEvents(value) {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(event) =>
			event &&
			typeof event === 'object' &&
			typeof event.id === 'string' &&
			typeof event.at === 'number' &&
			ACTIONS.includes(event.action)
	);
}

/** @returns {JournalEvent[]} */
function load() {
	if (!browser) return [];
	const parsed = safeReadJson(STORAGE_KEY, /** @type {{ events?: unknown }} */ ({}));
	return coerceEvents(parsed?.events).slice(-MAX_EVENTS);
}

function createJournalStore() {
	let events = $state(load());

	function persist() {
		if (!browser) return;
		// A full or disabled localStorage costs the journal, not the session —
		// which is now `safeWriteJson`'s contract rather than this one store's
		// local guard. (It used to note that favoritesStore was missing the
		// same guard; every store shares this one now.)
		safeWriteJson(STORAGE_KEY, { version: VERSION, events });
	}

	return {
		/**
		 * @param {string} id
		 * @param {JournalAction} action
		 */
		record(id, action) {
			if (!id || !ACTIONS.includes(action)) return;
			const next = [...events, { id, action, at: Date.now() }];
			// FIFO, so the trail is a moving window of recent history rather
			// than a permanent archive that can only grow.
			events = next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
			persist();
		},
		clear() {
			events = [];
			persist();
		},
		get events() {
			return events;
		},
		get size() {
			return events.length;
		}
	};
}

export const journalStore = createJournalStore();
