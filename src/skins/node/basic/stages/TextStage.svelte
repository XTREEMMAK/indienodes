<script>
	import NodeFallbackIcon from '../../../../components/NodeFallbackIcon.svelte';
	import { sanitizeExcerptHtml } from '$lib/ring.js';

	// Text entry's presentation, drawn over the card's blurred backdrop.
	//
	// The one type that fills rather than contains. A text entry's image is a
	// header or social card, not a composed artefact in its own right: it is
	// already made to be cropped, and letterboxing it over a blur would give
	// it a reverence it was not designed for. Entries with no image use the
	// shared paper-and-pencil mark over the card's type-colour wash.
	//
	// The card now surfaces the entry's own words rather than only its cover:
	// one sample at a time, laid over whichever background above already
	// applies. Same idea as the field's own per-node rotation and Comic's own
	// page cycling, one level down — see this stage's own rotation effect
	// below for the two rules it inherits from both for the same reasons.
	//
	// Sanitized again here even though `toRingEntry` already sanitizes on the
	// way in: this stage renders untrusted third-party ring.json data (a
	// hand-edited entry, or one from a source that skipped the form), not
	// only entries this app's own submission flow produced.
	//
	// Prose in line comments and the type on one line: a multi-line block
	// comment here gets hoisted into a `var` declaration in the emitted JS
	// and breaks the production build while passing every other check.

	/** @type {{ entry: any, cover?: string | null, hasImage?: boolean, paused?: boolean, motionReduced?: boolean, onImageError?: () => void, onExcerptChange?: (index: number) => void }} */
	let {
		entry,
		cover = null,
		hasImage = false,
		paused = false,
		motionReduced = false,
		onImageError,
		onExcerptChange
	} = $props();

	const EXCERPT_INTERVAL_MS = 9000;

	/** @param {{ text?: string }} sample */
	function hasSampleText(sample) {
		return Boolean(sample?.text?.trim());
	}

	/** @type {{ text?: string, audio_url?: string }[]} */
	const samples = $derived((entry.excerpts ?? []).filter(hasSampleText));

	let index = $state(0);

	$effect(() => {
		entry.id;
		index = 0;
		onExcerptChange?.(0);
	});

	const current = $derived(samples[index] ?? null);

	// Pauses when the tab is hidden or the visitor is on this node (`paused`),
	// and stops entirely under prefers-reduced-motion rather than merely
	// slowing down, because this is content changing under you rather than a
	// decorative flourish — the same two rules ComicStage's own rotation
	// follows, for the same reasons.
	$effect(() => {
		const count = samples.length;
		if (count < 2 || paused || motionReduced) return;

		const timer = setInterval(() => {
			index = (index + 1) % count;
			onExcerptChange?.(index);
		}, EXCERPT_INTERVAL_MS);
		return () => clearInterval(timer);
	});
</script>

<div class="header" class:has-image={hasImage}>
	{#if hasImage && cover}
		<img class="header-image" src={cover} alt="" aria-hidden="true" onerror={() => onImageError?.()} />
	{:else}
		<NodeFallbackIcon type="text" />
	{/if}
</div>

{#if current}
	{#key index}
		<div class="excerpt" class:has-image={hasImage}>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized above -->
			{@html sanitizeExcerptHtml(current.text ?? '')}
		</div>
	{/key}
{/if}

<style>
	.header {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.header-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* Sits in the same stacking context as `.header`, after it in the DOM, so
	   it paints on top without needing its own z-index — FieldNode's `.scrim`
	   (tuned deeper for text than any other type; see its own CSS) still
	   layers above both, which is what keeps this legible over an arbitrary
	   photo rather than this stage inventing a second darkening mechanism. */
	.excerpt {
		position: relative;
		max-width: 92%;
		max-height: 78%;
		padding: 0.5rem 0.25rem;
		overflow: hidden;
		font-size: 1.1rem;
		line-height: 1.5;
		text-align: center;
		animation: excerpt-in 500ms ease;
	}

	.excerpt :global(p) {
		margin: 0 0 0.6em;
	}

	.excerpt :global(p:last-child) {
		margin-bottom: 0;
	}

	.excerpt :global(a) {
		color: inherit;
		text-decoration: underline;
	}

	/* Clamped rather than scrolling: this is a preview on a card, not the
	   reader — the full sample is one tap away via the Read button. */
	.excerpt {
		display: -webkit-box;
		-webkit-line-clamp: 8;
		line-clamp: 8;
		-webkit-box-orient: vertical;
	}

	/* Matches FieldNode's own split: a real photo behind this pins the text to
	   a fixed light color regardless of theme, the same as the creator-name/
	   why band; the flat type-color wash defers to the theme's own contrast
	   instead. */
	.excerpt.has-image {
		color: #f2ede2;
	}

	.excerpt:not(.has-image) {
		color: var(--text);
	}

	@keyframes excerpt-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.excerpt {
			animation: none;
		}
	}
</style>
