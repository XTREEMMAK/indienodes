/**
 * The frequency response of the low-pass filter in `AudioPlayer.svelte`'s
 * beat-detection branch, as numbers rather than as an audio node.
 *
 * `?debug=audio`'s graph view has to draw this curve before anything is
 * playing, and the only real `BiquadFilterNode` in the app lives inside an
 * `AudioContext` that `AudioPlayer` creates lazily, and only for a track
 * that permits analysis at all (see `audioLevelStore.svelte.js` on the CORS
 * probe). So rather than reaching for `getFrequencyResponse()` on a node
 * that usually does not exist yet, the same math is done here: pure, so a
 * test can check the curve without an `AudioContext`, and available whether
 * or not a track is loaded.
 *
 * The coefficients are the ones the Web Audio specification defines for
 * `type = 'lowpass'` specifically, not a generic biquad: **its `Q` is in
 * decibels**, unlike the linear Q the cookbook formula uses for the
 * band-pass and peaking types. That one detail is the difference between a
 * curve that matches what the detector is actually hearing and one that is
 * confidently wrong — at this app's default Q of 2.5 the linear reading
 * would draw an 8 dB resonant peak where the real filter has a 2.5 dB one.
 */

/** Web Audio's own usual rate; only a stand-in until a real context reports its own. */
export const DEFAULT_SAMPLE_RATE = 48000;

/** The drawable range of the EQ graph, and the clamp on a dragged cutoff. */
export const MIN_GRAPH_HZ = 20;
export const MAX_GRAPH_HZ = 20000;

/**
 * Floor for a dB conversion. A low-pass is mathematically silent at Nyquist,
 * so without a floor the curve's last point is `-Infinity` and every line
 * drawn to it disappears.
 */
export const MIN_DB = -96;

/**
 * @typedef {object} BiquadCoefficients
 * Normalised so `a0` is 1 and does not have to be carried around.
 * @property {number} b0
 * @property {number} b1
 * @property {number} b2
 * @property {number} a1
 * @property {number} a2
 */

/**
 * @param {number} frequency Cutoff in Hz.
 * @param {number} q Resonance **in decibels**, matching `BiquadFilterNode.Q` for a low-pass.
 * @param {number} [sampleRate]
 * @returns {BiquadCoefficients}
 */
export function lowpassCoefficients(frequency, q, sampleRate = DEFAULT_SAMPLE_RATE) {
	const nyquist = sampleRate / 2;
	// Clamped rather than trusted: the spec's formula degenerates at and past
	// Nyquist, and both a slider and a dragged graph node can be pushed there.
	const f0 = Math.min(Math.max(frequency, 0), nyquist * 0.999999);
	const w0 = (2 * Math.PI * f0) / sampleRate;
	const cosW0 = Math.cos(w0);
	const alpha = Math.sin(w0) / (2 * Math.pow(10, q / 20));
	const a0 = 1 + alpha;
	const shared = (1 - cosW0) / 2;
	return {
		b0: shared / a0,
		b1: (1 - cosW0) / a0,
		b2: shared / a0,
		a1: (-2 * cosW0) / a0,
		a2: (1 - alpha) / a0
	};
}

/**
 * Linear magnitude of a normalised biquad at one frequency.
 *
 * Evaluated as `|H(e^-jw)|` straight from the coefficients rather than via
 * the cookbook's expanded squared-magnitude identity — same answer, but the
 * complex arithmetic is short enough to read and check by eye, which the
 * expanded form is not.
 *
 * @param {BiquadCoefficients} coefficients
 * @param {number} frequency Hz.
 * @param {number} [sampleRate]
 * @returns {number} 1 is unity gain.
 */
export function magnitudeAt(coefficients, frequency, sampleRate = DEFAULT_SAMPLE_RATE) {
	const { b0, b1, b2, a1, a2 } = coefficients;
	const w = (2 * Math.PI * frequency) / sampleRate;
	const cos1 = Math.cos(w);
	const sin1 = Math.sin(w);
	const cos2 = Math.cos(2 * w);
	const sin2 = Math.sin(2 * w);
	const denominator = Math.hypot(1 + a1 * cos1 + a2 * cos2, -(a1 * sin1 + a2 * sin2));
	if (denominator === 0) return 0;
	return Math.hypot(b0 + b1 * cos1 + b2 * cos2, -(b1 * sin1 + b2 * sin2)) / denominator;
}

