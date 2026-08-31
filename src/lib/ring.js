import DOMPurify from 'isomorphic-dompurify';

/**
 * @typedef {object} RingEntry
 * @property {string} id
 * @property {string} creator
 * @property {string} [creator_id]
 * @property {'audio' | 'comic' | 'text' | 'game' | 'art'} type
 * @property {string} why
 * @property {string} source_url
 * @property {string[]} tags
 * @property {{ label: string, media_url: string }[]} [tracks]
 * @property {{ image_url: string, caption?: string }[]} [pages]
 * @property {{ image_url: string, alt: string, title?: string, year?: string, medium?: string, external_url?: string }[]} [artworks]
 * @property {{ title?: string, text: string, audio_url?: string }[]} [excerpts]
 * @property {string} [excerpt] Legacy single-sample input, normalized to excerpts.
 * @property {string} [thumb_url]
 * @property {{ x: number, y: number }} [thumb_position]
 * @property {string} [preview_url]
 * @property {string} [trailer_url]
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
		artworks: entry.artworks ?? [],
		// `excerpts` moved from a plain string array to `{ text, audio_url? }`
		// objects. Real ring.json entries still on disk predate that change,
		// and the older single-`excerpt` string predates `excerpts` entirely,
		// so both are lifted into the current shape here rather than requiring
		// a one-time data migration.
		excerpts: (entry.excerpts ?? (entry.excerpt ? [entry.excerpt] : [])).map((sample) =>
			typeof sample === 'string' ? { text: sample } : sample
		),
		explicit: entry.explicit === true
	};
}

/**
 * Sanitizes a text sample's rich content before it is either persisted or
 * rendered. Called twice by design, not redundantly: once in
 * `toRingEntry` before an entry is ever written to `ring.json`, and again
 * wherever a sample is rendered with `{@html}`, since every route here
 * prerenders (see `+layout.js`), so render-time sanitization runs during the
 * Node build as well as in the browser — `isomorphic-dompurify` covers both
 * without two separate code paths.
 *
 * The allowlist is prose-only: headings, paragraphs, restrained inline
 * emphasis, links, lists, and blockquotes, but no images, scripts, or styling
 * hooks. Join and Update expose a still smaller toolbar tailored to a work
 * sample (headings, paragraph, emphasis, history, and plain-text paste).
 * Existing safe list/link/quote markup remains readable for compatibility;
 * formatting outside the allowlist is silently dropped rather than rejected,
 * matching the form's tolerant handling of other trimmed input.
 * @param {string} html
 * @returns {string}
 */
export function sanitizeExcerptHtml(html) {
	return DOMPurify.sanitize(html ?? '', {
		ALLOWED_TAGS: [
			'h1',
			'h2',
			'h3',
			'p',
			'br',
			'strong',
			'em',
			'u',
			's',
			'a',
			'ul',
			'ol',
			'li',
			'blockquote'
		],
		ALLOWED_ATTR: ['href']
	});
}

/**
 * Sanitizes a creator's bio to **inline** markup only.
 *
 * Deliberately narrower than `sanitizeExcerptHtml`: every generated template
 * renders the bio inside a paragraph of its own (`<p class="bio-text">` and
 * friends), so a block element here would nest a `<p>` inside a `<p>` and
 * the browser would silently close the outer one early, breaking the layout
 * around it. Restricting the tags is what lets the bio become rich text
 * without touching the markup of thirteen templates.
 *
 * Paragraph boundaries are converted to `<br />` before sanitizing rather
 * than dropped: the editor always wraps its content in `<p>`, so stripping
 * those outright would silently run a two-paragraph bio together into one
 * line of prose.
 * @param {string | null | undefined} html
 * @returns {string}
 */
export function sanitizeBioHtml(html) {
	const withBreaks = String(html ?? '')
		.replace(/<\/p>\s*<p[^>]*>/gi, '<br />')
		.replace(/<\/?p[^>]*>/gi, '');
	return DOMPurify.sanitize(withBreaks, {
		ALLOWED_TAGS: ['br', 'strong', 'em', 'u', 's', 'a'],
		ALLOWED_ATTR: ['href']
	}).trim();
}

/**
 * Plain-text approximation of a sample's HTML, for contexts that cannot use
 * markup: text-to-speech and anywhere excerpts are joined into one passage.
 * A regex strip rather than a DOM parse, so this runs identically during
 * prerendering (Node, no DOM) and in the browser without pulling in a DOM
 * dependency just for this.
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
	return (html ?? '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();
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
	return (
		entry.thumb_url ??
		(entry.type === 'comic'
			? entry.pages?.[0]?.image_url
			: entry.type === 'art'
				? entry.artworks?.[0]?.image_url
				: null) ??
		null
	);
}

/**
 * The entries carried by a ring document, whichever shape it is in.
 *
 * `ring.json` has been a bare top-level array for this project's whole life,
 * and every `embed.v1.js` already pasted onto a member's site fetches it
 * expecting exactly that. The envelope adds a `version` so a future breaking
 * change can announce itself rather than be inferred from the data, but the
 * bare array has to keep working: this reader ships *before* the data changes,
 * never after, or the widget throws on `.map` on somebody else's page.
 *
 * An unrecognized version is read anyway rather than refused. A client that
 * rejects data it would probably have understood is worse than one that renders
 * what it recognizes, and `normalizeEntry` already supplies every optional
 * field. Refusing outright is what a future `embed.v2.js` is for.
 * @param {unknown} document
 * @returns {RingEntry[]}
 */
export function ringEntries(document) {
	if (Array.isArray(document)) return /** @type {RingEntry[]} */ (document);
	const entries = /** @type {{ entries?: unknown } | null | undefined} */ (document)?.entries;
	return Array.isArray(entries) ? /** @type {RingEntry[]} */ (entries) : [];
}

/**
 * One ring document, fetched and normalized. Split out of `loadRing` only so
 * the fallback below can reuse it without recursing.
 * @param {typeof fetch} fetchFn
 * @param {string} url
 * @returns {Promise<RingEntry[]>}
 */
async function fetchRing(fetchFn, url) {
	const response = await fetchFn(url);
	if (!response.ok) {
		throw new Error(`Failed to load ring.json: ${response.status}`);
	}
	return ringEntries(await response.json()).map(normalizeEntry);
}

/**
 * Loads and normalizes the ring, for use in load functions and in the
 * standalone widget bundle. `url` defaults to a same-origin relative
 * path, which is right for the main app; the widget passes an absolute URL
 * (RING_JSON_URL from lib/config.js), since it is embedded on someone
 * else's origin and a relative fetch there would hit the host page's site
 * instead of this one.
 *
 * `fallbackUrl` exists for the split between a canonical ring endpoint and
 * this origin's own copy. The widget runs on other people's sites, so pointing
 * it at a second host trades one failure domain for two; trying the canonical
 * URL first and falling back to the copy served beside the widget itself buys
 * the freshness without paying that trade. Nothing falls back by default — a
 * caller has to name the second source, because a silent retry against a URL
 * nobody asked for is how a stale copy becomes invisible.
 * @param {typeof fetch} fetchFn
 * @param {string} [url]
 * @param {string | null} [fallbackUrl]
 * @returns {Promise<RingEntry[]>}
 */
export async function loadRing(fetchFn, url = '/ring.json', fallbackUrl = null) {
	try {
		return await fetchRing(fetchFn, url);
	} catch (error) {
		if (!fallbackUrl || fallbackUrl === url) throw error;
		return fetchRing(fetchFn, fallbackUrl);
	}
}
