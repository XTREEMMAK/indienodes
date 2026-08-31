<script>
	/**
	 * The minimized player: a small draggable dock that stays put while the
	 * visitor reads something else.
	 *
	 * Owns its own position entirely — where it sits, dragging it, nudging it
	 * with the keyboard, clamping it back on screen, and remembering it. None
	 * of that is the player's business, and keeping it here is what let the
	 * clamp arithmetic move to `miniPlayerPosition.js` where it could be tested
	 * against the case that actually matters: a position restored from a
	 * different-sized screen.
	 *
	 * Desktop only. Mobile has one persistent play/pause control in the nav and
	 * a dismissible detail sheet instead, so this is display:none there rather
	 * than a second floating thing competing with the nav bar.
	 *
	 * @type {{
	 *   current: { label: string, creator: string, cover: string | null } | null,
	 *   playing?: boolean,
	 *   onToggle: () => void,
	 *   onExpand: () => void
	 * }}
	 */
	let { current, playing = false, onToggle, onExpand } = $props();

	import { untrack } from 'svelte';
	import { flyFade } from '$lib/transitions.js';
	import {
		MOBILE_BOTTOM_MARGIN,
		VIEWPORT_MARGIN,
		clampToViewport,
		parseStoredPosition
	} from '$lib/miniPlayerPosition.js';
	import { STORAGE_KEYS, safeReadJson, safeWriteJson } from '$lib/storageKeys.js';

	const POSITION_KEY = STORAGE_KEYS.playerPosition.key;
	const KEYBOARD_STEP = 16;

	/** @type {HTMLDivElement | undefined} */
	let el = $state(undefined);
	let dragging = $state(false);
	let position = $state(/** @type {{ x: number, y: number } | null} */ (null));
	let offsetX = 0;
	let offsetY = 0;

	/** @param {number} x @param {number} y */
	function clamp(x, y) {
		return clampToViewport(
			{ x, y },
			{ width: el?.offsetWidth ?? 320, height: el?.offsetHeight ?? 56 },
			{ width: innerWidth, height: innerHeight },
			{
				// Clear the mobile nav bar, which would otherwise sit on top of
				// this and make it unreachable.
				bottomMargin: matchMedia('(max-width: 64rem)').matches
					? MOBILE_BOTTOM_MARGIN
					: VIEWPORT_MARGIN
			}
		);
	}

	function persist() {
		if (!position) return;
		// Private mode or a full quota: positioning remains session-local.
		safeWriteJson(POSITION_KEY, position);
	}

	/** @param {number} x @param {number} y @param {boolean} [save] */
	function moveTo(x, y, save = false) {
		const next = clamp(x, y);
		if (position?.x !== next.x || position?.y !== next.y) position = next;
		if (save) persist();
	}

	/** @param {PointerEvent} event */
	function startDrag(event) {
		if (event.button !== 0 || !el) return;
		event.preventDefault();
		const rect = el.getBoundingClientRect();
		offsetX = event.clientX - rect.left;
		offsetY = event.clientY - rect.top;
		dragging = true;
		moveTo(rect.left, rect.top);
		try {
			/** @type {HTMLElement} */ (event.currentTarget).setPointerCapture(event.pointerId);
		} catch {
			// Synthetic pointers and older browsers may not support capture.
		}
	}

	/** @param {PointerEvent} event */
	function moveDrag(event) {
		if (!dragging) return;
		moveTo(event.clientX - offsetX, event.clientY - offsetY);
	}

	/** @param {PointerEvent} event */
	function finishDrag(event) {
		if (!dragging) return;
		dragging = false;
		persist();
		try {
			/** @type {HTMLElement} */ (event.currentTarget).releasePointerCapture(event.pointerId);
		} catch {
			// The pointer may already have lost capture outside the viewport.
		}
	}

	/** @param {KeyboardEvent} event */
	function moveWithKeyboard(event) {
		const delta = /** @type {Record<string, [number, number]>} */ ({
			ArrowLeft: [-KEYBOARD_STEP, 0],
			ArrowRight: [KEYBOARD_STEP, 0],
			ArrowUp: [0, -KEYBOARD_STEP],
			ArrowDown: [0, KEYBOARD_STEP]
		})[event.key];
		if (!delta || !el) return;
		event.preventDefault();
		const rect = el.getBoundingClientRect();
		moveTo((position?.x ?? rect.left) + delta[0], (position?.y ?? rect.top) + delta[1], true);
	}

	$effect(() => {
		// Not clamped here: what fits depends on this element's measured size,
		// which does not exist yet. The first drag or nudge clamps it.
		const restored = parseStoredPosition(safeReadJson(POSITION_KEY, null));
		if (restored) position = restored;
	});

	// Re-clamp once the element exists and can be measured, which is when a
	// restored position is first checkable against this screen at all.
	$effect(() => {
		const node = el;
		const restored = untrack(() => position);
		if (!node || !restored) return;
		const frame = requestAnimationFrame(() => moveTo(restored.x, restored.y, true));
		return () => cancelAnimationFrame(frame);
	});

	// And again whenever the viewport changes, so resizing a window cannot
	// strand the dock off the edge.
	$effect(() => {
		function handleResize() {
			if (position) moveTo(position.x, position.y, true);
		}
		addEventListener('resize', handleResize);
		return () => removeEventListener('resize', handleResize);
	});