/**
 * @param {number} magnitude Linear gain.
 * @returns {number} Decibels, floored at `MIN_DB`.
 */
export function toDecibels(magnitude) {
	if (!(magnitude > 0)) return MIN_DB;
	return Math.max(MIN_DB, 20 * Math.log10(magnitude));
}

/**
 * Where a frequency sits on a log axis, as 0..1 across `[min, max]`. The
 * graph's only mapping from Hz to a pixel column, and — read backwards
 * through `ratioToFrequency` — from a dragged pointer back to a cutoff.
 * @param {number} frequency
 * @param {number} [min]
 * @param {number} [max]
 */
export function frequencyToRatio(frequency, min = MIN_GRAPH_HZ, max = MAX_GRAPH_HZ) {
	const clamped = Math.min(Math.max(frequency, min), max);
	return Math.log(clamped / min) / Math.log(max / min);
}

/**
 * @param {number} ratio 0..1 across the axis.
 * @param {number} [min]
 * @param {number} [max]
 */
export function ratioToFrequency(ratio, min = MIN_GRAPH_HZ, max = MAX_GRAPH_HZ) {
	return min * Math.pow(max / min, Math.min(Math.max(ratio, 0), 1));
}

/**
 * The curve itself: `count` points evenly spaced on the log frequency axis,
 * in dB. One array per redraw, sized to the canvas' own pixel width, so the
 * caller can walk it straight into a path without any further mapping.
 *
 * @param {object} filter
 * @param {number} filter.frequency Cutoff Hz.
 * @param {number} filter.q Decibels.
 * @param {number} [filter.sampleRate]
 * @param {number} count
 * @param {number} [min] Hz at ratio 0.
 * @param {number} [max] Hz at ratio 1.
 * @returns {Float64Array} dB per point.
 */
export function lowpassResponseDb(
	{ frequency, q, sampleRate = DEFAULT_SAMPLE_RATE },
	count,
	min = MIN_GRAPH_HZ,
	max = MAX_GRAPH_HZ
) {
	const coefficients = lowpassCoefficients(frequency, q, sampleRate);
	const out = new Float64Array(Math.max(0, count));
	const last = out.length - 1;
	for (let i = 0; i < out.length; i += 1) {
		const hz = ratioToFrequency(last <= 0 ? 0 : i / last, min, max);
		out[i] = toDecibels(magnitudeAt(coefficients, hz, sampleRate));
	}
	return out;
}

/**
 * The frequency where the response crosses `targetDb` — the real corner of
 * the filter, which is not the nominal cutoff whenever Q is anything but
 * 0 dB. Worth showing next to the cutoff for exactly that reason: at the
 * app's default 2.5 dB of resonance, the -3 dB point sits well above the
 * 125 Hz the slider says.
 *
 * Bisection rather than a closed form. A low-pass leaves 0 dB, may rise to a
 * resonant peak, then falls to silence, so it crosses any target below 0 dB
 * exactly once even though it is not monotonic over the whole range — which
 * is all bisection needs.
 *
 * @param {object} filter
 * @param {number} filter.frequency
 * @param {number} filter.q
 * @param {number} [filter.sampleRate]
 * @param {number} [targetDb]
 * @returns {number} Hz.
 */
export function frequencyAtGainDb(
	{ frequency, q, sampleRate = DEFAULT_SAMPLE_RATE },
	targetDb = -3
) {
	const coefficients = lowpassCoefficients(frequency, q, sampleRate);
	const gainAt = (/** @type {number} */ hz) =>
		toDecibels(magnitudeAt(coefficients, hz, sampleRate));

	let lo = MIN_GRAPH_HZ;
	let hi = (sampleRate / 2) * 0.999999;
	if (gainAt(lo) <= targetDb) return lo;
	if (gainAt(hi) >= targetDb) return hi;
	// 40 halvings takes a 20 Hz..24 kHz span below a millionth of a hertz;
	// the loop is bounded rather than run to a tolerance so a pathological
	// filter cannot spin it.
	for (let i = 0; i < 40; i += 1) {
		const mid = Math.sqrt(lo * hi);
		if (gainAt(mid) > targetDb) lo = mid;
		else hi = mid;
	}
	return Math.sqrt(lo * hi);
}
