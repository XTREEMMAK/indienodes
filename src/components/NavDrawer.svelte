<script>
	/**
	 * The main nav, collapsed into a right-side slide-out on desktop so the
	 * header can shrink to a floating logo mark and a hamburger trigger
	 * instead of a full-width bar. That bar used to occupy real space in the
	 * page's flex flow above `main`; a floating trigger does not, which is
	 * the actual point of this component: the field view's node canvas gets
	 * the full viewport height instead of "viewport minus the nav."
	 *
	 * Mirrors Modal.svelte's mechanics (backdrop click to close, Escape,
	 * body scroll lock, focus moved onto the panel on open) rather than
	 * reinventing them, since this is the same weight of interaction; it
	 * does not add a stricter Tab focus trap because Modal does not either,
	 * and matching that baseline keeps every overlay in the app behaving the
	 * same way.
	 *
	 * Desktop-only by construction: mobile keeps the bottom tab bar as its
	 * primary nav and gets Arrange and Theme added to it directly instead of
	 * a second, redundant slide-out (docs/decisions.md).
	 *
	 * @type {{ open: boolean, onClose: () => void }}
	 */
	let { open, onClose } = $props();

	import { fade } from 'svelte/transition';
	import { resolve } from '$app/paths';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import ThemeToggle from './ThemeToggle.svelte';
	import { aboutModalStore } from '$lib/aboutModalStore.svelte.js';
	import { editModeStore } from '$lib/editModeStore.svelte.js';
	import { flyFade } from '$lib/transitions.js';

	/** @type {HTMLElement | null} */
	let panelEl = $state(null);

	const isField = $derived(page.url.pathname === resolve('/'));
	const isFavorites = $derived(page.url.pathname === resolve('/favorites'));
	const isMembers = $derived(page.url.pathname === resolve('/members'));
	const isJoin = $derived(page.url.pathname === resolve('/join'));
	const isSettings = $derived(page.url.pathname === resolve('/settings'));

	function close() {
		onClose?.();
	}

	// Closed *after* a navigation completes, not on the link click.
	//
	// Closing on click unmounted the drawer, and therefore the anchor, while
	// the click was still being handled. SvelteKit's router listens for these
	// on the document, so by the time the event bubbled up the link was
	// already detached and the router ignored it, leaving the browser to do a
	// native full-page navigation instead.
	//
	// That was worse than it sounds: a full page load tears down the whole
	// app, which restarts the ring fetch and, more visibly, kills audio that
	// is playing. The player lives in the layout precisely so a queue
	// survives moving between Field, Favorites, and Members, and drawer
	// navigation was the one path that broke that promise.
	//
	// Reacting to the navigation instead keeps the anchor in the DOM for the
	// router, and also closes the drawer on back/forward, which the click
	// handler never did.
	afterNavigate(() => close());

	/** @param {KeyboardEvent} event */
	function handleKeydown(event) {
		if (event.key === 'Escape') close();
	}

	$effect(() => {
		if (!open) return;

		panelEl?.focus();

		const originalOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		return () => {
			document.body.style.overflow = originalOverflow;
		};
	});
</script>

