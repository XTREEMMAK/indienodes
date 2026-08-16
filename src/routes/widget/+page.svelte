<script>
	// This page is a demo and embed-snippet reference for site owners; it is
	// not the widget itself. The widget is a standalone custom element
	// (src/widget/), built separately (vite.widget.config.js) into
	// static/embed.js, and rendered here by loading that same script a host
	// page would load. It carries none of this app's chrome, theme, or
	// ambient background: the <indienode-widget> element below is isolated in
	// its own shadow root regardless of what page it sits on.
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import GlassPanel from '../../components/GlassPanel.svelte';
	import { SITE_ORIGIN } from '$lib/config.js';
	import { embedSnippet } from './embed-snippet.js';

	let ready = $state(false);

	onMount(() => {
		if (!browser) return;
		// A plain DOM script tag rather than a dynamic import(): /embed.js is
		// a static asset outside this project's module graph, exactly the way
		// a site embedding the widget would load it, and a bundler has
		// nothing to statically analyze here.
		const script = document.createElement('script');
		script.type = 'module';
		script.src = '/embed.js';
		script.onload = () => {
			ready = true;
		};
		document.head.appendChild(script);
	});

	const snippet = embedSnippet(SITE_ORIGIN);
</script>

<svelte:head>
	<title>Widget, IndieNodes</title>
</svelte:head>

<div class="widget-page">
	<h1>Embeddable widget</h1>

	<GlassPanel as="section" class="widget-section">
		<p>
			The classic webring behavior: Previous, Next, Random, over the same <code>ring.json</code>
			everything else here reads. Paste it onto your own site and it brings none of this app's chrome
			or opinions with it, no theme, no ambient background, no tracking. It runs in its own shadow root,
			so your page's stylesheet cannot reach it and its styles cannot leak into your page.
		</p>

		<pre class="snippet"><code>{snippet}</code></pre>
	</GlassPanel>

	<GlassPanel as="section" class="widget-section">
		<h2>Live preview</h2>
		<div class="preview">
			{#if ready}
				<indienode-widget></indienode-widget>
			{:else}
				<p class="loading">Loading widget...</p>
			{/if}
		</div>
	</GlassPanel>
</div>

<style>
	.widget-page {
		max-width: 48rem;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 2.5rem;
	}

	:global(.widget-section) {
		padding: 2.5rem;
	}

	:global(.widget-section) p {
		color: var(--text);
		margin-bottom: 1.6rem;
	}

	h2 {
		margin-bottom: 1.6rem;
	}

	.snippet {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 1.4rem 1.65rem;
		overflow-x: auto;
		font-size: var(--text-sm);
	}

	.preview {
		display: flex;
		justify-content: center;
	}

	.loading {
		color: var(--text-muted);
	}
</style>
