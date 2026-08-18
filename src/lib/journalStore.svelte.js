import { browser } from '$app/environment';

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
const STORAGE_KEY = 'indienode:journal:v1';
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
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return coerceEvents(parsed?.events).slice(-MAX_EVENTS);
	} catch {
		return [];
	}
}

function createJournalStore() {
	let events = $state(load());

	function persist() {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, events }));
		} catch {
			// A full or disabled localStorage costs the journal, not the
			// session. favoritesStore's own write path is missing this guard;
			// this one has it deliberately.
		}
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