{#if open}
	<div
		class="backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) close();
		}}
		transition:fade={{ duration: 160 }}
	>
		<div
			bind:this={panelEl}
			class="panel glass-panel"
			role="dialog"
			aria-modal="true"
			aria-label="Menu"
			tabindex="-1"
			onkeydown={handleKeydown}
			transition:flyFade={{ x: 320, duration: 220 }}
		>
			<nav class="links" aria-label="Primary">
				<a href={resolve('/')} class:active={isField}>
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path d="M3 11l9-7 9 7" stroke-linecap="round" stroke-linejoin="round" />
						<path
							d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Field
				</a>
				<a href={resolve('/favorites')} class:active={isFavorites}>
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path
							d="M12 20.5s-7.5-4.6-10-9.3C.4 8 1.7 4.5 5 3.4c2.1-.7 4.3.1 5.6 1.9L12 7l1.4-1.7c1.3-1.8 3.5-2.6 5.6-1.9 3.3 1.1 4.6 4.6 3 7.8-2.5 4.7-10 9.3-10 9.3Z"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Favorites
				</a>
				<a href={resolve('/members')} class:active={isMembers}>
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="8.5" />
						<circle cx="12" cy="3.5" r="1.9" fill="currentColor" stroke="none" />
						<circle cx="20.5" cy="12" r="1.9" fill="currentColor" stroke="none" />
						<circle cx="12" cy="20.5" r="1.9" fill="currentColor" stroke="none" />
						<circle cx="3.5" cy="12" r="1.9" fill="currentColor" stroke="none" />
					</svg>
					Members
				</a>
				<a href={resolve('/join')} class:active={isJoin}>
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="8.5" />
						<path d="M12 8.5v7M8.5 12h7" stroke-linecap="round" />
					</svg>
					Join the ring
				</a>
				<button
					type="button"
					onclick={() => {
						aboutModalStore.show();
						close();
					}}
				>
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="9" />
						<path d="M12 11v6" stroke-linecap="round" />
						<circle
							cx="12"
							cy="7.5"
							r="0.25"
							fill="currentColor"
							stroke="currentColor"
							stroke-width="1.5"
						/>
					</svg>
					About
				</button>
				<a href={resolve('/settings')} class:active={isSettings}>
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="3" />
						<path
							d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3h-6l-.3 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.5L4.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 1.7 1L9 21h6l.3-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.5Z"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Settings
				</a>
			</nav>

			{#if isField}
				<!-- Only on the Field route, because it arranges that specific
				     surface. Grouped with the theme control below rather than
				     with the destinations above: both change how the app
				     behaves, while every link above changes where you are. -->
				<div class="divider" role="separator"></div>
				<button
					type="button"
					class="action-item"
					class:active={editModeStore.active}
					aria-pressed={editModeStore.active}
					onclick={() => {
						editModeStore.toggle();
						close();
					}}
				>
					<svg
						viewBox="0 0 24 24"
						width="20"
						height="20"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<rect x="3" y="3" width="7" height="7" rx="1.5" />
						<rect x="14" y="3" width="7" height="7" rx="1.5" />
						<rect x="3" y="14" width="7" height="7" rx="1.5" />
						<path d="M17.5 14.5v6M14.5 17.5h6" stroke-linecap="round" />
					</svg>
					{editModeStore.active ? 'Done arranging' : 'Arrange field'}
				</button>
			{/if}

			<div class="divider" role="separator"></div>
			<ThemeToggle variant="drawer" />
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: rgb(0 0 0 / 0.4);
	}

	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 101;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		width: min(19rem, 85vw);
		padding: 5.5rem 1.4rem 2rem;
		overflow-y: auto;
		border-radius: 0;
		border-left: 1px solid var(--glass-border);
		/* Translucent glass rather than the solid panel this used to be, so an
		   enabled ambient background stays visible and moving behind the menu
		   instead of being cut out by a grey slab.

		   Deliberately *more* opaque than `.glass-panel`'s own token (0.86 vs
		   0.5-0.62). That token is tuned for panels sitting on a static page;
		   this one sits over a drifting particle field, where a passing bright
		   particle would otherwise change the contrast under a line of text
		   while you are reading it. Contrast has to hold against the whole
		   animation, not just its average frame, so the floor is set by the
		   worst moment rather than the typical one. Measured at 0.86: ~15:1 in
		   dark and ~16:1 in light, against a 4.5:1 requirement.

		   The 0.4 black backdrop behind it does part of that work by damping
		   whatever is underneath before it ever reaches this surface. */
		background: color-mix(in srgb, var(--bg-elevated) 86%, transparent);
		backdrop-filter: blur(16px);
	}

	/* Without backdrop-filter there is no blur to separate text from the
	   moving field behind it, so translucency stops being a style and starts
	   being a legibility problem. Same fallback `.glass-panel` already uses. */
	@supports not (backdrop-filter: blur(1px)) {
		.panel {
			background: var(--bg-elevated);
		}
	}

	.links {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.links a,
	.links button,
	.action-item {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		padding: 0.75rem 0.6rem;
		border-radius: var(--radius-sm);
		border: none;
		background: none;
		color: var(--text);
		font: inherit;
		font-size: var(--text-base);
		text-decoration: none;
		text-align: left;
		cursor: pointer;
	}

	.links a:hover,
	.links button:hover,
	.action-item:hover {
		background: var(--glass-bg);
	}

	.links a.active {
		color: var(--accent);
	}

	.action-item.active {
		color: var(--accent);
	}

	.divider {
		height: 1px;
		margin: 0.6rem 0;
		background: var(--border);
	}
</style>
