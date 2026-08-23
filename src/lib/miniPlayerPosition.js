/**
 * Keeping the draggable mini player on screen.
 *
 * Small, but worth having somewhere a test can reach: this is what makes a
 * position restored from a *different* screen usable rather than stranding the
 * player off the edge. `storageKeys.js` cites exactly that when it marks
 * `indienode:player-position:v1` non-exportable — a dragged position is
 * viewport-specific and gets clamped back into bounds elsewhere — and that
 * claim had nothing standing behind it until now.
 *
 * The drag plumbing itself (pointer capture, offsets, keyboard nudges) stays
 * in the component: it is DOM event handling, not arithmetic.
 */

/** Breathing room from every edge. */
export const VIEWPORT_MARGIN = 12;

/**
 * Extra bottom clearance on narrow viewports, so the mini player cannot sit
 * under the mobile nav bar where it is unreachable.
 */
export const MOBILE_BOTTOM_MARGIN = 84;

/**
 * Clamps a desired position to somewhere actually visible.
 *
 * `Math.max(margin, ...)` on the upper bound is doing real work rather than
 * being defensive: when the element is larger than the viewport — a narrow
 * phone, or a zoomed-in browser — the available range goes negative, and
 * clamping naively would push the player off the top-left instead of the
 * bottom-right. Preferring the margin keeps at least its leading edge in view.
 *
 * @param {{ x: number, y: number }} position desired top-left
 * @param {{ width: number, height: number }} element the player's own size
 * @param {{ width: number, height: number }} viewport
 * @param {{ bottomMargin?: number }} [options]
 * @returns {{ x: number, y: number }}
 */
export function clampToViewport(position, element, viewport, { bottomMargin } = {}) {
	const bottom = bottomMargin ?? VIEWPORT_MARGIN;
	return {
		x: Math.min(
			Math.max(VIEWPORT_MARGIN, position.x),
			Math.max(VIEWPORT_MARGIN, viewport.width - element.width - VIEWPORT_MARGIN)
		),
		y: Math.min(
			Math.max(VIEWPORT_MARGIN, position.y),
			Math.max(VIEWPORT_MARGIN, viewport.height - element.height - bottom)
		)
	};
}

/**
 * Reads a persisted position, rejecting anything that is not a real pair of
 * finite numbers.
 *
 * Deliberately does not clamp: what is on screen depends on the element's
 * measured size, which is not known at the moment this is read. The caller
 * clamps once it can measure.
 *
 * @param {unknown} stored
 * @returns {{ x: number, y: number } | null}
 */
export function parseStoredPosition(stored) {
	const value = /** @type {{ x?: unknown, y?: unknown } | null} */ (stored);
	if (!value || typeof value !== 'object') return null;
	const { x, y } = value;
	if (typeof x !== 'number' || typeof y !== 'number') return null;
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
	return { x, y };
}
