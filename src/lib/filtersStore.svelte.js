import { browser } from '$app/environment';
import { SvelteSet } from 'svelte/reactivity';
import { STORAGE_KEYS, safeReadJson, safeWriteJson } from './storageKeys.js';

/**
 * Global tag narrowing for the pool the field view draws from. Local-only,
 * same as favorites and preferences: nothing here is a server-side query.
 *
 * An empty `tags` set means "no restriction," not "nothing matches": a
 * visitor who has set nothing sees everything, rather than an empty field.
 *
 * **The type filter that used to live here is gone.** Field nodes now
 * declare their own content type, and a global type exclusion layered on
 * top of that would strand a node with a permanently empty pool, with the
 * cause sitting in a different part of the app than the symptom. Tags move
 * onto nodes in the semantic pass, at which point this store and the
 * Settings tab that drives it are removed entirely (docs/decisions.md).
 *
 * This is deliberately not exposed as a control inside the field view
 * itself (brief section 7c: "the moment this view grows a filter control,
 * it has become a directory again").
 */
const STORAGE_KEY = STORAGE_KEYS.filters.key;

function load() {
	if (!browser) return { tags: [] };
	const parsed = safeReadJson(STORAGE_KEY, /** @type {{ tags?: unknown }} */ ({}));
	// `types` may still be present from a layout written before nodes carried
	// their own type. Read and discard rather than migrating: the setting no
	// longer has a meaning to migrate into.
	return { tags: Array.isArray(parsed.tags) ? parsed.tags : [] };
}

function createFiltersStore() {
	const initial = load();
	const tags = new SvelteSet(initial.tags);

	function persist() {
		if (!browser) return;
		safeWriteJson(STORAGE_KEY, { tags: [...tags] });
	}

	return {
		get tags() {
			return tags;
		},
		/** @param {string} tag */
		toggleTag(tag) {
			if (tags.has(tag)) {
				tags.delete(tag);
			} else {
				tags.add(tag);
			}
			persist();
		},
		clear() {
			tags.clear();
			persist();
		},
		/** @param {import('./ring.js').RingEntry} entry */
		matches(entry) {
			return tags.size === 0 || entry.tags.some((tag) => tags.has(tag));
		}
	};
}

export const filtersStore = createFiltersStore();
