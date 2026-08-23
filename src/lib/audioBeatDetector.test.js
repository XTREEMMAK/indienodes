import { describe, expect, it } from 'vitest';
import { bassAmplitude, createBeatDetector, spectrumEnergy } from './audioBeatDetector.js';

/**
 * The reactive background's signal path, tested for the first time. It
 * previously needed a live AudioContext, a playing cross-origin track and a
 * rendered player to exercise at all, so the reasoning recorded in its
 * comments — measured against real music — was protected by nothing.
 */

const TUNING = { beatRatio: 1.3, beatFloor: 0.05, beatGapMs: 100, bigHitRatio: 1.8 };

/**
 * Time-domain bytes for a steady tone of the given amplitude (0..1).
 * @param {number} amplitude
 * @param {number} [length]
 */
function tone(amplitude, length = 256) {
	return Array.from({ length }, (_, i) =>
		Math.round(128 + Math.sin((i / length) * Math.PI * 8) * 127 * amplitude)
	);
}

describe('spectrumEnergy', () => {
	it('normalises a byte average into 0..1', () => {
		expect(spectrumEnergy([255, 255, 255, 255])).toBeCloseTo(1, 5);
		expect(spectrumEnergy([0, 0, 0, 0])).toBe(0);
		expect(spectrumEnergy([128, 128])).toBeCloseTo(128 / 255, 5);
	});

	it('survives an empty frame rather than returning NaN', () => {
		expect(spectrumEnergy([])).toBe(0);
	});
});

describe('bassAmplitude', () => {
	it('reads silence as zero, not as half', () => {
		// Time-domain bytes centre on 128. Averaging them without centring
		// first makes silence read as ~0.5, so everything looks like a
		// constant beat — the bug the centring exists to prevent.
		expect(bassAmplitude(new Array(128).fill(128))).toBe(0);
	});

	it('grows with amplitude', () => {
		const quiet = bassAmplitude(tone(0.2));
		const loud = bassAmplitude(tone(0.9));
		expect(loud).toBeGreaterThan(quiet);
		expect(quiet).toBeGreaterThan(0);
	});

	it('is a real RMS, so it is never negative', () => {
		// A signal that swings mostly below the midpoint must still register.
		const belowMid = new Array(128).fill(20);
		expect(bassAmplitude(belowMid)).toBeGreaterThan(0);
	});

	it('survives an empty frame', () => {
		expect(bassAmplitude([])).toBe(0);
	});
});

describe('beat detection', () => {
	/**
	 * Feeds a steady level for n frames so the running average settles.
	 * @param {ReturnType<typeof createBeatDetector>} detector
	 * @param {number} bass
	 * @param {number} [frames]
	 * @param {number} [startAt]
	 */
	function settle(detector, bass, frames = 90, startAt = 0) {
		let last = /** @type {import('./audioBeatDetector.js').BeatFrame | undefined} */ (undefined);
		for (let i = 0; i < frames; i += 1) {
			last = detector.push({ energy: 0.5, bass, now: startAt + i * 16, tuning: TUNING });
		}
		return last;
	}

	it('does not beat on a constant signal, however loud', () => {
		// The whole point: a kick is not "loud", it is louder than recently.
		const d = createBeatDetector();
		settle(d, 0.8, 30);
		const frames = [];
		for (let i = 0; i < 60; i += 1) {
			frames.push(d.push({ energy: 0.5, bass: 0.8, now: 1000 + i * 16, tuning: TUNING }));
		}
		expect(frames.some((f) => f.beat)).toBe(false);
	});

	it('beats on a hit that clears the recent average', () => {
		const d = createBeatDetector();
		settle(d, 0.2, 90);
		const hit = d.push({ energy: 0.5, bass: 0.9, now: 100000, tuning: TUNING });
		expect(hit.beat).toBe(true);
		expect(hit.pulse).toBeGreaterThan(0.8);
	});

	it('reports a big hit only well above the ordinary beat threshold', () => {
		const d = createBeatDetector();
		settle(d, 0.2, 90);
		// Above beatRatio but below bigHitRatio.
		const modest = d.push({ energy: 0.5, bass: 0.2 * 1.4, now: 100000, tuning: TUNING });
		expect(modest.beat).toBe(true);
		expect(modest.bigHit).toBe(false);
	});

	it('never beats below the absolute floor, however quiet the average', () => {
		// Near-silence still has ratios; the floor is what stops noise beating.
		const d = createBeatDetector();
		settle(d, 0.001, 90);
		const frame = d.push({ energy: 0, bass: 0.01, now: 100000, tuning: TUNING });
		expect(frame.beat).toBe(false);
	});

	it('honours the minimum gap between beats', () => {
		const d = createBeatDetector();
		settle(d, 0.2, 90);
		const first = d.push({ energy: 0.5, bass: 0.9, now: 100000, tuning: TUNING });
		// Immediately after, still loud, but inside beatGapMs.
		const tooSoon = d.push({ energy: 0.5, bass: 0.95, now: 100050, tuning: TUNING });
		expect(first.beat).toBe(true);
		expect(tooSoon.beat).toBe(false);
	});

	it('decays the pulse back toward zero between hits', () => {
		const d = createBeatDetector();
		settle(d, 0.2, 90);
		const hit = d.push({ energy: 0.5, bass: 0.9, now: 100000, tuning: TUNING });
		let pulse = hit.pulse;
		for (let i = 1; i <= 20; i += 1) {
			pulse = d.push({ energy: 0.5, bass: 0.2, now: 100000 + i * 16, tuning: TUNING }).pulse;
		}
		// There has to be something to slow back down to.
		expect(pulse).toBeLessThan(0.2);
	});

	it('keeps level inside 0..1 even for a pinned signal', () => {
		const d = createBeatDetector();
		for (let i = 0; i < 200; i += 1) {
			const f = d.push({ energy: 1, bass: 0.5, now: i * 16, tuning: TUNING });
			expect(f.level).toBeGreaterThanOrEqual(0);
			expect(f.level).toBeLessThanOrEqual(1);
		}
	});

	it('releases the level more slowly than it attacks', () => {
		const d = createBeatDetector();
		for (let i = 0; i < 40; i += 1) d.push({ energy: 1, bass: 0.2, now: i * 16, tuning: TUNING });
		const peak = d.push({ energy: 1, bass: 0.2, now: 999, tuning: TUNING }).level;
		const after = d.push({ energy: 0, bass: 0.2, now: 1015, tuning: TUNING }).level;
		expect(after).toBeLessThan(peak);
		// A single quiet frame must not drop it to nothing.
		expect(after).toBeGreaterThan(peak * 0.5);
	});

	it('bounds its history rather than growing forever', () => {
		// This runs every animation frame for as long as audio plays.
		const d = createBeatDetector({ windowSize: 10 });
		let frame = d.push({ energy: 0.4, bass: 0.3, now: 0, tuning: TUNING });
		for (let i = 1; i < 5000; i += 1) {
			frame = d.push({ energy: 0.4, bass: 0.3, now: i * 16, tuning: TUNING });
		}
		expect(frame.bassAvg).toBeCloseTo(0.3, 5);
	});

	it('forgets history on reset, so a new source starts clean', () => {
		const d = createBeatDetector();
		settle(d, 0.9, 90);
		d.reset();
		// After a reset, the first quiet frame is its own average, so a
		// leftover loud history cannot suppress the next track's beats.
		const frame = d.push({ energy: 0.1, bass: 0.1, now: 200000, tuning: TUNING });
		expect(frame.bassAvg).toBeCloseTo(0.1, 5);
		expect(frame.pulse).toBeLessThan(0.01);
	});
});
