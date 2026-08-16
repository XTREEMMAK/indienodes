<script>
	import { onMount } from 'svelte';
	import FieldNode from '../../components/FieldNode.svelte';
	import { favoritesStore } from '$lib/favoritesStore.svelte.js';
	import { ringStore } from '$lib/ringStore.svelte.js';
	import { preferencesStore } from '$lib/preferencesStore.svelte.js';
	import { isVisibleTo } from '$lib/ring.js';
	import { flyFade } from '$lib/transitions.js';
	import Modal from '../../components/Modal.svelte';

	/** The entry awaiting confirmation, or null. @type {import('$lib/ring.js').RingEntry | null} */
	let pendingUnlike = $state(null);

	function confirmUnlike() {
		if (!pendingUnlike) return;
		favoritesStore.toggle(pendingUnlike.id);
		pendingUnlike = null;
	}

	// Same first-load stagger as the field view (`src/routes/+page.svelte`);
	// see the comment there for why both a CSS animation and a Svelte
	// transition are needed together.
	const STAGGER_STEP_MS = 45;

	let firstLoad = $state(true);

	onMount(() => {
		const timer = setTimeout(() => (firstLoad = false), 900);
		return () => clearTimeout(timer);
	});

	// Liking something does not exempt it from the explicit filter: turning the
	// filter back on should hide it here too, otherwise the setting quietly
	// means "except the ones you already found."
	const liked = $derived(
		ringStore.entries.filter(
			(entry) =>
				favoritesStore.isLiked(entry.id) && isVisibleTo(entry, preferencesStore.showExplicit)
		)
	);
</script>

<svelte:head>
	<title>Favorites, IndieNodes</title>
</svelte:head>

<div class="favorites-page">
	<h1>Favorites</h1>
	<p class="lede">
		Liked entries, stored only in this browser's local storage. Nothing here is sent to a server.
	</p>

	{#if liked.length === 0 && !ringStore.settled}
		<!-- Liked ids live in local storage but the entries they point at come
		     from the ring, which is now fetched in the browser. Without this,
		     someone with favourites would be told they had none for a moment. -->
		<div class="empty-state">
			<p>Loading the ring…</p>
		</div>
	{:else if liked.length === 0}
		<div class="empty-state">
			<p>Nothing liked yet. Tap the heart on any node in the Field to add it here.</p>
		</div>
	{:else}
		<div class="field" class:first-load={firstLoad}>
			{#each liked as entry, i (entry.id)}
				<div
					class="node-slot"
					style:animation-delay={`${i * STAGGER_STEP_MS}ms`}
					in:flyFade={{ y: 20, duration: 320, delay: i * STAGGER_STEP_MS }}
				>
					<FieldNode {entry} onUnlikeRequest={(target) => (pendingUnlike = target)} />
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- The app's own dialog, not window.confirm(). A browser confirm is modal to
     the whole tab, cannot be styled or themed, reads as a security prompt
     rather than a question from this page, and on some platforms shows the
     origin next to it. This is a small question about a card the visitor is
     looking at, so it should look like it came from the card. Reuses the same
     Modal every other overlay here uses. -->
<Modal
	open={pendingUnlike !== null}
	title="Remove from favorites?"
	onClose={() => (pendingUnlike = null)}
>
	<p class="confirm-text">
		<strong>{pendingUnlike?.title}</strong>
		by {pendingUnlike?.creator} will be removed from your favorites. It stays in the ring, and you can
		like it again if you find it.
	</p>
	<div class="confirm-actions">
		<button type="button" class="confirm-no" onclick={() => (pendingUnlike = null)}>Keep it</button>
		<button type="button" class="confirm-yes" onclick={confirmUnlike}>Remove</button>
	</div>
</Modal>

<style>
	.confirm-text {
		color: var(--text);
	}

	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 1.6rem;
	}

	.confirm-yes,
	.confirm-no {
		padding: 0.55rem 1.1rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.confirm-no:hover {
		background: var(--glass-bg);
	}

	/* The destructive action carries the weight, and it is the one tinted
	   red: the safe choice should not be the one that looks like the button
	   you are meant to press. */
	.confirm-yes {
		border-color: #e0455f;
		background: #e0455f;
		color: #fff;
	}

	.confirm-yes:hover {
		filter: brightness(1.1);
	}

	.favorites-page {
		max-width: 52rem;
		margin: 0 auto;
	}

	.lede {
		color: var(--text-muted);
		margin-bottom: 2rem;
	}

	.empty-state {
		padding: 3rem;
		text-align: center;
		border-radius: var(--radius-lg);
		border: 1px dashed var(--border);
		color: var(--text-muted);
	}

	.node-slot {
		min-width: 0;
	}

	.field.first-load .node-slot {
		animation: node-stagger-in 320ms ease-out both;
	}

	@keyframes node-stagger-in {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.field.first-load .node-slot {
			animation-duration: 120ms;
			animation-delay: 0ms !important;
		}
	}

	.field {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.6rem;
	}

	/* Matches the field view's two-column layout (src/routes/+page.svelte)
	   rather than auto-fill, so cards stay the same size in both places. */
	@media (min-width: 40rem) {
		.field {
			grid-template-columns: repeat(2, 1fr);
			gap: 2rem;
		}
	}
</style>
