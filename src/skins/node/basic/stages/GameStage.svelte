<script>
	import { onDestroy } from 'svelte';
	import NodeFallbackIcon from '../../../../components/NodeFallbackIcon.svelte';
	import { youtubeEmbedUrl } from '$lib/videoPreview.js';

	// A direct `preview_url` remains the lightweight, muted teaser existing game
	// nodes already use. `trailer_url` is separate: its YouTube iframe does not
	// exist until the visitor explicitly presses Watch trailer.
	/** @type {{ entry: any, cover?: string | null, hasImage?: boolean, motionReduced?: boolean, onImageError?: () => void, onTrailerChange?: (open: boolean) => void }} */
	let {
		entry,
		cover = null,
		hasImage = false,
		motionReduced = false,
		onImageError,
		onTrailerChange
	} = $props();

	let videoEl = $state(/** @type {HTMLVideoElement | undefined} */ (undefined));
	let videoFailed = $state(false);
	let onScreen = $state(false);
	let trailerOpen = $state(false);

	const coverPosition = $derived(
		`${entry.thumb_position?.x ?? 50}% ${entry.thumb_position?.y ?? 50}%`
	);
	const previewUrl = $derived(entry.preview_url ?? null);
	const trailerEmbedUrl = $derived(youtubeEmbedUrl(entry.trailer_url));
	const showVideo = $derived(!!previewUrl && !videoFailed && !motionReduced && !trailerOpen);

	$effect(() => {
		const el = videoEl;
		if (!el) return;

		const observer = new IntersectionObserver(
			([entryRecord]) => (onScreen = entryRecord?.isIntersecting ?? false),
			{ threshold: 0.25 }
		);
		observer.observe(el);
		return () => observer.disconnect();
	});

	$effect(() => {
		const el = videoEl;
		const play = onScreen && showVideo;
		if (!el) return;
		if (play) el.play().catch(() => {});
		else el.pause();
	});

	/** @param {MouseEvent} event */
	function openTrailer(event) {
		event.stopPropagation();
		if (!trailerEmbedUrl) return;
		trailerOpen = true;
		onTrailerChange?.(true);
	}

	/** @param {MouseEvent} [event] */
	function closeTrailer(event) {
		event?.stopPropagation();
		trailerOpen = false;
		onTrailerChange?.(false);
	}

	onDestroy(() => {
		onTrailerChange?.(false);
	});
</script>

{#if showVideo && previewUrl}
	<video
		bind:this={videoEl}
		class="preview"
		src={previewUrl}
		poster={cover ?? undefined}
		muted
		loop
		playsinline
		preload="metadata"
		aria-hidden="true"
		onerror={() => (videoFailed = true)}
	></video>
{:else if hasImage && cover}
	<img
		class="shot"
		src={cover}
		alt=""
		aria-hidden="true"
		referrerpolicy="no-referrer"
		style:object-position={coverPosition}
		onerror={() => onImageError?.()}
	/>
{:else}
	<NodeFallbackIcon type="game" />
{/if}

{#if trailerEmbedUrl && !trailerOpen}
	<button
		type="button"
		class="trailer-button"
		onclick={openTrailer}
		aria-label={`Watch ${entry.creator}'s game trailer`}
		title="Watch trailer"
	>
		<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5 19 12 8 18.5v-13Z" /></svg>
		<span>Trailer</span>
	</button>
{/if}

{#if trailerOpen && trailerEmbedUrl}
	<div class="game-trailer-open">
		<iframe
			src={trailerEmbedUrl}
			title={`${entry.creator} game trailer`}
			allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
			allowfullscreen
			referrerpolicy="strict-origin-when-cross-origin"
		></iframe>
		<button type="button" class="close-trailer" onclick={closeTrailer} aria-label="Close trailer">
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
		</button>
	</div>
{/if}

<style>
	.preview,
	.shot {
		max-width: 92%;
		max-height: 92%;
		border-radius: var(--radius-sm);
		box-shadow: 0 0.6rem 2rem rgb(0 0 0 / 0.45);
	}

	.preview {
		object-fit: contain;
	}

	.shot {
		width: 92%;
		height: 92%;
		object-fit: cover;
	}

	.trailer-button {
		position: absolute;
		top: 50%;
		left: 50%;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid rgb(255 255 255 / 0.28);
		border-radius: 999px;
		background: rgb(12 11 10 / 0.82);
		box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.42);
		color: white;
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 700;
		cursor: pointer;
		transform: translate(-50%, -50%);
		backdrop-filter: blur(8px);
	}

	.trailer-button:hover,
	.trailer-button:focus-visible {
		background: var(--node-color);
		color: var(--bg-elevated);
	}

	.trailer-button svg {
		width: 1rem;
		height: 1rem;
		fill: currentColor;
	}

	.game-trailer-open {
		position: absolute;
		inset: 0.45rem;
		display: grid;
		place-items: center;
		border-radius: var(--radius-sm);
		background: #000;
		overflow: hidden;
	}

	.game-trailer-open iframe {
		width: 100%;
		height: 100%;
		border: 0;
	}

	.close-trailer {
		position: absolute;
		top: 0.45rem;
		right: 0.45rem;
		display: inline-grid;
		width: 2.25rem;
		height: 2.25rem;
		place-items: center;
		border: 1px solid rgb(255 255 255 / 0.3);
		border-radius: 999px;
		background: rgb(0 0 0 / 0.78);
		color: white;
		cursor: pointer;
	}

	.close-trailer svg {
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}
</style>