</script>

<div
	bind:this={el}
	class="mini-player glass-panel"
	class:dragging
	style:left={position ? `${position.x}px` : undefined}
	style:top={position ? `${position.y}px` : undefined}
	style:right={position ? 'auto' : undefined}
	style:bottom={position ? 'auto' : undefined}
	transition:flyFade={{ y: 16, duration: 180 }}
>
	<button
		type="button"
		class="mini-play"
		onclick={onToggle}
		aria-label={playing ? 'Pause' : 'Play'}
		title={playing ? 'Pause' : 'Play'}
	>
		{#if playing}
			<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
				<path d="M7 5h4v14H7zM13 5h4v14h-4z" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
				<path d="M7 5l12 7-12 7z" />
			</svg>
		{/if}
	</button>
	<button
		type="button"
		class="mini-details"
		onclick={onExpand}
		aria-label={`Expand player, ${current?.label ?? 'current track'} by ${current?.creator ?? 'unknown creator'}`}
		title="Expand player"
	>
		{#if current?.cover}
			<img class="mini-cover" src={current.cover} alt="" decoding="async" referrerpolicy="no-referrer" />
		{/if}
		<span class="mini-meta">
			<span class="mini-track">{current?.label ?? ''}</span>
			<span class="mini-entry">{current?.creator ?? ''}</span>
		</span>
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<path d="M7 14l5-5 5 5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>
	<button
		type="button"
		class="mini-drag-handle"
		onpointerdown={startDrag}
		onpointermove={moveDrag}
		onpointerup={finishDrag}
		onpointercancel={finishDrag}
		onkeydown={moveWithKeyboard}
		aria-label="Move minimized player"
		title="Drag to move player"
	>
		<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
			<circle cx="8" cy="7" r="1.4" />
			<circle cx="16" cy="7" r="1.4" />
			<circle cx="8" cy="12" r="1.4" />
			<circle cx="16" cy="12" r="1.4" />
			<circle cx="8" cy="17" r="1.4" />
			<circle cx="16" cy="17" r="1.4" />
		</svg>
	</button>
</div>

<style>
	.mini-player {
		position: fixed;
		right: 0.75rem;
		bottom: 0.75rem;
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		width: min(20rem, calc(100vw - 1.5rem));
		padding: 0.4rem;
		border-radius: 999px;
	}

	.mini-player.dragging {
		user-select: none;
	}

	.mini-play {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		width: 2.65rem;
		height: 2.65rem;
		border: none;
		border-radius: 999px;
		background: var(--accent);
		color: white;
		cursor: pointer;
	}

	.mini-play:hover {
		background: var(--accent-hover);
	}

	.mini-details {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
		flex: 1;
		padding: 0.15rem 0.45rem 0.15rem 0.15rem;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.mini-details:hover {
		background: var(--glass-bg);
	}

	.mini-cover {
		width: 2rem;
		height: 2rem;
		flex: 0 0 auto;
		border-radius: 999px;
		object-fit: cover;
	}

	.mini-meta {
		display: flex;
		min-width: 0;
		flex: 1;
		flex-direction: column;
	}

	.mini-track,
	.mini-entry {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mini-track {
		font-size: var(--text-sm);
		font-weight: 700;
	}

	.mini-entry {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.mini-drag-handle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		width: 2.2rem;
		height: 2.2rem;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--text-muted);
		cursor: grab;
		touch-action: none;
	}

	.mini-drag-handle:hover,
	.mini-drag-handle:focus-visible {
		background: var(--glass-bg);
		color: var(--text);
	}

	.dragging .mini-drag-handle {
		cursor: grabbing;
	}

	@media (max-width: 64rem) {
		.mini-player {
			bottom: 5.25rem;
		}
	}

	@media (max-width: 64rem) {
		/* Mobile owns one persistent play/pause control in the nav, plus a
		   dismissible detail sheet. A second floating dock competing with the
		   nav bar is not wanted there. */
		.mini-player {
			display: none;
		}
	}
</style>
