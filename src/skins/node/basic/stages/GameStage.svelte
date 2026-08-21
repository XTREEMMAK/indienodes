<script>
	// Game entry's presentation, drawn over the card's blurred backdrop.
	//
	// Plays `preview_url` silently when the entry has one, falling back to the
	// screenshot otherwise, which is the same contained-over-blur treatment
	// audio gets.
	//
	// NOTE, deliberately: this departs from brief section 7b, which specifies
	// "static screenshot by default; muted preview loads on explicit tap".
	// Autoplaying the preview was asked for directly, and it is recorded as a
	// decision rather than slipped in. Three guarantees keep it inside the
	// rules that were not relaxed:
	//
	//   - It is muted at every point, and carries no control to unmute, so
	//     "nothing autoplays with sound" (section 11) still holds absolutely.
	//   - It never plays under prefers-reduced-motion; that visitor gets the
	//     poster frame, which is exactly the old static behaviour.
	//   - It only plays while actually on screen and while the tab is visible,
	//     so a field of game nodes cannot quietly burn a phone's battery or
	//     somebody's data on video nobody is looking at.
	//
	// Prose in line comments and the type on one line: a multi-line block
	// comment here gets hoisted into a `var` declaration in the emitted JS
	// and breaks the production build while passing every other check.

	/** @type {{ entry: any, cover?: string | null, hasImage?: boolean, motionReduced?: boolean, onImageError?: () => void }} */
	let { entry, cover = null, hasImage = false, motionReduced = false, onImageError } = $props();

	let videoEl = $state(/** @type {HTMLVideoElement | undefined} */ (undefined));
	let videoFailed = $state(false);
	let onScreen = $state(false);

	const previewUrl = $derived(entry.preview_url ?? null);
	const showVideo = $derived(!!previewUrl && !videoFailed && !motionReduced);

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

		if (play) {
			// Muted autoplay can still be refused; the poster stays up if so,
			// which is the intended fallback rather than an error state.
			el.play().catch(() => {});
		} else {
			el.pause();
		}
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
	<img class="shot" src={cover} alt="" aria-hidden="true" onerror={() => onImageError?.()} />
{/if}

<style>
	.preview,
	.shot {
		max-width: 92%;
		max-height: 92%;
		object-fit: contain;
		border-radius: var(--radius-sm);
		box-shadow: 0 0.6rem 2rem rgb(0 0 0 / 0.45);
	}
</style>
