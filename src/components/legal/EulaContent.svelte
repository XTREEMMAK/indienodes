<script>
	/**
	 * Renders HTML parsed from docs/legal/EULA.md (see
	 * src/routes/join/+page.server.js) — the markdown file is the only
	 * source of truth for the EULA's text. Editing it is the whole change;
	 * this component only supplies the legal-document styling for whatever
	 * standard tags remark-html produces (headings, paragraphs, lists,
	 * blockquote, table, code, strong/em).
	 */
	let { html } = $props();
</script>

<div class="eula">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- remark-html output from docs/legal/EULA.md, parsed at build time in +page.server.js; project-authored content, not user input -->
	{@html html}
</div>

<style>
	.eula {
		color: var(--text);
		font-size: var(--text-sm);
		line-height: 1.6;
	}

	.eula :global(h2) {
		margin: 1.8rem 0 0.7rem;
		color: var(--text);
		font-family: var(--font-display);
		font-size: var(--text-sm);
		font-weight: 700;
	}

	.eula :global(h2:first-of-type) {
		margin-top: 0;
	}

	.eula :global(p) {
		margin: 0 0 0.9rem;
	}

	.eula :global(p:last-child) {
		margin-bottom: 0;
	}

	/* Tailwind's preflight reset (src/app.css: `@import 'tailwindcss'`) zeroes
	   `list-style` on every ol/ul in the app, same as every other list in
	   this codebase (grep list-style across src/) — they all suppress it
	   further for custom bullets. This is the one list that wants the
	   browser's own numbers/bullets back, so both are restored explicitly
	   rather than inherited. */
	.eula :global(ol) {
		margin: 0 0 0.9rem;
		padding-left: 1.4rem;
		list-style: decimal outside;
	}

	.eula :global(ul) {
		margin: 0 0 0.9rem;
		padding-left: 1.4rem;
		list-style: disc outside;
	}

	.eula :global(ol:last-child),
	.eula :global(ul:last-child) {
		margin-bottom: 0;
	}

	.eula :global(li) {
		margin-bottom: 0.4rem;
	}

	.eula :global(li:last-child) {
		margin-bottom: 0;
	}

	.eula :global(li)::marker {
		color: var(--text-muted);
	}

	.eula :global(li > ul),
	.eula :global(li > ol) {
		margin-top: 0.4rem;
	}

	.eula :global(code) {
		padding: 0.05rem 0.35rem;
		border-radius: var(--radius-sm);
		background: var(--glass-bg);
		font-size: 0.92em;
	}

	.eula :global(blockquote) {
		margin: 0 0 0.9rem;
		padding: 0.9rem 1.1rem;
		border-left: 3px solid var(--accent);
		border-radius: var(--radius-sm);
		background: var(--glass-bg);
		color: var(--text);
		font-style: italic;
	}

	.eula :global(blockquote p) {
		margin: 0;
	}

	.eula :global(strong) {
		font-weight: 700;
	}

	.eula :global(a) {
		color: var(--accent);
	}

	.eula :global(hr) {
		margin: 1.6rem 0;
		border: none;
		border-top: 1px solid var(--border);
	}

	/* The metadata block (Version/Last updated/Licensor/...) and the Table
	   of Contents are the only tables and top-level ordered list in the
	   document that read as reference material rather than legal prose, so
	   they get slightly tighter treatment than the numbered clauses below. */
	.eula :global(table) {
		width: 100%;
		margin: 0 0 1.6rem;
		border-collapse: collapse;
		font-size: var(--text-xs);
	}

	/* GFM requires a header row syntactically, but the metadata table's is
	   an empty two-column layout with nothing worth labeling as a header —
	   the first column (Version, Licensor, ...) already is one. */
	.eula :global(table thead) {
		display: none;
	}

	.eula :global(table tr) {
		border-bottom: 1px solid var(--border);
	}

	.eula :global(table tr:last-child) {
		border-bottom: none;
	}

	.eula :global(table td) {
		padding: 0.4rem 0.8rem 0.4rem 0;
		vertical-align: top;
	}

	.eula :global(table td:first-child) {
		width: 11rem;
		color: var(--text-muted);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		font-size: 0.85em;
	}

	.eula :global(h2 + ol) {
		margin-bottom: 1.8rem;
	}
</style>
