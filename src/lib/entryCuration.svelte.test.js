import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hideEntry, likeEntry } from './entryCuration.js';
import { audioPlayerStore } from './audioPlayerStore.svelte.js';
import { favoritesStore } from './favoritesStore.svelte.js';
import { hiddenStore } from './hiddenStore.svelte.js';
import { journalStore } from './journalStore.svelte.js';

/**
 * These assert the brief's curation rules, not one component's reading of
 * them. Nothing tested them before: the rules were written out inside three
 * separate components, so there was no seam a test could reach, and they had
 * already drifted apart unnoticed.
 */

/** @type {import('./ring.js').RingEntry} */
const AUDIO_ENTRY = {
	id: 'audio-curation',
	creator: 'Test Artist',
	type: 'audio',
	why: 'Curation fixture.',
	source_url: 'https://example.com',
	tags: ['test'],
	tracks: [
		{ label: 'One', media_url: 'https://example.com/1.mp3' },
		{ label: 'Two', media_url: 'https://example.com/2.mp3' }
	],
	verification_token: 'test'
};

const ID = AUDIO_ENTRY.id;

/** Every action this entry has in the journal, oldest first. */
function actionsFor(/** @type {string} */ id) {
	return journalStore.events.filter((event) => event.id === id).map((event) => event.action);
}

function reset() {
	audioPlayerStore.clear();
	journalStore.clear();
	if (favoritesStore.isLiked(ID)) favoritesStore.toggle(ID);
	if (hiddenStore.isHidden(ID)) hiddenStore.toggle(ID);
}

beforeEach(reset);
afterEach(reset);

describe('like and Not for Me are mutually exclusive', () => {
	it('liking a dismissed entry clears the dismissal', () => {
		hideEntry(ID);
		expect(hiddenStore.isHidden(ID)).toBe(true);

		likeEntry(ID);

		expect(favoritesStore.isLiked(ID)).toBe(true);
		expect(hiddenStore.isHidden(ID)).toBe(false);
	});

	it('dismissing a liked entry clears the like', () => {
		likeEntry(ID);
		expect(favoritesStore.isLiked(ID)).toBe(true);

		hideEntry(ID);

		expect(hiddenStore.isHidden(ID)).toBe(true);
		expect(favoritesStore.isLiked(ID)).toBe(false);
	});

	it('never leaves an entry both wanted and not wanted', () => {
		for (const step of [likeEntry, hideEntry, likeEntry, hideEntry, likeEntry]) {
			step(ID);
			expect(favoritesStore.isLiked(ID) && hiddenStore.isHidden(ID)).toBe(false);
		}
	});
});

describe('the journal records the way in only', () => {
	it('records a like but not an un-like', () => {
		likeEntry(ID);
		expect(actionsFor(ID)).toEqual(['liked']);

		likeEntry(ID);

		expect(favoritesStore.isLiked(ID)).toBe(false);
		expect(actionsFor(ID)).toEqual(['liked']);
	});

	it('records a dismissal but not a restore', () => {
		hideEntry(ID);
		expect(actionsFor(ID)).toEqual(['hidden']);

		hideEntry(ID);

		expect(hiddenStore.isHidden(ID)).toBe(false);
		expect(actionsFor(ID)).toEqual(['hidden']);
	});
});

describe('dismissing drops what the node had queued', () => {
	it('removes every track the entry contributed', () => {
		audioPlayerStore.addEntry(AUDIO_ENTRY, null);
		expect(audioPlayerStore.queue).toHaveLength(2);

		hideEntry(ID);

		expect(audioPlayerStore.queue).toHaveLength(0);
	});

	it('leaves other nodes in the queue alone', () => {
		const other = {
			...AUDIO_ENTRY,
			id: 'audio-other',
			tracks: (AUDIO_ENTRY.tracks ?? []).slice(0, 1)
		};
		audioPlayerStore.addEntry(AUDIO_ENTRY, null);
		audioPlayerStore.addEntry(other, null);
		expect(audioPlayerStore.queue).toHaveLength(3);

		hideEntry(ID);

		expect(audioPlayerStore.queue).toHaveLength(1);
		expect(audioPlayerStore.queue[0].entryId).toBe('audio-other');
	});

	it('restoring does not re-queue anything', () => {
		audioPlayerStore.addEntry(AUDIO_ENTRY, null);
		hideEntry(ID);
		expect(audioPlayerStore.queue).toHaveLength(0);

		hideEntry(ID);

		expect(hiddenStore.isHidden(ID)).toBe(false);
		expect(audioPlayerStore.queue).toHaveLength(0);
	});
});

describe('both actions report which way they went', () => {
	it('so a caller can tell a dismissal from a restore', () => {
		expect(likeEntry(ID)).toBe('liked');
		expect(likeEntry(ID)).toBe('unliked');
		expect(hideEntry(ID)).toBe('hidden');
		expect(hideEntry(ID)).toBe('restored');
	});
});
