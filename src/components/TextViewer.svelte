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
</script>

<Modal {open} {title} dialogClass="text-viewer" {onClose}>
	{#each samples as sample, i (i)}
		<article class="sample">
			<div class="sample-body">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized above -->
				{@html sanitizeExcerptHtml(sample.text ?? '')}
			</div>
			{#if entry}
				<TextSpeechButton {entry} excerptIndex={i} />
			{/if}
		</article>
		{#if i < samples.length - 1}
			<hr class="divider" />
		{/if}
	{/each}
</Modal>

<style>
	:global(.text-viewer) {
		--node-color: var(--type-text);
		max-width: 40rem;
	}

	.sample {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 0.5rem 0;
	}

	.sample-body {
		flex: 1;
		line-height: 1.65;
	}

	.sample-body :global(p) {
		margin: 0 0 0.8em;
	}

	.sample-body :global(p:last-child) {
		margin-bottom: 0;
	}

	.divider {
		margin: 1.25rem 0;
		border: none;
		border-top: 1px solid var(--border);
	}
</style>
