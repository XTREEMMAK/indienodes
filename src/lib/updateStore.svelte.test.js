import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from './storageKeys.js';
import { createUpdateStore } from './updateStore.svelte.js';

/**
 * `/update`'s draft, and the property that brought these tests about: an email
 * typed here used to survive in the browser between visits, while `/join`
 * deliberately never kept one. An address given for a single message should
 * not outlive that message because someone closed a tab.
 *
 * The rest of the draft must still survive, which is the half that protects
 * someone's half-finished change request.
 */

const KEY = STORAGE_KEYS.updateDraft.key;

/** @param {unknown} [draft] */
function freshStore(draft) {
	localStorage.clear();
	if (draft !== undefined) localStorage.setItem(KEY, JSON.stringify(draft));
	return createUpdateStore();
}

/** @type {any[]} */
const RING = [
	{
		id: 'audio-ashzone-xeno',
		creator: 'AshZone',
		type: 'audio',
		why: 'Tape loops.',
		tags: ['ambient'],
		source_url: 'https://ashzonemusic.bandcamp.com/album/xeno'
	},
	{
		id: 'comic-paper-lantern',
		creator: 'Paper Lantern Comics',
		type: 'comic',
		why: 'Ink and rain.',
		tags: ['comics'],
		source_url: 'https://paperlantern.example/'
	}
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	localStorage.clear();
});

describe('the email never reaches storage', () => {
	it('is not written when the draft persists', () => {
		const store = freshStore();
		store.nodeId = 'audio-ashzone-xeno';
		store.email = 'private@example.com';
		store.touch();
		vi.runAllTimers();

		const raw = localStorage.getItem(KEY) ?? '';
		expect(raw).toContain('audio-ashzone-xeno');
		expect(raw).not.toContain('private@example.com');
	});

	it('is not restored from a draft written by an older build', () => {
		// Those drafts exist in real browsers right now, so dropping it on the
		// way out is not enough on its own.
		const store = freshStore({
			nodeId: 'audio-ashzone-xeno',
			entry: { creator: 'AshZone' },
			email: 'left@example.com'
		});
		expect(store.email).toBe('');
	});

	it('starts each session with the re-affirmation ungiven', () => {
		const store = freshStore({ nodeId: 'x', entry: {}, rightsReaffirmed: true });
		expect(store.rightsReaffirmed).toBe(false);
	});
});

describe('the rest of the draft still survives', () => {
	it('brings back the node and the edits in progress', () => {
		const store = freshStore({
			nodeId: 'comic-paper-lantern',
			entry: { creator: 'Paper Lantern Comics', why: 'A rewritten pitch.' }
		});
		expect(store.nodeId).toBe('comic-paper-lantern');
		expect(store.entry.why).toBe('A rewritten pitch.');
	});

	it('ignores a draft with no node id rather than half-loading it', () => {
		const store = freshStore({ entry: { creator: 'Orphaned' } });
		expect(store.nodeId).toBe('');
		expect(store.entry.creator).toBe('');
	});
});

describe('finding the node without knowing its id', () => {
	it('matches an exact id', () => {
		const store = freshStore();
		store.nodeId = 'audio-ashzone-xeno';
		store.lookup(RING);
		expect(store.node?.id).toBe('audio-ashzone-xeno');
		expect(store.notFound).toBe(false);
	});

	it('matches the site address someone would actually remember', () => {
		const store = freshStore();
		store.nodeId = 'ashzonemusic.bandcamp.com';
		store.lookup(RING);
		expect(store.node?.id).toBe('audio-ashzone-xeno');
	});

	it('matches a creator name', () => {
		const store = freshStore();
		store.nodeId = 'paper lantern';
		store.lookup(RING);
		expect(store.node?.id).toBe('comic-paper-lantern');
	});

	it('replaces what was typed with the real id once matched', () => {
		// The backend is asked about the node's own id, never the search text.
		const store = freshStore();
		store.nodeId = 'AshZone';
		store.lookup(RING);
		expect(store.nodeId).toBe('audio-ashzone-xeno');
	});

	it('seeds the edit step from the matched node', () => {
		const store = freshStore();
		store.nodeId = 'AshZone';
		store.lookup(RING);
		expect(store.entry.creator).toBe('AshZone');
		expect(store.entry.source_url).toBe('https://ashzonemusic.bandcamp.com/album/xeno');
		expect(store.entry.tags).toEqual(['ambient']);
	});

	it('offers a choice instead of guessing when several match', () => {
		/** @type {any[]} */
		const ambiguous = [
			{ id: 'a', creator: 'Paper Lantern Comics', type: 'comic', source_url: 'https://a.example' },
			{ id: 'b', creator: 'Paper Lantern Press', type: 'text', source_url: 'https://b.example' }
		];
		const store = freshStore();
		store.nodeId = 'paper lantern';
		store.lookup(ambiguous);

		expect(store.node).toBeNull();
		expect(store.matches.map((m) => m.id).sort()).toEqual(['a', 'b']);

		store.select(store.matches[0]);
		expect(store.node?.id).toBe('a');
		expect(store.matches).toEqual([]);
	});

	it('reports nothing found without blocking the flow', () => {
		const store = freshStore();
		store.nodeId = 'not-in-this-ring';
		store.lookup(RING);
		expect(store.node).toBeNull();
		expect(store.notFound).toBe(true);
		// Verification is the real gate, so an unmatched id still continues.
		expect(store.isStepComplete('identify')).toBe(true);
	});

	it('does not report "not found" for an empty field', () => {
		const store = freshStore();
		store.nodeId = '';
		store.lookup(RING);
		expect(store.notFound).toBe(false);
	});
});
