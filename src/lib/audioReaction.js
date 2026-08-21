/**
 * Shared "how a background reacts to what's playing" tuning, factored out
 * of `AmbientBackground.svelte` so a second background variant — the
 * component's own `variant` prop already anticipates one — can reuse the
 * exact same reaction (the drift-speed boost formula, and the big-hit
 * pulse/burst envelope) instead of re-deriving its own magic numbers from
 * scratch. Plain constants and pure functions, not a store: nothing here is
 * per-frame mutable state, so there's nothing for a component to subscribe
 * to, only values and math to import.
 *
 * **Not the same layer as `?debug=audio`'s tuning panel.** That panel
 * (`AudioDebugPanel.svelte` / `audioTuning.svelte.js`) tunes the *detector*
 * in `AudioPlayer.svelte` — what counts as a beat or a big hit in the first
 * place. This module is the *reaction* to whatever the detector already
 * reported, via `audioLevelStore`'s `level`/`pulse`/`bigHitId` — one layer
 * downstream, and a separate concern. See `docs/audio-reactivity.md` for
 * the full signal path and how the two tuning layers relate.
 */

export const AUDIO_REACTION_DEFAULTS = {
	drift: {
		// boost = 1 + level*levelWeight + pulse*pulseWeight. Weighted hard
		// toward pulse over level on purpose: see `driftBoost`'s own doc
		// comment for the measurement behind that split.
		levelWeight: 0.5,
		pulseWeight: 8
	},
	hitScale: {
		/** Peak multiplier applied to a particle's own radius on a big hit. */
		peak: 3.2,
		/** Multiplied per frame; clears most of a peak in well under a second at 30fps. */
		decay: 0.83
	},
	burst: {
		/** Extra particles spawned per big hit. */
		count: 14,
		lifetimeMs: 1800,
		/** Fraction of `lifetimeMs` spent fading in before the (longer) fade-out begins. */
		fadeInFraction: 0.08
	}
};

/**
 * Multiplies particle drift velocity. 1 (no change) whenever nothing is
 * playing or analysis isn't available at all — `active` is checked rather
 * than treating a `level` of 0 as "no audio," because silence and
 * no-analysis look identical in the number alone.
 *
 * The beat (`pulse`) carries almost all of this, and sustained loudness
 * (`level`) almost none. That split was measured, not guessed: overall
 * energy on real music sits around 0.47 and barely moves, so driving speed
 * from it alone produced a constant ~1.9x with no visible variation at
 * all — the background read as ignoring the audio entirely. Weighting the
 * pulse instead means the field returns to its resting pace between hits,
 * which is what makes a beat legible as a beat rather than as general
 * activity.
 * @param {{ active: boolean, level: number, pulse: number }} audio Typically `audioLevelStore` itself.
 * @param {typeof AUDIO_REACTION_DEFAULTS.drift} [tuning]
 */
export function driftBoost(audio, tuning = AUDIO_REACTION_DEFAULTS.drift) {
	if (!audio.active) return 1;
	return 1 + audio.level * tuning.levelWeight + audio.pulse * tuning.pulseWeight;
}

/**
 * The fade-in/fade-out envelope for one burst particle, given how old it
 * is. 0 once it's past its own lifetime, so a caller can use this alone to
 * decide when to drop a particle rather than tracking that separately.
 * @param {number} ageMs Milliseconds since the particle was spawned.
 * @param {typeof AUDIO_REACTION_DEFAULTS.burst} [tuning]
 */
export function burstOpacity(ageMs, tuning = AUDIO_REACTION_DEFAULTS.burst) {
	const t = ageMs / tuning.lifetimeMs;
	if (t >= 1) return 0;
	return t < tuning.fadeInFraction
		? t / tuning.fadeInFraction
		: Math.max(0, 1 - (t - tuning.fadeInFraction) / (1 - tuning.fadeInFraction));
}

/**
 * The per-frame decay step for a particle's `hitScale` (see
 * `AmbientBackground.svelte`'s own use of this). Snaps fully to 1 once
 * within a hair of it, rather than asymptoting forever, so a caller can
 * cheaply check `hitScale === 1` to skip the work entirely once a pulse has
 * settled.
 * @param {number} hitScale Current value, `>= 1`.
 * @param {typeof AUDIO_REACTION_DEFAULTS.hitScale} [tuning]
 */
export function decayHitScale(hitScale, tuning = AUDIO_REACTION_DEFAULTS.hitScale) {
	if (hitScale <= 1) return 1;
	const next = 1 + (hitScale - 1) * tuning.decay;
	return next < 1.01 ? 1 : next;
}
