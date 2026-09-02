<script>
	/**
	 * The one-time rating and support prompt. Two steps in one dialog: rate the
	 * app, then optionally support it.
	 *
	 * The boundaries this must not cross are argued in docs/decisions.md and
	 * restated in feedbackStore: the rating is about THIS APP, never about a
	 * creator, a Node, or a work; it never ranks or recommends anything; and it
	 * never comes back as a number a visitor can see. It also cannot recur —
	 * the store is marked answered before the request goes out, so a failed
	 * send loses the rating rather than earning a second ask.
	 */
	import Modal from './Modal.svelte';
	import Honeypot from './Honeypot.svelte';
	import { feedbackStore } from '$lib/feedbackStore.svelte.js';
	import { KOFI_URL } from '$lib/config.js';
	import { createAntiBot } from '$lib/antiBot.svelte.js';
	import { submitRating, hasBackend, useMock } from '$lib/ratingApi.js';

	let { open = false, onClose } = $props();

	/** 'rating' asks; 'support' thanks and offers Ko-fi. */
	let step = $state('rating');
	let selected = $state(0);
	let hovered = $state(0);

	// The dwell clock deliberately runs from mount, not from when the dialog
	// opens, which is the same "time since the page was rendered" the other
	// webhook-backed forms send. Resetting it on open was tried and reverted:
	// the prompt itself only appears four seconds in, so a visitor who rates
	// quickly can post an elapsed_ms under n8n's 1500ms dwell gate and be
	// silently bot-dropped. Measuring from mount cannot produce a value the
	// gate rejects, and the gate only ever tests for too-fast.
	const antiBot = createAntiBot();

	const STARS = [1, 2, 3, 4, 5];
	const LABELS = ['Poor', 'Fair', 'Good', 'Great', 'Excellent'];

	/** The filled count follows the pointer before a choice is committed. */
	const shown = $derived(hovered || selected);

	function finish() {
		step = 'rating';
		selected = 0;
		hovered = 0;
		onClose?.();
	}

	/**
	 * Marked answered first, deliberately. A rating nobody is waiting on is not
	 * worth a retry, and it is certainly not worth asking a second time.
	 */
	async function send() {
		if (!selected) return;
		feedbackStore.markAnswered();
		if (hasBackend || useMock) {
			try {
				await submitRating({
					rating: selected,
					website: antiBot.honeypot,
					elapsed_ms: antiBot.elapsedMs
				});
			} catch {
				// Deliberately silent. The visitor did their part; a delivery
				// problem is not their problem to see, and there is nothing
				// useful for them to do about it.
			}
		}
		// Ko-fi is the only reason to continue, so skip straight out when the
		// link is not configured — same "unset means off, not broken" posture
		// AboutModal uses when it drops the Support tab entirely.
		if (KOFI_URL) step = 'support';
		else finish();
	}

	function dismiss() {
		feedbackStore.markAnswered();
		finish();
	}
</script>

<Modal
	{open}
	title={step === 'rating' ? 'How has IndieNodes been for you?' : 'Thanks for helping'}
	onClose={dismiss}
>
	{#if step === 'rating'}
		<p class="prompt-copy">
			This is about IndieNodes itself — how it works and how it feels to explore, not the creators
			or the work you have found here. Asked once, and never again on this device.
		</p>

		<!-- Radios, not buttons: a rating is one choice from a set, and that is
		     what a radio group already means to a screen reader and to the
		     keyboard. The visual stars are the label. -->
		<fieldset class="stars">
			<legend class="sr-only">Rate IndieNodes from 1 to 5</legend>
			{#each STARS as star (star)}
				<label
					class="star"
					class:filled={star <= shown}
					onmouseenter={() => (hovered = star)}
					onmouseleave={() => (hovered = 0)}
				>
					<input
						type="radio"
						name="rating"
						value={star}
						checked={selected === star}
						onchange={() => (selected = star)}
					/>
					<span class="sr-only">{star} — {LABELS[star - 1]}</span>
					<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
						<path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z" />
					</svg>
				</label>
			{/each}
		</fieldset>

		<p class="star-label" aria-live="polite">
			{shown ? LABELS[shown - 1] : ' '}
		</p>

		<!-- Same anti-bot pair every other webhook-backed form here sends. -->
		<Honeypot id="f-rating-website" bind:value={antiBot.honeypot} />

		<div class="prompt-actions">
			<button type="button" class="btn btn-secondary" onclick={dismiss}>Not now</button>
			<button type="button" class="btn btn-primary" disabled={!selected} onclick={send}>
				Send rating
			</button>
		</div>
	{:else}
		<p class="prompt-copy">
			Thanks for helping us improve it. If you would like to help keep IndieNodes independent, you
			can support development on Ko-fi.
		</p>
		<div class="prompt-actions">
			<button type="button" class="btn btn-secondary" onclick={finish}>Not now</button>
			<!-- eslint-disable svelte/no-navigation-without-resolve -- external URL from config.js, not an app route; same as AboutModal's Support tab -->
			<a
				class="btn btn-primary"
				href={KOFI_URL}
				target="_blank"
				rel="noopener noreferrer"
				onclick={finish}
			>
				Support IndieNodes
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	{/if}
</Modal>

<style>
	.prompt-copy {
		margin: 0 0 1.25rem;
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: 1.55;
	}

	.stars {
		display: flex;
		justify-content: center;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		border: 0;
	}

	.star {
		cursor: pointer;
		color: var(--text-faint);
		transition:
			color 0.15s ease,
			transform 0.15s ease;
	}

	.star svg {
		display: block;
		width: 2.4rem;
		height: 2.4rem;
		fill: currentColor;
	}

	.star.filled {
		color: var(--accent);
	}

	.star:hover {
		transform: translateY(-2px);
	}

	/* The radio itself is invisible but still focusable, so keyboard focus
	   lands on a real control and the ring is drawn on the star instead. */
	.star input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.star:focus-within svg {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
		border-radius: 4px;
	}

	.star-label {
		margin: 0.5rem 0 1.25rem;
		color: var(--text-muted);
		font-size: var(--text-xs);
		text-align: center;
		min-height: 1.2em;
	}

	.prompt-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
	}

	.prompt-actions .btn {
		text-decoration: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.star {
			transition: none;
		}

		.star:hover {
			transform: none;
		}
	}
</style>
