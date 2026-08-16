<script>
	/**
	 * One position in the field view, owning *when* it rotates. The parent
	 * owns *which* entry it shows and hands the next one down; this component
	 * only decides the timing and reports back with `onadvance`.
	 *
	 * Timing is per-slot rather than global on purpose. The previous design
	 * ran one timer for the whole field and swapped every visible node at the
	 * same instant, which is both the least calm way to present it and the
	 * worst case for the network: every card's cover image requested in one
	 * burst. Independent timers with jitter spread that out by construction.
	 *
	 * @type {{
	 *   entry: import('../lib/ring.js').RingEntry,
	 *   nodeId?: string,
	 *   index?: number,
	 *   rotating?: boolean,
	 *   pageVisible?: boolean,
	 *   intervalMs?: number,
	 *   onadvance?: () => void,
	 *   aspect?: string,
	 *   editMode?: boolean,
	 *   nodeType?: import('../lib/nodeShape.js').NodeType,
	 *   onTypeChange?: (type: import('../lib/nodeShape.js').NodeType) => void,
	 *   onRemove?: () => void
	 * }}
	 */
	let {
		entry,
		nodeId = '',
		index = 0,
		rotating = false,
		pageVisible = true,
		intervalMs = 14000,
		onadvance,
		aspect = '1 / 1',
		editMode = false,
		nodeType = 'any',
		onTypeChange,
		onRemove
	} = $props();

	import { untrack } from 'svelte';
	import FieldNode from './FieldNode.svelte';
	import NodeConfig from './NodeConfig.svelte';

	/** Progress repaint cadence. Matches FieldNode's fill transition duration. */
	const TICK_MS = 120;
	/** Spread between neighbouring slots' first rotation, so they don't align. */
	const STAGGER_MS = 2200;
	/** Fraction of the base interval each cycle is randomly stretched/shrunk by. */
	const JITTER = 0.25;

	/** @param {number} base */
	function jittered(base) {
		return Math.round(base * (1 - JITTER + Math.random() * JITTER * 2));
	}

	let hovering = $state(false);
	let focused = $state(false);
	let elapsed = $state(0);
	// Staggered on the first cycle only; every cycle after is plain jitter,
	// by which point the slots have already drifted apart on their own.
	// untrack because this genuinely is a one-time seed: a later change to
	// intervalMs should govern the *next* cycle, not retroactively rewrite
	// the countdown already in progress.
	let target = $state(untrack(() => jittered(intervalMs) + index * STAGGER_MS));

	// Rotation must never pull content out from under someone who is actually
	// engaging with it, so a slot holds while the pointer is over it or
	// keyboard focus is inside it. Page visibility comes from the parent,
	// which keeps one listener for the whole field instead of one per slot.
	const paused = $derived(hovering || focused || !pageVisible);
	const progress = $derived(rotating ? Math.min(1, elapsed / target) : null);

	$effect(() => {
		if (!rotating) return;

		// Reads inside this callback are deliberately outside the effect's
		// tracking context: it runs on a later tick, so `paused` and `target`
		// are read live without making this effect a dependent of them, which
		// would tear down and restart the interval on every hover.
		const id = setInterval(() => {
			if (paused) return;
			elapsed += TICK_MS;
			if (elapsed >= target) {
				elapsed = 0;
				target = jittered(intervalMs);
				onadvance?.();
			}
		}, TICK_MS);

		return () => clearInterval(id);
	});
</script>

<!-- role="presentation" because these handlers only track hover and focus to
     pause this slot's rotation; they add no interaction of their own, and
     every actionable control inside the card is its own button or link. -->
<div
	class="slot"
	role="presentation"
	onmouseenter={() => (hovering = true)}
	onmouseleave={() => (hovering = false)}
	onfocusin={() => (focused = true)}
	onfocusout={() => (focused = false)}
>
	<FieldNode {entry} {progress} progressPaused={paused} {aspect} {editMode} />

	{#if editMode}
		<NodeConfig {nodeId} {nodeType} {onTypeChange} {onRemove} />
	{/if}
</div>

<style>
	.slot {
		position: relative;
		min-width: 0;
		height: 100%;
	}
</style>
