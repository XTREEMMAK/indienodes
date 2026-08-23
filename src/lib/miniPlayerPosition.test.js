import { describe, expect, it } from 'vitest';
import {
	MOBILE_BOTTOM_MARGIN,
	VIEWPORT_MARGIN,
	clampToViewport,
	parseStoredPosition
} from './miniPlayerPosition.js';

const PLAYER = { width: 320, height: 56 };
const DESKTOP = { width: 1440, height: 900 };

describe('clampToViewport', () => {
	it('leaves a position that is already on screen alone', () => {
		expect(clampToViewport({ x: 400, y: 300 }, PLAYER, DESKTOP)).toEqual({ x: 400, y: 300 });
	});

	it('pulls a position back from beyond the right and bottom edges', () => {
		const at = clampToViewport({ x: 9999, y: 9999 }, PLAYER, DESKTOP);
		expect(at.x).toBe(DESKTOP.width - PLAYER.width - VIEWPORT_MARGIN);
		expect(at.y).toBe(DESKTOP.height - PLAYER.height - VIEWPORT_MARGIN);
	});

	it('keeps a margin at the top and left', () => {
		expect(clampToViewport({ x: -500, y: -500 }, PLAYER, DESKTOP)).toEqual({
			x: VIEWPORT_MARGIN,
			y: VIEWPORT_MARGIN
		});
	});

	it('restores an off-screen position from a larger display', () => {
		// The reason indienode:player-position:v1 is not exported: a position
		// dragged on a wide monitor must still be reachable on a laptop.
		const fromWide = { x: 3000, y: 1800 };
		const onLaptop = clampToViewport(fromWide, PLAYER, { width: 1280, height: 800 });

		expect(onLaptop.x).toBeLessThanOrEqual(1280 - PLAYER.width);
		expect(onLaptop.y).toBeLessThanOrEqual(800 - PLAYER.height);
		expect(onLaptop.x).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
		expect(onLaptop.y).toBeGreaterThanOrEqual(VIEWPORT_MARGIN);
	});

	it('clears the mobile nav bar when asked to', () => {
		const viewport = { width: 390, height: 844 };
		const at = clampToViewport({ x: 0, y: 9999 }, PLAYER, viewport, {
			bottomMargin: MOBILE_BOTTOM_MARGIN
		});
		expect(at.y).toBe(viewport.height - PLAYER.height - MOBILE_BOTTOM_MARGIN);
		// Which is meaningfully higher than the desktop clamp would allow.
		expect(at.y).toBeLessThan(viewport.height - PLAYER.height - VIEWPORT_MARGIN);
	});

	it('keeps the leading edge visible when the player is wider than the viewport', () => {
		// A narrow phone or a zoomed-in browser makes the available range
		// negative; clamping naively would push it off the top-left instead.
		// Both axes must genuinely be too small: at 200x120 the player's 56px
		// height still fits, so only x would clamp to the margin.
		const tiny = { width: 200, height: 40 };
		const at = clampToViewport({ x: 500, y: 500 }, PLAYER, tiny);
		expect(at.x).toBe(VIEWPORT_MARGIN);
		expect(at.y).toBe(VIEWPORT_MARGIN);
	});

	it('never returns a negative coordinate, whatever the inputs', () => {
		for (const viewport of [
			{ width: 0, height: 0 },
			{ width: 100, height: 50 },
			{ width: 1920, height: 1080 }
		]) {
			for (const desired of [
				{ x: -9999, y: -9999 },
				{ x: 0, y: 0 },
				{ x: 9999, y: 9999 }
			]) {
				const at = clampToViewport(desired, PLAYER, viewport);
				expect(at.x).toBeGreaterThanOrEqual(0);
				expect(at.y).toBeGreaterThanOrEqual(0);
			}
		}
	});
});

describe('parseStoredPosition', () => {
	it('accepts a real pair of numbers', () => {
		expect(parseStoredPosition({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
	});

	it('rejects anything malformed rather than half-restoring it', () => {
		// A half-valid position is worse than none: the player would jump to a
		// coordinate the visitor never chose.
		for (const bad of [
			null,
			undefined,
			'nope',
			42,
			{},
			{ x: 10 },
			{ y: 10 },
			{ x: '10', y: '20' },
			{ x: NaN, y: 0 },
			{ x: 0, y: Infinity }
		]) {
			expect(parseStoredPosition(bad), JSON.stringify(bad) ?? 'undefined').toBeNull();
		}
	});

	it('accepts zero, which is falsy but valid', () => {
		expect(parseStoredPosition({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
	});
});
