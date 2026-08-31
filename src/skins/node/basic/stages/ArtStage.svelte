<script>
	import NodeFallbackIcon from '../../../../components/NodeFallbackIcon.svelte';

	// Art entries contain independent works rather than sequential pages. The
	// stage gives each submitted work equal time, keeps the complete composition
	// visible with `contain`, and uses a quiet dissolve between them. The creator
	// identity and outbound action remain in the app-owned node shell.

	/** @type {{ entry: any, paused?: boolean, motionReduced?: boolean, services?: import('../../../contracts.js').NodeSkinServices, onImageError?: () => void, onStageProgressChange?: (progress: number | null) => void }} */
	let {
		entry,
		paused = false,
		motionReduced = false,
		services,
		onImageError,
		onStageProgressChange
	} = $props();

	const ARTWORK_INTERVAL_MS = 6800;
	/** Matches the host node's progress-fill transition cadence. */
	const TICK_MS = 120;

	/** @type {{ image_url?: string, alt?: string, title?: string, year?: string, medium?: string }[]} */
	const sourceArtworks = $derived(entry.artworks ?? []);
	/** @param {{ image_url?: string }} artwork */
	function hasArtworkImage(artwork) {
		return typeof artwork?.image_url === 'string' && artwork.image_url.length > 0;
	}
	const artworks = $derived(sourceArtworks.filter(hasArtworkImage));

	let index = $state(0);
	let elapsed = $state(0);

	$effect(() => {
		entry.id;
		index = 0;
		elapsed = 0;
	});

	const current = $derived(artworks[index] ?? null);
	const details = $derived(
		[current?.title, current?.medium, current?.year].filter(Boolean).join(' · ')
	);
	const rotating = $derived(artworks.length > 1 && !motionReduced);

	// The field shell owns the common timer bar. Report this stage's own
	// countdown so an Art entry with several works still has a truthful bar
	// when it is the only Art creator in the outer field pool.
	$effect(() => {
		onStageProgressChange?.(rotating ? Math.min(1, elapsed / ARTWORK_INTERVAL_MS) : null);
	});

	$effect(() => {
		if (!rotating) return;

		const timer = setInterval(() => {
			// Read live inside the interval so hover/focus freezes the countdown
			// where it is instead of tearing the clock down and restarting it.
			if (paused) return;
			elapsed += TICK_MS;
			if (elapsed < ARTWORK_INTERVAL_MS) return;
			elapsed = 0;
			index = (index + 1) % artworks.length;
		}, TICK_MS);
		return () => clearInterval(timer);
	});

	$effect(() => {
		const count = artworks.length;
		if (count < 2) return;
		const next = artworks[(index + 1) % count]?.image_url;
		if (next) services?.preloadImage(next);
	});
</script>

{#if current?.image_url}
	{#key current.image_url}
		<figure class="artwork-frame">
			<img
				class="artwork"
				src={current.image_url}
				alt={current.alt ?? ''}
				loading="lazy"
				decoding="async"
				referrerpolicy="no-referrer"
				onerror={() => onImageError?.()}
			/>
			{#if details}
				<figcaption>{details}</figcaption>
			{/if}
		</figure>
	{/key}
{:else}
	<NodeFallbackIcon type="art" />
{/if}

<style>
	.artwork-frame {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 94%;
		height: 94%;
		margin: 0;
		animation: artwork-in 700ms ease;
	}

	.artwork {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		box-shadow: 0 0.55rem 2rem rgb(0 0 0 / 0.38);
	}

	figcaption {
		position: absolute;
		right: 0.45rem;
		bottom: 0.45rem;
		max-width: calc(100% - 0.9rem);
		padding: 0.25rem 0.45rem;
		border-radius: var(--radius-sm);
		background: rgb(10 8 16 / 0.78);
		color: rgb(255 255 255 / 0.9);
		font-size: var(--text-xs);
		line-height: 1.25;
		text-align: right;
	}

	@keyframes artwork-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.artwork-frame {
			animation: none;
		}
	}
</style>
