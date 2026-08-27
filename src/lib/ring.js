/**
 * @typedef {object} RingEntry
 * @property {string} id
 * @property {string} creator
 * @property {string} [creator_id]
 * @property {'audio' | 'comic' | 'text' | 'game'} type
 * @property {string} why
 * @property {string} source_url
 * @property {string[]} tags
 * @property {{ label: string, media_url: string }[]} [tracks]
 * @property {{ image_url: string, caption?: string }[]} [pages]
 * @property {string[]} [excerpts]
 * @property {string} [excerpt] Legacy single-sample input, normalized to excerpts.
 * @property {string} [thumb_url]
 * @property {{ x: number, y: number }} [thumb_position]
 * @property {string} [preview_url]
 * @property {boolean} [explicit]
 * @property {string} verification_token
 */

/**
 * Normalizes a raw ring.json entry so every optional array field is at
 * least an empty array, rather than undefined, for callers that iterate
 * over them without a type-specific guard first.
 *
 * `explicit` is coerced to a real boolean rather than left as whatever the
 * file said, because it gates what a visitor sees: a truthy-but-not-true
 * value (the string "false", say) must not be able to make the difference
 * between showing and hiding adult content by accident.
 * @param {RingEntry} entry
 * @returns {RingEntry}
 */
function normalizeEntry(entry) {
	return {
		...entry,
		tags: entry.tags ?? [],
		tracks: entry.tracks ?? [],
		pages: entry.pages ?? [],
		excerpts: entry.excerpts ?? (entry.excerpt ? [entry.excerpt] : []),
		explicit: entry.explicit === true
	};
}

/**
 * Whether an entry may be shown, given the visitor's own setting.
 *
 * Deliberately a plain function taking the flag rather than a store read, so
 * every surface (field, members, favorites) filters by the same rule and the
 * rule itself stays testable without mounting anything.
 *
 * **Fails closed.** An entry is hidden unless the visitor has explicitly
 * asked to see explicit content, and `normalizeEntry` has already forced
 * `explicit` to a boolean, so a malformed or hand-edited entry that cannot be
 * read cleanly ends up hidden rather than shown. That is the right direction
 * for this particular default to fail in.
 * @param {RingEntry} entry
 * @param {boolean} showExplicit
 */
export function isVisibleTo(entry, showExplicit) {
	return showExplicit || entry.explicit !== true;
}

/**
 * The image that represents an entry on a field-view card, or null if it has
 * none and should fall back to a color wash.
 *
 * `thumb_url` is checked for every type, not just `game`. The schema declares
 * it at the top level and its `allOf` rules only make it *required* for game,
 * never forbidden elsewhere, so an audio entry pointing at its album art or a
 * text entry pointing at a header image is valid ring data. An earlier version
 * of this read `thumb_url` only for game entries, which silently discarded
 * real cover art that submitters had already provided.
 *
 * Comics fall back to their first page when no explicit `thumb_url` is set,
 * since a first page is a reasonable cover; an explicit `thumb_url` still wins
 * for a comic that would rather lead with something else.
 *
 * Shared with the preloader so the URL warmed before a swap is always exactly
 * the URL the card will then render.
 * @param {RingEntry} entry
 * @returns {string | null}
 */
export function coverImageUrl(entry) {
	return entry.thumb_url ?? (entry.type === 'comic' ? (entry.pages?.[0]?.image_url ?? null) : null);
}

/**
 * Loads and normalizes ring.json via fetch, for use in load functions and
 * in the standalone widget bundle. `url` defaults to a same-origin relative
 * path, which is right for the main app; the widget passes an absolute URL
 * (RING_JSON_URL from lib/config.js), since it is embedded on someone
 * else's origin and a relative fetch there would hit the host page's site
 * instead of this one.
 * @param {typeof fetch} fetchFn
 * @param {string} [url]
 * @returns {Promise<RingEntry[]>}
 */
export async function loadRing(fetchFn, url = '/ring.json') {
	const response = await fetchFn(url);
	if (!response.ok) {
		throw new Error(`Failed to load ring.json: ${response.status}`);
	}
	/** @type {RingEntry[]} */
	const entries = await response.json();
	return entries.map(normalizeEntry);
}
