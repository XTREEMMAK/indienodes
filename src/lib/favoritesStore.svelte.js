import { browser } from '$app/environment';
import { SvelteSet } from 'svelte/reactivity';
import { STORAGE_KEYS, safeReadJson, safeWriteJson } from './storageKeys.js';

/**
 * Liked entries, local-only (brief section 8: "Likes... stored in the
 * visitor's own localStorage. Nothing sent to a server."). Stores just the
 * `id` strings, not full entries, so it stays valid even if an entry's
 * other fields change upstream.
 */
const STORAGE_KEY = STORAGE_KEYS.favorites.key;

function load() {
	if (!browser) return /** @type {string[]} */ ([]);
	const parsed = safeReadJson(STORAGE_KEY, /** @type {string[]} */ ([]));
	return Array.isArray(parsed) ? parsed : [];
}

function createFavoritesStore() {
	const ids = new SvelteSet(load());

	function persist() {
		if (!browser) return;
		// Was an unguarded write: a private window or a full quota threw out of
		// the click handler, so the like failed rather than merely not
		// persisting. journalStore's own comment used to point at this gap.
		safeWriteJson(STORAGE_KEY, [...ids]);
	}

	return {
		/** @param {string} id */
		isLiked(id) {
			return ids.has(id);
		},
		/** @param {string} id */
		toggle(id) {
			if (ids.has(id)) {
				ids.delete(id);
			} else {
				ids.add(id);
			}
			persist();
		},
		get size() {
			return ids.size;
		},
		get ids() {
			return ids;
		}
	};
}

export const favoritesStore = createFavoritesStore();
