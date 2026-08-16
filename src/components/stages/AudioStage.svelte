<script>
	// Audio entry's presentation, drawn over the card's blurred backdrop.
	//
	// Album art contained rather than cropped, sitting on a blurred copy of
	// itself. Cover art is composed as a square and usually has its title
	// somewhere near an edge, so filling a wide card with it crops exactly
	// the part worth seeing. Contain keeps the whole sleeve, and the blurred
	// bed behind fills the leftover space with something that belongs to the
	// same image instead of an unrelated flat colour.
	//
	// This is the seam where the roadmap's record player treatment lands.
	// The pulsing bars are the placeholder for entries with no art at all.
	//
	// Prose in line comments and the type on one line: a multi-line block
	// comment here gets hoisted into a `var` declaration in the emitted JS
	// and breaks the production build while passing every other check.

	/** @type {{ cover?: string | null, hasImage?: boolean, onImageError?: () => void }} */
	let { cover = null, hasImage = false, onImageError } = $props();

	const WAVEFORM_BARS = [0, 1, 2, 3, 4];
</script>

{#if hasImage && cover}
	<img class="art" src={cover} alt="" aria-hidden="true" onerror={() => onImageError?.()} />
{:else}
	<div class="waveform" aria-hidden="true">
		{#each WAVEFORM_BARS as i (i)}
			<span class="bar" style:animation-delay={`${i * 0.15}s`}></span>
		{/each}
	</div>
{/if}

<style>
	.art {
		max-width: 82%;
		max-height: 82%;
		object-fit: contain;
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
