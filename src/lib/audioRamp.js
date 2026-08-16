/**
 * A requestAnimationFrame volume ramp.
 *
 * Deliberately ramps a plain number that a caller applies to
 * `HTMLMediaElement.volume`, rather than using a Web Audio GainNode. A gain
 * node would be the more obvious tool and is not available here: reading a
 * media element through Web Audio requires the host to send CORS headers, and
 * the whole point of this project's audio is that it comes from wherever the
 * creator hosts it (see the analyser notes in docs/decisions.md). `el.volume`
 * works for every source unconditionally, which is the property that matters
 * for a fade that must never fail.
 *
 * A plain .js module, not .svelte.js: it holds no reactive state, and the
 * value it produces is handed back through a callback so the caller decides
 * what is reactive.
 */

/**
 * @typedef {object} RampHandle
 * @property {() => void} cancel Stops the ramp where it is. Safe to call
 *   after it has already finished.
 */

/**
 * Ramps from `from` to `to` over `duration` ms, calling `onValue` on every
 * frame and `onDone` once at the end. Returns a handle so an in-flight ramp
 * can be cancelled by the next one, which is the normal case: previewing a
 * second node while the first fade is still running must not leave two ramps
 * fighting over the same value.
 *
 * @param {object} options
 * @param {number} options.from
 * @param {number} options.to
 * @param {number} options.duration ms
 * @param {(value: number) => void} options.onValue
 * @param {() => void} [options.onDone]
 * @returns {RampHandle}
 */
export function rampVolume({ from, to, duration, onValue, onDone }) {
	// No rAF outside the browser, and nothing to animate for a zero-length
	// ramp: land on the target immediately so callers get the same end state
	// either way and never have to special-case it.
	if (typeof requestAnimationFrame !== 'function' || duration <= 0) {
		onValue(to);
		onDone?.();
		return { cancel() {} };
	}

	const start = performance.now();
	let frame = 0;
	let cancelled = false;

	/** @param {number} now */
	function step(now) {
		if (cancelled) return;
		// Clamped at BOTH ends, and the lower clamp is not defensive padding.
		// A rAF callback's timestamp is the start of that frame, which can be
		// *earlier* than the `performance.now()` captured when the frame was
		// requested. That makes `t` slightly negative on the first frame, and
		// since the easing below is a parabola rather than a line, a negative
		// `t` produces a value past `from` rather than short of it: measured as
		// a single frame at 0.604 while the visitor's chosen volume was 0.6.
		// Inaudible at that size, but a fade must never be able to overshoot
		// into being louder than the level it started from.
		const t = Math.max(0, Math.min(1, (now - start) / duration));
		// Ease-out: a linear fade reads as an abrupt stop at the quiet end,
		// because loudness is perceived roughly logarithmically. This spends
		// more of the ramp near silence, which is where the ear notices.
		const eased = 1 - (1 - t) * (1 - t);
		onValue(from + (to - from) * eased);
		if (t < 1) {
			frame = requestAnimationFrame(step);
		} else {
			onDone?.();
		}
	}

	frame = requestAnimationFrame(step);

	return {
		cancel() {
			cancelled = true;
			if (frame) cancelAnimationFrame(frame);
		}
	};
}
