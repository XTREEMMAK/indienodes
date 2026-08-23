/**
 * The decisions behind the comic reader's gestures.
 *
 * `ComicViewer.svelte` is 1,238 lines of pointer, touch, pinch, momentum and
 * auto-hide handling wound through component state, and none of it was tested:
 * every threshold lived inside a handler that needed a real `TouchEvent` and a
 * rendered component to reach. The thresholds are the part most worth pinning,
 * because they are the part that is subtly wrong rather than obviously broken
 * — a swipe that needs 51px instead of 50 does not throw, it just feels wrong
 * on someone else's device.
 *
 * What moved here is only the *deciding*: given some numbers, is this a tap or
 * a drag, a swipe or a wobble, which way did it go, what should the zoom
 * become. The state machine, the timers, and the element wiring stay in the
 * component, because they are genuinely about that component's lifecycle and
 * moving them would be a large refactor of code with no coverage to protect
 * it — the exact combination worth being careful about.
 */

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.2;

export const SWIPE_THRESHOLD = 50;
export const SWIPE_MAX_TIME = 300;
export const LONG_PRESS_TIME = 200;
export const TAP_THRESHOLD = 10;
export const DOUBLE_TAP_INTERVAL = 300;
export const INACTIVITY_TIMEOUT = 3000;
export const POST_DRAG_COOLDOWN = 2000;

/** How near two taps must land to count as one double-tap, in px. */
export const DOUBLE_TAP_RADIUS = 50;
/** Under this a mouse drag was a click that wobbled. */
export const CLICK_WOBBLE_PX = 5;
/** A touch under this distance and duration is a tap, not a short drag. */
export const TOUCH_TAP_PX = 15;
export const TOUCH_TAP_MS = 250;
/** Below this a flick is not worth coasting. */
export const MIN_FLICK_VELOCITY = 0.1;
/** A pinch that ends below this snaps back to exactly 1x. */
export const PINCH_SNAP_BACK = 1.1;

/**
 * Rounds to the 2dp the zoom controls step in.
 *
 * Floating-point accumulation is why this exists: 1 + 0.2 + 0.2 is
 * 1.4000000000000001, which then never equals `ZOOM_MIN` on the way back down
 * and leaves pan enabled at an apparently-unzoomed view.
 * @param {number} value
 */
function round2(value) {
	return Math.round(value * 100) / 100;
}

/**
 * @param {number} value
 * @param {number} [min]
 * @param {number} [max]
 */
export function clampZoom(value, min = ZOOM_MIN, max = ZOOM_MAX) {
	return Math.max(min, Math.min(max, value));
}

/**
 * The next zoom for a click or tap on the page: step up, and wrap back to 1x
 * once stepping would pass the maximum.
 *
 * Wrapping rather than stopping at the top is what makes a single repeated
 * gesture able to get back out of zoom, which matters most on touch where
 * there is no separate reset control in reach.
 * @param {number} current
 * @returns {number}
 */
export function nextZoomOnToggle(current) {
	const next = round2(current + ZOOM_STEP);
	return next > ZOOM_MAX ? ZOOM_MIN : next;
}

/**
 * The next zoom for a wheel notch, or null when it would leave the range.
 *
 * Null rather than a clamped value on purpose: clamping would make every
 * further scroll at the limit re-assign the same number, and at the bottom end
 * that re-runs the "reset pan" branch on a view the visitor is still scrolling
 * past. Nothing to do is its own answer.
 * @param {number} current
 * @param {number} deltaY negative scrolls in
 * @returns {number | null}
 */
