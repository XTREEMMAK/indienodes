import { describe, expect, it } from 'vitest';
import {
	DOUBLE_TAP_INTERVAL,
	SWIPE_THRESHOLD,
	ZOOM_MAX,
	ZOOM_MIN,
	ZOOM_STEP,
	clampZoom,
	flickVelocity,
	isClickNotDrag,
	isDoubleTap,
	isTap,
	isTapNotPan,
	nextZoomOnToggle,
	nextZoomOnWheel,
	pinchZoom,
	shouldCoast,
	shouldSnapBack,
	swipeDirection,
	touchDistance
} from './viewerGestures.js';

/**
 * These thresholds decide how the reader feels, and they were previously
 * unreachable: each lived inside a handler needing a real TouchEvent and a
 * rendered component. The failure mode is not a crash but a reader that turns
 * pages when you meant to pan.
 */

describe('zoom stepping', () => {
	it('steps up without floating-point drift', () => {
		// 1 + 0.2 + 0.2 is 1.4000000000000001 unrounded, which then never
		// equals ZOOM_MIN on the way back down and leaves pan enabled at an
		// apparently-unzoomed view.
		let zoom = ZOOM_MIN;
		for (let i = 0; i < 3; i += 1) zoom = nextZoomOnToggle(zoom);
		expect(zoom).toBe(1.6);
		expect(Number.isInteger(zoom * 100)).toBe(true);
	});

	it('wraps back to 1x rather than sticking at the maximum', () => {
		// The only way out of zoom on touch, where there is no reset in reach.
		let zoom = ZOOM_MAX;
		expect(nextZoomOnToggle(zoom)).toBe(ZOOM_MIN);
	});

	it('reaches the maximum exactly before wrapping', () => {
		let zoom = ZOOM_MIN;
		const seen = [];
		for (let i = 0; i < 40; i += 1) {
			zoom = nextZoomOnToggle(zoom);
			seen.push(zoom);
			if (zoom === ZOOM_MIN) break;
		}
		expect(seen).toContain(ZOOM_MAX);
		expect(Math.max(...seen)).toBe(ZOOM_MAX);
	});
});

describe('wheel zoom', () => {
	it('scrolling in zooms in, out zooms out', () => {
		expect(nextZoomOnWheel(2, -1)).toBe(round(2 + ZOOM_STEP));
		expect(nextZoomOnWheel(2, 1)).toBe(round(2 - ZOOM_STEP));
	});

	it('reports nothing to do at either limit instead of clamping', () => {
		// Clamping would re-assign the same value on every further notch, which
		// at the bottom end re-runs the reset-pan branch mid-scroll.
		expect(nextZoomOnWheel(ZOOM_MIN, 1)).toBeNull();
		expect(nextZoomOnWheel(ZOOM_MAX, -1)).toBeNull();
	});

	/** @param {number} v */
	function round(v) {
		return Math.round(v * 100) / 100;
	}
});

describe('pinch', () => {
	it('scales from where the pinch started', () => {
		expect(pinchZoom(2, 100, 200)).toBe(4);
		expect(pinchZoom(2, 100, 50)).toBe(1);
	});

	it('stays inside the zoom range', () => {
		expect(pinchZoom(2, 100, 1000)).toBe(ZOOM_MAX);
		expect(pinchZoom(2, 100, 1)).toBe(ZOOM_MIN);
	});

	it('survives a zero starting distance rather than returning NaN', () => {
		expect(pinchZoom(2, 0, 100)).toBe(2);
	});

	it('snaps back only from a barely-zoomed state', () => {
		// 1.04 would keep pan enabled and chrome hidden for no visible zoom.
		expect(shouldSnapBack(1.04)).toBe(true);
		expect(shouldSnapBack(1.5)).toBe(false);
	});

	it('measures the distance between two touches', () => {
		expect(
			touchDistance([
				{ clientX: 0, clientY: 0 },
				{ clientX: 3, clientY: 4 }
			])
		).toBe(5);
	});

	it('reports no distance when there is no second finger', () => {
		expect(touchDistance([{ clientX: 0, clientY: 0 }])).toBe(0);
		expect(touchDistance([])).toBe(0);
	});
});

