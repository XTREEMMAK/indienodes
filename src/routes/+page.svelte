<script>
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import FieldGrid from '../components/FieldGrid.svelte';
	import FieldSlot from '../components/FieldSlot.svelte';
	import ArrangeMenu from '../components/ArrangeMenu.svelte';
	import RingLoading from '../components/RingLoading.svelte';
	import EmptyNode from '../components/EmptyNode.svelte';
	import NodeConfig from '../components/NodeConfig.svelte';
	import { aboutModalStore } from '$lib/aboutModalStore.svelte.js';
	import { filtersStore } from '$lib/filtersStore.svelte.js';
	import { layoutStore } from '$lib/layoutStore.svelte.js';
	import { editModeStore } from '$lib/editModeStore.svelte.js';
	import { preferencesStore } from '$lib/preferencesStore.svelte.js';
	import { coverImageUrl, isVisibleTo } from '$lib/ring.js';
	import { ringStore } from '$lib/ringStore.svelte.js';
	import { preload } from '$lib/imagePreloader.js';

	// Seconds-on-screen now comes from the visitor's own per-type setting
	// (preferences.js `DEFAULT_ROTATION_MS`, adjustable in Settings), not one
	// global constant, per brief section 7c: a track is sampled in seconds and
	// a comic page has to be read, so one interval cannot serve both. Each
	// node still jitters its own value per cycle and staggers its first one
	// (FieldSlot), so nodes of the same type drift apart rather than rotating
	// in lockstep.
	let pageVisible = $state(true);

	// The toggle lives in the header (see editModeStore for why), so this
	// page reads the mode rather than owning it.
	const editMode = $derived(editModeStore.active);

	// Add-node/reset/exit live in a menu summoned on demand rather than a bar
	// sitting permanently over the field: null when closed, viewport
	// coordinates when open. Desktop opens it with a right-click anywhere on
	// the field surface, in *either* mode: outside arrange it collapses to a
	// single "Arrange field" entry (see ArrangeMenu), which is what makes
	// right-click a quick way in and out rather than something that only
	// works once you are already arranging.
	let menuPos = $state(/** @type {{ x: number, y: number } | null} */ (null));

	/**
	 * Last mode the menu was reconciled against. A plain variable, not
	 * `$state`, so comparing it cannot itself become a reactive dependency,
	 * matching the `lastSignature` pattern further down this file. Seeded
	 * with the mode's known initial value rather than by reading the derived
	 * here, which would only capture that first value anyway and reads as a
	 * mistake to anyone (or any linter) checking for exactly that.
	 */
	let lastEditMode = false;

	// Closed on any mode change, in both directions: the menu's contents
	// differ per mode, so leaving it open across a switch would leave
	// controls for the mode that just ended sitting on screen.
	$effect(() => {
		if (editMode === lastEditMode) return;
		lastEditMode = editMode;
		menuPos = null;
	});

	/** @param {MouseEvent} event */
	function handleContextMenu(event) {
		// Links keep their native menu: right-clicking a card's Visit button to
		// open a creator's site in a new tab is a real thing to want, and
		// swallowing it to offer "Arrange field" instead would be a bad trade.
		if (/** @type {HTMLElement} */ (event.target).closest('a')) return;
		event.preventDefault();
		menuPos = { x: event.clientX, y: event.clientY };
	}

	onMount(() => {
		// One listener for the whole field rather than one per node; each node
		// folds this into its own pause state alongside its hover and focus.
		function handleVisibilityChange() {
			pageVisible = document.visibilityState === 'visible';
		}
		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
	});

	// Global tag filtering still applies for now. The global *type* filter is
	// gone: a node declares its own type, and a global exclusion on top of
	// that would strand a node with an empty pool forever, with the cause in
	// a different part of the app than the symptom. Tags move onto nodes in
	// the semantic pass, at which point this goes too (docs/decisions.md).
	// The explicit gate is applied before the tag filter, and separately from
	// it, because they are different kinds of thing: tags narrow a pool the
	// visitor is choosing to shape, while this decides what is eligible to be
	// in the pool at all. It also has to survive `filtersStore` being removed
	// when tags move onto nodes (docs/roadmap.md), so it does not live there.
	const entries = $derived(
		ringStore.entries.filter(
			(entry) => isVisibleTo(entry, preferencesStore.showExplicit) && filtersStore.matches(entry)
		)
	);
	const hasActiveFilters = $derived(filtersStore.tags.size > 0);

	const nodes = $derived(layoutStore.nodes);
	const byId = $derived(new Map(entries.map((entry) => [entry.id, entry])));

	/**
	 * Every type's pool, bucketed once per entries change.
	 *
	 * Built as a map rather than filtered on demand because `poolFor` sits in
	 * the rotation hot path: it is called from `takeNext` and, via
	 * `canRotate`, from the template for every node on screen. Filtering there
	 * made a single rotation cost O(nodes squared * ring size) and allocated a
	 * fresh array of the whole pool each time, which is the thing that would
	 * have turned a large ring into GC churn on a phone. One pass here makes
	 * every later lookup O(1).
	 *
	 * `any` maps to `entries` by reference, matching the old behaviour.
	 */
	const poolsByType = $derived.by(() => {
		/** @type {Record<string, import('$lib/ring.js').RingEntry[]>} */
		const pools = { audio: [], comic: [], text: [], game: [] };
		for (const entry of entries) pools[entry.type]?.push(entry);
		// `any` draws from everything, by reference rather than a copy.
		pools.any = entries;
		return pools;
	});

	/**
	 * The pool a node draws from: entries of its own type, or everything for
	 * an `any` node. This is what makes a node a channel rather than a slot.
	 * @param {import('$lib/nodeShape.js').NodeType} type
	 */
	function poolFor(type) {
		return poolsByType[type] ?? entries;
	}

	/** Entry id currently shown, keyed by node id. @type {Record<string, string | null>} */
	let assigned = $state({});
	/** Entry id warmed and waiting, keyed by node id. @type {Record<string, string | null>} */
	let queued = $state({});

	/**
	 * A shuffled deck of entry ids per type, dealt from and refilled when
	 * empty. Plain object rather than `$state` for the same reason the old
	 * cursor was: it is written from inside `reconcile`/`advance`, which
	 * already write the reactive state that matters.
	 *
	 * This replaces a per-type cursor that walked `ring.json` in array order.
	 * That cursor was deterministic and started at zero for everyone, so every
	 * visitor with the default layout opened on the same entries in the same
	 * slots, and members near the top of the file were seen far more than
	 * members near the bottom.
	 *
	 * A deck rather than picking at random each time, because plain random
	 * repeats: at ring sizes a young webring actually has, the same entry
	 * would reappear while others went unseen for long stretches. Dealing from
	 * a shuffled deck shows everything of a type once before anything repeats,
	 * and reshuffles differently for the next pass.
	 * @type {Record<string, string[]>}
	 */
	let decks = {};

	/**
	 * Fisher-Yates, on a copy. Not seeded: the shuffle is per visitor per
	 * session and nothing needs to reproduce it.
	 * @param {string[]} ids
	 */
	function shuffle(ids) {
		const deck = [...ids];
		for (let i = deck.length - 1; i > 0; i -= 1) {
			const j = Math.floor(Math.random() * (i + 1));
			[deck[i], deck[j]] = [deck[j], deck[i]];
		}
		return deck;
	}

	// Plain arrays rather than Sets: transient scratch recomputed per call,
	// not reactive state, and the exclude list is at most two per node.

	/** Ids on screen or spoken for, so nothing appears twice at once. */
	function spokenFor() {
		return [...Object.values(assigned), ...Object.values(queued)].filter((id) => id !== null);
	}

	/**
	 * Next unclaimed entry of a type, walking that type's own cursor.
	 * @param {import('$lib/nodeShape.js').NodeType} type
	 * @param {(string | null)[]} exclude
	 */
	function takeNext(type, exclude) {
		const pool = poolFor(type);
		if (pool.length === 0) return null;

		if (!decks[type]?.length) decks[type] = shuffle(pool.map((entry) => entry.id));
		let deck = decks[type];

		let index = deck.findIndex((id) => !exclude.includes(id));

		// A deck near the end of its pass can hold nothing but ids that are
		// already on screen, while the pool still has plenty that are not.
		// Refill and look again rather than reporting the pool exhausted.
		if (index === -1 && deck.length < pool.length) {
			deck = decks[type] = shuffle(pool.map((entry) => entry.id));
			index = deck.findIndex((id) => !exclude.includes(id));
		}

		// A full deck with nothing usable means every entry of this type really
		// is spoken for, which is the same "nothing to show" the cursor
		// reported by completing a lap.
		if (index === -1) return null;

		return deck.splice(index, 1)[0];
	}

	/** Warms a queued entry's cover so its swap lands on a decoded image. */
	/** @param {string | null} id */
	function warm(id) {
		if (!id) return;
		const entry = byId.get(id);
		if (entry) preload(coverImageUrl(entry));
	}

	/**
	 * Reconciles assignments against the current nodes and pool, preserving
	 * what is already on screen wherever it is still valid. Deliberately not
	 * a reseed: adding or removing one node should not reshuffle every other
	 * node's content, which would be a jarring way to answer a small edit.
	 *
	 */
	function reconcile() {
		/** @type {(string | null)[]} */
		const claimed = [];
		/** @type {Record<string, string | null>} */
		const nextAssigned = {};

		for (const node of nodes) {
			const current = assigned[node.id];
			const entry = current ? byId.get(current) : undefined;
			const stillValid =
				entry && (node.type === 'any' || entry.type === node.type) && !claimed.includes(current);
			if (stillValid && current) {
				nextAssigned[node.id] = current;
				claimed.push(current);
			}
		}

		for (const node of nodes) {
			if (nextAssigned[node.id]) continue;
			const id = takeNext(node.type, claimed);
			if (id) claimed.push(id);
			nextAssigned[node.id] = id;
		}

		/** @type {Record<string, string | null>} */
		const nextQueued = {};
		for (const node of nodes) {
			const id = takeNext(node.type, claimed);
			if (id) claimed.push(id);
			nextQueued[node.id] = id;
		}

		assigned = nextAssigned;
		queued = nextQueued;
		Object.values(nextQueued).forEach(warm);
	}

	/**
	 * Promotes a node's warmed queue entry into view, then queues and warms
	 * the next. Falls back to picking fresh when nothing was queued, which
	 * happens when a type's pool is barely larger than the nodes using it.
	 * @param {string} nodeId
	 */
	function advance(nodeId) {
		const node = nodes.find((n) => n.id === nodeId);
		if (!node) return;

		const promoted = queued[nodeId] ?? takeNext(node.type, spokenFor());
		if (!promoted) return;

		assigned = { ...assigned, [nodeId]: promoted };
		queued = { ...queued, [nodeId]: null };

		const following = takeNext(node.type, spokenFor());
		queued = { ...queued, [nodeId]: following };
		warm(following);
	}

	/**
	 * How many entries of each type are on screen right now.
	 *
	 * Derived once per assignment change rather than recomputed inside
	 * `canRotate`, because `canRotate` is called from the template for every
	 * node, and a single rotation reassigns `assigned` and so re-runs all of
	 * them. Scanning the pool per node made that O(nodes squared * ring size)
	 * per rotation; counting here makes it a comparison.
	 */
	const shownCountByType = $derived.by(() => {
		/** @type {Record<string, number>} */
		const counts = { audio: 0, comic: 0, text: 0, game: 0 };
		let total = 0;
		for (const id of Object.values(assigned)) {
			if (!id) continue;
			const entry = byId.get(id);
			if (!entry) continue;
			counts[entry.type] = (counts[entry.type] ?? 0) + 1;
			total += 1;
		}
		counts.any = total;
		return counts;
	});

	/**
	 * Whether a node has anywhere to rotate to: an entry of its type that is
	 * not already on screen somewhere.
	 *
	 * A pool holds something unshown exactly when it is larger than the count
	 * of that type currently displayed, so this needs no scan of either.
	 * @param {import('$lib/layoutStore.svelte.js').FieldNodeConfig} node
	 */
	function canRotate(node) {
		return poolFor(node.type).length > (shownCountByType[node.type] ?? 0);
	}

	// Reconcile when the *composition* changes: which nodes exist and what
	// type each is. Deliberately not the whole node objects, because those
	// also change on every drag and resize, and reseeding content because
	// someone nudged a node two cells left would be absurd.
	const composition = $derived(nodes.map((n) => `${n.id}:${n.type}`).join('|'));

	/**
	 * Last state reconcile() ran against. Plain variables, not `$state`, so
	 * comparing them here cannot itself become a reactive dependency.
	 *
	 * The entry set is tracked by array identity rather than by joining every
	 * id into a string. `entries` is a `$derived`, so a new array means the
	 * set genuinely changed, and the old string built roughly 200 KB of ids on
	 * every evaluation once a ring reached ten thousand entries just to prove
	 * nothing had.
	 * @type {import('$lib/ring.js').RingEntry[] | null}
	 */
	let lastEntries = null;
	let lastComposition = '';

	// Both values are read unconditionally, before any early return, so they
	// are always tracked as dependencies of this effect regardless of which
	// branch it takes. Reading one only after an early exit on the other is
	// how an effect ends up silently never re-running.
	//
	// untrack for the same reason as before: reconcile() both reads and
	// writes assignment state, so without it this effect would depend on its
	// own writes and re-run on every rotation. That trap has bitten twice.
	$effect(() => {
		const nextEntries = entries;
		const nextComposition = composition;
		if (nextEntries === lastEntries && nextComposition === lastComposition) return;

		// A changed entry set invalidates every deck: a deck can otherwise
		// hold ids that a filter change, or the ring finishing loading, has
		// removed from the pool.
		if (nextEntries !== lastEntries) decks = {};

		lastEntries = nextEntries;
		lastComposition = nextComposition;
		untrack(() => reconcile());
	});

	const visibleCount = $derived(Object.values(assigned).filter((id) => id !== null).length);

	/**
	 * Whether the intro animation has had time to finish.
	 *
	 * `ring.json` is a static file and usually resolves in well under the
	 * length of the animation, so without this the logo would be cut off
	 * mid-zoom on most loads, which reads as a glitch rather than an intro.
	 * Holding for the animation's own duration means the loading state either
	 * plays fully or not at all.
	 */
	let introDone = $state(false);

	onMount(() => {
		// Skipped entirely when the ring is already in memory. This is a
		// loading state, and there is nothing to load when navigating back
		// from Favorites; replaying it there would be theatre, and the kind
		// that gets annoying by the third time.
		if (ringStore.status === 'ready') {
			introDone = true;
			return;
		}
		const timer = setTimeout(() => (introDone = true), 900);
		return () => clearTimeout(timer);
	});

	const ringPending = $derived(ringStore.status === 'idle' || ringStore.status === 'loading');

	// Held until the ring has arrived *and* the intro has played out, so the
	// logo is never cut off mid-zoom by a file that resolved in 40ms. A
	// failure opts out immediately: it gets its own branch rather than
	// sitting under a loading message that will never resolve.
	const showLoading = $derived((ringPending || !introDone) && ringStore.status !== 'error');
