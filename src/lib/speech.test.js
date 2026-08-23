import { describe, expect, it } from 'vitest';
import { chunkForSpeech } from './speech.js';

/**
 * `chunkForSpeech` is the half of the reader worth testing without a browser:
 * it is pure, and it is where the failure modes live. Engines truncate or
 * stall on long utterances, so a chunker that quietly drops text or emits an
 * oversized piece produces a reader that stops mid-passage for no visible
 * reason.
 */

const CAP = 60;

describe('splitting text for the synthesiser', () => {
	it('returns nothing for empty or blank input', () => {
		expect(chunkForSpeech('')).toEqual([]);
		expect(chunkForSpeech('   \n  ')).toEqual([]);
		expect(chunkForSpeech(/** @type {any} */ (null))).toEqual([]);
	});

	it('keeps short text as a single chunk', () => {
		expect(chunkForSpeech('A short line.', CAP)).toEqual(['A short line.']);
	});

	it('never emits a chunk longer than the cap', () => {
		const text =
			'The first sentence is here. The second one follows it closely. ' +
			'A third arrives, longer than the others by some margin. Then a fourth.';
		for (const chunk of chunkForSpeech(text, CAP)) {
			expect(chunk.length).toBeLessThanOrEqual(CAP);
		}
	});

	it('splits a single over-long sentence rather than dropping it', () => {
		const long = `${'word '.repeat(60).trim()}.`;
		const chunks = chunkForSpeech(long, CAP);

		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CAP);
	});

	it('loses no words, whatever the shape of the input', () => {
		const samples = [
			'One. Two. Three.',
			`${'alpha '.repeat(40).trim()}.`,
			'Mixed: a tiny one. ' + 'then '.repeat(30) + 'a long tail without punctuation',
			'No terminal punctuation at all here'
		];
		for (const text of samples) {
			const original = text.replace(/\s+/g, ' ').trim().split(' ');
			const roundTripped = chunkForSpeech(text, CAP).join(' ').split(' ').filter(Boolean);
			expect(roundTripped).toEqual(original);
		}
	});

	it('keeps terminal punctuation with its own sentence when it does split', () => {
		// The synthesiser reads intonation off this, so a split must not leave
		// the "?" at the head of the next chunk and turn a question into a
		// statement. Capped tight enough to force the boundary; at a cap that
		// fits both, staying as one chunk is the correct answer.
		const chunks = chunkForSpeech('Is this a question? It is indeed.', 20);
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks[0]).toBe('Is this a question?');
	});

	it('collapses whitespace so line breaks are not read as pauses', () => {
		expect(chunkForSpeech('one\n\n   two', CAP)).toEqual(['one two']);
	});
});
