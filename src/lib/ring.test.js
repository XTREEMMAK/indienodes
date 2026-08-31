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
 *
 * The `loadRing` block below also covers hardening added once `RING_ENDPOINT_URL`
 * (see `lib/config.js`) could point this app at a host this codebase does not
 * operate: a size ceiling, a fetch timeout, a content-type check, and
 * per-entry runtime validation that drops what does not look safe to render
 * rather than trusting a remote response fully because it parsed as JSON.
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
 * A minimal `Response` stand-in, cast to `typeof fetch` rather than typed
 * exactly: `loadRing` only ever reads `.ok`, `.status`, `.headers.get`, and
 * `.text()` on what it gets back, and a full `Response` mock would test
 * nothing this suite cares about.
 * @param {unknown} body
 * @param {{ ok?: boolean, status?: number, contentType?: string, contentLength?: string }} [options]
 * @returns {typeof fetch}
 */
function respondWith(
	body,
	{ ok = true, status = 200, contentType = 'application/json', contentLength } = {}
) {
	const text = typeof body === 'string' ? body : JSON.stringify(body);
	return /** @type {typeof fetch} */ (
		/** @type {unknown} */ (
			async () => ({
				ok,
				status,
				headers: {
					get: (/** @type {string} */ name) => {
						if (name === 'content-type') return contentType;
						if (name === 'content-length') return contentLength ?? String(text.length);
						return null;
					}
				},
				text: async () => text
			})
		)
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
				return respondWith([entry])(url);
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

	it('rejects a response over the size ceiling, by declared content-length', async () => {
		await expect(
			loadRing(respondWith([entry], { contentLength: String(9 * 1024 * 1024) }))
		).rejects.toThrow('too large');
	});

	it('rejects a response over the size ceiling even with no content-length header', async () => {
		const hugeEntry = { ...entry, why: 'x'.repeat(9 * 1024 * 1024) };
		await expect(loadRing(respondWith([hugeEntry], { contentLength: undefined }))).rejects.toThrow(
			'too large'
		);
	});

	describe('per-entry runtime validation', () => {
		it('drops an entry missing a required field', async () => {
			const missingCreator = { ...entry, creator: undefined };
			const loaded = await loadRing(respondWith([entry, missingCreator]));
			expect(loaded.map((e) => e.id)).toEqual([entry.id]);
		});

		it('drops an entry with an unrecognized type', async () => {
			const badType = { ...entry, id: 'bad-type', type: 'video' };
			const loaded = await loadRing(respondWith([entry, badType]));
			expect(loaded.map((e) => e.id)).toEqual([entry.id]);
		});

		it('drops an entry whose source_url is not https', async () => {
			for (const source_url of ['http://example.org', 'javascript:alert(1)', 'data:text/html,x']) {
				const unsafe = { ...entry, id: 'unsafe', source_url };
				const loaded = await loadRing(respondWith([unsafe]));
				expect(loaded).toEqual([]);
			}
		});

		it('drops an entry whose thumb_url is not https, even with a safe source_url', async () => {
			const unsafeThumb = { ...entry, id: 'unsafe-thumb', thumb_url: 'javascript:alert(1)' };
			const loaded = await loadRing(respondWith([unsafeThumb]));
			expect(loaded).toEqual([]);
		});

		it('drops individual unsafe nested media rather than the whole entry', async () => {
			const mixed = {
				...entry,
				tracks: [
					{ label: 'ok', media_url: 'https://example.org/a.mp3' },
					{ label: 'bad', media_url: 'javascript:alert(1)' }
				]
			};
			const [loaded] = await loadRing(respondWith([mixed]));
			expect(loaded.tracks).toEqual([{ label: 'ok', media_url: 'https://example.org/a.mp3' }]);
		});
	});
});
