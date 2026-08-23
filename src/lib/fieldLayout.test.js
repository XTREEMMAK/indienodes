import { describe, expect, it } from 'vitest';
import {
	FIT_VIEWPORT_INSET,
	MAX_CELL_PX,
	MIN_CELL_PX,
	computeCenteredLayout,
	fitCellSize,
	layoutRowsFor
} from './fieldLayout.js';
import { GRID_COLUMNS } from './nodeShape.js';

/**
 * `computeCenteredLayout` exists because gridstack's own column reflow
 * produced visibly unbalanced rows. Nothing was stopping it regressing back to
 * that: it lived 1,100 lines inside a component wired to a third-party grid,
 * with no seam a test could reach.
 */

/** @param {Partial<{id:string,x:number,y:number,w:number,h:number}>} o */
const node = (o) => ({ id: 'n', x: 0, y: 0, w: 4, h: 4, type: 'audio', ...o });

describe('layoutRowsFor', () => {
	it('measures the deepest node, not the node count', () => {
		expect(layoutRowsFor([node({ y: 0, h: 4 }), node({ y: 4, h: 6 })])).toBe(10);
	});

	it('never returns zero, so callers can divide by it', () => {
		// An empty field still occupies a row's worth of height.
		expect(layoutRowsFor([])).toBe(1);
		expect(layoutRowsFor([node({ y: 0, h: 0 })])).toBe(1);
	});
});

describe('fitCellSize', () => {
	it('honours whichever axis is the tighter constraint', () => {
		const rows = 4;
		// Very wide, very short: height should win.
		const short = fitCellSize({ width: 4000, height: 400 }, rows);
		expect(short).toBeCloseTo((400 - FIT_VIEWPORT_INSET) / rows, 5);

		// Narrow and tall: width should win.
		const narrow = fitCellSize({ width: 480, height: 4000 }, rows);
		expect(narrow).toBeCloseTo(480 / GRID_COLUMNS, 5);
	});

	it('clamps to the readable range in both directions', () => {
		// Enormous viewport, one row: would be absurd unclamped.
		expect(fitCellSize({ width: 100000, height: 100000 }, 1)).toBe(MAX_CELL_PX);
		// Tiny viewport, very deep layout: the field scrolls instead of vanishing.
		expect(fitCellSize({ width: 200, height: 200 }, 400)).toBe(MIN_CELL_PX);
	});

	it('reports nothing to fit when there is nothing to measure', () => {
		expect(fitCellSize({ width: 0, height: 800 }, 4)).toBe(0);
		expect(fitCellSize({ width: 800, height: 800 }, 0)).toBe(0);
	});
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
