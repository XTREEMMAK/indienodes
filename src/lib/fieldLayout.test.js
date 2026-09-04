import { describe, expect, it } from 'vitest';
import { CANVAS_CELL_PX, columnsForWidth, computeCenteredLayout } from './fieldLayout.js';
import { GRID_COLUMNS, MIN_W } from './nodeShape.js';

/**
 * `computeCenteredLayout` exists because gridstack's own column reflow
 * produced visibly unbalanced rows. Nothing was stopping it regressing back to
 * that: it lived 1,100 lines inside a component wired to a third-party grid,
 * with no seam a test could reach.
 */

/**
 * @param {Partial<import('./layoutStore.svelte.js').FieldNodeConfig>} o
 * @returns {import('./layoutStore.svelte.js').FieldNodeConfig}
 */
const node = (o) => ({
	id: 'n',
	x: 0,
	y: 0,
	w: 4,
	h: 4,
	type: /** @type {import('./nodeShape.js').NodeType} */ ('audio'),
	tags: /** @type {string[]} */ ([]),
	...o
});

describe('computeCenteredLayout', () => {
	it('centres a row, splitting the leftover evenly', () => {
		const placed = computeCenteredLayout([node({ id: 'a', w: 4, h: 4 })], 12);
		// 12 - 4 = 8 leftover, 4 each side.
		expect(placed[0].x).toBe(4);
		expect(placed[0].nudge).toBe(0);
	});

	it('carries the half cell as a nudge when the leftover is odd', () => {
		const placed = computeCenteredLayout([node({ id: 'a', w: 4, h: 4 })], 11);
		// 11 - 4 = 7: floor(3.5) = 3 columns, with half a cell left over.
		expect(placed[0].x).toBe(3);
		expect(placed[0].nudge).toBe(0.5);
	});

	it('wraps to a new row when the next node will not fit', () => {
		const placed = computeCenteredLayout(
			[node({ id: 'a', w: 6, h: 4 }), node({ id: 'b', w: 6, h: 4 }), node({ id: 'c', w: 6, h: 4 })],
			12
		);
		const [a, b, c] = placed;
		expect(a.y).toBe(0);
		expect(b.y).toBe(0);
		// Third does not fit beside the first two.
		expect(c.y).toBeGreaterThan(0);
	});

	it('advances the next row past the tallest node in the previous one', () => {
		const placed = computeCenteredLayout(
			[
				node({ id: 'tall', w: 6, h: 9 }),
				node({ id: 'short', w: 6, h: 2 }),
				node({ id: 'next', w: 6, h: 3 })
			],
			12
		);
		const next = placed.find((p) => p.id === 'next');
		// Not 2 (the short one) — the row is as deep as its tallest member.
		expect(next?.y).toBe(9);
	});

	it('scales height with a clamped width, preserving aspect ratio', () => {
		// A 16:9 node into an 8-column grid: width halves, so height must too.
		const placed = computeCenteredLayout([node({ id: 'wide', w: 16, h: 9 })], 8);
		expect(placed[0].w).toBe(8);
		// This is the bug the extraction protects: gridstack kept height fixed
		// and distorted a 16:9 node toward 4:3.
		expect(placed[0].h).toBe(5); // round(9 * 8 / 16) = 5
	});

	it('leaves an unclamped node’s height exactly as authored', () => {
		const placed = computeCenteredLayout([node({ id: 'fits', w: 6, h: 9 })], 12);
		expect(placed[0].h).toBe(9);
	});

	it('never places a node outside the grid', () => {
		const nodes = [
			node({ id: 'a', w: 30, h: 4 }),
			node({ id: 'b', w: 7, h: 3 }),
			node({ id: 'c', w: 5, h: 5 })
		];
		for (const columns of [1, 3, 8, 12, GRID_COLUMNS]) {
			for (const p of computeCenteredLayout(nodes, columns)) {
				expect(p.x).toBeGreaterThanOrEqual(0);
				expect(p.w).toBeGreaterThanOrEqual(1);
				expect(p.h).toBeGreaterThanOrEqual(1);
				expect(p.x + p.w).toBeLessThanOrEqual(columns);
			}
		}
	});

	it('places every node exactly once, losing none', () => {
		const nodes = ['a', 'b', 'c', 'd', 'e'].map((id) => node({ id, w: 5, h: 4 }));
		const placed = computeCenteredLayout(nodes, 12);
		expect(placed.map((p) => p.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('never overlaps two nodes in the same row', () => {
		const nodes = [
			node({ id: 'a', w: 4, h: 4 }),
			node({ id: 'b', w: 3, h: 4 }),
			node({ id: 'c', w: 2, h: 4 })
		];
		const placed = computeCenteredLayout(nodes, 12);
		const byRow = placed.filter((p) => p.y === 0).sort((l, r) => l.x - r.x);
		for (let i = 1; i < byRow.length; i += 1) {
			expect(byRow[i].x).toBeGreaterThanOrEqual(byRow[i - 1].x + byRow[i - 1].w);
		}
	});

	it('handles an empty arrangement', () => {
		expect(computeCenteredLayout([], 12)).toEqual([]);
	});
});

/**
 * The column count is what gives way as the window narrows, so that a card can
 * hold a size its own content is still legible at. FieldNode drops the `why`
 * line below 15rem of card height, which is the measurable thing this protects.
 */
describe('columnsForWidth', () => {
	it('gives a wider screen more canvas rather than bigger cards', () => {
		expect(columnsForWidth(GRID_COLUMNS * CANVAS_CELL_PX)).toBe(GRID_COLUMNS);
		// Past the authored width the extra columns are room to arrange into,
		// which is what stops a large display becoming a centred column.
		expect(columnsForWidth(GRID_COLUMNS * CANVAS_CELL_PX * 2)).toBe(GRID_COLUMNS * 2);
	});

	it('holds the cell size steady across the whole range', () => {
		for (const width of [3000, 2000, 1600, 1200, 900, 600, 520]) {
			const pitch = width / columnsForWidth(width);
			expect(pitch).toBeGreaterThanOrEqual(CANVAS_CELL_PX);
			// Never more than one cell's worth of slack spread across the row.
			expect(pitch).toBeLessThan(CANVAS_CELL_PX * 1.3);
		}
	});

	it('trades columns away rather than letting the pitch fall', () => {
		// One column short of the full canvas, and the count follows the room.
		const width = GRID_COLUMNS * CANVAS_CELL_PX - 1;
		expect(columnsForWidth(width)).toBe(GRID_COLUMNS - 1);
	});

	it('drops straight to one full-width column once only one node fits a row', () => {
		// Two MIN_W nodes side by side is the last arrangement worth keeping;
		// below it, a count between would leave a card floating in margin.
		expect(columnsForWidth(2 * MIN_W * CANVAS_CELL_PX)).toBe(2 * MIN_W);
		expect(columnsForWidth(2 * MIN_W * CANVAS_CELL_PX - 1)).toBe(MIN_W);
		expect(columnsForWidth(340)).toBe(MIN_W);
		expect(columnsForWidth(120)).toBe(MIN_W);
	});

	it('never returns a count a node could not fit in', () => {
		for (let w = 60; w <= 3000; w += 7) {
			expect(columnsForWidth(w)).toBeGreaterThanOrEqual(MIN_W);
		}
	});

	it('falls back to the authored count with nothing to measure', () => {
		expect(columnsForWidth(0)).toBe(GRID_COLUMNS);
	});
});
