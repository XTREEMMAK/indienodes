import { browser } from '$app/environment';
import { STORAGE_KEYS, safeReadJson, safeWriteJson } from './storageKeys.js';
import { ALLOWED_RATIOS, MIN_W, defaultSizeFor, snapToAllowedShape } from './nodeShape.js';

/**
 * The visitor's arranged field: which nodes exist, where they sit, how big
 * they are, and what type of entry each one pulls.
 *
 * Local-only, same as favorites and preferences. Mirrors their pattern
 * exactly (versioned key, browser guard, try/catch load, defensive parse),
 * because a corrupt or hand-edited layout should degrade to the default
 * arrangement rather than throwing on boot and leaving an empty page.
 *
 * A node is a *channel*, not a slot for a specific entry (docs/decisions.md):
 * it declares what kind of thing it shows, and entries flow through it. The
 * visitor can shape the pool but never pick the item. `tags` will narrow the
 * pool further in the semantic pass; only `type` exists today.
 */

const STORAGE_KEY = STORAGE_KEYS.layout.key;

/** @typedef {import('./nodeShape.js').NodeType} NodeType */
/** @typedef {{ id: string, type: NodeType, x: number, y: number, w: number, h: number }} FieldNodeConfig */

export { GRID_COLUMNS } from './nodeShape.js';

/**
 * Shipped arrangement, so a first-time visitor sees a composed field rather
 * than an empty canvas with an invitation to build one. Deliberately mixed:
 * square audio and game nodes beside a portrait comic and a portrait text
 * one, so the per-type shape rules are visible immediately rather than
 * being something you only discover by trying to resize.
 *
 * Small and masonry, not one big hero: an earlier version of this gave the
 * comic node a 16-wide hero shape, which read as "the biggest thing on the
 * page" rather than "one entry among several." Every node here starts at
 * `MIN_W`, the smallest width the shape rules allow, and comic/text take
 * the tall end of their ratio family (2:3) instead of the wide end, since a
 * type that is *allowed* to be tall reads as an actual choice only if the
 * default demonstrates it. Two columns, each two nodes stacked, is the
 * simplest arrangement that gives real masonry: the columns land at
 * different total heights (comic+text taller than audio+game) purely
 * because the nodes in them are different heights, the same reason a
 * Pinterest-style layout staggers instead of gridding evenly.
 *
 * Still centered, not full-width: the whole two-column block sits in the
 * middle of the 24-column canvas with margin on both sides, continuing the
 * "a composed column, not a viewport-filling spread" rule from before this.
 * This is still only the *first* visit's arrangement; anything the visitor
 * does after is what persists (`load()` below only reaches this when
 * nothing is already saved).
 * @returns {FieldNodeConfig[]}
 */
function defaultLayout() {
	// [2, 3] (portrait) at MIN_W is an exact ratio match (w=4 -> h=6), same
	// as [1, 1] (square) at MIN_W (w=4 -> h=4): both columns below are
	// built from already-legal shapes, not values that need snapping.
	const tallW = MIN_W;
	const tallH = (MIN_W * 3) / 2;
	const squareW = MIN_W;

	const columnA = 8; // left column's x; centers the 2*MIN_W-wide pair in 24 columns
	const columnB = columnA + tallW;

	return [
		{ id: 'n-comic-1', type: 'comic', x: columnA, y: 0, w: tallW, h: tallH },
		{ id: 'n-text-1', type: 'text', x: columnA, y: tallH, w: tallW, h: tallH },
		{ id: 'n-audio-1', type: 'audio', x: columnB, y: 0, w: squareW, h: squareW },
		{ id: 'n-game-1', type: 'game', x: columnB, y: squareW, w: squareW, h: squareW }
	];
}

const VALID_TYPES = Object.keys(ALLOWED_RATIOS);

/**
 * Coerces one stored record into a valid node, or null if it is too broken
 * to rescue. Sizes are re-snapped rather than trusted: the ratio rules may
 * have changed since the layout was written, and a stored shape that is no
 * longer legal would otherwise be un-resizable back into legality.
 * @param {unknown} raw
 * @returns {FieldNodeConfig | null}
 */
