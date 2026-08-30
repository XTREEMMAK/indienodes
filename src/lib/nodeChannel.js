/**
 * What pool a field node draws from.
 *
 * A node is a *channel*: it declares a content type and, since the semantic
 * pass, a set of tags, and entries flow through it. This module owns the
 * "which entries belong to this channel" half of that — the pure half — so
 * the field page can memoize pools per distinct channel instead of filtering
 * per node per frame, and so the rules are testable without a ring, a
 * layout, or a rendered field.
 *
 * **Two tag layers, both local to the visitor, deliberately different in
 * scope.** `filtersStore` is the broad preference ("I am not interested in
 * horror, anywhere"); a node's own `tags` narrow one channel inside whatever
 * that leaves ("this particular node is my VGM node"). An empty selection at
 * either layer adds no restriction, so the common case — nothing set
 * anywhere — is the whole ring. See `docs/decisions.md` on why the two
 * coexist rather than one replacing the other, and on the empty-node
 * explanation that makes the interaction between them legible.
 */

/** @typedef {import('./ring.js').RingEntry} RingEntry */
/** @typedef {import('./nodeShape.js').NodeType} NodeType */

/**
 * Cleans a stored or user-supplied tag list into the canonical form
 * everything else here assumes: strings only, trimmed, no blanks, no
 * duplicates, sorted.
 *
 * Sorted specifically so `channelKey` below is stable regardless of the
 * order tags were clicked in — two nodes configured with the same tags in
 * different orders are the same channel and must share one pool, not build
 * two identical ones.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeTags(raw) {
	if (!Array.isArray(raw)) return [];
	const cleaned = raw
		.filter((tag) => typeof tag === 'string')
		.map((tag) => tag.trim())
		.filter(Boolean);
	return [...new Set(cleaned)].sort();
}

/**
 * A stable identity for "type plus tags", used to key memoized pools and
 * on-screen counts.
 *
 * `\n` as the separator rather than a comma: a tag is creator-supplied text
 * and could contain anything typed into a form, but not a newline, so this
 * cannot collide the way `audio|a,b` and `audio|a,b` from different splits
 * could.
 * @param {NodeType} type
 * @param {string[]} tags Already normalized.
 * @returns {string}
 */
export function channelKey(type, tags) {
	return tags.length === 0 ? type : `${type}\n${tags.join('\n')}`;
}

/**
 * Whether an entry satisfies a tag selection. An empty selection matches
 * everything — the "no restriction" rule, stated once here rather than at
 * each of the four call sites that would otherwise each have to remember it.
 * @param {RingEntry} entry
 * @param {ReadonlySet<string> | string[]} tags
 */
export function matchesTags(entry, tags) {
	const size = Array.isArray(tags) ? tags.length : tags.size;
	if (size === 0) return true;
	const has = Array.isArray(tags)
		? (/** @type {string} */ tag) => tags.includes(tag)
		: (/** @type {string} */ tag) => tags.has(tag);
	return entry.tags.some(has);
}

/**
 * Whether an entry belongs to a node's type at all. `any` takes everything,
 * which is what makes it the default a new node starts from.
 * @param {RingEntry} entry
 * @param {NodeType} type
 */
export function matchesType(entry, type) {
	return type === 'any' || entry.type === type;
}

/**
 * The tags actually available to a node of this type, sorted.
 *
 * Scoped to the type rather than offering every tag in the ring: a comic
 * node offered `chiptune` could only ever be configured into an empty
 * channel, and an option that cannot lead anywhere is worse than no option.
 * This is why the "your tags match nothing" state is rare rather than the
 * normal result of exploring the picker.
 * @param {RingEntry[]} entries
 * @param {NodeType} type
 * @returns {string[]}
 */
export function tagsForType(entries, type) {
	const found = new Set();
	for (const entry of entries) {
		if (!matchesType(entry, type)) continue;
		for (const tag of entry.tags) if (tag) found.add(tag);
	}
	return [...found].sort();
}

/**
 * Drops tags that no entry of this type carries any more.
 *
 * Called when a node's type changes: `tags` are kept across a retype rather
 * than cleared, because switching a node from Any to Audio should not throw
 * away a genre selection that still means something, but a tag that only
 * ever existed on comics has to go or the node lands in a permanently empty
 * state that reads as a bug rather than as a choice.
 * @param {string[]} tags
 * @param {RingEntry[]} entries
 * @param {NodeType} type
 * @returns {string[]}
 */
export function pruneTagsForType(tags, entries, type) {
	if (tags.length === 0) return tags;
	const available = new Set(tagsForType(entries, type));
	const kept = tags.filter((tag) => available.has(tag));
	return kept.length === tags.length ? tags : kept;
}