export function nextZoomOnWheel(current, deltaY) {
	const next = round2(current + (deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
	if (next < ZOOM_MIN || next > ZOOM_MAX) return null;
	return next;
}

/**
 * Zoom during a two-finger pinch, scaled from where the pinch started.
 * @param {number} startZoom
 * @param {number} startDistance
 * @param {number} currentDistance
 * @returns {number}
 */
export function pinchZoom(startZoom, startDistance, currentDistance) {
	if (!startDistance) return startZoom;
	return clampZoom(startZoom * (currentDistance / startDistance));
}

/**
 * Whether a finished pinch should snap back to exactly 1x.
 *
 * Leaving it at 1.04 would keep pan enabled and the chrome hidden for no
 * visible zoom, which reads as the viewer being stuck.
 * @param {number} zoom
 */
export function shouldSnapBack(zoom) {
	return zoom < PINCH_SNAP_BACK;
}

/**
 * Distance between the first two touches of a pinch.
 * @param {ArrayLike<{ clientX: number, clientY: number }>} touches
 */
export function touchDistance(touches) {
	if (!touches || touches.length < 2) return 0;
	return Math.hypot(
		touches[0].clientX - touches[1].clientX,
		touches[0].clientY - touches[1].clientY
	);
}

/**
 * Whether a finished mouse press was a click rather than a pan.
 * @param {number} distance px travelled
 */
export function isClickNotDrag(distance) {
	return distance < CLICK_WOBBLE_PX;
}

/**
 * Whether a finished touch-pan was a tap rather than a short deliberate drag.
 * Both conditions are needed: a slow, small drag is still a drag.
 * @param {number} distance
 * @param {number} duration ms
 */
export function isTapNotPan(distance, duration) {
	return distance < TOUCH_TAP_PX && duration < TOUCH_TAP_MS;
}

/**
 * Whether this tap continues the previous one into a double-tap.
 * @param {{ now: number, x: number, y: number }} tap
 * @param {{ time: number, x: number, y: number }} previous
 */
export function isDoubleTap(tap, previous) {
	return (
		tap.now - previous.time < DOUBLE_TAP_INTERVAL &&
		Math.abs(tap.x - previous.x) < DOUBLE_TAP_RADIUS &&
		Math.abs(tap.y - previous.y) < DOUBLE_TAP_RADIUS
	);
}

/**
 * Whether a finished touch was a tap at all, as opposed to a swipe or a drag.
 * @param {number} diffX start minus end
 * @param {number} diffY
 * @param {number} duration ms
 */
export function isTap(diffX, diffY, duration) {
	return (
		Math.abs(diffX) < TAP_THRESHOLD && Math.abs(diffY) < TAP_THRESHOLD && duration < SWIPE_MAX_TIME
	);
}

/**
 * Which page a finished touch asks for, or null when it was not a swipe.
 *
 * Horizontal has to dominate: a diagonal drag down the page is someone
 * scrolling or panning, not asking to turn the page, and treating it as a
 * swipe makes the reader feel like it changes pages at random.
 * @param {number} diffX start minus end, so positive means the finger moved left
 * @param {number} diffY
 * @param {number} duration ms
 * @returns {'next' | 'prev' | null}
 */
export function swipeDirection(diffX, diffY, duration) {
	const horizontal = Math.abs(diffX) > Math.abs(diffY);
	if (!horizontal || Math.abs(diffX) <= SWIPE_THRESHOLD || duration >= SWIPE_MAX_TIME) return null;
	return diffX > 0 ? 'next' : 'prev';
}

/**
 * Velocity of the last touch movement, in px/ms.
 * @param {{ x: number, y: number, time: number }} last
 * @param {{ x: number, y: number, time: number }} previous
 * @returns {{ vx: number, vy: number }}
 */
export function flickVelocity(last, previous) {
	// Never divide by zero: two samples in the same millisecond are common on
	// a high-frequency touch screen.
	const dt = Math.max(last.time - previous.time, 1);
	return { vx: (last.x - previous.x) / dt, vy: (last.y - previous.y) / dt };
}

/**
 * Whether a flick is fast enough to coast after the finger leaves.
 * @param {number} vx
 * @param {number} vy
 */
export function shouldCoast(vx, vy) {
	return Math.abs(vx) > MIN_FLICK_VELOCITY || Math.abs(vy) > MIN_FLICK_VELOCITY;
}
