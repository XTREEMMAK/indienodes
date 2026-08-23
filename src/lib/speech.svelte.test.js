import { afterEach, describe, expect, it } from 'vitest';
import { pickVoice } from './speech.js';

/**
 * The privacy-critical half of the reader, tested against a stubbed voice
 * list because a headless browser has no on-device voices of its own — which
 * is also why the end-to-end reader test skips rather than asserts.
 *
 * What matters here is that a *remote* voice is never selected. Speech
 * synthesis with a network voice sends the passage to a vendor, which is the
 * one thing this app promises never happens, and `localService` is the only
 * signal distinguishing the two.
 */

const real = window.speechSynthesis;

/** @param {Partial<SpeechSynthesisVoice>[]} voices */
function stubVoices(voices) {
	Object.defineProperty(window, 'speechSynthesis', {
		configurable: true,
		value: { getVoices: () => voices }
	});
}

afterEach(() => {
	Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: real });
});

describe('choosing a voice', () => {
	it('refuses a device that offers only remote voices', () => {
		stubVoices([
			{ name: 'Cloud A', lang: 'en-US', localService: false, default: true },
			{ name: 'Cloud B', lang: 'en-GB', localService: false }
		]);

		// Null means the caller hides the read control entirely, rather than
		// quietly uploading the text to whoever supplies these voices.
		expect(pickVoice('en')).toBeNull();
	});

	it('never returns a remote voice even when it is the only language match', () => {
		stubVoices([
			{ name: 'Cloud FR', lang: 'fr-FR', localService: false },
			{ name: 'Local EN', lang: 'en-US', localService: true }
		]);

		const voice = pickVoice('fr');

		expect(voice?.localService).toBe(true);
		expect(voice?.name).toBe('Local EN');
	});

	it('prefers a local voice matching the language', () => {
		stubVoices([
			{ name: 'Local DE', lang: 'de-DE', localService: true, default: true },
			{ name: 'Local EN', lang: 'en-GB', localService: true }
		]);

		expect(pickVoice('en')?.name).toBe('Local EN');
	});

	it('matches on the primary subtag, so en-GB serves an en page', () => {
		stubVoices([{ name: 'Local EN GB', lang: 'en-GB', localService: true }]);
		expect(pickVoice('en-US')?.name).toBe('Local EN GB');
	});

	it('prefers the platform default among equal matches', () => {
		stubVoices([
			{ name: 'First', lang: 'en-US', localService: true },
			{ name: 'Default', lang: 'en-US', localService: true, default: true }
		]);

		expect(pickVoice('en')?.name).toBe('Default');
	});

	it('returns null when the device reports no voices yet', () => {
		stubVoices([]);
		expect(pickVoice('en')).toBeNull();
	});
});
