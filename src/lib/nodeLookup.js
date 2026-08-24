/**
 * Finding a published node from what a creator actually remembers.
 *
 * `/update` used to require an exact node id, and that id is shown **nowhere**
 * in this app's interface: it lives in `ring.json`, in `{#each}` keys, and
 * inside `?report=` query strings. Someone who joined two years ago remembers
 * their site and their own name. They do not remember `audio-ashzone-xeno`.
 *
 * So this matches on any of the three, against the public ring data the
 * browser has already fetched. Nothing here is a security boundary — see
 * `updateStore.svelte.js`'s own header — because re-verification against the
 * node's current `source_url` is the only real gate. This decides what to
 * *prefill*, not what anyone is allowed to change.
 */

/**
 * The comparable part of a URL: host plus path, without scheme, `www.`, a
 * trailing slash, or case.
 *
 * Host *and* path, not host alone: several creators can legitimately share a
 * host (`bandcamp.com/artist-a`, `bandcamp.com/artist-b`), and collapsing to
 * the host would make every one of them match every other.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeUrl(value) {
	let text = String(value ?? '')
		.trim()
		.toLowerCase();
	if (!text) return '';
	text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
	text = text.replace(/^www\./, '');
	return text.replace(/\/+$/, '');
}

/** @param {string} value */
function normalizeName(value) {
	return String(value ?? '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

/**
 * Every node matching `query`, best first.
 *
 * Ranked rather than filtered, because the three kinds of match are not
 * equally certain. An exact id is unambiguous and returns alone; a URL is
 * nearly as good; a name is the loosest and is where two creators most
 * plausibly collide, which is why the caller is handed a list to choose from
 * rather than a guess.
 *
 * Typed loosely on purpose: callers pass whatever `ring.json` this browser
 * last cached, which may predate fields this build knows about, and every
 * read below already tolerates a missing one.
 *
 * @param {Record<string, any>[]} entries
 * @param {string} query an id, a site URL, or a creator name
 * @returns {Record<string, any>[]}
 */
export function findNodes(entries, query) {
	const raw = String(query ?? '').trim();
	if (!raw || !Array.isArray(entries)) return [];

	// An exact id is unambiguous: return it alone rather than alongside
	// anything its text happens to resemble.
	const byId = entries.find((entry) => entry.id === raw);
	if (byId) return [byId];

	const url = normalizeUrl(raw);
	const name = normalizeName(raw);

	/** @type {{ entry: Record<string, any>, rank: number }[]} */
	const hits = [];
	for (const entry of entries) {
		const entryUrl = normalizeUrl(entry.source_url ?? '');
		const entryName = normalizeName(entry.creator ?? '');

		if (entryUrl && url && (entryUrl === url || entryUrl.startsWith(`${url}/`))) {
			hits.push({ entry, rank: 1 });
		} else if (entryName && name && entryName === name) {
			hits.push({ entry, rank: 2 });
		} else if (entryName && name && name.length >= 3 && entryName.includes(name)) {
			// Partial names only from three characters up: shorter than that
			// matches most of the ring and is noise rather than a shortlist.
			hits.push({ entry, rank: 3 });
		}
	}

	return hits.sort((a, b) => a.rank - b.rank).map((hit) => hit.entry);
}
