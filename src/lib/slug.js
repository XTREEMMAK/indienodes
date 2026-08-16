/**
 * Entry id generation.
 *
 * The schema requires `id` and constrains it to `^[a-z0-9]+(-[a-z0-9]+)*$`.
 * `submission-form-spec.md` section 2.1 states that it is generated at
 * approval time and is never a form field, because uniqueness is a property
 * of `ring.json` *as it exists at merge time*, and the file can gain entries
 * between someone starting a draft and a maintainer approving it.
 *
 * So the authoritative generation happens in the submission workflow, not
 * here. This module exists because the same rule has to be applied in two
 * places and disagreeing about it would be worse than duplicating it: the
 * form shows the submitter a preview of the id their entry will get, and the
 * workflow computes the real one against the live file. Keeping the shape in
 * one tested module is what lets the preview be honest.
 *
 * The preview is labelled as provisional in the UI for exactly the reason
 * above: it is computed against the ring as the submitter's browser last saw
 * it, and the real one is computed later against the merged file.
 */

/** Leaves room for a `-10`-scale suffix inside a sane total length. */
const MAX_BASE_LENGTH = 48;

/**
 * Reduces arbitrary text to the schema's id alphabet.
 *
 * Unicode is normalized to NFKD and combining marks are stripped first, so
 * accented Latin degrades to its base letters ("Café" to "cafe") rather than
 * having those characters dropped outright. That matters here: creator names
 * are the main input to this function and mangling them is a bad first
 * impression, but the schema's pattern is ASCII-only and this is the last
 * point where anything can be done about it.
 *
 * Scripts with no Latin decomposition (Cyrillic, Han, Arabic) reduce to
 * nothing, which is why {@link entrySlug} has a fallback and does not assume
 * this returns a non-empty string. Transliterating them properly needs a
 * library per script and is not worth it for a field nobody reads: the id is
 * a URL-safe key, and `creator` carries the actual name everywhere it is
 * displayed.
 * @param {string} value
 * @returns {string}
 */
export function slugify(value) {
	return (
		(value ?? '')
			.normalize('NFKD')
			// Combining diacritical marks, written as escapes rather than literal
			// characters so the rule survives any editor or tool that would
			// normalize this file's own bytes back into composed form.
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
	);
}

/**
 * The base id for an entry, before any collision suffix.
 *
 * Composed as type-creator so ids sort into type groups and stay readable in
 * a diff, which is the one place a human actually looks at them: the pull
 * request that adds the entry to `ring.json`. There is no work-level title to
 * fold in here any more (a node represents a creator, not a single work, per
 * the Creator Nodes addendum), so two nodes of the same type from the same
 * creator collide on this base and rely entirely on {@link uniqueEntryId}'s
 * suffix, which is exactly the case that mechanism exists for (a creator's
 * two linked nodes, capped at that same count for the same reason).
 *
 * Truncation cuts at a hyphen where one is close enough to the limit, rather
 * than mid-word, so a truncated id still reads as words. If nothing suitable
 * is near the cut, it takes the hard truncation and strips any trailing
 * hyphen, since a trailing hyphen would violate the schema's pattern.
 * @param {{ type?: string, creator?: string }} entry
 * @returns {string}
 */
export function entrySlug(entry) {
	const base = [entry?.type, entry?.creator]
		.map((part) => slugify(String(part ?? '')))
		.filter(Boolean)
		.join('-');

	// Every part was empty or non-Latin. Callers must still get a valid id.
	if (!base) return 'entry';

	if (base.length <= MAX_BASE_LENGTH) return base;

	const cut = base.slice(0, MAX_BASE_LENGTH);
	const lastHyphen = cut.lastIndexOf('-');
	const trimmed = lastHyphen > MAX_BASE_LENGTH - 12 ? cut.slice(0, lastHyphen) : cut;
	return trimmed.replace(/-+$/, '') || 'entry';
}

/**
 * The final id, given the ids already in the ring.
 *
 * Suffixes start at `-2` rather than `-1`, so the first duplicate reads as
 * "the second one of these" instead of implying the original was `-1`.
 *
 * Takes the existing ids as an argument rather than reading `ring.json`
 * itself, because the two callers get that list from completely different
 * places (the browser's already-loaded ring store; the workflow's fetch of
 * the file at merge time) and neither should be reimplemented inside the
 * other.
 * @param {{ type?: string, creator?: string }} entry
 * @param {Iterable<string>} existingIds
 * @returns {string}
 */
export function uniqueEntryId(entry, existingIds = []) {
	const taken = new Set(existingIds);
	const base = entrySlug(entry);
	if (!taken.has(base)) return base;

	let n = 2;
	while (taken.has(`${base}-${n}`)) n++;
	return `${base}-${n}`;
}
