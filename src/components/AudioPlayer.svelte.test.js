import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AudioPlayer from './AudioPlayer.svelte';
import { audioPlayerStore } from '$lib/audioPlayerStore.svelte.js';
import { audioLevelStore } from '$lib/audioLevelStore.svelte.js';

class FakeAudioNode {
	connect() {}
}

class FakeAnalyserNode extends FakeAudioNode {
	frequencyBinCount = 128;
	fftSize = 256;
	smoothingTimeConstant = 0;

	/** @param {Uint8Array} bins */
	getByteFrequencyData(bins) {
		bins.fill(32);
	}

	/** @param {Uint8Array} bins */
	getByteTimeDomainData(bins) {
		bins.fill(128);
	}
}

class FakeAudioContext {
	destination = new FakeAudioNode();

	createAnalyser() {
		return new FakeAnalyserNode();
	}

	createMediaElementSource() {
		return new FakeAudioNode();
	}

	createGain() {
		return Object.assign(new FakeAudioNode(), { gain: { value: 1 } });
	}

	createBiquadFilter() {
		return Object.assign(new FakeAudioNode(), {
			type: 'lowpass',
			frequency: { value: 0 },
			Q: { value: 0 }
		});
	}

	async resume() {}
	async close() {}
}

/** @type {import('$lib/ring.js').RingEntry} */
const FIRST_ENTRY = {
	id: 'audio-first',
	creator: 'First Artist',
	type: 'audio',
	why: 'Player lifecycle fixture.',
	source_url: 'https://example.com/first',
	tags: ['test'],
	tracks: [{ label: 'First Track', media_url: 'https://example.com/first.mp3' }],
	verification_token: 'test'
};

/** @type {import('$lib/ring.js').RingEntry} */
const SECOND_ENTRY = {
	...FIRST_ENTRY,
	id: 'audio-second',
	creator: 'Second Artist',
	source_url: 'https://example.com/second',
	tracks: [{ label: 'Second Track', media_url: 'https://example.com/second.mp3' }]
};

afterEach(() => {
	audioPlayerStore.clear();
	audioLevelStore.reset();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('main audio element lifecycle', () => {
	it('keeps the Web Audio source element when the player is closed and reopened', async () => {
		await render(AudioPlayer, { entries: [FIRST_ENTRY, SECOND_ENTRY] });

		const original = /** @type {HTMLAudioElement | null} */ (
			document.querySelector('[data-main-player-audio]')
		);
		expect(original).toBeInstanceOf(HTMLAudioElement);

		audioPlayerStore.addEntry(FIRST_ENTRY, null);
		await vi.waitFor(() => expect(original?.src).toBe('https://example.com/first.mp3'));

		audioPlayerStore.clear();
		await vi.waitFor(() => {
			expect(original?.getAttribute('src')).toBeNull();
			expect(document.querySelector('[data-main-player-audio]')).toBe(original);
		});

		audioPlayerStore.addEntry(SECOND_ENTRY, null);
		await vi.waitFor(() => expect(original?.src).toBe('https://example.com/second.mp3'));
		expect(document.querySelector('[data-main-player-audio]')).toBe(original);
	});

	it('restarts background analysis after the player is closed and reopened', async () => {
		vi.stubGlobal('AudioContext', FakeAudioContext);
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
		await render(AudioPlayer, { entries: [FIRST_ENTRY, SECOND_ENTRY] });

		audioPlayerStore.addEntry(FIRST_ENTRY, null);
		await vi.waitFor(() => expect(audioPlayerStore.current?.entryId).toBe(FIRST_ENTRY.id));
		audioPlayerStore.setPlaying(true);
		await vi.waitFor(() => expect(audioLevelStore.active).toBe(true));

		audioPlayerStore.clear();
		await vi.waitFor(() => expect(audioLevelStore.active).toBe(false));

		audioPlayerStore.addEntry(SECOND_ENTRY, null);
		await vi.waitFor(() => expect(audioPlayerStore.current?.entryId).toBe(SECOND_ENTRY.id));
		audioPlayerStore.setPlaying(true);
		await vi.waitFor(() => expect(audioLevelStore.active).toBe(true));
	});
});
