<script>
	// Audio entry's presentation, drawn over the card's blurred backdrop.
	//
	// Album art fills a fixed square inset instead of shrinking when the source
	// image is rectangular. The stored normalized focal point controls the crop,
	// while the same image remains as the blurred bed behind it. Older entries
	// without a focal point stay centered.
	//
	// This is Basic Nodes' audio stage; richer skins provide their own stage.
	// The pulsing bars are the placeholder for entries with no art at all.
	//
	// Prose in line comments and the type on one line: a multi-line block
	// comment here gets hoisted into a `var` declaration in the emitted JS
	// and breaks the production build while passing every other check.

	/** @type {{ entry: any, cover?: string | null, hasImage?: boolean, onImageError?: () => void }} */
	let { entry, cover = null, hasImage = false, onImageError } = $props();
	const coverPosition = $derived(
		`${entry.thumb_position?.x ?? 50}% ${entry.thumb_position?.y ?? 50}%`
	);

	const WAVEFORM_BARS = [0, 1, 2, 3, 4];
</script>

{#if hasImage && cover}
	<img
		class="art"
		src={cover}
		alt=""
		aria-hidden="true"
		referrerpolicy="no-referrer"
		style:object-position={coverPosition}
		onerror={() => onImageError?.()}
	/>
{:else}
	<div class="waveform" aria-hidden="true">
		{#each WAVEFORM_BARS as i (i)}
			<span class="bar" style:animation-delay={`${i * 0.15}s`}></span>
		{/each}
	</div>
{/if}

<style>
	.art {
		width: 82%;
		height: 82%;
		object-fit: cover;
		border-radius: var(--radius-sm);
		/* Lifts the sleeve off its own blurred bed so the two read as
		   foreground and background rather than one smeared image. */
		box-shadow: 0 0.6rem 2rem rgb(0 0 0 / 0.45);
	}

	.waveform {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		height: 45%;
		padding: 0 1rem;
	}

	.bar {
		width: 0.6rem;
		align-self: flex-end;
		background: var(--bg-elevated);
		border-radius: 999px;
		animation: pulse 1.4s ease-in-out infinite;
	}

	@media (prefers-reduced-motion: reduce) {
		.bar {
			animation: none;
			height: 40%;
		}
	}

	@keyframes pulse {
		0%,
		100% {
			height: 25%;
		}
		50% {
			height: 100%;
		}
	}
</style>
