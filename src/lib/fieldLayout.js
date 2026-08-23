import { GRID_COLUMNS } from './nodeShape.js';

/**
 * The field's geometry: how deep an arrangement is, how big a cell should be
 * to fit it on screen, and how to lay it out at a narrower column count.
 *
 * Extracted from `FieldGrid.svelte`, where it was 1,100 lines of gridstack
 * lifecycle away from anything a test could reach. It is all pure — nodes and
 * numbers in, positions out — and it is the part of that component most worth
 * pinning: `computeCenteredLayout` exists specifically because gridstack's own
 * reflow produced visibly unbalanced rows, and nothing was stopping it
 * regressing back to that.
 */

/** @typedef {import('./layoutStore.svelte.js').FieldNodeConfig} FieldNodeConfig */

/** Below this a card stops being worth looking at; the field scrolls instead. */
export const MIN_CELL_PX = 14;
/** Above this a four-node field on a large display reads as absurdly large. */
export const MAX_CELL_PX = 96;
/** Vertical room the fitted layout gets, matching main's own padding. */
export const FIT_VIEWPORT_INSET = 112;

/**
 * How many rows deep an arrangement actually is.
 *
 * Derived from the nodes rather than measured from the DOM, so it is correct
 * before anything has rendered and does not chase the sizes it is about to
 * set. Never zero: an empty field still occupies one row's worth of height,
 * and returning zero would make the fit calculation divide by it.
 *
 * @param {FieldNodeConfig[]} nodes
 * @returns {number}
 */
export function layoutRowsFor(nodes) {
	return nodes.reduce((deepest, node) => Math.max(deepest, node.y + node.h), 0) || 1;
}

/**
 * Cell size, in pixels, that fits the whole arrangement on screen.
 *
 * Both constraints matter: width alone leaves a tall arrangement running off
 * the bottom, height alone leaves a wide one clipped at the side. The result
 * is clamped, because past either bound the field stops being worth looking at
 * in one direction and looks absurd in the other.
 *
 * Returns 0 when there is nothing to measure against, which the caller reads
 * as "not fitting" and falls back to its own sizing.
 *
 * @param {{ width: number, height: number }} viewport
 * @param {number} rows
 * @param {number} [columns]
 * @returns {number}
 */
export function fitCellSize(viewport, rows, columns = GRID_COLUMNS) {
	if (!viewport || viewport.width === 0 || rows <= 0 || columns <= 0) return 0;
	const byWidth = viewport.width / columns;
	const byHeight = (viewport.height - FIT_VIEWPORT_INSET) / rows;
	return Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, Math.min(byWidth, byHeight)));
}

/**
 * A deterministic, row-centered layout for a reduced column count.
 *
 * This replaces gridstack's own column-change reflow at every width that is
 * not the authored one. That reflow proportionally rescales each node's x,
 * then resolves whatever collisions that creates through its general-purpose
 * move logic, and the two together produce inconsistent gaps: one row's
 * content sits flush against the left edge, the next starts two columns in,
 * the one after that ten columns in. There is no side those gaps consistently
 * favor; the result just reads as unbalanced, which is what was reported.
 * Resize is not offered at these widths (there is no arrangement to preserve
 * by leaning on gridstack's own resize math), so a plain shelf-packer is what
 * makes the outcome predictable enough to center.
 *
 * Width is clamped to the column count and height scaled with it, which keeps
 * a node's aspect ratio intact rather than gridstack's own clamp, which kept
 * height fixed and left a 16:9 node distorted toward 4:3 once its width alone
 * was cut down to fit.
 *
 * `gs-x` is a grid coordinate and has to be a whole cell, so a row whose
 * leftover space is an odd number of columns cannot be centered by integer
 * offset alone: the two sides differ by one full cell, roughly 60px in this
 * grid, which is small next to the bug this replaces but was still visibly
 * off-center rather than truly centered. `nudge` carries that leftover
 * half-cell (0 or 0.5) so the caller can correct for it with a CSS transform,
 * which is not bound to whole cells the way gridstack's own positioning is.
 *
 * @param {FieldNodeConfig[]} nodeList
 * @param {number} columns
 * @returns {{ id: string, x: number, y: number, w: number, h: number, nudge: number }[]}
 */
export function computeCenteredLayout(nodeList, columns) {
	/** @type {{ id: string, x: number, y: number, w: number, h: number, nudge: number }[]} */
	const placed = [];
	/** @type {{ id: string, x: number, y: number, w: number, h: number }[]} */
	let row = [];
	let rowHeight = 1;
	let cursor = 0;
	let y = 0;

	function closeRow() {
		if (!row.length) return;
		const used = row.reduce((sum, item) => sum + item.w, 0);
		const leftover = columns - used;
		const offset = Math.floor(leftover / 2);
		const nudge = leftover % 2 === 0 ? 0 : 0.5;
		for (const item of row) placed.push({ ...item, x: item.x + offset, nudge });
		row = [];
		rowHeight = 1;
	}

	for (const node of nodeList) {
		const w = Math.max(1, Math.min(node.w, columns));
		const h = w === node.w ? node.h : Math.max(1, Math.round((node.h * w) / node.w));

		if (cursor > 0 && cursor + w > columns) {
			y += rowHeight;
			closeRow();
			cursor = 0;
		}
		row.push({ id: node.id, x: cursor, y, w, h });
		rowHeight = Math.max(rowHeight, h);
		cursor += w;
	}
	closeRow();

	return placed;
}
