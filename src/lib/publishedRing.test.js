import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The published ring must not carry test data.
 *
 * Four fictional members lived in `members/` for most of this project's life,
 * not because anyone wanted to publish them but because the end-to-end suite
 * needed one entry of every type to act on. That coupling had two costs: every
 * real deploy shipped four creators who do not exist, and the ring could not be
 * cleared for launch without turning twelve tests red.
 *
 * The suite now seeds its own ring (`testing/ring.e2e.json`, applied by
 * `testing/scripts/seed-e2e-ring.mjs`), so nothing needs a placeholder in
 * `members/` any more. This is the guard that keeps it that way — without it,
 * the next person who needs a comic entry to test against will add one here,
 * which is exactly how it happened the first time.
 *
 * `npm run validate:publish` already proves ring.json matches members/ and
 * fits the schema. This is the separate question of whether what it contains
 * is real.
 */

const ring = JSON.parse(readFileSync('ring.json', 'utf-8'));
/** @type {import('./ring.js').RingEntry[]} */
const entries = Array.isArray(ring) ? ring : (ring.entries ?? []);

/**
 * Every URL an entry can carry, flattened.
 * @param {import('./ring.js').RingEntry} entry
 */
function urlsOf(entry) {
	/** @type {(string | undefined)[]} */
	const raw = [
		entry.source_url,
		entry.thumb_url,
		entry.preview_url,
		...(entry.tracks ?? []).map(trackUrl),
		...(entry.pages ?? []).map(pageUrl)
	];
	return /** @type {string[]} */ (raw.filter(Boolean));
}

/** @param {{ media_url: string }} track */
const trackUrl = (track) => track.media_url;
/** @param {{ image_url: string }} page */
const pageUrl = (page) => page.image_url;
/** @param {import('./ring.js').RingEntry} entry */
const idOf = (entry) => entry.id;
/** @param {import('./ring.js').RingEntry} entry */
const hasTestDomain = (entry) =>
	urlsOf(entry).some((u) => /(^|\.)(invalid|example\.com|localhost)/i.test(new URL(u).hostname));
/** @param {import('./ring.js').RingEntry} entry */
const looksLikePlaceholder = (entry) => /placeholder|example|lorem/i.test(entry.creator);
/** @param {string} f */
const isExampleFile = (f) => /^example-/.test(f);

describe('the published ring contains only real members', () => {
	it('is a well-formed list, empty or not', () => {
		// Deliberately not "has at least one entry". A ring with no members is a
		// legitimate state, not a broken one: it is where this project started,
		// where it returns if every member is removed, and — the case that
		// actually argues for it — where anyone forking this to run their own
		// ring begins. Failing the suite on day one of a fork would make an
		// empty ring a problem to work around rather than a state to grow out
		// of.
		//
		// Verified against a genuinely empty ring rather than assumed: every
		// route serves, the field view says "The ring is empty right now",
		// /members offers its empty state and hides the search box, and ambient
		// opens to "No visual entries are available" and a silent session, with
		// no uncaught errors anywhere.
		expect(Array.isArray(entries)).toBe(true);
	});

	it('points at no reserved test domain', () => {
		// `.invalid` is reserved and can never resolve, so its presence in the
		// published artifact is proof of test data rather than a broken link.
		const offenders = entries.filter(hasTestDomain).map(idOf);
		expect(offenders).toEqual([]);
	});

	it('names no entry as a placeholder', () => {
		const offenders = entries.filter(looksLikePlaceholder).map(idOf);
		expect(offenders).toEqual([]);
	});

	it('carries no member file named as an example', () => {
		const offenders = readdirSync('members').filter(isExampleFile);
		expect(offenders).toEqual([]);
	});
});
