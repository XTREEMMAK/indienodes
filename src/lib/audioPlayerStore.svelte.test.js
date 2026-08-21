import { afterEach, describe, expect, it } from 'vitest';
import { audioPlayerStore } from './audioPlayerStore.svelte.js';

/** @type {import('./ring.js').RingEntry} */
const ENTRY = {
	id: 'audio-test',
	creator: 'Test Artist',
	type: 'audio',
	why: 'Queue behavior fixture.',
	source_url: 'https://example.com',
	tags: ['test'],
	tracks: [{ label: 'Test Track', media_url: 'https://example.com/test.mp3' }],
	verification_token: 'test'
};

afterEach(() => audioPlayerStore.clear());

describe('audio queue expansion', () => {
	it('opens for an explicit add', () => {
		audioPlayerStore.addEntry(ENTRY, null);
		expect(audioPlayerStore.queueOpen).toBe(true);
	});

	it('stays closed for an automatic Keep Going add', () => {
		audioPlayerStore.addEntry(ENTRY, null, { openQueue: false });
		expect(audioPlayerStore.queueOpen).toBe(false);
	});

	it('stays open when automatic continuation appends to an already open queue', () => {
		audioPlayerStore.setQueueOpen(true);
		audioPlayerStore.addEntry(ENTRY, null, { openQueue: false });
		expect(audioPlayerStore.queueOpen).toBe(true);
	});
});
