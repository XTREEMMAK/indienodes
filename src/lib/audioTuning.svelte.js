/**
 * Live-tunable parameters for `AudioPlayer.svelte`'s bass/beat detector,
 * plus a few read-only live readouts, split out of that component's own
 * module-level consts so `AudioDebugPanel.svelte` can adjust them with
 * sliders while a track plays instead of every tuning pass being an
 * edit-reload-relisten loop.
 *
 * Not gated on `import.meta.env.DEV` itself — `AudioPlayer` reads these
 * values unconditionally, the same way it would read a plain const, so the
 * store has to exist in every build. Only the debug panel that writes to it
 * is dev-only; see that component for the gate.
 */

import { DEFAULT_SAMPLE_RATE } from './audioFilterResponse.js';

/**
 * Tuned by ear against real tracks via the `?debug=audio` panel; see
 * `docs/audio-reactivity.md`'s "Locking in a tuning pass." Replaces the
 * original hardcoded defaults (150 / 1 / 1.12 / 0.1 / 110 / 1.6) outright.
 */
export const AUDIO_TUNING_DEFAULTS = {
	lowpassFrequency: 125,
	lowpassQ: 2.5,
	beatRatio: 1.95,
	beatFloor: 0.23,
	beatGapMs: 110,
	bigHitRatio: 1.35
};

/**
 * @typedef {'lowpassFrequency' | 'lowpassQ' | 'beatRatio' | 'bigHitRatio' | 'beatFloor' | 'beatGapMs'} AudioTuningKey
 */

/**
 * @typedef {object} AudioTuningSlider
 * @property {AudioTuningKey} key
 * @property {string} label
 * @property {string} unit
 * @property {number} min
 * @property {number} max
 * @property {number} step
 */

/**
 * The range and labelling of each field, next to the fields themselves
 * rather than inside one view's component: both `?debug=audio` views render
 * these, and the graph view additionally clamps a dragged filter node to the
 * same bounds, so a value set by dragging is always one the slider can also
 * represent.
 * @type {AudioTuningSlider[]}
 */
export const AUDIO_TUNING_SLIDERS = [
	{ key: 'lowpassFrequency', label: 'Low-pass frequency', unit: 'Hz', min: 40, max: 500, step: 5 },
	{ key: 'lowpassQ', label: 'Low-pass Q', unit: 'dB', min: 0.1, max: 10, step: 0.1 },
	{ key: 'beatRatio', label: 'Beat ratio', unit: '×', min: 1, max: 3, step: 0.01 },
	{ key: 'bigHitRatio', label: 'Big-hit ratio', unit: '×', min: 1, max: 4, step: 0.01 },
	{ key: 'beatFloor', label: 'Beat floor', unit: '', min: 0, max: 0.5, step: 0.01 },
	{ key: 'beatGapMs', label: 'Beat gap', unit: 'ms', min: 0, max: 500, step: 10 }
];

/**
 * @param {AudioTuningKey} key
 * @returns {AudioTuningSlider}
 */
export function tuningSlider(key) {
	const found = AUDIO_TUNING_SLIDERS.find((slider) => slider.key === key);
	if (!found) throw new Error(`Unknown audio tuning field: ${key}`);
	return found;
}

/**
 * Clamps a value to its own field's slider bounds and snaps it to that
 * field's step, so a value arrived at by dragging the graph view's filter
 * node reads back cleanly (125 Hz, not 124.7314 Hz) and stays inside the
 * range the sliders can show.
 * @param {AudioTuningKey} key
 * @param {number} value
 */
export function clampTuning(key, value) {
	const { min, max, step } = tuningSlider(key);
	const snapped = Math.round(value / step) * step;
	// Re-rounded because a float step like 0.01 leaves 1.9500000000000002.
	const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
	return Number(Math.min(max, Math.max(min, snapped)).toFixed(decimals));
}

function createAudioTuningStore() {
	let lowpassFrequency = $state(AUDIO_TUNING_DEFAULTS.lowpassFrequency);
	let lowpassQ = $state(AUDIO_TUNING_DEFAULTS.lowpassQ);
	let beatRatio = $state(AUDIO_TUNING_DEFAULTS.beatRatio);
	let beatFloor = $state(AUDIO_TUNING_DEFAULTS.beatFloor);
	let beatGapMs = $state(AUDIO_TUNING_DEFAULTS.beatGapMs);
	let bigHitRatio = $state(AUDIO_TUNING_DEFAULTS.bigHitRatio);

	// Written by AudioPlayer's own readFrame every frame; the debug panel
	// has no audio graph access of its own, so this is the only channel it
	// has for "what is the detector actually seeing right now."
	let bass = $state(0);
	let bassAvg = $state(0);
	let beatCount = $state(0);
	let bigHitCount = $state(0);

	// The rate the real AudioContext came up at, reported once it exists.
	// Only the graph view needs it, to plot the filter's response against the
	// same Nyquist the live BiquadFilterNode is working to; a curve drawn at
	// an assumed rate would be subtly wrong about where its own corner sits.
	// Defaulted rather than left undefined because the graph is drawable
	// before any track has ever played.
	let sampleRate = $state(DEFAULT_SAMPLE_RATE);

	return {
		get lowpassFrequency() {
			return lowpassFrequency;
		},
		set lowpassFrequency(value) {
			lowpassFrequency = value;
		},
		get lowpassQ() {
			return lowpassQ;
		},
		set lowpassQ(value) {
			lowpassQ = value;
		},
		get beatRatio() {
			return beatRatio;
		},
		set beatRatio(value) {
			beatRatio = value;
		},
		get beatFloor() {
			return beatFloor;
		},
		set beatFloor(value) {
			beatFloor = value;
		},
		get beatGapMs() {
			return beatGapMs;
		},
		set beatGapMs(value) {
			beatGapMs = value;
		},
		get bigHitRatio() {
			return bigHitRatio;
		},
		set bigHitRatio(value) {
			bigHitRatio = value;
		},

		get bass() {
			return bass;
		},
		get bassAvg() {
			return bassAvg;
		},
		get beatCount() {
			return beatCount;
		},
		get bigHitCount() {
			return bigHitCount;
		},
		get sampleRate() {
			return sampleRate;
		},

		/**
		 * Called once per animation frame by AudioPlayer's readFrame.
		 * @param {number} nextBass
		 * @param {number} nextBassAvg
		 */
		reportFrame(nextBass, nextBassAvg) {
			bass = nextBass;
			bassAvg = nextBassAvg;
		},
		reportBeat() {
			beatCount += 1;
		},

		/**
		 * Called once, when AudioPlayer's AudioContext is first created.
		 * @param {number} rate
		 */
		reportSampleRate(rate) {
			if (rate > 0) sampleRate = rate;
		},
		reportBigHit() {
			bigHitCount += 1;
		},

		resetToDefaults() {
			lowpassFrequency = AUDIO_TUNING_DEFAULTS.lowpassFrequency;
			lowpassQ = AUDIO_TUNING_DEFAULTS.lowpassQ;
			beatRatio = AUDIO_TUNING_DEFAULTS.beatRatio;
			beatFloor = AUDIO_TUNING_DEFAULTS.beatFloor;
			beatGapMs = AUDIO_TUNING_DEFAULTS.beatGapMs;
			bigHitRatio = AUDIO_TUNING_DEFAULTS.bigHitRatio;
		},

		resetCounts() {
			beatCount = 0;
			bigHitCount = 0;
		}
	};
}

export const audioTuningStore = createAudioTuningStore();
