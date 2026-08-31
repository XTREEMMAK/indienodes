<script>
	// This page is a demo and embed-snippet reference for site owners; it is
	// not the widget itself. Two genuinely different embeds share the same
	// underlying widget, and both previews below are real, not mockups:
	//
	// - The sandboxed iframe (recommended) is a real <iframe src="/embed-frame">
	//   -- a live top-level navigation, so it loads and runs exactly as it
	//   would on a member's own site.
	// - The advanced script tag is demonstrated by loading /embed.js directly
	//   onto this page, exactly the way a host page would load it.
	//
	// See docs/decisions.md's widget-iframe-isolation entry for why the
	// iframe is the recommended default and the script stays available as a
	// documented, weaker-trust option.
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import GlassPanel from '../../components/GlassPanel.svelte';
	import { SITE_ORIGIN } from '$lib/config.js';
	import { embedSnippet, embedFrameSnippet } from './embed-snippet.js';

	let scriptReady = $state(false);

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
			scriptReady = true;
		};
		document.head.appendChild(script);
	});

	const frameSnippet = embedFrameSnippet(SITE_ORIGIN);
	const scriptSnippet = embedSnippet(SITE_ORIGIN);
</script>

<svelte:head>
	<title>Widget, IndieNodes</title>
</svelte:head>

<div class="widget-page">
	<h1>Embeddable widget</h1>

	<GlassPanel as="section" class="widget-section">
		<p>
			The classic webring behavior: Previous, Next, Random, over the same <code>ring.json</code>
			everything else here reads. This is the recommended embed: it runs in a sandboxed frame with no
			access to your page at all — not your cookies, not your storage, not your DOM — regardless of what
			runs inside it, today or in any future update. No tracking, no theme, no ambient background.
		</p>

		<pre class="snippet"><code>{frameSnippet}</code></pre>

		<h2>Live preview</h2>
		<div class="preview">
			<iframe
				title="IndieNodes webring"
				width="260"
				height="150"
				style="border:0;"
				sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
				loading="lazy"
				src="/embed-frame"
			></iframe>
		</div>
	</GlassPanel>

	<GlassPanel as="section" class="widget-section">
		<h2>Advanced: script tag</h2>
		<p>
			The same widget as a <code>&lt;script&gt;</code> tag and a custom element instead of a frame. It
			runs in its own shadow root, so your page's stylesheet cannot reach it and its styles cannot leak
			into your page — but the script itself runs with your page's own JavaScript privileges, unlike the
			sandboxed frame above. Most sites want the frame; this exists for sites that specifically need a
			script embed.
		</p>

		<pre class="snippet"><code>{scriptSnippet}</code></pre>

		<h3>Live preview</h3>
		<div class="preview">
			{#if scriptReady}
				<indienode-widget></indienode-widget>
			{:else}
				<p class="loading">Loading widget...</p>
			{/if}
		</div>
	</GlassPanel>

	<GlassPanel as="section" class="widget-section">
		<h2>Matching your site's look</h2>
		<p>
			The widget exposes exactly two CSS custom properties — <code>--indienode-accent</code> and
			<code>--indienode-font-family</code> — everything else stays fixed so it keeps its own tuned contrast
			in light and dark mode. For the script tier, set them in your own stylesheet:
		</p>
		<pre class="snippet"><code
				>indienode-widget &lbrace;
	--indienode-accent: #2563eb;
	--indienode-font-family: 'Fira Code', monospace;
&rbrace;</code
			></pre>
		<p>
			For the frame tier, append <code>accent</code>/<code>font</code> to the
			<code>src</code> URL instead — a cross-origin frame doesn't inherit custom properties from the page
			embedding it:
		</p>
		<pre class="snippet"><code
				>&lt;iframe src="{SITE_ORIGIN}/embed-frame?site-id=your-ring-entry-id&accent=%232563eb"&gt;</code
			></pre>
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
