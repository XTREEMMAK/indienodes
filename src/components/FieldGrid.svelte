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

	/** Below this a card stops being worth looking at; the field scrolls instead. */
	const MIN_CELL_PX = 14;
	/** Above this a four-node field on a large display reads as absurdly large. */
	const MAX_CELL_PX = 96;

	/** Vertical room the fitted layout gets, matching main's own padding. */
	const FIT_VIEWPORT_INSET = 112;

	let viewportSize = $state({ w: 0, h: 0 });

	/**
	 * How many rows deep the authored arrangement actually is. Derived from the
	 * store rather than measured from the DOM, so it is correct before anything
	 * has rendered and does not chase the sizes it is about to set.
	 */
	const layoutRows = $derived(
		nodes.reduce((deepest, node) => Math.max(deepest, node.y + node.h), 0) || 1
	);

	const fitCellPx = $derived.by(() => {
		if (!fitToView || viewportSize.w === 0) return 0;
		// Both constraints matter: width alone leaves a tall arrangement running
		// off the bottom, height alone leaves a wide one clipped at the side.
		const byWidth = viewportSize.w / GRID_COLUMNS;
		const byHeight = (viewportSize.h - FIT_VIEWPORT_INSET) / layoutRows;
		return Math.max(MIN_CELL_PX, Math.min(MAX_CELL_PX, Math.min(byWidth, byHeight)));
	});

	/**
	 * A deterministic, row-centered layout for a reduced column count.
	 *
	 * This replaces gridstack's own column-change reflow at every width that
	 * is not the authored one. That reflow proportionally rescales each
	 * node's x, then resolves whatever collisions that creates through its
	 * general-purpose move logic, and the two together produce inconsistent
	 * gaps: one row's content sits flush against the left edge, the next
	 * starts two columns in, the one after that ten columns in. There is no
	 * side those gaps consistently favor; the result just reads as
	 * unbalanced, which is what was reported. Resize is not offered at these
	 * widths (there is no arrangement to preserve by leaning on gridstack's
	 * own resize math), so a plain shelf-packer is what makes the outcome
	 * predictable enough to center. Move *is* offered here, but a drop is
	 * read as a reorder rather than a placement; see the `change` handler
	 * below for why that sidesteps the same problem.
	 *
	 * Width is clamped to the column count and height scaled with it, which
	 * keeps a node's aspect ratio intact rather than gridstack's own clamp,
	 * which kept height fixed and left a 16:9 node distorted toward 4:3 once
	 * its width alone was cut down to fit.
	 *
	 * `gs-x` is a grid coordinate and has to be a whole cell, so a row whose
	 * leftover space is an odd number of columns cannot be centered by
	 * integer offset alone: the two sides differ by one full cell, roughly
	 * 60px in this grid, which is small next to the bug this replaces but
	 * was still visibly off-center rather than truly centered. `nudge`
	 * carries that leftover half-cell (0 or 0.5) so the caller can correct
	 * for it with a CSS transform, which is not bound to whole cells the way
	 * gridstack's own positioning is.
	 * @param {import('../lib/layoutStore.svelte.js').FieldNodeConfig[]} nodeList
	 * @param {number} columns
	 * @returns {{ id: string, x: number, y: number, w: number, h: number, nudge: number }[]}
	 */
	function computeCenteredLayout(nodeList, columns) {
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
					margin: 8,
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

<div class="grid-viewport" class:fitting={fitToView} bind:this={viewportEl}>
	<div
		class="grid-stack"
		class:gs-ready={ready}
		class:edit-mode={editMode}
		bind:this={gridEl}
		style:--cell-w={`${cellSize.w}px`}
		style:--cell-h={`${cellSize.h}px`}
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

	.grid-stack-item-content {
		inset: 0;
		overflow: visible;
	}

	/* The snap targets, shown only while arranging. Sized from gridstack's
	   own measured cell pitch rather than a percentage of the container: the
	   vertical pitch is a row height, not a fraction of the container's
	   height, so a percentage put the dots on a grid that did not exist.
	   Extra bottom padding gives visible empty grid to drag into. */
	.grid-stack.edit-mode {
		background-image: radial-gradient(
			circle at 1px 1px,
			color-mix(in oklch, var(--text-muted) 55%, transparent) 1.5px,
			transparent 0
		);
		background-size: var(--cell-w, 2rem) var(--cell-h, 2rem);
		background-position: 4px 4px;
		border-radius: var(--radius-md);
		padding-bottom: calc(var(--cell-h, 2rem) * 4);
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
	   arranging and sized to be a real pointer target. */
	.grid-stack.edit-mode :global(.ui-resizable-handle) {
		background: var(--accent);
		border: 1px solid var(--bg-elevated);
		border-radius: 999px;
		opacity: 0.9;
		width: 0.85rem;
		height: 0.85rem;
		z-index: 3;
	}

	.grid-stack.edit-mode :global(.ui-resizable-e) {
		right: -0.4rem;
		top: 50%;
		margin-top: -0.425rem;
		cursor: ew-resize;
	}

	.grid-stack.edit-mode :global(.ui-resizable-w) {
		left: -0.4rem;
		top: 50%;
		margin-top: -0.425rem;
		cursor: ew-resize;
	}

	.grid-stack.edit-mode :global(.ui-resizable-s) {
		bottom: -0.4rem;
		left: 50%;
		margin-left: -0.425rem;
		cursor: ns-resize;
	}

	.grid-stack.edit-mode :global(.ui-resizable-se) {
		right: -0.4rem;
		bottom: -0.4rem;
		cursor: nwse-resize;
	}

	.grid-stack.edit-mode :global(.ui-resizable-sw) {
		left: -0.4rem;
		bottom: -0.4rem;
		cursor: nesw-resize;
	}
</style>
