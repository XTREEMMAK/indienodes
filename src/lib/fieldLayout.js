import { GRID_COLUMNS, MIN_W } from './nodeShape.js';

/**
 * The field's geometry: how big a cell is, how many columns fit in a given
 * width, and how to lay the field out once there are too few for the
 * arrangement as authored.
 *
 * Extracted from `FieldGrid.svelte`, where it was 1,100 lines of gridstack
 * lifecycle away from anything a test could reach. It is all pure — nodes and
 * numbers in, positions out — and it is the part of that component most worth
 * pinning: `computeCenteredLayout` exists specifically because gridstack's own
 * reflow produced visibly unbalanced rows, and nothing was stopping it
 * regressing back to that.
 */

/** @typedef {import('./layoutStore.svelte.js').FieldNodeConfig} FieldNodeConfig */

/**
 * The size of a grid cell, in pixels. Fixed, not derived from the viewport.
 *
 * A node holds the size it was given rather than inflating on a large display
 * and shrinking on a small one: at four cells (`MIN_W`) this puts the smallest
 * card at roughly 250px across, which is about where a card reads comfortably
 * and comfortably clear of the 15rem card height at which FieldNode drops the
 * `why` line under the title and starts clipping the Visit button.
 *
 * What follows the viewport is the *column count*, not the pitch: a wider
 * screen gets more canvas rather than bigger cards. The one exception is the
 * narrowest layout, where four columns are made to fill whatever width there
 * is — below about 250px a card cannot hold its size and still fit.
 */
export const CANVAS_CELL_PX = 64;

/**
 * How many columns the field should run at in a given container.
 *
 * Straight division by the fixed cell size, so the cards keep their size and
 * the canvas gains or loses columns instead. There is no upper limit: past the
 * authored count the extra columns are simply more room to arrange into, which
 * is what makes a wide screen usable rather than a centred column with dead
 * margins either side.
 *
 * The floor is `MIN_W`, one node's width. Once there is no longer room for two
 * of them side by side the count drops straight to that rather than to some
 * value between, where a card would fill a fraction of the row and leave the
 * rest as margin.
 *
 * @param {number} containerWidth
 * @returns {number}
 */
export function columnsForWidth(containerWidth) {
	if (!containerWidth || containerWidth <= 0) return GRID_COLUMNS;
	const fits = Math.floor(containerWidth / CANVAS_CELL_PX);
	if (fits < 2 * MIN_W) return MIN_W;
	return fits;
}

/**
 * The layout used once there are fewer columns than the arrangement needs.
 *
 * While the container holds at least the authored column count, every node
 * simply renders at the coordinates it was arranged at. Below that, a node
 * wider than the grid is clamped to fit — a 16-wide node becomes 12 at 12
 * columns — so the stored coordinates stop describing anything renderable and
 * the only coherent thing left is the reading order, packed into rows. At the
 * narrowest count that degenerates into one full-width card after another,
 * which is the single-column layout.
 *
 * It is a shelf-packer rather than gridstack's own column reflow because that
 * reflow proportionally rescales each node's x and then resolves the resulting
 * collisions through its general-purpose move logic, which produces
 * inconsistent gaps: one row flush left, the next two columns in, the one after
 * ten columns in. There is no side those gaps consistently favor; it just reads
 * as unbalanced.
 *
 * Width is clamped to the column count and height scaled with it, which keeps a
 * node's aspect ratio intact rather than gridstack's own clamp, which kept
 * height fixed and left a 16:9 node distorted toward 4:3 once its width alone
 * was cut down to fit.
 *
 * `gs-x` is a grid coordinate and has to be a whole cell, so a row whose
 * leftover space is an odd number of columns cannot be centered by integer
 * offset alone. `nudge` carries that leftover half-cell (0 or 0.5) so the
 * caller can correct for it with a CSS transform, which is not bound to whole
 * cells the way gridstack's own positioning is.
 *
 * @param {FieldNodeConfig[]} nodeList
 * @param {number} columns
 * @returns {{ id: string, x: number, y: number, w: number, h: number, nudge: number }[]}
 */
export function computeCenteredLayout(nodeList, columns) {
	/** @type {{ id: string, x: number, y: number, w: number, h: number, nudge: number }[]} */
	const placed = [];
	/** @type {{ id: string, x: number, w: number, h: number }[]} */
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
		for (const item of row) placed.push({ ...item, x: item.x + offset, y, nudge });
		row = [];
		rowHeight = 1;
	}

	for (const node of nodeList) {
		const w = Math.max(1, Math.min(node.w, columns));
		const h = w === node.w ? node.h : Math.max(1, Math.round((node.h * w) / node.w));

		if (cursor > 0 && cursor + w > columns) {
			// Captured before `closeRow` resets it: the next row starts below the
			// tallest node in the one being closed, not below the shortest.
			const finished = rowHeight;
			closeRow();
			y += finished;
			cursor = 0;
		}
		row.push({ id: node.id, x: cursor, w, h });
		rowHeight = Math.max(rowHeight, h);
		cursor += w;
	}
	closeRow();

	return placed;
}
