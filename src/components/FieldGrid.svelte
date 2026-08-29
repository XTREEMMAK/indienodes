<script>
	/**
	 * Hosts the gridstack instance for the field view.
	 *
	 * The seam with gridstack, verified empirically before committing to it:
	 * **Svelte owns the DOM elements and their contents; gridstack owns their
	 * geometry.** Svelte renders the `.grid-stack-item` children with `gs-*`
	 * attributes and `GridStack.init()` adopts them in place. Dragging does
	 * not reorder DOM children (gridstack positions absolutely), so keyed
	 * `{#each}` reconciliation and gridstack never fight over the same thing.
	 *
	 * Two consequences worth knowing before editing this:
	 *
	 * 1. After init, writing `gs-x` from Svelte is inert. gridstack tracks
	 *    position in its own engine and applies inline styles, so programmatic
	 *    moves (the keyboard handlers below, and any store-side size change)
	 *    must go through `grid.update()`. The store is the reload-time truth;
	 *    the engine is the runtime truth.
	 * 2. Nodes added after init are invisible to gridstack until
	 *    `makeWidget()` is called on them, which the sync effect handles.
	 *
	 * @type {{
	 *   nodes: import('../lib/layoutStore.svelte.js').FieldNodeConfig[],
	 *   editMode?: boolean,
	 *   fitToView?: boolean,
	 *   onGeometryChange?: (changed: { id: string, x: number, y: number, w: number, h: number }[]) => void,
	 *   onReorder?: (order: string[]) => void,
	 *   children: import('svelte').Snippet<[import('../lib/layoutStore.svelte.js').FieldNodeConfig]>
	 * }}
	 */
	let {
		nodes,
		editMode = false,
		fitToView = false,
		onGeometryChange,
		onReorder,
		children
	} = $props();

	import { onMount, tick, untrack } from 'svelte';
	import { GRID_COLUMNS, snapToAllowedShape } from '$lib/nodeShape.js';
	import { computeCenteredLayout, fitCellSize, layoutRowsFor } from '$lib/fieldLayout.js';
	import { reducedMotion } from '$lib/motion.svelte.js';
	// Static CSS import so the stylesheet is in the build's CSS bundle and
	// present on first paint; only the JS is deferred. Without this the
	// prerendered grid would flash unstyled before hydration.
	import 'gridstack/dist/gridstack.css';

	let gridEl = $state(/** @type {HTMLElement | undefined} */ (undefined));
	let viewportEl = $state(/** @type {HTMLElement | undefined} */ (undefined));
	let ready = $state(false);
	let cellSize = $state({ w: 0, h: 0 });
	let columnCount = $state(0);
	// True while the stored layout is being re-applied to the engine, so the
	// change events that causes are not persisted back as if they were edits.
	let restoring = false;
	/** @type {import('gridstack').GridStack | null} */
	let grid = null;

	// A plain array, not a reactive collection: this is bookkeeping for an
	// imperative library, nothing renders from it, and making it reactive
	// would only invite an effect to depend on it by accident.
	/** @type {string[]} Ids gridstack already knows about. */
	let known = [];

	/** Reads the real cell pitch so the edit-mode dot grid lines up with it. */
	function measureCells() {
		if (!grid) return;
		cellSize = { w: grid.cellWidth(), h: grid.getCellHeight(true) };
		columnCount = grid.getColumn();
	}

	/**
	 * The grid cell under a point on screen, so a node added from the
	 * right-click menu can land where the pointer was.
	 *
	 * Exported rather than done by the caller because the pitch is this
	 * component's own business: the page holding the menu knows the click
	 * position and nothing about columns or cell height, and teaching it
	 * would mean two places deriving the same geometry.
	 *
	 * `getBoundingClientRect` is viewport-relative and so is a pointer event,
	 * so scroll needs no separate handling — a click far down a long field
	 * resolves to the row actually under it.
	 * @param {number} clientX
	 * @param {number} clientY
	 * @param {number} [width] Intended node width in cells, so the result can
	 *   be clamped to keep the whole node on the canvas rather than letting it
	 *   hang off the right edge and be shoved back by the engine.
	 * @returns {{ x: number, y: number } | undefined} undefined before the
	 *   grid exists, which the caller reads as "no opinion, use the default".
	 */
	export function cellFromPoint(clientX, clientY, width = 1) {
		if (!gridEl || !cellSize.w || !cellSize.h) return undefined;
		const rect = gridEl.getBoundingClientRect();
		const column = Math.floor((clientX - rect.left) / cellSize.w);
		const row = Math.floor((clientY - rect.top) / cellSize.h);
		const lastColumn = Math.max(0, columnCount - width);
		return {
			x: Math.max(0, Math.min(column, lastColumn)),
			y: Math.max(0, row)
		};
	}

	// ------------------------------------------------------- fit to view ---
	//
	// The default behavior is the column ladder above: fewer columns on a
	// smaller screen, so nodes keep their authored *cell* size and get
	// repacked into new rows. That keeps cards readable and is the right
	// default, but it deliberately changes where things sit relative to each
	// other, so a composition someone arranged does not survive a resize.
	//
	// Fit mode answers the other want: keep the arrangement exactly, and shrink
	// it to fit. The whole implementation is "change the cell pitch", because
	// the layout is stored in *cells* and gridstack derives every pixel from
	// that one number. Nothing writes x/y/w/h, so the arrangement is not merely
	// restored on the way back out, it was never touched. That is also why this
	// is not a CSS transform: a scaled ancestor would leave gridstack's drag
	// math reading raw pointer coordinates that no longer match what is on
	// screen, and dragging would land a node somewhere other than where it was
	// dropped. Scaling the cell keeps every pixel gridstack computes honest, so
	// arranging and fitting can both be on at once.

	/**
	 * The gap gridstack leaves around each item, in pixels.
	 *
	 * Shared with this component's CSS through a custom property rather than
	 * written down twice, because the resize grips depend on it: gridstack
	 * positions them against the grid *item*, while the card they are meant
	 * to sit on is inset this far inside it. A grip inset that ignored the
	 * margin sits outside the card by exactly this much.
	 */
	const GRID_MARGIN_PX = 8;

	let viewportSize = $state({ w: 0, h: 0 });

	const layoutRows = $derived(layoutRowsFor(nodes));

	const fitCellPx = $derived.by(() =>
		fitToView ? fitCellSize({ width: viewportSize.w, height: viewportSize.h }, layoutRows) : 0
	);

	onMount(() => {
		let disposed = false;
		/** @type {ResizeObserver | undefined} */
		let observer;

		/**
		 * Reads gridstack's own settled state, sorted into reading order.
		 *
		 * Used below the authored column count, where a completed drag is
		 * read as a reorder rather than a placement (see the `change`
		 * handler). By the time `change` fires, gridstack's own collision
		 * handling has already resolved the drop into a definite (y, x)
		 * arrangement, so sorting by that is the visitor's intended new
		 * sequence, not a guess at it.
		 * @returns {string[] | null}
		 */
		function deriveOrderFromDom() {
			if (!gridEl) return null;
			const items = [...gridEl.querySelectorAll('.grid-stack-item')]
				.map((el) => {
					const id = el.getAttribute('gs-id');
					const node = /** @type {import('gridstack').GridItemHTMLElement} */ (el).gridstackNode;
					return typeof id === 'string' ? { id, x: node?.x ?? 0, y: node?.y ?? 0 } : null;
				})
				.filter((item) => item !== null);
			items.sort((a, b) => a.y - b.y || a.x - b.x);
			return items.map((item) => item.id);
		}

		(async () => {
			const { GridStack } = await import('gridstack');
			if (disposed || !gridEl) return;

			const instance = GridStack.init(
				{
					column: GRID_COLUMNS,
					// Square cells, so a node that is 16 wide and 9 tall really is
					// 16:9. The per-type shape rules are meaningless otherwise.
					cellHeight: 'auto',
					cellHeightThrottle: 100,
					margin: GRID_MARGIN_PX,
					float: false,
					disableDrag: true,
					disableResize: true,
					// Handles on every edge except the top, which is where the
					// node's own configuration bar sits while editing. Default is
					// 'se' alone, which was both hard to find and directly under
					// that bar, so resizing appeared not to work at all.
					resizable: { handles: 'e, se, s, sw, w' },
					alwaysShowResizeHandle: true,
					// The whole card is the drag surface. `cancel` keeps a press
					// on an actual control from starting a drag instead; the
					// default list omits anchors, so Visit is added explicitly.
					draggable: { cancel: 'button, a, select, input, textarea, option' },
					placeholderClass: 'field-drop-target',
					columnOpts: {
						// Without columnMax the grid silently runs at 12 columns no
						// matter what `column` says, because it defaults to 12 and
						// caps it. That capped every 16-wide node to 12, which made
						// 16:9 literally unreachable and made resizing look broken
						// rather than constrained. v13 positions items from a
						// --gs-column-width custom property, so an arbitrary column
						// count needs no extra stylesheet.
						columnMax: GRID_COLUMNS,
						breakpointForWindow: true,
						// Fewer columns on smaller screens, so a node keeps its
						// authored cell width and therefore occupies a *larger*
						// share of a smaller viewport. At a fixed 24 columns an
						// 8-cell node was 32% of the width at every size, which
						// reads fine at 1600px (516px) and far too small at 700px
						// (216px).
						//
						// Down to 4 at the narrowest phone widths, never all the way
						// to 1. gridstack's own one-column mode is not usable: a
						// column change only rescales x and w, never h, and
						// `cellHeight: 'auto'` derives a square cell from the column
						// width, so at one column a cell becomes the full container
						// width and a node 9 cells tall rendered over 5000px high on
						// a phone. 4 columns keeps cells a small, sane size at every
						// width instead (MIN_W in nodeShape.js is 4, so every node
						// still clamps to exactly one full-width column there, the
						// same visual result a dedicated single-column mode would
						// have given, without that explosion).
						//
						// `layout: 'none'` is what makes the sizing part of this
						// work: gridstack's default rescales w with the column
						// count, which preserves the proportion and so changes
						// nothing at all here.
						layout: 'none',
						// Stepped finely rather than in two jumps, so a node stays
						// roughly 330-520px across the whole range instead of
						// lurching between breakpoints.
						breakpoints: [
							{ w: 400, c: 4 },
							{ w: 640, c: 8 },
							{ w: 800, c: 12 },
							{ w: 1000, c: 15 },
							{ w: 1200, c: 18 },
							{ w: 1400, c: 21 }
						]
					}
				},
				gridEl
			);
			if (!instance) return;

			known = nodes.map((node) => node.id);

			// Shape is snapped here, on the way to the store, rather than in a
			// `resizestop` handler that adjusts the engine directly.
			//
			// That was the original approach and it fought itself: `change`
			// still reported the raw dragged size, the store recorded that
			// unsnapped value, and the store-to-engine sync effect below then
			// pushed it straight back onto the engine, undoing the snap. The
			// visible symptom was resizing that appeared to do nothing at all.
			// Snapping before the store sees it makes the store authoritative,
			// and the sync effect then corrects the engine rather than fighting.
			instance.on('change', (_event, items) => {
				// gridstack can emit into a listener after the instance it
				// belongs to has been destroyed (crossing a breakpoint tears
				// one down while its own change is still unwinding), and any
				// call back into it then throws. `grid` is nulled first on
				// teardown, so this identity check is what marks it stale.
				if (grid !== instance) return;
				if (restoring) return;
				if (!items?.length) return;

				if (instance.getColumn() !== GRID_COLUMNS) {
					// Below the authored width, x/y is never trustworthy geometry
					// (a 16-wide node is clamped to fit as few as 4 columns; see
					// computeCenteredLayout), so persisting it the way the branch
					// below does silently rewrote the saved layout on nothing more
					// than a window resize. A move here is read as a reorder
					// instead: this is also what makes touch dragging work as
					// reordering on a phone, rather than drag being disabled
					// there entirely with only Move-up/down buttons standing in
					// for it. The centered-layout effect further down regenerates
					// clean, centered coordinates from the new order on the next
					// tick, which is what makes the dropped position a suggestion
					// rather than something committed pixel for pixel.
					const order = deriveOrderFromDom();
					if (order) onReorder?.(order);
					return;
				}

				// Only the authored column count round-trips losslessly. At a
				// reduced count a node wider than the grid is clamped to fit
				// (a 16-wide node becomes 12 at 12 columns), and persisting
				// that silently rewrote the saved layout: resizing a window
				// down and back up permanently shrank every wide node. The
				// narrow view is a rendering of the layout, not an edit of it.
				const changed = items
					.filter((item) => typeof item.id === 'string')
					.map((item) => {
						const id = /** @type {string} */ (item.id);
						const node = nodes.find((n) => n.id === id);
						const rawW = item.w ?? 1;
						const rawH = item.h ?? 1;
						const snapped = node ? snapToAllowedShape(node.type, rawW, rawH) : { w: rawW, h: rawH };
						return { id, x: item.x ?? 0, y: item.y ?? 0, w: snapped.w, h: snapped.h };
					});
				if (changed.length) onGeometryChange?.(changed);
			});

			grid = instance;
			measureCells();

			observer?.disconnect();
			observer = new ResizeObserver(() => measureCells());
			observer.observe(gridEl);
			instance.on('change', () => {
				if (grid !== instance) return;
				measureCells();
			});

			ready = true;
		})();

		return () => {
			disposed = true;
			observer?.disconnect();
			grid?.destroy(false);
			grid = null;
		};
	});

	// Adopt nodes Svelte rendered after init, and forget removed ones.
	$effect(() => {
		const ids = nodes.map((n) => n.id);
		if (!grid || !ready) return;

		tick().then(() => {
			if (!grid || !gridEl) return;
			for (const id of ids) {
				if (known.includes(id)) continue;
				const el = gridEl.querySelector(`.grid-stack-item[gs-id="${CSS.escape(id)}"]`);
				if (el) {
					grid.makeWidget(/** @type {HTMLElement} */ (el));
					known.push(id);
				}
			}
			known = known.filter((id) => ids.includes(id));
		});
	});

	// Push store-side geometry changes into gridstack's engine.
	//
	// Necessary because after init, gridstack stops reading the `gs-*`
	// attributes Svelte renders: it keeps position in its own engine and
	// applies inline styles from there. So a size change that originates in
	// the store rather than from a drag (changing a node's type re-snaps it
	// to that type's allowed shape) would update the attribute and change
	// nothing visible. Compared before writing, so the drag path (which
	// already agrees with the engine) is a no-op rather than a feedback loop.
	$effect(() => {
		const snapshot = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h }));
		// Depends on the column count as well as the store. A trip down to a
		// reduced count leaves gridstack's engine holding a reflowed layout:
		// wide nodes clamped, and everything repacked into the narrower grid.
		// The store never changed, so without the column dependency this had
		// no reason to re-run and the field stayed visibly wrong for the rest
		// of the session even though a reload was correct.
		const columns = columnCount;
		if (!grid || !ready || columns !== GRID_COLUMNS) return;

		untrack(() => {
			if (!grid || !gridEl) return;

			// Position as well as size. Restoring only w and h left every node
			// sitting wherever the narrow reflow had repacked it, which is the
			// more obvious half of the damage: a node authored at 8,0 came back
			// at 0,8.
			const pending = [];
			for (const wanted of snapshot) {
				const el = /** @type {import('gridstack').GridItemHTMLElement | null} */ (
					gridEl.querySelector(`.grid-stack-item[gs-id="${CSS.escape(wanted.id)}"]`) ?? null
				);
				const current = el?.gridstackNode;
				if (!el || !current) continue;
				if (
					current.x !== wanted.x ||
					current.y !== wanted.y ||
					current.w !== wanted.w ||
					current.h !== wanted.h
				) {
					pending.push({ el, wanted });
				}
			}
			if (!pending.length) return;

			// Batched and flagged: applied one at a time each update would
			// reflow against the others and land somewhere else again, and
			// every one of those intermediate states would be persisted as if
			// the visitor had made it.
			restoring = true;
			grid.batchUpdate();
			for (const { el, wanted } of pending) {
				grid.update(el, { x: wanted.x, y: wanted.y, w: wanted.w, h: wanted.h });
				// Cleared here rather than left over from a prior reduced-column
				// visit: at the authored width every row spans exactly the full
				// column count, so there is never a leftover half-cell to correct
				// for and a stale nudge would otherwise just shift the node.
				el.style.transform = '';
			}
			grid.batchUpdate(false);
			restoring = false;
		});
	});

	// The complement of the effect above: at any column count other than the
	// authored one, gridstack's own reflow is discarded in favor of the
	// deterministic, centered layout from computeCenteredLayout(). See that
	// function for why its output is not trustworthy here.
	$effect(() => {
		const columns = columnCount;
		const nodeList = nodes;
		// cellWidth is read here, not inside untrack, so a plain window resize
		// that changes the pixel size of a cell without crossing a column-count
		// breakpoint still recomputes the sub-cell nudge below. Cell geometry
		// itself (gs-x/w) does not need to change for that; only the pixel
		// value of half a cell does.
		const cellWidth = cellSize.w;
		if (!grid || !ready || columns === 0 || columns === GRID_COLUMNS) return;

		const wantedLayout = computeCenteredLayout(nodeList, columns);

		untrack(() => {
			if (!grid || !gridEl) return;

			const pending = [];
			for (const wanted of wantedLayout) {
				const el = /** @type {import('gridstack').GridItemHTMLElement | null} */ (
					gridEl.querySelector(`.grid-stack-item[gs-id="${CSS.escape(wanted.id)}"]`) ?? null
				);
				const current = el?.gridstackNode;
				if (!el || !current) continue;
				if (
					current.x !== wanted.x ||
					current.y !== wanted.y ||
					current.w !== wanted.w ||
					current.h !== wanted.h
				) {
					pending.push({ el, wanted });
				}
				// The half-cell visual correction, applied to every item in this
				// layout regardless of whether its grid coordinates just changed:
				// a resize that only changes cellWidth still needs its pixel
				// value updated even when x/y/w/h are already correct.
				el.style.transform = wanted.nudge ? `translateX(${wanted.nudge * cellWidth}px)` : '';
			}
			if (!pending.length) return;

			// Batched and flagged for the same reason as the effect above: an
			// unbatched pass would have each update reflow against the
			// others, and the `change` guard elsewhere already refuses to
			// persist a reduced-column state, but restoring still keeps the
			// intermediate positions out of onGeometryChange entirely.
			restoring = true;
			grid.batchUpdate();
			for (const { el, wanted } of pending) {
				grid.update(el, { x: wanted.x, y: wanted.y, w: wanted.w, h: wanted.h });
			}
			grid.batchUpdate(false);
			restoring = false;
		});
	});

	// Edit mode gates interaction. Move is offered at every column count now:
	// a drop below the authored width is read as a reorder rather than a
	// placement (see the `change` handler), which is what makes it safe to
	// allow there at all, and is also what makes touch dragging work as
	// reordering on a phone instead of needing a separate mechanism. Resize
	// stays gated to the authored count specifically, since "resize" has no
	// coherent meaning at a width where the layout is about to be recomputed
	// out from under it anyway.
	//
	// `editMode` and `columnCount` are read here, before the guard, on
	// purpose: an effect's dependencies for its *next* run come from what it
	// read on its *last* run, and `grid`/`ready` start false, so the guard
	// used to return before either was ever read. The very first run past
	// that guard then only depended on whichever of `grid`/`ready` had most
	// recently changed, not on `editMode` at all, so toggling arrange mode
	// afterward never re-ran this effect and drag silently stayed disabled.
	// Reading them unconditionally, matching every other effect below,
	// keeps them tracked regardless of which run first clears the guard.
	$effect(() => {
		const wantMove = editMode;
		const wantResize = editMode && columnCount === GRID_COLUMNS;
		if (!grid || !ready) return;
		grid.enableMove(wantMove);
		grid.enableResize(wantResize);
	});

	// One ripple through the dot grid's columns the moment arrange mode
	// switches on, and one burst the moment it switches back off — reading
	// the grid's dots as visibly acknowledging each transition rather than
	// static chrome silently appearing and disappearing. Both are one-shot,
	// driven off the two edges of `editMode` (the guard below fires on
	// either edge, unlike the entrance-only version this replaced).
	let waving = $state(false);
	let exiting = $state(false);
	let wasEditMode = false;
	/** Column indices to render one `.dot-wave-col` per column, keyed on the index itself. */
	const waveColumns = $derived(Array.from({ length: columnCount }, (_, i) => i));
	$effect(() => {
		if (editMode === wasEditMode) return;
		wasEditMode = editMode;
		if (reducedMotion.current) return;

		if (editMode) {
			waving = true;
			// Matches .dot-wave-col's own 700ms animation-duration below, plus
			// the last column's stagger delay (22ms/column, matching its own
			// animation-delay below); untrack so a mid-wave resize (columnCount
			// changing) cannot itself re-trigger this effect.
			const totalMs = 700 + untrack(() => columnCount) * 22;
			const timer = setTimeout(() => {
				waving = false;
			}, totalMs);
			return () => clearTimeout(timer);
		}

		// The exit burst: .arrange-canvas is kept mounted (see the template's
		// `editMode || exiting`) for exactly this long after Done arranging is
		// pressed, so the dots have somewhere to still be while they animate
		// away instead of vanishing the instant the class comes off. Distance
		// from the middle column, not index, drives each column's own delay
		// here (see --exp-d in the template) — a burst radiates outward from
		// its center, it does not sweep from one edge like the entrance does.
		exiting = true;
		const totalCols = untrack(() => columnCount);
		const maxDistFromCenter = Math.ceil(totalCols / 2);
		// Matches .dot-wave-col.exploding's own 550ms duration, plus the
		// farthest column's stagger delay (18ms per step of distance).
		const totalMs = 550 + maxDistFromCenter * 18;
		const timer = setTimeout(() => {
			exiting = false;
		}, totalMs);
		return () => clearTimeout(timer);
	});

	// Measures the room a fitted layout has to work with.
	//
	// Width comes from the wrapper, which is always full-bleed and so cannot
	// be affected by what we do to the grid inside it. Height comes from the
	// window, deliberately NOT from the wrapper: the wrapper's height is set
	// by its own content, so measuring it would feed the cell size back into
	// the thing that determines the cell size, and the field would either
	// oscillate or settle on an arbitrary size.
	$effect(() => {
		const el = viewportEl;
		if (!el) return;

		const measure = () => {
			viewportSize = { w: el.clientWidth, h: window.innerHeight };
		};
		measure();

		const observer = new ResizeObserver(measure);
		observer.observe(el);
		window.addEventListener('resize', measure);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', measure);
		};
	});

	/** @type {import('gridstack').GridStackOptions['columnOpts']} */
	let savedColumnOpts;
	let columnOptsSaved = false;

	// Applies and unwinds fit mode. Reads both inputs before the guard, for
	// the dependency-tracking reason documented on the interaction effect
	// above: this effect must re-run when fit is toggled long after `grid` and
	// `ready` first became true.
	$effect(() => {
		const active = fitToView;
		const cellPx = fitCellPx;
		if (!grid || !ready) return;

		untrack(() => {
			if (!grid) return;

			if (active) {
				// Disable the ladder outright rather than just forcing the count.
				// gridstack re-derives its column from `columnOpts` on every
				// resize, so a bare `column(24)` would be silently undone the
				// next time the window moved. An absent `columnOpts` is the first
				// thing its own checkDynamicColumn() bails on, which makes this
				// the supported way to say "not right now" rather than a hack.
				if (!columnOptsSaved) {
					savedColumnOpts = grid.opts.columnOpts;
					columnOptsSaved = true;
				}
				grid.opts.columnOpts = undefined;
				if (grid.getColumn() !== GRID_COLUMNS) grid.column(GRID_COLUMNS, 'none');
				grid.cellHeight(cellPx);
			} else {
				if (columnOptsSaved) {
					grid.opts.columnOpts = savedColumnOpts;
					columnOptsSaved = false;
				}
				// Order matters on the way out. Restoring 'auto' is what flips
				// gridstack back into tracking its own size and re-attaches the
				// ResizeObserver it disconnected when we pinned a pixel height;
				// clearing the width override then changes the element's width,
				// which is the event that makes it re-evaluate the breakpoints
				// and restore the responsive column count on its own.
				grid.cellHeight('auto');
			}
			measureCells();
		});
	});

	/**
	 * Keyboard equivalents for drag and resize. gridstack provides none, and
	 * the field is fully keyboard navigable today, so pointer-only placement
	 * would be a real regression. Routed through `grid.update()` for the
	 * reason in the header comment.
	 * @param {KeyboardEvent} event
	 * @param {import('../lib/layoutStore.svelte.js').FieldNodeConfig} node
	 */
	function handleKeydown(event, node) {
		if (!editMode || !grid) return;
		const deltas = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1]
		};
		const delta = deltas[/** @type {keyof typeof deltas} */ (event.key)];
		if (!delta) return;

		const el = /** @type {import('gridstack').GridItemHTMLElement} */ (event.currentTarget);
		event.preventDefault();

		if (event.shiftKey) {
			// Resize only at the authored count, matching the pointer/touch
			// gating above: there is no reduced-column meaning for "make this
			// one wider" when the whole layout is about to be recomputed.
			if (columnCount !== GRID_COLUMNS) return;
			// Step by a whole cell then snap, so each press lands on the next
			// permitted size rather than nudging toward one that never arrives.
			const step = 2;
			const snapped = snapToAllowedShape(
				node.type,
				node.w + delta[0] * step,
				node.h + delta[1] * step
			);
			grid.update(el, snapped);
			return;
		}

		// Read the engine's current position rather than the store's, so this
		// still moves the node exactly one step from wherever it actually is:
		// below the authored column count that can differ from `node.x/y`,
		// which describe the authored-width arrangement, not the recomputed
		// one currently on screen.
		const current = el.gridstackNode;
		const baseX = current?.x ?? node.x;
		const baseY = current?.y ?? node.y;
		grid.update(el, {
			x: Math.max(0, baseX + delta[0]),
			y: Math.max(0, baseY + delta[1])
		});
	}
