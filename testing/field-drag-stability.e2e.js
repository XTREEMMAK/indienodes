import { expect, test } from '@playwright/test';

/**
 * The field is an open canvas at its full authored column count everywhere
 * above the mobile stack, so a node renders where it was actually arranged and
 * a drop is a placement rather than a suggestion.
 *
 * These cover the two things that used to break that. One was a bug: the
 * responsive layout pass read the measured cell pitch, gridstack resizes the
 * grid container continuously while a node is in flight, so the pass ran
 * mid-drag and repositioned the node under the pointer — which both snapped it
 * back and left gridstack refusing every later move of that drag, while the
 * neighbours it had already pushed aside kept their pushed positions. The
 * other was the column ladder itself: below the authored width a node wider
 * than the grid was clamped, so coordinates could not be trusted, so the whole
 * arrangement was re-derived from reading order and re-centered on every
 * resize. Holding 24 columns removes the clamp, and with it the re-derivation.
 */

/** Engine-side geometry, which is the runtime truth while a grid is live. */
const geometry = (page) =>
	page.evaluate(() =>
		Object.fromEntries(
			[...document.querySelectorAll('.grid-stack-item[gs-id]')].map((el) => [
				el.getAttribute('gs-id'),
				`${el.gridstackNode?.x},${el.gridstackNode?.y}`
			])
		)
	);

/** The saved layout, or null when nothing has been persisted this session. */
const stored = (page) =>
	page.evaluate(() => {
		const raw = localStorage.getItem('indienode:layout:v1');
		return raw
			? Object.fromEntries(JSON.parse(raw).map((node) => [node.id, `${node.x},${node.y}`]))
			: null;
	});

const storedOrder = (page) =>
	page.evaluate(() => {
		const raw = localStorage.getItem('indienode:layout:v1');
		return raw ? JSON.parse(raw).map((node) => node.id) : null;
	});

/**
 * Width reserved by `scrollbar-gutter: stable` (app.css). A fixed element fills
 * the viewport minus this strip, and nothing is painted inside it.
 */
const GUTTER_PX = 16;

const columnsNow = (page) =>
	page.evaluate(() => document.querySelector('.grid-stack').gridstack.getColumn());

/**
 * Presses on a card's middle and nudges once, which is what gridstack treats
 * as the start of a real drag.
 *
 * The middle specifically, because both ends of a card are drag-cancelling
 * controls: the configuration bar along the top and the Visit link near the
 * bottom, both of which match gridstack's `cancel` selector. On the open
 * canvas a card can be as little as 128px tall, so an offset that clears them
 * comfortably at desktop sizes lands squarely on one of them further down.
 */
async function pressOn(page, id) {
	const box = await page.locator(`.grid-stack-item[gs-id="${id}"]`).boundingBox();
	if (!box) throw new Error(`${id} has no bounding box`);
	const from = { x: box.x + box.width / 2, y: box.y + box.height * 0.45 };
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 3, from.y + 3);
	return from;
}

/**
 * The column count follows the width now, so a test asks for the *mode* it
 * needs rather than a number: 'canvas' is any width holding at least the
 * authored count, where nodes render at their own coordinates, and 'stack' is
 * the narrowest layout, where a drop means reorder.
 */
