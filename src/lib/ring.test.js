import { describe, expect, it } from 'vitest';
import { loadRing, ringEntries } from './ring.js';

/**
 * The ring document's shape is a public contract, and the reader is the half
 * of it this repo controls.
 *
 * `ring.json` was a bare top-level array for this project's whole life. Every
 * `embed.v1.js` already pasted onto a member's site fetches it and calls
 * `.map` on the result, and that file is regenerated on every build rather
 * than frozen -- so the reader can change ahead of the data, but never behind
 * it. These tests are what keep the bare-array path alive after the envelope
 * becomes the thing actually published.
 */

/** A minimal valid entry; the fields under test are structural, not content. */
const entry = {
	id: 'audio-example',
	creator: 'Example',
	type: 'audio',
	why: 'because',
	source_url: 'https://example.org',
	tags: ['one'],
	verification_token: 'token'
};

/**
 * A minimal fetch stand-in, cast to `typeof fetch` rather than typed exactly:
 * `loadRing` only ever calls `.ok`, `.status`, and `.json()` on what it gets
 * back, and a full `Response` mock would test nothing this suite cares about.
 * @param {unknown} body
 * @returns {typeof fetch}
 */
function respondWith(body, { ok = true, status = 200 } = {}) {
	return /** @type {typeof fetch} */ (
		/** @type {unknown} */ (async () => ({ ok, status, json: async () => body }))
	);
}

describe('ringEntries reads either document shape', () => {
	it('reads a bare array, which is what pasted widgets still fetch', () => {
		expect(ringEntries([entry])).toEqual([entry]);
	});

	it('reads a versioned envelope', () => {
		expect(ringEntries({ version: 1, entries: [entry] })).toEqual([entry]);
	});

	it('reads an envelope whose version it does not recognize', () => {
		// Deliberate: refusing data we would probably have understood is worse
		// than rendering what we recognize. Refusing outright is what a future
		// embed.v2.js is for, not what this function is for.
		expect(ringEntries({ version: 99, entries: [entry] })).toEqual([entry]);
	});

	it('treats a document with no usable entries as an empty ring', () => {
		for (const document of [null, undefined, {}, { entries: 'nope' }, 42, 'ring']) {
			expect(ringEntries(document)).toEqual([]);
		}
	});
});

describe('loadRing', () => {
	it('normalizes entries from both shapes identically', async () => {
		const fromArray = await loadRing(respondWith([entry]));
		const fromEnvelope = await loadRing(respondWith({ version: 1, entries: [entry] }));
		expect(fromArray).toEqual(fromEnvelope);
	});

	it('fills optional collections so callers can iterate without guarding', async () => {
		const [loaded] = await loadRing(respondWith([entry]));
		expect(loaded).toMatchObject({ tracks: [], pages: [], artworks: [], excerpts: [] });
	});

	it('throws on a failed response when no fallback was named', async () => {
		await expect(loadRing(respondWith([], { ok: false, status: 503 }))).rejects.toThrow('503');
	});

	it('falls back to the second source when the first fails', async () => {
		/** @type {string[]} */
		const requested = [];
		const fetchFn = /** @type {typeof fetch} */ (
			async (url) => {
				requested.push(String(url));
				if (url === 'https://data.example/ring.json') return { ok: false, status: 500 };
				return { ok: true, status: 200, json: async () => [entry] };
			}
		);

		const loaded = await loadRing(fetchFn, 'https://data.example/ring.json', '/ring.json');
		expect(requested).toEqual(['https://data.example/ring.json', '/ring.json']);
		expect(loaded).toHaveLength(1);
	});

	it('does not retry when the fallback is the URL that just failed', async () => {
		let calls = 0;
		const fetchFn = /** @type {typeof fetch} */ (
			/** @type {unknown} */ (
				async () => {
					calls++;
					return { ok: false, status: 500 };
				}
			)
		);

		await expect(loadRing(fetchFn, '/ring.json', '/ring.json')).rejects.toThrow('500');
		expect(calls).toBe(1);
	});
});
