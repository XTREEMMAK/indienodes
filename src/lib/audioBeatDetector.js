/**
 * Turning an analyser's raw bytes into "is that a beat".
 *
 * This is the arithmetic `AudioPlayer.svelte` runs on every animation frame to
 * drive the reactive background. It was written against real music rather than
 * guessed — the comment it came from records that a full-spectrum average of
 * one track sat between 0.40 and 0.53 for six seconds straight, which is why
 * the first version, which drove particle speed from that average directly,
 * made the background look like it was doing nothing at all.
 *
 * None of that was testable where it lived: it needed a live `AudioContext`, a
 * playing cross-origin track, and a rendered player. So the reasoning was
 * recorded in prose and protected by nothing. Extracted here it is ordinary
 * numbers in, numbers out.
 *
 * What stayed behind is the Web Audio graph itself — creating the context,
 * wiring `sourceNode -> analyser` and the parallel filtered bass branch,
 * ordering the gain node after the taps. That wiring is delicate in ways that
 * are about the browser API rather than about this algorithm, and it has no
 * meaningful test without a real audio pipeline, so moving it would be motion
 * without benefit.
 */

/** Roughly 1.5s at 60fps. Long enough to average a bar, short enough to track a build. */
export const BASS_WINDOW = 90;

/** How fast a beat pulse falls away. Fast, so the field visibly settles between hits. */
const PULSE_DECAY = 0.86;
/** Attack and release on the sustained-loudness term. */
const LEVEL_ATTACK = 0.35;
const LEVEL_RELEASE = 0.94;

/**
 * Average level across the spectrum, normalised to 0..1.
 *
 * Deliberately kept as a *gentle* contributor rather than the main signal: on
 * real material this barely moves, which is exactly the trap the original
 * version fell into.
 *
 * @param {ArrayLike<number>} bins byte frequency data, 0..255
 * @returns {number}
 */
export function spectrumEnergy(bins) {
	if (!bins || bins.length === 0) return 0;
	let sum = 0;
	for (let i = 0; i < bins.length; i += 1) sum += bins[i];
	return sum / bins.length / 255;
}

/**
 * RMS amplitude of an already low-pass-filtered signal.
 *
 * Read as time-domain samples rather than frequency bins because the filter
 * has already isolated kick/bass-fundamental energy; this only has to measure
 * how loud the result is, not pick bins out of it.
 *
 * Bytes are centred on 128 (silence). Shifting to -1..1 *before* squaring is
 * what makes this a real RMS rather than a biased-positive average — skip it
 * and silence reads as roughly 0.5, so everything looks like a constant beat.
 *
 * @param {ArrayLike<number>} bins byte time-domain data, 0..255
 * @returns {number}
 */
export function bassAmplitude(bins) {
	if (!bins || bins.length === 0) return 0;
	let sumSquares = 0;
	for (let i = 0; i < bins.length; i += 1) {
		const centered = (bins[i] - 128) / 128;
		sumSquares += centered * centered;
	}
	return Math.sqrt(sumSquares / bins.length);
}

/**
 * @typedef {object} BeatTuning
 * @property {number} beatRatio how far above the recent average counts as a hit
 * @property {number} beatFloor absolute floor, so silence cannot beat
 * @property {number} beatGapMs minimum time between beats
 * @property {number} bigHitRatio the louder threshold that triggers a burst
 */

/**
 * @typedef {object} BeatFrame
 * @property {number} bass this frame's bass amplitude
 * @property {number} bassAvg the running average it was compared against
 * @property {boolean} beat
 * @property {boolean} bigHit
 * @property {number} level smoothed sustained loudness, 0..1
 * @property {number} pulse beat envelope, 0..1
 */

/**
 * Stateful detector: feed it a frame, get back what that frame means.
 *
 * The state is the point. A beat is not "loud", it is *louder than the last
 * second and a half was* — which is what survives a track being quiet or
 * dense, and what makes the value fall back to zero between hits so there is
 * something for the visuals to slow down to.
 *
 * @param {{ windowSize?: number }} [options]
 */
export function createBeatDetector({ windowSize = BASS_WINDOW } = {}) {
	/** @type {number[]} */
	let bassHistory = [];
	let smoothed = 0;
	let pulseValue = 0;
	let lastBeatAt = -Infinity;

	return {
		/**
		 * @param {{ energy: number, bass: number, now: number, tuning: BeatTuning }} frame
		 * @returns {BeatFrame}
		 */
		push({ energy, bass, now, tuning }) {
			bassHistory.push(bass);
			if (bassHistory.length > windowSize) bassHistory.shift();
			const bassAvg = bassHistory.reduce((a, b) => a + b, 0) / bassHistory.length;

			let beat = false;
			let bigHit = false;
			if (
				bass > bassAvg * tuning.beatRatio &&
				bass > tuning.beatFloor &&
				now - lastBeatAt > tuning.beatGapMs
			) {
				// Snapped to full rather than accumulated: a beat is an event,
				// and scaling it by how hard it hit made quiet passages produce
				// half-beats that read as jitter.
				pulseValue = 1;
				lastBeatAt = now;
				beat = true;
				bigHit = bass > bassAvg * tuning.bigHitRatio;
			}
			pulseValue *= PULSE_DECAY;

			// Sustained loudness still gets a say, but relative to its own
			// recent floor, so a constant 0.47 contributes almost nothing.
			smoothed =
				energy > smoothed
					? smoothed + (energy - smoothed) * LEVEL_ATTACK
					: smoothed * LEVEL_RELEASE;

			return { bass, bassAvg, beat, bigHit, level: Math.min(1, smoothed), pulse: pulseValue };
		},

		/** Forgets history, for a new source or after the graph is rebuilt. */
		reset() {
			bassHistory = [];
			smoothed = 0;
			pulseValue = 0;
			lastBeatAt = -Infinity;
		}
	};
}