async function arrangeAt(page, width, mode = 'canvas') {
	await page.setViewportSize({ width, height: 1000 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();
	await page.getByRole('button', { name: 'Arrange field' }).click();
	if (mode === 'stack') await expect.poll(() => columnsNow(page)).toBe(4);
	else await expect.poll(() => columnsNow(page)).toBeGreaterThanOrEqual(24);
}

test('the arrangement is identical at every width above the mobile stack', async ({ page }) => {
	await page.setViewportSize({ width: 1600, height: 1000 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();
	await expect.poll(() => columnsNow(page)).toBeGreaterThanOrEqual(24);
	const composed = await geometry(page);

	// The whole point of holding the authored column count: a composition
	// survives a resize instead of being re-flowed into centered rows.
	for (const width of [2400, 2000, 1750, 1620, 1600]) {
		await page.setViewportSize({ width, height: 1000 });
		await expect.poll(() => columnsNow(page)).toBeGreaterThanOrEqual(24);
		await expect.poll(() => geometry(page)).toEqual(composed);
	}
});

test('cards hold their size and the canvas gains columns instead', async ({ page }) => {
	// The complaint this answers: cards scaled with the viewport, shrinking
	// until a card's own container query dropped the `why` line under the title
	// and clipped the Visit button.
	const card = () =>
		page.evaluate(() => {
			const node = document.querySelector('.grid-stack-item[gs-id="n-comic-1"] .node');
			const why = node?.querySelector('.why');
			const box = node.getBoundingClientRect();
			const grid = document.querySelector('.grid-stack').getBoundingClientRect();
			const room = document.querySelector('.grid-viewport').getBoundingClientRect();
			return {
				width: Math.round(box.width),
				height: Math.round(box.height),
				why: why ? getComputedStyle(why).display !== 'none' : false,
				columns: document.querySelector('.grid-stack').gridstack.getColumn(),
				unusable: Math.round(room.width - grid.width)
			};
		});

	await page.setViewportSize({ width: 2560, height: 1000 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();
	await page.waitForTimeout(400);
	for (const width of [2560, 1920, 1608, 1400, 1200, 900, 600]) {
		await page.setViewportSize({ width, height: 1000 });
		// Polled rather than read once: a resize re-derives the column count and
		// then re-applies the arrangement, so the first frame after it is still
		// the old layout in the new room.
		await expect
			.poll(
				async () => {
					const c = await card();
					// The same card at every width, give or take the slack a whole
					// number of columns leaves in a row — not one tracking the window.
					return c.width > 200 && c.width < 340;
				},
				{ message: `card width at ${width}px` }
			)
			.toBe(true);
		const now = await card();
		expect(now.why, `why line at ${width}px`).toBe(true);
		expect(now.height, `card height at ${width}px`).toBeGreaterThan(240);
		// And the canvas uses the whole width rather than centring in it.
		expect(now.unusable, `dead margin at ${width}px`).toBeLessThanOrEqual(1);
	}

	// A wider screen buys more canvas, not bigger cards.
	await page.setViewportSize({ width: 2560, height: 1000 });
	await expect.poll(() => card().then((c) => c.columns)).toBeGreaterThan(24);
});

test('fit-to-view caps the column count without pinning it', async ({ page }) => {
	const state = () =>
		page.evaluate(() => {
			const grid = document.querySelector('.grid-stack');
			const room = document.querySelector('.grid-viewport').getBoundingClientRect();
			const card = document.querySelector(
				'.grid-stack-item[gs-id] .node, .grid-stack-item[gs-id] .empty-node'
			);
			return {
				columns: grid.gridstack.getColumn(),
				cardWidth: card ? Math.round(card.getBoundingClientRect().width) : 0,
				unusable: Math.round(room.width - grid.getBoundingClientRect().width),
				columnsUsed: new Set(
					[...document.querySelectorAll('.grid-stack-item[gs-id]')].map((el) => el.gridstackNode.x)
				).size
			};
		});

	await page.setViewportSize({ width: 2110, height: 1000 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();
	await page.evaluate(() => {
		const key = 'indienode:preferences:v1';
		const prefs = JSON.parse(localStorage.getItem(key) ?? '{}');
		prefs.fitToView = true;
		localStorage.setItem(key, JSON.stringify(prefs));
	});
	await page.reload();
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();

	// Upward it caps: the composition fills a wide screen instead of sitting in
	// the left of a canvas wider than it, and no dead margin is left either side.
	await expect.poll(() => state().then((s) => s.columns)).toBe(24);
	expect((await state()).unusable).toBeLessThanOrEqual(1);

	// Downward it must still collapse. Pinning the authored count onto smaller
	// screens rendered cards at 119px, then 45px, and never reached a single
	// column — a composition preserved in name only.
	// Polled on the card, not the count: the count drops a frame before the
	// arrangement is re-applied underneath it.
	await page.setViewportSize({ width: 872, height: 1000 });
	await expect
		.poll(
			async () => {
				const now = await state();
				return now.columns < 24 && now.cardWidth > 200;
			},
			{ message: 'collapsed and legible at 872px' }
		)
		.toBe(true);

	await page.setViewportSize({ width: 426, height: 1000 });
	await expect
		.poll(
			async () => {
				const now = await state();
				return now.columns === 4 && now.cardWidth > 200;
			},
			{ message: 'single legible column at 426px' }
		)
		.toBe(true);
	const narrow = await state();
	// One column: every node starts at the same x.
	expect(narrow.columnsUsed).toBe(1);
	expect(narrow.unusable).toBeLessThanOrEqual(1);
});

test('the narrowest layout is one full-width column', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 900 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();
	await expect.poll(() => columnsNow(page)).toBe(4);

	// Every node on its own row, filling the width rather than sitting in a
	// column with margin either side.
	const placed = await geometry(page);
	for (const cell of Object.values(placed)) expect(cell.split(',')[0]).toBe('0');
	const fills = await page.evaluate(() => {
		const grid = document.querySelector('.grid-stack').getBoundingClientRect();
		const vp = document.querySelector('.grid-viewport').getBoundingClientRect();
		return Math.round(vp.width - grid.width);
	});
	expect(fills).toBe(0);
});

test('the field never scrolls sideways at any width', async ({ page }) => {
	await page.setViewportSize({ width: 1600, height: 1000 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();
	for (const width of [1600, 1205, 1100, 900, 700, 500, 390]) {
		await page.setViewportSize({ width, height: 1000 });
		await page.waitForTimeout(250);
		const overflows = await page.evaluate(() => {
			const vp = document.querySelector('.grid-viewport');
			return vp.scrollWidth > vp.clientWidth + 1;
		});
		expect(overflows, `overflow at ${width}px`).toBe(false);
	}
});

test('the arrange grid fills the viewport, not just the arrangement', async ({ page }) => {
	// It is the surface the field is arranged on, so it covers the whole screen
	// however few nodes there are and however far down they reach — and, being
	// out of flow, it cannot add a pixel of scroll to the page doing it.
	await page.setViewportSize({ width: 1400, height: 700 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();

	const restingHeight = await page.evaluate(() => document.documentElement.scrollHeight);
	await page.getByRole('button', { name: 'Arrange field' }).click();
	await expect(page.locator('.arrange-canvas')).toBeVisible();

	const covers = () =>
		page.evaluate(() => {
			const dots = document.querySelector('.arrange-canvas').getBoundingClientRect();
			const lowest = [...document.querySelectorAll('.grid-stack-item[gs-id]')].reduce(
				(deepest, el) => Math.max(deepest, el.getBoundingClientRect().bottom),
				0
			);
			return {
				left: Math.round(dots.left),
				top: Math.round(dots.top),
				width: Math.round(dots.width),
				height: Math.round(dots.height),
				// The gutter reserved for the scrollbar is not part of the
				// viewport a fixed element fills, and nothing is painted there.
				win: `${document.documentElement.clientWidth}x${window.innerHeight}`,
				pastLowestNode: dots.bottom > lowest
			};
		});

	const box = await covers();
	expect(box).toMatchObject({ left: 0, top: 0, height: 700 });
	// Everything but the strip reserved for the scrollbar, which is not part of
	// the viewport a fixed element fills and has nothing painted in it.
	expect(box.width).toBeGreaterThanOrEqual(Number.parseInt(box.win, 10) - GUTTER_PX);

	// Arranging must not lengthen the page: an earlier version gave the canvas a
	// min-height, which made an absolutely positioned box overflow its parent.
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollHeight))
		.toBe(restingHeight);

	// Still the whole viewport once the field scrolls beneath it, and the
	// lattice follows the grid so the dots stay on real cell boundaries.
	await page.evaluate(() => window.scrollTo(0, 200));
	await expect.poll(covers).toMatchObject({ left: 0, top: 0, height: 700 });
	const tracks = await page.evaluate(() => {
		const canvas = document.querySelector('.arrange-canvas');
		const grid = document.querySelector('.grid-stack').getBoundingClientRect();
		return Math.abs(Number.parseFloat(canvas.style.getPropertyValue('--dot-y')) - grid.top) <= 1;
	});
	expect(tracks).toBe(true);
});

test('every node shows what type it is while being arranged', async ({ page }) => {
	// Resizing a node is exactly when you need to know which kind it is, and an
	// empty one has no artwork to say so — it is otherwise a blank rectangle.
	// The whole row carrying the badge used to be hidden here, on the reasoning
	// that the node's own menu states the type; that meant opening a menu per
	// node to read something a chip already says.
	await page.setViewportSize({ width: 1700, height: 950 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();
	await page.getByRole('button', { name: 'Arrange field' }).click();

	await expect
		.poll(() =>
			page.evaluate(() =>
				[...document.querySelectorAll('.grid-stack-item[gs-id]')].every((el) => {
					const badge = el.querySelector('.type-badge');
					return (
						badge &&
						getComputedStyle(badge).visibility !== 'hidden' &&
						badge.textContent.trim().length > 0
					);
				})
			)
		)
		.toBe(true);

	// Including the ones with nothing in them, which is the case that needs it.
	const empties = await page.evaluate(
		() => document.querySelectorAll('.grid-stack-item[gs-id] .empty-node .type-badge').length
	);
	expect(empties).toBeGreaterThan(0);

	// The curate toggles still go: they sit above the configuration layer and
	// covered the Remove control underneath it.
	await expect(page.locator('.grid-stack-item .curate-controls')).toHaveCount(0);
});

test('the arrange intro sweeps the whole viewport, not just the grid', async ({ page }) => {
	await page.setViewportSize({ width: 1700, height: 950 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();
	await page.waitForTimeout(400);
	await page.getByRole('button', { name: 'Arrange field' }).click();

	// The dot canvas is the full screen, but the sweep was generated one column
	// per *grid* column from the grid's own left edge, so it rippled across the
	// arrangement and left the gutters bare until the resting grid popped in.
	const spans = await page.evaluate(() => {
		const cols = [...document.querySelectorAll('.dot-wave-col')];
		if (!cols.length) return null;
		const rects = cols.map((c) => c.getBoundingClientRect());
		return {
			left: Math.min(...rects.map((r) => r.left)) <= 0,
			right: Math.max(...rects.map((r) => r.right)) >= window.innerWidth
		};
	});
	expect(spans).toEqual({ left: true, right: true });
});

test('the intro sweep lands on the lattice it hands over to', async ({ page }) => {
	// The sweep draws the same dot pattern the resting canvas does, then hands
	// over to it. Both have to be on the same lattice or the whole grid appears
	// to jump into place as the animation ends — which it did: the canvas offsets
	// its dots by --dot-y to follow the grid, and the sweep's columns did not, so
	// they sat a third of a cell out.
	await page.setViewportSize({ width: 1700, height: 950 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();
	await page.waitForTimeout(400);
	await page.getByRole('button', { name: 'Arrange field' }).click();
	await expect(page.locator('.dot-wave-col').first()).toBeAttached();

	const offset = await page.evaluate(() => {
		const canvas = document.querySelector('.arrange-canvas');
		const column = document.querySelector('.dot-wave-col');
		const style = getComputedStyle(column);
		const cell = Number.parseFloat(style.backgroundSize);
		const canvasPos = getComputedStyle(canvas).backgroundPosition.split(' ');
		const columnPos = style.backgroundPosition.split(' ');
		// Untransformed layout position: the sweep animation is mid-flight and
		// its translate would otherwise be read as a lattice difference.
		const wrap = (value) => ((value % cell) + cell) % cell;
		return {
			cell,
			y: wrap(
				Number.parseFloat(canvasPos[1]) - (column.offsetTop + Number.parseFloat(columnPos[1]))
			),
			x: wrap(
				Number.parseFloat(canvasPos[0]) - (column.offsetLeft + Number.parseFloat(columnPos[0]))
			)
		};
	});

	// Whole cells apart is the same lattice; anything in between is a visible jump.
	const nearZero = (value) => Math.min(value, offset.cell - value);
	expect(nearZero(offset.y), 'vertical lattice').toBeLessThan(1);
	expect(nearZero(offset.x), 'horizontal lattice').toBeLessThan(1);
});

test('the grid stays under the whole viewport mid-drag', async ({ page }) => {
	// Dragging a node up shortens the field. The canvas used to be sized to the
	// grid, so the height that freed up showed bare page until the drop landed.
	await arrangeAt(page, 1700);
	const box = await page.locator('.grid-stack-item[gs-id="n-art-1"]').boundingBox();
	if (!box) throw new Error('the art node has no bounding box');
	const from = { x: box.x + box.width / 2, y: box.y + box.height * 0.45 };
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 3, from.y + 3);
	await page.mouse.move(from.x, from.y - 300, { steps: 20 });

	const covers = await page.evaluate(() => {
		const d = document.querySelector('.arrange-canvas').getBoundingClientRect();
		return (
			d.top <= 1 &&
			d.left <= 1 &&
			d.bottom >= window.innerHeight - 2 &&
			// Bar the strip reserved for the scrollbar; see GUTTER_PX.
			d.right >= document.documentElement.clientWidth - 16
		);
	});
	await page.mouse.up();
	expect(covers).toBe(true);
});

test('the page width does not depend on the field being tall', async ({ page }) => {
	// The shake this prevents was a loop, not a jitter. The field's cell pitch
	// comes from the container width; the drag margin under it used to be four
	// cells deep; so the document's *height* depended on its *width*. With
	// classic space-taking scrollbars — overlay scrollbars hide this entirely —
	// dragging a node down grew the page, summoned the scrollbar, narrowed the
	// container, shrank the cell, shrank the page, dismissed the scrollbar, and
	// went round again.
	await page.setViewportSize({ width: 1700, height: 700 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();

	// One edge: the gutter is reserved whether or not a scrollbar is showing.
	await expect
		.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter))
		.toBe('stable');

	// The other: the drag margin is a fixed length, so growing or shrinking the
	// cell cannot move the document's height.
	await page.getByRole('button', { name: 'Arrange field' }).click();
	const measure = () =>
		page.evaluate(() => ({
			pad: getComputedStyle(document.querySelector('.grid-stack')).paddingBottom,
			cell: document.querySelector('.grid-viewport').style.getPropertyValue('--cell-h')
		}));
	await expect.poll(() => measure().then((m) => m.pad)).not.toBe('0px');
	const wide = await measure();

	await page.setViewportSize({ width: 900, height: 700 });
	await expect.poll(() => measure().then((m) => m.cell)).not.toBe(wide.cell);
	const narrow = await measure();
	expect(narrow.pad, 'drag margin must not track the cell pitch').toBe(wide.pad);

	// And the usable width is the same either side of the change.
	const widths = await page.evaluate(() => ({
		client: document.documentElement.clientWidth,
		win: window.innerWidth
	}));
	expect(widths.win - widths.client).toBeLessThanOrEqual(20);
});

test('resizing back and forth while arranging settles instead of looping', async ({ page }) => {
	// The crash this guards: the layout effect wrote positions, gridstack
	// announced them, the change listener re-measured, and the measurement was
	// state the effect reads — so it ran again. It only terminated if the engine
	// landed exactly where the effect asked, and top gravity in the re-arranging
	// tier does not always allow that (the shelf packer leaves a gap under a
	// short node beside a tall one; gravity pulls the next row into it).
	const errors = [];
	page.on('pageerror', (error) => errors.push(String(error).split('\n')[0]));

	await page.setViewportSize({ width: 1000, height: 900 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();
	// Rows that mix tall and short nodes, which is what creates the gaps.
	await page.evaluate(() => {
		localStorage.setItem(
			'indienode:layout:v1',
			JSON.stringify([
				{ id: 'n-comic-1', type: 'comic', tags: [], x: 0, y: 0, w: 4, h: 6 },
				{ id: 'n-audio-1', type: 'audio', tags: [], x: 4, y: 0, w: 4, h: 4 },
				{ id: 'n-game-1', type: 'game', tags: [], x: 8, y: 0, w: 4, h: 4 },
				{ id: 'n-text-1', type: 'text', tags: [], x: 12, y: 0, w: 4, h: 6 },
				{ id: 'n-art-1', type: 'art', tags: [], x: 16, y: 0, w: 4, h: 6 }
			])
		);
	});
	await page.reload();
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();
	await page.getByRole('button', { name: 'Arrange field' }).click();
	await page.waitForTimeout(600);

	await page.evaluate(() => {
		window.__updates = 0;
		const grid = document.querySelector('.grid-stack').gridstack;
		const update = grid.update.bind(grid);
		grid.update = (...args) => {
			window.__updates += 1;
			return update(...args);
		};
	});

	// Down through the tiers and back up, which is the reported gesture.
	for (const width of [900, 800, 700, 600, 480, 600, 700, 800, 900, 1000]) {
		await page.setViewportSize({ width, height: 900 });
		await page.waitForTimeout(200);
	}

	// Whatever it did on the way, it has to stop when the resizing does.
	await page.evaluate(() => {
		window.__updates = 0;
	});
	await page.waitForTimeout(1500);
	expect(await page.evaluate(() => window.__updates), 'still writing while idle').toBe(0);
	expect(errors).toEqual([]);
});

test('an abandoned drag leaves every node where it was', async ({ page }) => {
	await arrangeAt(page, 1700);
	const before = await geometry(page);
	const cell = await page.evaluate(() =>
		document.querySelector('.grid-stack').gridstack.cellWidth()
	);

	// Five cells left, which lands audio squarely across comic rather than
	// clipping its edge: gridstack only pushes a neighbour once the drag covers
	// more than half of it, so a pixel nudge would prove nothing either way.
	const from = await pressOn(page, 'n-audio-1');
	await page.mouse.move(from.x - 5 * cell, from.y, { steps: 20 });

	// The drag has to actually engage, which is the half of this that was
	// silently dead: gridstack refused every move after the first correction, so
	// nothing on the grid ever responded to the pointer.
	await expect
		.poll(() => geometry(page).then((now) => now['n-audio-1']))
		.not.toBe(before['n-audio-1']);
	// And it has to have shoved a neighbour, which is what the drop then puts
	// back.
	await expect
		.poll(() => geometry(page).then((now) => now['n-comic-1']))
		.not.toBe(before['n-comic-1']);

	await page.mouse.move(from.x, from.y, { steps: 20 });
	await page.mouse.up();

	// Everything back where it started, neighbours included: the ones gridstack
	// pushed out of the way on the trip out used to keep the pushed positions.
	await expect.poll(() => geometry(page)).toEqual(before);
	// And nothing was written. A drag that changes nothing is not an edit.
	expect(await stored(page)).toBeNull();
});

test('a drag that pushes a node upward and returns commits nothing', async ({ page }) => {
	// The direction matters, which is why this is separate from the drag above.
	// gridstack pushes neighbours aside continuously and has only one mechanism
	// for putting them back — the floating pack — which walks a displaced node
	// *upward* toward where it started. Anything shoved upward therefore had no
	// route home, and worse, the node that shoved it could not get back into its
	// own cell either once that cell was occupied: gridstack refuses a move
	// covering less than half an occupant. Dragging a node up and back down left
	// the whole column permanently shifted.
	await arrangeAt(page, 1700);
	const before = await geometry(page);
	const cell = await page.evaluate(() =>
		document.querySelector('.grid-stack').gridstack.cellWidth()
	);

	// game sits directly below audio; dragging it up displaces audio downward.
	const from = await pressOn(page, 'n-game-1');
	await page.mouse.move(from.x, from.y - 4 * cell, { steps: 20 });
	await expect
		.poll(() => geometry(page).then((now) => now['n-audio-1']))
		.not.toBe(before['n-audio-1']);

	await page.mouse.move(from.x, from.y, { steps: 20 });
	await page.mouse.up();

	await expect.poll(() => geometry(page)).toEqual(before);
	expect(await stored(page)).toBeNull();
});

test('a drop in open canvas keeps the cell it was dropped on', async ({ page }) => {
	// Comfortably inside the open canvas, but well below the widths the old
	// column ladder kept the authored count for — this drop used to be
	// re-centered away rather than kept.
	await arrangeAt(page, 1700);
	const before = await geometry(page);

	const from = await pressOn(page, 'n-audio-1');
	await page.mouse.move(from.x + 180, from.y + 260, { steps: 25 });
	await page.mouse.up();

	// Literal coordinates, persisted as themselves — no reorder, no re-centring,
	// and no per-breakpoint bookkeeping needed to survive.
	await expect.poll(() => stored(page)).not.toBeNull();
	const after = await geometry(page);
	expect(after['n-audio-1']).not.toBe(before['n-audio-1']);
	expect((await stored(page))['n-audio-1']).toBe(after['n-audio-1']);
	// The nodes it never touched are untouched.
	expect(after['n-comic-1']).toBe(before['n-comic-1']);
	expect(after['n-text-1']).toBe(before['n-text-1']);
});

test('a placement made on a narrower canvas survives a trip to a wide one', async ({ page }) => {
	await arrangeAt(page, 1700);
	const from = await pressOn(page, 'n-audio-1');
	await page.mouse.move(from.x + 180, from.y + 260, { steps: 25 });
	await page.mouse.up();
	await expect.poll(() => stored(page)).not.toBeNull();
	const placed = await geometry(page);

	// Out to a much wider canvas and back. Both widths hold the authored column
	// count, so the arrangement is the same arrangement at each.
	await page.setViewportSize({ width: 2200, height: 1000 });
	await expect.poll(() => geometry(page)).toEqual(placed);
	await page.setViewportSize({ width: 1700, height: 1000 });
	await expect.poll(() => geometry(page)).toEqual(placed);

	// And through the re-arranging tier, which renders from reading order and
	// must leave the saved coordinates alone.
	await page.setViewportSize({ width: 800, height: 1000 });
	await expect.poll(() => columnsNow(page)).toBeLessThan(24);
	await page.setViewportSize({ width: 1700, height: 1000 });
	await expect.poll(() => geometry(page)).toEqual(placed);
});

test('the mobile stack still reads a drag as a reorder', async ({ page }) => {
	// At four columns a node authored 16 cells wide does not fit at all, so
	// there is no arrangement to preserve and sequence is the only thing a drop
	// can mean. This is the one width that still works that way.
	await page.setViewportSize({ width: 400, height: 1400 });
	await page.goto('/');
	await expect(page.locator('.grid-stack.gs-visible')).toBeVisible();
	await page.getByRole('button', { name: 'Arrange field' }).click();
	await expect.poll(() => columnsNow(page)).toBe(4);
	expect(await storedOrder(page)).toBeNull();

	// The first card, dragged down past the second. Grabbed near its top so the
	// whole gesture stays on screen: at four columns every card is a full
	// viewport width across and correspondingly tall.
	const box = await page.locator('.grid-stack-item[gs-id="n-comic-1"]').boundingBox();
	if (!box) throw new Error('the comic node has no bounding box');
	const from = { x: box.x + box.width / 2, y: box.y + box.height * 0.25 };
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(from.x + 3, from.y + 3);
	await page.mouse.move(from.x, from.y + box.height * 0.9, { steps: 25 });
	await page.mouse.up();

	// Order changed; every node still sits in one full-width column.
	await expect.poll(() => storedOrder(page)).not.toBeNull();
	const order = await storedOrder(page);
	expect(order).toHaveLength(5);
	expect(order).not.toEqual(['n-comic-1', 'n-text-1', 'n-audio-1', 'n-game-1', 'n-art-1']);
	const placed = await geometry(page);
	for (const cell of Object.values(placed)) expect(cell.split(',')[0]).toBe('0');
});
