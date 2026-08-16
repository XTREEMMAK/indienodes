import { browser } from '$app/environment';
import { SvelteSet } from 'svelte/reactivity';

/**
 * Liked entries, local-only (brief section 8: "Likes... stored in the
 * visitor's own localStorage. Nothing sent to a server."). Stores just the
 * `id` strings, not full entries, so it stays valid even if an entry's
 * other fields change upstream.
 */
const STORAGE_KEY = 'indienode:favorites:v1';

function load() {
	if (!browser) return /** @type {string[]} */ ([]);
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function createFavoritesStore() {
	const ids = new SvelteSet(load());

	function persist() {
		if (!browser) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
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
