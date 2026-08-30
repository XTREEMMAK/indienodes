import { describe, expect, it } from 'vitest';
import { AUDIO_TUNING_DEFAULTS } from './audioTuning.svelte.js';
import {
	DEFAULT_SAMPLE_RATE,
	MIN_DB,
	frequencyAtGainDb,
	frequencyToRatio,
	lowpassCoefficients,
	lowpassResponseDb,
	magnitudeAt,
	ratioToFrequency,
	toDecibels
} from './audioFilterResponse.js';

/**
 * dB of the filter at one frequency, the way the graph asks for it.
 * @param {number} frequency Cutoff Hz.
 * @param {number} q Decibels.
 * @param {number} hz Where to measure.
 * @param {number} [sampleRate]
 */
function gainDbAt(frequency, q, hz, sampleRate = DEFAULT_SAMPLE_RATE) {
	return toDecibels(magnitudeAt(lowpassCoefficients(frequency, q, sampleRate), hz, sampleRate));
}

describe('lowpass response', () => {
	it('passes low frequencies at unity gain', () => {
		expect(gainDbAt(125, 2.5, 1)).toBeCloseTo(0, 2);
		expect(gainDbAt(125, 2.5, 10)).toBeCloseTo(0, 1);
	});

	it('is silent at Nyquist, where a low-pass has a true zero', () => {
		expect(magnitudeAt(lowpassCoefficients(125, 2.5), DEFAULT_SAMPLE_RATE / 2)).toBeCloseTo(0, 10);
		expect(gainDbAt(125, 2.5, DEFAULT_SAMPLE_RATE / 2)).toBe(MIN_DB);
	});

	it('reads Q as decibels, the way Web Audio does for a low-pass', () => {
		// The defining property this rests on: an RBJ low-pass has |H(f0)| =
		// Q_linear, and Web Audio's low-pass Q *is* that figure in dB — so the
		// gain at the cutoff comes back as the Q value itself. Reading Q as
		// linear instead would put 6 dB here at nearly 16 dB, which is the
		// mistake this test exists to catch.
		expect(gainDbAt(125, 6, 125)).toBeCloseTo(6, 1);
		expect(gainDbAt(125, 0, 125)).toBeCloseTo(0, 1);
		expect(gainDbAt(125, -6, 125)).toBeCloseTo(-6, 1);
	});

	it('rolls off at 12 dB per octave well above the cutoff', () => {
		// Second-order, so each doubling costs another 12 dB. Measured an
		// octave apart and far enough above the corner that the resonance has
		// stopped contributing.
		const oneOctave = gainDbAt(125, 2.5, 1000);
		const twoOctaves = gainDbAt(125, 2.5, 2000);
		expect(twoOctaves - oneOctave).toBeCloseTo(-12, 0);
	});

	it('places the -3 dB corner above the nominal cutoff when the filter resonates', () => {
		const resonant = frequencyAtGainDb({ frequency: 125, q: 2.5 });
		expect(resonant).toBeGreaterThan(125);
		expect(gainDbAt(125, 2.5, resonant)).toBeCloseTo(-3, 2);

		// With no resonance the corner is the textbook one: at Q = 0 dB the
		// cutoff itself is already unity, so -3 dB still lands above it, but
		// far closer.
		const flat = frequencyAtGainDb({ frequency: 125, q: 0 });
		expect(flat).toBeGreaterThan(125);
		expect(flat).toBeLessThan(resonant);
	});

	it('keeps the app defaults well inside the kick band', () => {
		const { lowpassFrequency, lowpassQ } = AUDIO_TUNING_DEFAULTS;
		// A 60 Hz kick fundamental survives essentially untouched while a
		// 1 kHz snare/vocal body is 30 dB down — which is the whole reason the
		// detector filters before measuring RMS at all.
		expect(gainDbAt(lowpassFrequency, lowpassQ, 60)).toBeGreaterThan(-1);
		expect(gainDbAt(lowpassFrequency, lowpassQ, 1000)).toBeLessThan(-30);
	});

	it('survives a cutoff dragged past Nyquist without producing NaN', () => {
		const db = gainDbAt(40000, 2.5, 1000);
		expect(Number.isFinite(db)).toBe(true);
	});
});

describe('lowpassResponseDb', () => {
	it('returns one point per requested pixel column, descending across the axis', () => {
		const curve = lowpassResponseDb({ frequency: 125, q: 2.5 }, 64);
		expect(curve).toHaveLength(64);
		// The axis starts at 20 Hz, not at DC, and a resonant filter is already
		// a fraction of a dB up by then — the skirt of the peak reaches down
		// there. Near unity, not exactly unity.
		expect(curve[0]).toBeGreaterThan(0);
		expect(curve[0]).toBeLessThan(0.5);
		expect(curve[63]).toBeLessThan(curve[0]);
	});

	it('agrees with a direct evaluation at the same frequency', () => {
		const curve = lowpassResponseDb({ frequency: 125, q: 2.5 }, 101);
		const hz = ratioToFrequency(0.5);
		expect(curve[50]).toBeCloseTo(gainDbAt(125, 2.5, hz), 6);
	});

	it('handles degenerate widths rather than dividing by zero', () => {
		expect(lowpassResponseDb({ frequency: 125, q: 2.5 }, 0)).toHaveLength(0);
		expect(Number.isFinite(lowpassResponseDb({ frequency: 125, q: 2.5 }, 1)[0])).toBe(true);
	});
});

describe('log frequency axis', () => {
	it('round-trips a frequency through its axis position', () => {
		for (const hz of [20, 125, 440, 2000, 20000]) {
			expect(ratioToFrequency(frequencyToRatio(hz))).toBeCloseTo(hz, 6);
		}
	});

	it('spaces octaves evenly, which is what makes the slope readable', () => {
		const first = frequencyToRatio(200) - frequencyToRatio(100);
		const second = frequencyToRatio(400) - frequencyToRatio(200);
		expect(second).toBeCloseTo(first, 10);
	});

	it('clamps a pointer dragged outside the drawn range', () => {
		expect(frequencyToRatio(1)).toBe(0);
		expect(frequencyToRatio(48000)).toBe(1);
		expect(ratioToFrequency(-2)).toBeCloseTo(20, 6);
		expect(ratioToFrequency(3)).toBeCloseTo(20000, 6);
	});
});