function coerceNode(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const node = /** @type {Record<string, unknown>} */ (raw);

	const id = typeof node.id === 'string' && node.id ? node.id : null;
	if (!id) return null;

	const type = /** @type {NodeType} */ (
		typeof node.type === 'string' && VALID_TYPES.includes(node.type) ? node.type : 'any'
	);

	const x = Number.isFinite(node.x) ? Math.max(0, Number(node.x)) : 0;
	const y = Number.isFinite(node.y) ? Math.max(0, Number(node.y)) : 0;
	const fallback = defaultSizeFor(type);
	const w = Number.isFinite(node.w) ? Number(node.w) : fallback.w;
	const h = Number.isFinite(node.h) ? Number(node.h) : fallback.h;
	const snapped = snapToAllowedShape(type, w, h);

	return { id, type, x, y, w: snapped.w, h: snapped.h };
}

/** @returns {FieldNodeConfig[]} */
function load() {
	if (!browser) return defaultLayout();
	const parsed = safeReadJson(STORAGE_KEY, /** @type {unknown} */ (null));
	if (!Array.isArray(parsed)) return defaultLayout();
	// An empty stored array is a real state (the visitor removed every node)
	// and is preserved. Only an unreadable one falls back.
	return parsed.map(coerceNode).filter((n) => n !== null);
}

let nextId = 0;

function createLayoutStore() {
	let nodes = $state(load());

	function persist() {
		if (!browser) return;
		// Quota or private-mode failures are not worth breaking the field over;
		// the arrangement just will not survive this session.
		safeWriteJson(STORAGE_KEY, nodes);
	}

	return {
		get nodes() {
			return nodes;
		},

		/**
		 * Replaces stored geometry for the nodes gridstack reports as moved.
		 * Takes a partial list because gridstack's `change` event only
		 * reports what actually changed, not the whole grid.
		 * @param {{ id?: string, x?: number, y?: number, w?: number, h?: number }[]} changed
		 */
		applyGeometry(changed) {
			let touched = false;
			nodes = nodes.map((node) => {
				const update = changed.find((c) => c.id === node.id);
				if (!update) return node;
				touched = true;
				return {
					...node,
					x: update.x ?? node.x,
					y: update.y ?? node.y,
					w: update.w ?? node.w,
					h: update.h ?? node.h
				};
			});
			if (touched) persist();
		},

		/**
		 * Changes a node's content type, re-snapping its size because the new
		 * type may not permit the shape the old one had.
		 * @param {string} id
		 * @param {NodeType} type
		 */
		setType(id, type) {
			nodes = nodes.map((node) => {
				if (node.id !== id) return node;
				const snapped = snapToAllowedShape(type, node.w, node.h);
				return { ...node, type, w: snapped.w, h: snapped.h };
			});
			persist();
		},

		/**
		 * Appends a node. Position is left to the caller (or to gridstack's
		 * auto-placement) rather than guessed here.
		 * @param {NodeType} type
		 * @returns {FieldNodeConfig}
		 */
		add(type) {
			const size = defaultSizeFor(type);
			nextId += 1;
			const node = {
				id: `n-${type}-${Date.now().toString(36)}-${nextId}`,
				type,
				x: 0,
				y: 0,
				...size
			};
			nodes = [...nodes, node];
			persist();
			return node;
		},

		/**
		 * Reorders nodes to an arbitrary sequence.
		 *
		 * Exists for dragging below the authored column count, where x/y is
		 * never trustworthy geometry (see FieldGrid's `computeCenteredLayout`):
		 * a drop there is read as "put it here in the sequence" rather than
		 * "put it at this pixel," so this changes list order only and
		 * deliberately never touches x, y, w, or h. The wide, authored
		 * arrangement is positional, not order-based, so a phone reorder
		 * leaves it alone; a desktop visit still renders every node at its
		 * own saved coordinates regardless of what order this put them in.
		 *
		 * Ignored, rather than partially applied, if `order` does not contain
		 * exactly the current set of ids: a stale or partial read (the caller
		 * derives this from live DOM state) should do nothing instead of
		 * silently dropping a node.
		 * @param {string[]} order
		 */
		reorderTo(order) {
			if (order.length !== nodes.length) return;
			const byId = new Map(nodes.map((node) => [node.id, node]));
			if (!order.every((id) => byId.has(id))) return;
			nodes = order.map((id) => /** @type {FieldNodeConfig} */ (byId.get(id)));
			persist();
		},

		/** @param {string} id */
		remove(id) {
			nodes = nodes.filter((node) => node.id !== id);
			persist();
		},

		/** Restores the shipped arrangement, for an "undo my mess" affordance. */
		reset() {
			nodes = defaultLayout();
			persist();
		}
	};
}

export const layoutStore = createLayoutStore();
