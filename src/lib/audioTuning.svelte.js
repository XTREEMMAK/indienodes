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
