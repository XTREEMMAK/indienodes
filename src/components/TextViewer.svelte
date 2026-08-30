<script>
	/**
	 * Full-sample reader for a text entry: every excerpt the creator
	 * submitted, each with its own play control (their own recording, or an
	 * automatic read-aloud — same choice `TextSpeechButton` already makes for
	 * whichever excerpt a card is currently showing).
	 *
	 * Built on `Modal` rather than `ComicViewer`: that one is a tightly
	 * image/page-specific pan-and-zoom gesture engine with no text-rendering
	 * path to extend, while `Modal` is deliberately content-agnostic and
	 * already gives every other "read more in an overlay" surface in this app
	 * the same backdrop/Escape/scroll-lock mechanics.
	 *
	 * Samples are tabbed rather than stacked. Stacked, several samples ran
	 * together into one column of prose with nothing but a rule between them,
	 * and a rule is a weak signal for "this is a different piece of writing by
	 * the same person" — which is exactly what a sample is. A tab per sample
	 * makes each one a place you go rather than a thing you scroll past, and
	 * it means the play control on screen is unambiguously the control for the
	 * sample you are reading. The schema caps samples at three, so the strip
	 * never grows into a navigation problem of its own.
	 */
	import Modal from './Modal.svelte';
	import TextSpeechButton from './TextSpeechButton.svelte';
	import { sanitizeExcerptHtml } from '$lib/ring.js';

	/** @type {{ open?: boolean, entry?: import('$lib/ring.js').RingEntry | null, onClose?: () => void }} */
	let { open = false, entry = null, onClose = () => {} } = $props();

	/** @param {{ text?: string }} sample */
	function hasSampleText(sample) {
		return Boolean(sample?.text?.trim());
	}

	const samples = $derived((entry?.excerpts ?? []).filter(hasSampleText));
	const title = $derived(entry?.creator ? `${entry.creator}'s writing` : 'Text sample');

	let active = $state(0);

	// A different entry starts at its first sample rather than inheriting the
	// tab index of whatever was open before — the reader is a singleton, so
	// without this, opening a two-sample entry after a three-sample one could
	// land on a tab that no longer exists.
	$effect(() => {
		entry?.id;
		active = 0;
	});

	const current = $derived(samples[active] ?? null);

	/**
	 * Left/right arrows move between tabs, which is the behavior a tablist is
	 * expected to have; without it the strip is reachable but not operable in
	 * the way a screen reader user is told it will be.
	 * @param {KeyboardEvent} event
	 */
	function handleTabKeys(event) {
		if (samples.length < 2) return;
		const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!delta) return;
		event.preventDefault();
		active = (active + delta + samples.length) % samples.length;
		/** @type {HTMLElement | null} */
		const next = document.querySelector(`#text-sample-tab-${active}`);
		next?.focus();
	}
</script>

<Modal {open} {title} dialogClass="text-viewer" {onClose}>
	{#if samples.length > 1}
		<div class="tabs" role="tablist" aria-label="Writing samples">
			{#each samples, i (i)}
				<!-- Roving tabindex: only the selected tab is in the tab order, and
				     the arrow keys move between them from there. The handler sits on
				     the tabs rather than the strip because the strip itself is never
				     focused, so a keydown bound to it would only ever fire by
				     bubbling from here anyway. -->
				<button
					type="button"
					role="tab"
					id="text-sample-tab-{i}"
					class="tab"
					class:active={active === i}
					aria-selected={active === i}
					aria-controls="text-sample-panel-{i}"
					tabindex={active === i ? 0 : -1}
					onclick={() => (active = i)}
					onkeydown={handleTabKeys}
				>
					{samples[i]?.title?.trim() || `Sample ${i + 1}`}
				</button>
			{/each}
		</div>
	{/if}

	{#if current}
		{#key active}
			<div
				class="sample"
				role="tabpanel"
				id="text-sample-panel-{active}"
				aria-labelledby={samples.length > 1 ? `text-sample-tab-${active}` : undefined}
			>
				<div class="sample-head">
					<!-- The creator's own title when there is one, since that is what
					     the piece is actually called; the positional label is only a
					     stand-in for an untitled excerpt. -->
					<h3>
						{current.title?.trim() ||
							`Sample ${active + 1}${samples.length > 1 ? ` of ${samples.length}` : ''}`}
					</h3>
					{#if entry}
						<TextSpeechButton {entry} excerptIndex={active} />
					{/if}
				</div>
				<div class="sample-body">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized above -->
					{@html sanitizeExcerptHtml(current.text ?? '')}
				</div>
			</div>
		{/key}
	{/if}
</Modal>

<style>
	:global(.text-viewer) {
		--node-color: var(--type-text);
		max-width: 40rem;
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		border-bottom: 1px solid var(--border);
		margin-bottom: 1.4rem;
	}

	.tab {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 0.2rem 0.75rem;
		margin-bottom: -1px;
		border: none;
		border-bottom: 2px solid transparent;
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.tab:hover {
		color: var(--text);
	}

	.tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	/* The heading carries the separation a rule used to be asked to carry, and
	   pairs the sample with its own play control on the same line so "read
	   this one aloud" is unambiguous about which one it means. */
	.sample-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}

	.sample-head h3 {
		margin: 0;
		font-size: var(--text-sm);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.sample-body {
		line-height: 1.65;
	}

	.sample-body :global(p) {
		margin: 0 0 0.8em;
	}

	.sample-body :global(p:last-child) {
		margin-bottom: 0;
	}

	/* The reader has room for a real heading scale, unlike the card, but a
	   sample is still a few paragraphs rather than a document — so these stay
	   below the dialog's own title rather than competing with it. */
	.sample-body :global(h1),
	.sample-body :global(h2),
	.sample-body :global(h3) {
		margin: 1.2em 0 0.5em;
		font-weight: 700;
		line-height: 1.25;
	}

	.sample-body :global(h1) {
		font-size: 1.35em;
	}

	.sample-body :global(h2) {
		font-size: 1.2em;
	}

	.sample-body :global(h3) {
		font-size: 1.08em;
	}

	.sample-body :global(:first-child) {
		margin-top: 0;
	}

	.sample-body :global(blockquote) {
		margin: 0 0 0.8em;
		padding-left: 1em;
		border-left: 3px solid var(--border);
		color: var(--text-muted);
	}

	.sample-body :global(ul),
	.sample-body :global(ol) {
		margin: 0 0 0.8em;
		padding-left: 1.4em;
	}
</style>