</script>

<div
	class="grid-viewport"
	class:fitting={fitToView}
	bind:this={viewportEl}
	style:--cell-w={`${cellSize.w}px`}
	style:--cell-h={`${cellSize.h}px`}
>
	{#if editMode || exiting}
		<!-- Purely decorative, sized and positioned independently of
		     .grid-stack below (see .arrange-canvas's own comment): the actual
		     grid never resizes to draw this, so entering arrange mode cannot
		     itself pop the real container taller. First in DOM order, same as
		     the wave overlay nested inside it used to be, so plain paint order
		     already puts it behind every card without a z-index.

		     Stays mounted through `exiting` (editMode is already false by
		     then) so the exit burst below has a canvas to still be on while
		     it animates away, instead of the whole thing vanishing the
		     instant Done arranging is pressed. -->
		<div class="arrange-canvas" class:waving class:exiting aria-hidden="true">
			{#if waving || exiting}
				<div class="dot-wave" aria-hidden="true">
					{#each waveColumns as i (i)}
						<!-- --i positions the column (always left-to-right, matching
						     the real grid underneath).
						     --d: entrance-only, a reversed index driving *when* a
						     column ripples in, so that sweeps right-to-left while
						     columns still sit where they actually belong.
						     --exp-d/--exp-x: exit-only. --exp-d is distance from the
						     middle column (unsigned), so the burst radiates outward
						     from the center rather than sweeping from an edge.
						     --exp-x is signed distance from center, driving *which
						     way* each column flies outward (left of center goes
						     further left, right goes further right). -->
						<span
							class="dot-wave-col"
							class:exploding={exiting}
							style:--i={i}
							style:--d={columnCount - 1 - i}
							style:--exp-d={Math.abs(i - (columnCount - 1) / 2)}
							style:--exp-x={i - (columnCount - 1) / 2}
						></span>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
	<div
		class="grid-stack"
		style="--grid-margin: {GRID_MARGIN_PX}px"
		class:gs-ready={ready}
		class:edit-mode={editMode}
		bind:this={gridEl}
		style:width={fitToView && fitCellPx ? `${GRID_COLUMNS * fitCellPx}px` : null}
	>
		{#each nodes as node (node.id)}
			<!--
			The gs-* attributes are gridstack's own DOM contract, which it reads
			on init() and keeps updated thereafter; svelte-check does not know
			them, hence the spread. `role="application"` is deliberate rather
			than incidental: in edit mode this really is a direct-manipulation
			widget that claims the arrow keys, which is exactly what that role
			warns assistive tech about. Outside edit mode it carries no role or
			tab stop at all, so the resting field stays plain content.
		-->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="grid-stack-item"
				{...{
					'gs-id': node.id,
					'gs-x': node.x,
					'gs-y': node.y,
					'gs-w': node.w,
					'gs-h': node.h
				}}
				role={editMode ? 'application' : undefined}
				tabindex={editMode ? 0 : undefined}
				aria-label={editMode
					? `${node.type} node, ${node.w} by ${node.h}. Arrow keys to move, shift and arrow keys to resize.`
					: undefined}
				onkeydown={(event) => handleKeydown(event, node)}
			>
				<div class="grid-stack-item-content">
					{@render children(node)}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.grid-viewport {
		position: relative;
		width: 100%;
	}

	/* Only while fitting. The grid inside is given an explicit pixel width
	   (24 cells at the fitted pitch) and centres itself in here. The scroll is
	   the escape hatch for when the cell pitch has already clamped at its
	   minimum: past that point the honest thing is to let the arrangement be
	   larger than the screen rather than keep shrinking cards nobody could
	   read. */
	.grid-viewport.fitting {
		overflow-x: auto;
	}

	.grid-viewport.fitting .grid-stack {
		margin-inline: auto;
	}

	.grid-stack {
		width: 100%;
		min-height: 20rem;
	}

	/* Covers only the moment before gridstack has initialized (prerendered
	   HTML, or a slow chunk): gridstack now runs at every width (down to 4
	   columns on the narrowest phones), so this is no longer a permanent
	   narrow-viewport layout, just a brief fallback so items are not all
	   stacked at the same absolute position for that moment. */
	.grid-stack:not(.gs-ready) {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
		height: auto !important;
	}

	@media (max-width: 40rem) {
		.grid-stack:not(.gs-ready) {
			grid-template-columns: 1fr;
		}
	}

	.grid-stack:not(.gs-ready) :global(.grid-stack-item) {
		position: relative;
		width: auto;
		height: auto;
		min-height: 0;
		inset: auto;
		transform: none;
	}

	/* gridstack's own stylesheet positions the item's content box absolutely,
	   which contributes no height to its parent. Left alone here, every card
	   would collapse to a sliver during this fallback. Returning it to normal
	   flow lets the card's aspect-ratio set the height from the available
	   width instead. */
	.grid-stack:not(.gs-ready) :global(.grid-stack-item-content) {
		position: relative;
		inset: auto;
		height: auto;
	}

	/* Gridstack's own selector is more specific and applies hidden/auto
	   overflow to this box. Force browse cards to paint their 1% hover scale
	   beyond the cell instead of shaving the expanded edges. The node itself
	   still owns overflow:hidden, preserving its rounded internal clipping. */
	.grid-stack-item-content {
		inset: 0;
		overflow: visible !important;
	}

	/* Inside a live grid the cell already encodes the node's shape, so the
	   card fills it rather than re-deriving that shape from `aspect-ratio`.
	   Both were applied at once before, and they disagree: a node spanning
	   w by h cells is `w*cell + (w-1)*gap` wide but only `h*cell + (h-1)*gap`
	   tall, which is not the w/h the ratio asks for. The card therefore came
	   up fractionally short of its own cell, by an error that grows with the
	   span — which is what made the resize grips look correctly placed on a
	   small node and visibly off one on a large one. FieldNode keeps the
	   ratio for the pre-hydration flow layout and for Lists, neither of which
	   has a cell to fill. */
	.grid-stack.gs-ready :global(.node),
	.grid-stack.gs-ready :global(.empty-node) {
		aspect-ratio: auto;
		width: 100%;
	}

	/* A scaled card must also paint above its neighbours rather than being
	   partially covered by whichever grid item happens to follow it. */
	.grid-stack:not(.edit-mode)
		:global(
			.grid-stack-item:has(.node.has-primary-action:hover, .node.has-primary-action:focus-within)
		) {
		z-index: 2;
	}

	/* Extra bottom padding gives visible empty grid to drag into — real
	   layout space on the actual grid, not decorative, which is why it stays
	   here rather than moving to .arrange-canvas below with everything else
	   about the dots. */
	.grid-stack.edit-mode {
		padding-bottom: calc(var(--cell-h, 2rem) * 4);
	}

	/* The snap targets, shown only while arranging. Sized from gridstack's
	   own measured cell pitch rather than a percentage of the container: the
	   vertical pitch is a row height, not a fraction of the container's
	   height, so a percentage put the dots on a grid that did not exist.
	   A sibling of .grid-stack, not part of it, and positioned with an
	   explicit height rather than `inset: 0` — deliberately: an earlier
	   version put this same background directly on `.grid-stack.edit-mode`
	   with `min-height` reaching down to the viewport edge, which made the
	   real grid container itself pop instantly taller the moment arrange
	   mode turned on (gridstack's actual draggable box growing, not just a
	   decorative canvas). Decoupled here: `.grid-viewport` (the positioning
	   parent) never changes size, this layer is free to be visually taller
	   than it without dragging the real grid's own layout along, and
	   `overflow: hidden` keeps it from ever painting past the space it was
	   actually given. `5.5rem`/`1.65rem` match `+layout.svelte`'s own
	   `.page-transition` padding, the space reserved above/below `main` for
	   the floating brand/menu pills — the same pair `/join`'s fixed-height
	   screen already subtracts for the same reason (see that page's own
	   `.join-page` comment), reused here rather than re-deriving a second
	   constant for the same offset. */
	/* Spans the whole arrangement, not one screenful of it.
	   This was a fixed `100dvh` box, which is right only while the field
	   happens to fit on screen: as soon as nodes ran past the fold the dots
	   stopped at the viewport edge and everything below sat on bare page, so
	   the canvas looked cut off exactly when there was most to arrange.
	   Stretching to the container instead keeps the dots under every node.

	   `bottom: 0` is safe against the note on the element itself about not
	   letting this pop the real container taller: it is absolutely
	   positioned, so it takes its height from the grid rather than
	   contributing any. The min-height keeps a short field from collapsing
	   the canvas to nothing. */
	.arrange-canvas {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		min-height: calc(100dvh - 5.5rem - 1.65rem);
		overflow: hidden;
		border-radius: var(--radius-md);
		pointer-events: none;
		background-image: radial-gradient(
			circle at 1px 1px,
			color-mix(in oklch, var(--text-muted) 55%, transparent) 1.5px,
			transparent 0
		);
		background-size: var(--cell-w, 2rem) var(--cell-h, 2rem);
		background-position: 4px 4px;
	}

	/* Hidden for the animation's own length: left in place, the resting
	   background sat visibly still directly underneath the rippling overlay
	   columns, so the "wave" read as a copy drawn on top of the real grid
	   rather than the grid itself moving. Suppressing the real one while
	   `waving` and letting the overlay (which uses this exact same pattern,
	   see `.dot-wave-col` below) stand in for it until it clears reads as
	   one grid actually rippling instead of two overlapping ones. */
	.arrange-canvas.waving,
	.arrange-canvas.exiting {
		background-image: none;
	}

	/* One ripple across the resting dot grid above, played once when arrange
	   mode switches on (see the `waving` effect). Each column repeats the
	   exact same dot pattern as `.arrange-canvas`'s own background, just
	   clipped to one cell's width, so the overlay is visually identical to
	   the grid at rest until it animates. */
	.dot-wave {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.dot-wave-col {
		position: absolute;
		top: 0;
		bottom: 0;
		left: calc(var(--cell-w, 2rem) * var(--i));
		width: var(--cell-w, 2rem);
		background-image: radial-gradient(
			circle at 1px 1px,
			color-mix(in oklch, var(--text-muted) 55%, transparent) 1.5px,
			transparent 0
		);
		background-size: var(--cell-w, 2rem) var(--cell-h, 2rem);
		background-position: 4px 4px;
		/* `both`, not the default `none`: without it, a column sits fully
		   opaque at its plain (unanimated) style for the whole span before
		   its own delay elapses — the entire grid would still pop in at once
		   the instant arrange mode turns on, just with a bump animating over
		   it later, rather than each column only fading into view as the
		   ripple actually reaches it. `both` applies the 0% keyframe (which
		   is invisible) for the whole delay, then holds the 100% keyframe
		   once done, instead of springing back to the plain, non-keyframed
		   style either side of the animation.
		   `ease-out`, not `ease-in-out`: applies to both segments this
		   keyframe set has (0%→55% and 55%→100% independently, which is how
		   a browser distributes one timing function across intermediate
		   keyframes), so the settle back to rest at 100% actually decelerates
		   into place instead of arriving at full speed and stopping dead. */
		animation: dot-wave 700ms ease-out both;
		/* Matches the `waving` effect's own totalMs calc in the script above.
		   --d (not --i): a separate, reversed index so the ripple direction
		   can differ from the columns' own left-to-right physical order. */
		animation-delay: calc(var(--d) * 22ms);
	}

	/* translateY only, no scaleY: this column spans .arrange-canvas's full
	   viewport-derived height (see that element's own comment), and scaling
	   a tall element forces the browser to resample its repeating
	   radial-gradient background every frame rather than just translating
	   already-rendered pixels. That resampling is what read as jitter, worse
	   the farther a dot sat from the transform-origin doing the scaling
	   (i.e. worst near the top) — confirmed by removing the scale outright
	   and watching it disappear. A plain translate moves the whole rendered
	   background as one rigid, GPU-composited unit with nothing to
	   resample, so it stays smooth regardless of how tall the strip is. */
	@keyframes dot-wave {
		0% {
			opacity: 0;
			transform: translateY(0.6rem);
		}
		55% {
			opacity: 1;
			transform: translateY(-0.5rem);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* The exit burst (see the `exiting` effect in the script). Overrides
	   .dot-wave-col's own entrance `animation`/`animation-delay` outright
	   (higher specificity, same property names) rather than needing a
	   separate element — the same column strips just play a different
	   keyframe outward instead of in. --exp-x carries both direction and
	   magnitude (signed distance from the middle column), so the whole grid
	   reads as scattering apart from its own center rather than every column
	   flying the same way. */
	.dot-wave-col.exploding {
		animation: dot-explode 550ms ease-in both;
		animation-delay: calc(var(--exp-d) * 18ms);
	}

	@keyframes dot-explode {
		0% {
			opacity: 1;
			transform: translateX(0) scaleY(1);
		}
		100% {
			opacity: 0;
			transform: translateX(calc(var(--exp-x) * 2.75rem)) scaleY(0.4);
		}
	}

	.grid-stack.edit-mode :global(.grid-stack-item) {
		cursor: grab;
	}

	.grid-stack.edit-mode :global(.grid-stack-item:active) {
		cursor: grabbing;
	}

	.grid-stack.edit-mode :global(.grid-stack-item:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
		border-radius: var(--radius-lg);
	}

	/* Where the node will land. gridstack's default is a faint fill that
	   effectively vanishes on a dark background, so this is an explicit
	   accent-tinted, dashed target that reads in both themes. */
	.grid-stack :global(.field-drop-target > .placeholder-content),
	.grid-stack :global(.field-drop-target) {
		background: color-mix(in oklch, var(--accent) 22%, transparent);
		border: 2px dashed var(--accent);
		border-radius: var(--radius-lg);
	}

	/* Resize grips. gridstack ships them nearly invisible and auto-hidden,
	   which made resizing undiscoverable; these are always visible while
	   arranging and sized to be a real pointer target.

	   Bars hugging their own edge rather than dots floating beside it. As
	   equal circles sitting half outside the card, a grip was the same shape
	   whichever edge it belonged to and sat nearly as close to the
	   neighbouring node as to its own — with nodes packed together that made
	   it genuinely ambiguous which card a grip would resize. An edge grip is
	   now a short bar lying along the edge it controls, so it reads as part
	   of that edge, and every grip is pulled in tight against the card so the
	   nearest thing to it is always the node it belongs to. */
	.grid-stack.edit-mode {
		/* Every grip's distance in from the card's own edge, in one place.
		   Positive, so grips sit *on* the card rather than straddling its
		   border: hanging outside put a grip nearly as close to the
		   neighbouring node as to its own, and with the card now filling its
		   cell exactly, inside is unambiguous at any node size.

		   The margin term is not optional. Gridstack positions handles
		   against the grid item, but the card is inset by the grid's own
		   margin, so an inset measured from the item alone leaves the grip
		   floating outside the card by that much — which is what made the
		   old values look almost right and never quite land. */
		--handle-inset: calc(var(--grid-margin, 8px) + 0.3rem);
	}

	.grid-stack.edit-mode :global(.ui-resizable-handle) {
		background: var(--accent);
		border: 1px solid var(--bg-elevated);
		border-radius: var(--radius-sm);
		opacity: 0.9;
		z-index: 3;
	}

	/* Edge grips: a bar along the edge, short enough to leave the corners to
	   the corner grips and centred so it cannot be mistaken for one. */
	.grid-stack.edit-mode :global(.ui-resizable-e),
	.grid-stack.edit-mode :global(.ui-resizable-w) {
		width: 0.4rem;
		height: 1.9rem;
		top: 50%;
		margin-top: -0.95rem;
		cursor: ew-resize;
	}

	.grid-stack.edit-mode :global(.ui-resizable-e) {
		right: var(--handle-inset);
	}

	.grid-stack.edit-mode :global(.ui-resizable-w) {
		left: var(--handle-inset);
	}

	.grid-stack.edit-mode :global(.ui-resizable-s) {
		width: 1.9rem;
		height: 0.4rem;
		bottom: var(--handle-inset);
		left: 50%;
		margin-left: -0.95rem;
		cursor: ns-resize;
	}

	/* Corners are drawn as the corner itself: two strokes meeting at a
	   rounded right angle, echoing the card's own rounded edge. A dot said
	   only "handle"; an L says which corner, and in doing so says it pulls in
	   two directions at once where an edge bar pulls in one. Background and
	   border are cleared rather than overridden piecemeal, since the shared
	   rule above fills and rounds every grip. */
	.grid-stack.edit-mode :global(.ui-resizable-se),
	.grid-stack.edit-mode :global(.ui-resizable-sw) {
		/* Big enough that the straight runs dominate: at 0.85rem with a
		   0.42rem elbow the radius ate half of each side and the mark read as
		   an arc rather than a corner. */
		width: 1.05rem;
		height: 1.05rem;
		bottom: var(--handle-inset);
		background: none;
		border: 0;
		border-radius: 0;
		/* Legible over whatever artwork the card happens to be showing,
		   which the removed fill was previously doing on its own. */
		filter: drop-shadow(0 0 1px var(--bg-elevated))
			drop-shadow(0 0 2px color-mix(in oklch, var(--bg-elevated) 70%, transparent));
	}

	.grid-stack.edit-mode :global(.ui-resizable-se) {
		right: var(--handle-inset);
		border-right: 2px solid var(--accent);
		border-bottom: 2px solid var(--accent);
		border-bottom-right-radius: 0.28rem;
		cursor: nwse-resize;
	}

	.grid-stack.edit-mode :global(.ui-resizable-sw) {
		left: var(--handle-inset);
		border-left: 2px solid var(--accent);
		border-bottom: 2px solid var(--accent);
		border-bottom-left-radius: 0.28rem;
		cursor: nesw-resize;
	}
</style>
