import { describe, expect, it } from 'vitest';
import { findNodes, normalizeUrl } from './nodeLookup.js';

/**
 * The point of this module is that a creator should not have to remember a
 * string they were never shown. These cases are the ways someone actually
 * types their own site.
 */

/** @type {any[]} */
const RING = [
	{
		id: 'audio-ashzone-xeno',
		creator: 'AshZone',
		type: 'audio',
		source_url: 'https://ashzonemusic.bandcamp.com/album/xeno'
	},
	{
		id: 'comic-paper-lantern',
		creator: 'Paper Lantern Comics',
		type: 'comic',
		source_url: 'https://paperlantern.example/'
	},
	{
		id: 'text-loose-leaf',
		creator: 'Loose Leaf Press',
		type: 'text',
		source_url: 'https://www.looseleaf.example/writing'
	},
	{
		// Same host as AshZone, different creator: the case that makes
		// host-only matching wrong.
		id: 'audio-other-band',
		creator: 'Other Band',
		type: 'audio',
		source_url: 'https://otherband.bandcamp.com/album/thing'
	}
];

const idsOf = (/** @type {any[]} */ list) => list.map((entry) => entry.id);

describe('normalizeUrl', () => {
	it('ignores the parts people type inconsistently', () => {
		const expected = 'site.example/path';
		for (const written of [
			'https://site.example/path',
			'http://site.example/path',
			'https://www.site.example/path',
			'site.example/path',
			'  HTTPS://WWW.Site.Example/path/  '
		]) {
			expect(normalizeUrl(written), written).toBe(expected);
		}
	});

	it('survives empty and nonsense input', () => {
		expect(normalizeUrl('')).toBe('');
		expect(normalizeUrl(/** @type {any} */ (null))).toBe('');
	});
});

describe('finding a node', () => {
	it('matches an exact id, and returns only that', () => {
		expect(idsOf(findNodes(RING, 'audio-ashzone-xeno'))).toEqual(['audio-ashzone-xeno']);
	});

	it('matches the site someone would type from memory', () => {
		for (const typed of [
			'https://ashzonemusic.bandcamp.com/album/xeno',
			'ashzonemusic.bandcamp.com/album/xeno',
			'ashzonemusic.bandcamp.com'
		]) {
			expect(idsOf(findNodes(RING, typed)), typed).toContain('audio-ashzone-xeno');
		}
	});

	it('does not match a different creator on a shared host', () => {
		// bandcamp.com hosts both; matching on host alone would return both.
		const found = idsOf(findNodes(RING, 'ashzonemusic.bandcamp.com'));
		expect(found).toContain('audio-ashzone-xeno');
		expect(found).not.toContain('audio-other-band');
	});

	it('tolerates www and a trailing slash', () => {
		expect(idsOf(findNodes(RING, 'www.looseleaf.example/writing'))).toEqual(['text-loose-leaf']);
		expect(idsOf(findNodes(RING, 'https://paperlantern.example'))).toEqual(['comic-paper-lantern']);
	});

	it('matches a creator name, exactly or partially', () => {
		expect(idsOf(findNodes(RING, 'AshZone'))).toEqual(['audio-ashzone-xeno']);
		expect(idsOf(findNodes(RING, 'paper lantern'))).toEqual(['comic-paper-lantern']);
		expect(idsOf(findNodes(RING, 'LOOSE LEAF PRESS'))).toEqual(['text-loose-leaf']);
	});

	it('ranks a URL match above a looser name match', () => {
		/** @type {any[]} */
		const ring = [
			{ id: 'a', creator: 'Lantern Works', type: 'comic', source_url: 'https://other.example' },
			{ id: 'b', creator: 'Someone', type: 'comic', source_url: 'https://lantern.example' }
		];
		// "lantern.example" is a URL for b and a partial name for neither.
		expect(idsOf(findNodes(ring, 'lantern.example'))[0]).toBe('b');
	});

	it('returns every candidate when a name is ambiguous', () => {
		/** @type {any[]} */
		const ring = [
			{ id: 'a', creator: 'Paper Lantern Comics', type: 'comic', source_url: 'https://a.example' },
			{ id: 'b', creator: 'Paper Lantern Press', type: 'text', source_url: 'https://b.example' }
		];
		// Two real answers: the caller has to offer a choice, not guess.
		expect(idsOf(findNodes(ring, 'paper lantern')).sort()).toEqual(['a', 'b']);
	});

	it('ignores a fragment too short to be a shortlist', () => {
		// Two characters would match most of a real ring.
		expect(findNodes(RING, 'as')).toEqual([]);
	});

	it('finds nothing for an unrelated query, rather than guessing', () => {
		expect(findNodes(RING, 'nobody-here')).toEqual([]);
	});

	it('survives empty input and a missing ring', () => {
		expect(findNodes(RING, '')).toEqual([]);
		expect(findNodes(RING, '   ')).toEqual([]);
		expect(findNodes(/** @type {any} */ (null), 'x')).toEqual([]);
	});

	it('tolerates entries with fields missing', () => {
		const ring = [{ id: 'bare', type: 'audio' }];
		expect(() => findNodes(ring, 'anything')).not.toThrow();
		expect(findNodes(ring, 'bare')).toHaveLength(1);
	});
});