describe('telling a tap from a drag', () => {
	it('treats a small mouse wobble as a click', () => {
		expect(isClickNotDrag(2)).toBe(true);
		expect(isClickNotDrag(40)).toBe(false);
	});

	it('needs a touch to be both small and quick to count as a tap', () => {
		expect(isTapNotPan(5, 100)).toBe(true);
		// Small but slow is a deliberate short drag.
		expect(isTapNotPan(5, 900)).toBe(false);
		// Quick but far is a flick.
		expect(isTapNotPan(200, 100)).toBe(false);
	});
});

describe('double tap', () => {
	const previous = { time: 1000, x: 100, y: 100 };

	it('accepts a second tap that is soon and near', () => {
		expect(isDoubleTap({ now: 1100, x: 105, y: 102 }, previous)).toBe(true);
	});

	it('rejects one that is too late', () => {
		expect(isDoubleTap({ now: 1000 + DOUBLE_TAP_INTERVAL + 1, x: 100, y: 100 }, previous)).toBe(
			false
		);
	});

	it('rejects one that is too far away', () => {
		expect(isDoubleTap({ now: 1100, x: 400, y: 100 }, previous)).toBe(false);
		expect(isDoubleTap({ now: 1100, x: 100, y: 400 }, previous)).toBe(false);
	});
});

describe('swipe direction', () => {
	it('turns forward when the finger moves left, back when it moves right', () => {
		expect(swipeDirection(SWIPE_THRESHOLD + 10, 0, 100)).toBe('next');
		expect(swipeDirection(-(SWIPE_THRESHOLD + 10), 0, 100)).toBe('prev');
	});

	it('ignores a swipe that is too short or too slow', () => {
		expect(swipeDirection(SWIPE_THRESHOLD, 0, 100)).toBeNull();
		expect(swipeDirection(SWIPE_THRESHOLD + 10, 0, 5000)).toBeNull();
	});

	it('ignores a mostly-vertical drag', () => {
		// Someone panning or scrolling, not asking to turn the page. Treating
		// this as a swipe is what makes a reader feel like it changes pages at
		// random.
		expect(swipeDirection(60, 200, 100)).toBeNull();
	});

	it('is not a tap and a swipe at the same time', () => {
		const diffX = SWIPE_THRESHOLD + 10;
		expect(isTap(diffX, 0, 100)).toBe(false);
		expect(swipeDirection(diffX, 0, 100)).not.toBeNull();
	});

	it('treats a stationary quick touch as a tap and not a swipe', () => {
		expect(isTap(2, 2, 100)).toBe(true);
		expect(swipeDirection(2, 2, 100)).toBeNull();
	});
});

describe('flick momentum', () => {
	it('computes velocity in px per ms', () => {
		const { vx, vy } = flickVelocity({ x: 100, y: 50, time: 1100 }, { x: 0, y: 0, time: 1000 });
		expect(vx).toBeCloseTo(1, 5);
		expect(vy).toBeCloseTo(0.5, 5);
	});

	it('never divides by zero when two samples share a millisecond', () => {
		const { vx } = flickVelocity({ x: 10, y: 0, time: 1000 }, { x: 0, y: 0, time: 1000 });
		expect(Number.isFinite(vx)).toBe(true);
	});

	it('coasts only above the minimum velocity', () => {
		expect(shouldCoast(1, 0)).toBe(true);
		expect(shouldCoast(0, 1)).toBe(true);
		expect(shouldCoast(0.01, 0.01)).toBe(false);
	});
});

describe('clampZoom', () => {
	it('keeps values inside the range', () => {
		expect(clampZoom(-5)).toBe(ZOOM_MIN);
		expect(clampZoom(99)).toBe(ZOOM_MAX);
		expect(clampZoom(2)).toBe(2);
	});
});
