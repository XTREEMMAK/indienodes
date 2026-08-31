<svelte:options
	customElement={{
		tag: 'indienode-widget',
		shadow: 'open',
		props: { siteId: { attribute: 'site-id', type: 'String' } }
	}}
/>

<script>
	/**
	 * The embeddable webring widget. Compiled to a standalone custom element
	 * (see src/widget/embed.js and vite.widget.config.js), not part of the
	 * main SvelteKit route tree, so it ships with no opinions, no
	 * personalization, and no tracking: just Previous, Next, and Random over
	 * ring.json.
	 *
	 * Rendered in an open shadow root, so a host page's stylesheet cannot
	 * reach in and this widget's styles cannot leak out. That is what "degrade
	 * gracefully inside someone else's stylesheet" means in practice: nothing
	 * to degrade, because there is no shared cascade to begin with.
	 *
	 * Two lines: the ring's mark and name, then the three controls. It used to
	 * also preview the current entry (badge, title, creator, why, a Visit
	 * link), which made it a card roughly the size of a sidebar ad on a
	 * member's own page. A webring badge is meant to be a small, quiet piece
	 * of furniture on someone else's site, so the preview is gone and the
	 * buttons do what a webring's buttons have always done: take you to
	 * another member.
	 *
	 * `site-id` is optional and is what makes Previous and Next mean anything:
	 * a webring's neighbours are relative to *which member you are currently
	 * on*, and an embedded script has no way to know that on its own. A member
	 * pasting the snippet sets it to their own ring.json `id`. Without it the
	 * widget picks a random starting point instead of silently pretending
	 * everyone is entry zero, so Next at least still walks the ring rather
	 * than funnelling every site's visitors to the same first member.
	 */
	import { loadRing } from '../lib/ring.js';
	import { RING_ENDPOINT_URL, RING_JSON_URL, SITE_ORIGIN } from '../lib/config.js';
	import { MARK_DATA_URI } from './mark.js';

	let { siteId = '' } = $props();

	/** @type {import('../lib/ring.js').RingEntry[]} */
	let entries = $state([]);
	let index = $state(0);
	let loading = $state(true);
	let error = $state(false);

	$effect(() => {
		loadRing(fetch, RING_ENDPOINT_URL, RING_JSON_URL)
			.then((loaded) => {
				entries = loaded;
				const own = siteId ? loaded.findIndex((entry) => entry.id === siteId) : -1;
				index = own >= 0 ? own : Math.floor(Math.random() * Math.max(1, loaded.length));
				loading = false;
			})
			.catch(() => {
				error = true;
				loading = false;
			});
	});

	const ready = $derived(!loading && !error && entries.length > 0);
	// Two or more, because "the next member" is meaningless in a ring of one,
	// and every control here would just reload the member's own site.
	const canTravel = $derived(ready && entries.length > 1);

	/**
	 * Opens a member's site in a new tab rather than navigating the host page
	 * away. A classic webring replaced the whole page, but this widget is a
	 * script running inside someone else's site, and taking their visitor off
	 * it without asking is not ours to do.
	 * @param {number} target
	 */
	function travelTo(target) {
		const entry = entries[((target % entries.length) + entries.length) % entries.length];
		if (!entry) return;
		index = entries.indexOf(entry);
		window.open(entry.source_url, '_blank', 'noopener,noreferrer');
	}

	function next() {
		if (canTravel) travelTo(index + 1);
	}

	function prev() {
		if (canTravel) travelTo(index - 1);
	}

	function random() {
		if (!canTravel) return;
		let target = index;
		while (target === index) target = Math.floor(Math.random() * entries.length);
		travelTo(target);
	}
</script>

