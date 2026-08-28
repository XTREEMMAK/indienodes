<script>
	import NodeFallbackIcon from '../../../../components/NodeFallbackIcon.svelte';

	// Comic entry's presentation, drawn over the card's blurred backdrop.
	//
	// The page is shown unedited: contained, uncropped, no zoom, no pan. A
	// comic page is composed art where the panel borders and gutters are part
	// of the work, so cropping it to fill a card cuts through panels and the
	// slow zoom this used to have drifted across it like a slideshow effect
	// applied to someone else's drawing. Whatever space the page does not
	// fill is taken by the blurred copy behind it.
	//
	// The card now cycles through the entry's pages on its own timer rather
	// than showing page one forever. This is the same idea as the field's own
	// per-node rotation, one level down: the node holds an entry for a while,
	// and while it does, the entry shows what it has. A comic that submitted
	// three pages had two of them invisible until the reader existed.
	//
	// Two rules it inherits from the field's rotation, for the same reasons:
	// it pauses when the tab is hidden, and it stops entirely under
	// prefers-reduced-motion rather than merely slowing down, because this is
	// content changing under you rather than a decorative flourish.
	//
	// Prose in line comments and the type on one line: a multi-line block
	// comment here gets hoisted into a `var` declaration in the emitted JS
	// and breaks the production build while passing every other check.

	/** @type {{ entry: any, cover?: string | null, hasImage?: boolean, paused?: boolean, motionReduced?: boolean, services?: import('../../../contracts.js').NodeSkinServices, onImageError?: () => void }} */
	let {
		entry,
		cover = null,
		hasImage = false,
		paused = false,
		motionReduced = false,
		services,
		onImageError
	} = $props();

	const PAGE_INTERVAL_MS = 5200;

	// Only pages that actually carry an image. An entry whose `pages` is
	// empty or malformed falls back to the cover, which is what the card
	// showed before this existed.
	// Typed on its own line, never as an inline cast inside the expression.
	// An inline JSDoc cast in an expression position (including an arrow
	// function's parameter list) emits JS that Svelte's own parser accepts
	// and both rolldown and Vite's SSR transform reject, with `npm run check`,
	// `npm run lint`, and even `npm run build` all passing. That is the trap
	// docs/decisions.md records having cost real time three times; this is the
	// fourth, and the first to surface as a dev-server 500 rather than a build
	// failure. A block comment above a plain `const` is the safe form.
	/** @type {{ image_url?: string, caption?: string }[]} */
	const pages = $derived(entry.pages ?? []);

	const pageImages = $derived(
		pages.map((page) => page?.image_url).filter((url) => typeof url === 'string' && url.length > 0)
	);

	let index = $state(0);

	// Reset when the entry changes: a slot reuses this component across
	// rotations, so page 3 of the previous comic must not become the starting
	// index of the next one.
	$effect(() => {
		entry.id;
		index = 0;
	});

	const current = $derived(pageImages[index] ?? cover);
	const caption = $derived(pages[index]?.caption ?? '');

	$effect(() => {
		const count = pageImages.length;
		const isPaused = paused;
		const still = motionReduced;
		if (count < 2 || isPaused || still) return;

		const timer = setInterval(() => {
			index = (index + 1) % count;
		}, PAGE_INTERVAL_MS);
		return () => clearInterval(timer);
	});

	// Warm the next page while the current one is on screen, through the same
	// capped, deduped preloader the field uses for cover images, so a flip
	// does not show an empty frame on a slow connection.
	$effect(() => {
		const count = pageImages.length;
		if (count < 2) return;
		const next = pageImages[(index + 1) % count];
		if (next) services?.preloadImage(next);
	});
</script>

{#if hasImage && current}
	{#key current}
		<img
			class="page"
			src={current}
			alt={caption ? `Page: ${caption}` : ''}
			onerror={() => onImageError?.()}
		/>
	{/key}
{:else}
	<NodeFallbackIcon type="comic" />
{/if}

<style>
	.page {
		max-width: 100%;
		max-height: 100%;
		/* contain, not cover: the whole page, exactly as drawn. */
		object-fit: contain;
		box-shadow: 0 0.4rem 1.6rem rgb(0 0 0 / 0.4);
		animation: page-in 420ms ease;
	}

	/* A cross-dissolve rather than a slide or a page-turn: the roadmap's
	   comic-book treatment owns page-turning, and doing a cheap version of it
	   here would preempt that with something that reads as a slideshow. */
	@keyframes page-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.page {
			animation: none;
		}
	}
</style>
