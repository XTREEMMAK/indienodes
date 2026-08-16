<script>
	// Text entry's presentation, drawn over the card's blurred backdrop.
	//
	// The one type that fills rather than contains. A text entry's image is a
	// header or social card, not a composed artefact in its own right: it is
	// already made to be cropped, and letterboxing it over a blur would give
	// it a reverence it was not designed for. Entries with no image fall
	// through to the card's plain type-colour wash.
	//
	// This is the seam where the roadmap's book treatment lands, as would any
	// use of the entry's `excerpt`, which the card does not surface yet.
	//
	// Prose in line comments and the type on one line: a multi-line block
	// comment here gets hoisted into a `var` declaration in the emitted JS
	// and breaks the production build while passing every other check.

	/** @type {{ cover?: string | null, hasImage?: boolean, onImageError?: () => void }} */
	let { cover = null, hasImage = false, onImageError } = $props();
</script>

{#if hasImage && cover}
	<img
		class="header-image"
		src={cover}
		alt=""
		aria-hidden="true"
		onerror={() => onImageError?.()}
	/>
{/if}

<style>
	.header-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