<div class="widget" role="region" aria-label="IndieNodes webring">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link out to the IndieNodes site, and this bundle has no SvelteKit router to resolve() against -->
	<a class="brand" href={SITE_ORIGIN} target="_blank" rel="noopener noreferrer">
		<!-- The real IndieNodes mark, inlined as a data URI rather than fetched:
		     this runs on someone else's origin, where an <img src="https://…">
		     is a second request their CSP, an ad blocker, or a flaky network
		     can fail independently of the script that drew it. Inlining keeps
		     the "cannot fail to load" property the old hand-drawn SVG had.

		     It replaces that SVG, which was a *different* mark: four type-color
		     nodes, three large and one small. That is not the brand logo, so
		     the widget was showing host pages something the site itself does
		     not use anywhere a visitor would recognise it. Generated from the
		     master by scripts/generate-icons.js into ./mark.js. -->
		<img class="mark" src={MARK_DATA_URI} width="22" height="22" alt="" />
		<span class="wordmark">IndieNodes</span>
	</a>

	<div class="controls">
		<button type="button" onclick={prev} disabled={!canTravel}>&larr; Prev</button>
		<button type="button" onclick={random} disabled={!canTravel}>Random</button>
		<button type="button" onclick={next} disabled={!canTravel}>Next &rarr;</button>
	</div>

	{#if loading}
		<p class="status" aria-live="polite">Loading the ring...</p>
	{:else if error}
		<p class="status" aria-live="polite">The ring is unavailable right now.</p>
	{:else if entries.length < 2}
		<p class="status" aria-live="polite">The ring has no other members yet.</p>
	{/if}
</div>

<style>
	:host {
		all: initial;
		color-scheme: light dark;

		--bg: #fdfcf9;
		--border: #ddd6c8;
		--text: #221f1a;
		--text-muted: #6b6558;
		--accent: #b5502f;
		--control-bg: #f7f4ee;
		--control-bg-hover: #efe9dc;
	}

	@media (prefers-color-scheme: dark) {
		:host {
			--bg: #1a1712;
			--border: #3a362b;
			--text: #f2ede2;
			--text-muted: #b3a996;
			--accent: #e08a5f;
			--control-bg: #221f1a;
			--control-bg-hover: #2b271f;
		}
	}

	.widget {
		display: block;
		box-sizing: border-box;
		/* Narrower than the old preview card, which ran to 22rem: this is a
		   badge now, not a panel. */
		max-width: 15rem;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 0.7rem;
		background: var(--bg);
		color: var(--text);
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 1rem;
		line-height: 1.4;
	}

	.widget * {
		box-sizing: border-box;
	}

	.brand {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		color: inherit;
		text-decoration: none;
	}

	.wordmark {
		font-weight: 700;
		font-size: 1.05rem;
		letter-spacing: 0.01em;
	}

	/* A slow breath rather than a spin: this sits on someone else's page
	   indefinitely, so it has to stay in the corner of the eye rather than
	   pull attention off their content.

	   The whole mark breathes as one now. The previous version staggered the
	   four nodes independently, which a single raster image cannot do; that
	   is the one thing given up by using the real logo instead of a redrawn
	   approximation of it, and a quieter idle animation is a fair trade for
	   the widget showing the actual brand. */
	.mark {
		display: block;
		animation: mark-breathe 3.2s ease-in-out infinite;
		transition: transform 260ms ease;
	}

	@keyframes mark-breathe {
		0%,
		70%,
		100% {
			opacity: 0.9;
		}
		35% {
			opacity: 1;
		}
	}

	/* Hovering the badge tilts the mark, so it acknowledges the pointer
	   without becoming a second animation competing with the idle one. */
	.brand:hover .mark {
		transform: rotate(-8deg) scale(1.06);
	}

	@media (prefers-reduced-motion: reduce) {
		.mark,
		.brand:hover .mark {
			animation: none;
			transition: none;
			transform: none;
			opacity: 1;
		}
	}

	.controls {
		display: flex;
		gap: 0.35rem;
		margin-top: 0.55rem;
	}

	button {
		flex: 1;
		padding: 0.35rem 0.3rem;
		border: 1px solid var(--border);
		border-radius: 0.4rem;
		background: var(--control-bg);
		color: inherit;
		font: inherit;
		font-size: 0.85rem;
		white-space: nowrap;
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: var(--control-bg-hover);
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.status {
		margin: 0.5rem 0 0;
		color: var(--text-muted);
		font-size: 0.8rem;
		text-align: center;
	}
</style>
