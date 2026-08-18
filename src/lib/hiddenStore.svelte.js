import { browser } from '$app/environment';
import { SvelteSet } from 'svelte/reactivity';

/**
 * Entries marked "not for me," local-only, same storage tier and promise as
 * favoritesStore (brief section 8: nothing sent to a server). Stores just the
 * `id` strings, not full entries, for the same reason favoritesStore does:
 * it stays valid even if an entry's other fields change upstream.
 *
 * This is the inverse of a like, not its opposite: liking says nothing about
 * disliking, and hiding something never un-likes it. The two stores are
 * independent, so a visitor can like something and later decide they no
 * longer want to see it rotate through the field, without that costing them
 * the like.
 *
 * A hidden id is excluded from the field's own pool (`src/routes/+page.svelte`
 * builds `entries` from `ringStore` filtered against this) but not from
 * Lists' Liked tab, which is "what you liked," not "what still rotates" —
 * the two questions are unrelated.
 */
const STORAGE_KEY = 'indienode:hidden:v1';

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

function createHiddenStore() {
	const ids = new SvelteSet(load());

	function persist() {
		if (!browser) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
	}

	return {
		/** @param {string} id */
		isHidden(id) {
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
		clear() {
			ids.clear();
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

export const hiddenStore = createHiddenStore();
