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

describe('mobile player panel', () => {
	it('opens with a new playback session and can be dismissed without clearing audio', () => {
		audioPlayerStore.playEntry(ENTRY, null);
		expect(audioPlayerStore.mobilePanelOpen).toBe(true);

		audioPlayerStore.closeMobilePanel();
		expect(audioPlayerStore.mobilePanelOpen).toBe(false);
		expect(audioPlayerStore.current?.entryId).toBe(ENTRY.id);

		audioPlayerStore.openMobilePanel();
		expect(audioPlayerStore.mobilePanelOpen).toBe(true);
	});

	it('closes when the last queued entry is removed', () => {
		audioPlayerStore.playEntry(ENTRY, null);
		audioPlayerStore.removeEntry(ENTRY.id);

		expect(audioPlayerStore.queue).toHaveLength(0);
		expect(audioPlayerStore.mobilePanelOpen).toBe(false);
	});
});

describe('audio preview', () => {
	it('can select a preview without autoplaying it', () => {
		audioPlayerStore.previewEntry(ENTRY, null, { autoplay: false });

		expect(audioPlayerStore.previewItem?.entryId).toBe(ENTRY.id);
		expect(audioPlayerStore.previewPlaying).toBe(false);
	});

	it('reports which preview completed before releasing it', () => {
		audioPlayerStore.previewEntry(ENTRY, null);
		const before = audioPlayerStore.previewCompletion.sequence;

		audioPlayerStore.finishPreview();

		expect(audioPlayerStore.previewItem).toBeNull();
		expect(audioPlayerStore.previewCompletion).toEqual({
			sequence: before + 1,
			entryId: ENTRY.id
		});
	});

	it('can select a specific track from a multi-track preview', () => {
		const multiTrackEntry = {
			...ENTRY,
			tracks: [
				{ label: 'First', media_url: 'https://example.test/first.mp3' },
				{ label: 'Second', media_url: 'https://example.test/second.mp3' }
			]
		};

		audioPlayerStore.previewEntry(multiTrackEntry, null, { autoplay: false, trackIndex: 1 });

		expect(audioPlayerStore.previewItem?.label).toBe('Second');
		expect(audioPlayerStore.previewItem?.url).toBe('https://example.test/second.mp3');
	});
});
