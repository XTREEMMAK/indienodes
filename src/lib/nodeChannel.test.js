import { describe, expect, it } from 'vitest';
import {
	channelKey,
	matchesTags,
	matchesType,
	normalizeTags,
	pruneTagsForType,
	tagsForType
} from './nodeChannel.js';

/**
 * @param {string} id
 * @param {string} type
 * @param {string[]} tags
 * @returns {import('./ring.js').RingEntry}
 */
const entry = (id, type, tags) =>
	/** @type {any} */ ({ id, type, tags, creator: id, why: '', source_url: '' });

const RING = [
	entry('a1', 'audio', ['vgm', 'chiptune']),
	entry('a2', 'audio', ['lo-fi']),
	entry('c1', 'comic', ['slice-of-life']),
	entry('t1', 'text', ['essay', 'lo-fi'])
];

describe('normalizeTags', () => {
	it('sorts, trims, dedupes, and drops blanks', () => {
		expect(normalizeTags([' vgm', 'chiptune', 'vgm', '  ', 'chiptune'])).toEqual([
			'chiptune',
			'vgm'
		]);
	});

	it('reads anything that is not a list of strings as no restriction', () => {
		// This is the migration path: a layout written before tags existed has
		// no `tags` key at all, and "no restriction" is the right reading of it.
		expect(normalizeTags(undefined)).toEqual([]);
		expect(normalizeTags(null)).toEqual([]);
		expect(normalizeTags('vgm')).toEqual([]);
		expect(normalizeTags([1, {}, 'vgm'])).toEqual(['vgm']);
	});
});

describe('channelKey', () => {
	it('is the bare type when nothing narrows it', () => {
		expect(channelKey('audio', [])).toBe('audio');
	});

	it('does not depend on the order tags were clicked in', () => {
		// Two nodes configured the same way have to share one pool and one
		// deck; keying them apart would double the work and let each deal the
		// other's upcoming entries.
		expect(channelKey('audio', normalizeTags(['vgm', 'chiptune']))).toBe(
			channelKey('audio', normalizeTags(['chiptune', 'vgm']))
		);
	});

	it('separates channels that differ only by type or only by tags', () => {
		expect(channelKey('audio', ['vgm'])).not.toBe(channelKey('text', ['vgm']));
		expect(channelKey('audio', ['vgm'])).not.toBe(channelKey('audio', ['lo-fi']));
		expect(channelKey('audio', ['vgm'])).not.toBe(channelKey('audio', []));
	});
});

describe('matchesTags', () => {
	it('treats an empty selection as no restriction, not as nothing', () => {
		expect(matchesTags(RING[0], [])).toBe(true);
		expect(matchesTags(RING[0], new Set())).toBe(true);
	});

	it('matches on any tag rather than all of them', () => {
		expect(matchesTags(RING[0], ['vgm', 'jazz'])).toBe(true);
		expect(matchesTags(RING[0], ['jazz'])).toBe(false);
	});

	it('accepts either an array or a set', () => {
		expect(matchesTags(RING[1], new Set(['lo-fi']))).toBe(true);
		expect(matchesTags(RING[1], new Set(['vgm']))).toBe(false);
	});
});

describe('matchesType', () => {
	it('lets an "any" node take everything', () => {
		expect(RING.every((e) => matchesType(e, 'any'))).toBe(true);
	});

	it('otherwise matches exactly', () => {
		expect(matchesType(RING[0], 'audio')).toBe(true);
		expect(matchesType(RING[0], 'comic')).toBe(false);
	});
});

describe('tagsForType', () => {
	it('offers only tags a node of that type could actually match', () => {
		// The picker is scoped this way so a comic node is never offered
		// `chiptune`, which could only ever configure it into an empty channel.
		expect(tagsForType(RING, 'audio')).toEqual(['chiptune', 'lo-fi', 'vgm']);
		expect(tagsForType(RING, 'comic')).toEqual(['slice-of-life']);
	});

	it('spans every type for an "any" node', () => {
		expect(tagsForType(RING, 'any')).toEqual([
			'chiptune',
			'essay',
			'lo-fi',
			'slice-of-life',
			'vgm'
		]);
	});

	it('returns nothing for a type the ring has none of', () => {
		expect(tagsForType(RING, 'game')).toEqual([]);
	});
});

describe('pruneTagsForType', () => {
	it('keeps a tag that still means something after a retype', () => {
		// lo-fi exists on both audio and text, so switching an audio node to
		// text should not silently discard the selection.
		expect(pruneTagsForType(['lo-fi'], RING, 'text')).toEqual(['lo-fi']);
	});

	it('drops a tag the new type cannot carry', () => {
		expect(pruneTagsForType(['vgm', 'lo-fi'], RING, 'text')).toEqual(['lo-fi']);
	});

	it('returns the same array when nothing is dropped, so callers can compare identity', () => {
		const tags = ['lo-fi'];
		expect(pruneTagsForType(tags, RING, 'audio')).toBe(tags);
		expect(pruneTagsForType([], RING, 'game')).toEqual([]);
	});

	it('can empty a selection entirely, which reads as no restriction', () => {
		expect(pruneTagsForType(['vgm'], RING, 'comic')).toEqual([]);
	});
});