</script>

<svelte:head>
	<title>IndieNodes</title>
</svelte:head>

<div class="field-page" role="presentation" oncontextmenu={handleContextMenu}>
	{#if nodes.length === 0}
		<div class="empty-state">
			<h1>IndieNodes</h1>
			<p>Your field has no nodes. Add one to start seeing work from the ring.</p>
			<button type="button" class="primary-button" onclick={() => editModeStore.enable()}>
				Arrange field
			</button>
		</div>
	{:else if showLoading}
		<!-- The ring is fetched in the browser rather than baked into this
		     page, so there is a moment before any entry exists. Saying "the
		     ring is empty" during it would be wrong. -->
		<RingLoading />
	{:else if visibleCount === 0 && ringStore.status === 'error'}
		<!-- Distinct from an empty ring, and the distinction matters: this
		     used to fall through to "the ring is empty right now", which sent
		     you looking at the content when the actual problem was that the
		     file never arrived. -->
		<div class="empty-state">
			<h1>IndieNodes</h1>
			<p class="status">The ring could not be loaded.</p>
			<button type="button" class="primary-button" onclick={() => ringStore.ensureLoaded()}>
				Try again
			</button>
		</div>
	{:else if visibleCount === 0}
		<div class="empty-state">
			<h1>IndieNodes</h1>
			<p>
				A webring for indie creators: audio, comics and visual art, writing, and eventually games.
			</p>
			{#if hasActiveFilters}
				<p class="status">
					No entries match your current filters.
					<a href={resolve('/settings')}>Adjust them in Settings</a>.
				</p>
			{:else}
				<p class="status">
					The ring is empty right now. See
					<button type="button" class="about-link" onclick={() => aboutModalStore.show()}>
						About
					</button> for what IndieNodes is.
				</p>
			{/if}
		</div>
	{:else}
		<FieldGrid
			{nodes}
			{editMode}
			fitToView={preferencesStore.fitToView}
			onGeometryChange={(changed) => layoutStore.applyGeometry(changed)}
			onReorder={(order) => layoutStore.reorderTo(order)}
		>
			{#snippet children(node)}
				{@const entry = assigned[node.id] ? byId.get(assigned[node.id] ?? '') : undefined}
				{#if entry}
					<FieldSlot
						{entry}
						nodeId={node.id}
						index={nodes.findIndex((n) => n.id === node.id)}
						rotating={canRotate(node) && !editMode}
						{pageVisible}
						intervalMs={preferencesStore.rotationFor(node.type)}
						onadvance={() => advance(node.id)}
						aspect={`${node.w} / ${node.h}`}
						{editMode}
						nodeType={node.type}
						onTypeChange={(type) => layoutStore.setType(node.id, type)}
						onRemove={() => layoutStore.remove(node.id)}
					/>
				{:else}
					<!-- Always render something. A node whose pool is empty still
					     has to be selectable and removable, since its controls
					     live on the node itself. -->
					<div class="empty-slot">
						<EmptyNode {node} {editMode} />
						{#if editMode}
							<NodeConfig
								nodeId={node.id}
								nodeType={node.type}
								onTypeChange={(type) => layoutStore.setType(node.id, type)}
								onRemove={() => layoutStore.remove(node.id)}
							/>
						{/if}
					</div>
				{/if}
			{/snippet}
		</FieldGrid>
	{/if}

	{#if menuPos}
		<ArrangeMenu
			x={menuPos.x}
			y={menuPos.y}
			{editMode}
			fitToView={preferencesStore.fitToView}
			onAdd={(type) => layoutStore.add(type)}
			onReset={() => layoutStore.reset()}
			onExit={() => editModeStore.disable()}
			onEnter={() => editModeStore.enable()}
			onToggleFit={() => preferencesStore.toggleFitToView()}
			onClose={() => (menuPos = null)}
		/>
	{/if}
</div>

<style>
	.field-page {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		/* Full-bleed rather than a centred column: node sizes are now set by
		   their own cell spans, so the container no longer has to constrain
		   width to keep cards a sensible size. */
		width: 100%;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		text-align: center;
		min-height: 60vh;
		max-width: 40rem;
	}

	.empty-state p {
		margin-top: 1.2rem;
		color: var(--text-muted);
	}

	.status {
		font-size: var(--text-sm);
	}

	.about-link {
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		font: inherit;
		font-size: inherit;
		color: var(--accent);
		cursor: pointer;
	}

	.about-link:hover {
		text-decoration: underline;
	}

	.status a {
		color: var(--accent);
	}

	.status a:hover {
		text-decoration: underline;
	}

	.primary-button {
		margin-top: 1.6rem;
		padding: 0.7rem 1.4rem;
		border: none;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: white;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.primary-button:hover {
		background: var(--accent-hover);
	}

	.empty-slot {
		position: relative;
		height: 100%;
	}
</style>
