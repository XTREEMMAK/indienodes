<script>
	/**
	 * How to get into the ring.
	 *
	 * Written against what actually exists today rather than a submission
	 * flow that does not: there is no form, no account, and no moderation
	 * queue yet (see docs/open-questions.md), so joining is a pull request
	 * or an issue against the public repo. Saying that plainly is better
	 * than shipping a form that emails nobody.
	 */
	import { resolve } from '$app/paths';
	import { GITHUB_URL, GITHUB_ISSUES_URL } from '$lib/config.js';
	import { embedSnippet } from '../widget/embed-snippet.js';
	import { SITE_ORIGIN } from '$lib/config.js';

	const snippet = embedSnippet(SITE_ORIGIN);

	// Ordered the way the steps are actually done, so the sidebar doubles as
	// the sequence rather than being an arbitrary index.
	const SECTIONS = [
		{ id: 'entry', label: 'Add your entry', hint: 'One object in a public file' },
		{ id: 'fields', label: 'Every field', hint: 'What is required, and when' },
		{ id: 'audio', label: 'Playable audio', hint: 'For musicians' },
		{ id: 'verify', label: 'Prove it is yours', hint: 'One meta tag' },
		{ id: 'widget', label: 'Add the widget', hint: 'One script tag' },
		{ id: 'submit', label: 'Send it in', hint: 'For now: PR or issue' }
	];

	let activeSection = $state('entry');

	const EXAMPLE = `{
  "id": "your-entry-id",
  "creator": "Your name or studio",
  "type": "audio",
  "title": "What you're sharing",
  "why": "One line on why it's worth someone's time.",
  "source_url": "https://your-site.example",
  "tags": ["genre", "medium"],
  "tracks": [
    { "label": "Track one", "media_url": "https://your-site.example/one.mp3" }
  ],
  "thumb_url": "https://your-site.example/cover.jpg",
  "verification_token": "indienode-verify-yourname-1a2b"
}`;

	// Mirrors schema/ring.schema.json: the eight top-level `required` fields,
	// then the three `allOf` conditionals (pages for comic, excerpt for text,
	// thumb_url for game). Kept as data rather than prose so the reference is
	// scannable and so a schema change has one obvious place to land here.
	const FIELDS = [
		{
			name: 'id',
			required: 'Yes',
			level: 'yes',
			applies: 'Every entry',
			what: 'Unique slug, lowercase with hyphens.'
		},
		{
			name: 'creator',
			required: 'Yes',
			level: 'yes',
			applies: 'Every entry',
			what: 'Your name or studio.'
		},
		{
			name: 'type',
			required: 'Yes',
			level: 'yes',
			applies: 'Every entry',
			what: 'audio, comic, text, or game.'
		},
		{
			name: 'title',
			required: 'Yes',
			level: 'yes',
			applies: 'Every entry',
			what: 'What you are sharing.'
		},
		{
			name: 'why',
			required: 'Yes',
			level: 'yes',
			applies: 'Every entry',
			what: 'One line on why it is worth someone’s time.'
		},
		{
			name: 'source_url',
			required: 'Yes',
			level: 'yes',
			applies: 'Every entry',
			what: 'The page you control that this points at.'
		},
		{
			name: 'tags',
			required: 'Yes',
			level: 'yes',
			applies: 'Every entry',
			what: 'At least one. Genre, medium, whatever fits.'
		},
		{
			name: 'verification_token',
			required: 'Yes',
			level: 'yes',
			applies: 'Every entry',
			what: 'Any random string. See step 2.'
		},
		{
			name: 'thumb_url',
			required: 'Games only',
			level: 'cond',
			applies: 'Encouraged for all',
			what: 'Cover art. Without one, a card falls back to a flat color.'
		},
		{
			name: 'pages',
			required: 'Yes',
			level: 'cond',
			applies: 'Comic',
			what: 'Each page an image_url plus an optional caption.'
		},
		{
			name: 'excerpt',
			required: 'Yes',
			level: 'cond',
			applies: 'Text',
			what: 'A short sample of the writing.'
		},
		{
			name: 'tracks',
			required: 'Optional',
			level: 'no',
			applies: 'Audio',
			what: 'Up to three, each a label plus a media_url. See below.'
		},
		{
			name: 'preview_url',
			required: 'Optional',
			level: 'no',
			applies: 'Game',
			what: 'A muted preview clip. Never plays audio on its own.'
		},
		{
			name: 'explicit',
			required: 'Optional',
			level: 'no',
			applies: 'Every entry',
			what: 'Set true if your work is explicit adult content. Hidden unless a visitor opts in. Omit otherwise.'
		}
	];

	const HOSTING = [
		{
			host: 'archive.org',
			plays: 'Yes',
			level: 'yes',
			why: 'Free, permanent, built for this, and sends the cross-origin header. The standing recommendation.'
		},
		{
			host: 'Your own site',
			plays: 'Yes',
			level: 'yes',
			why: 'As long as the file is served with an Access-Control-Allow-Origin header.'
		},
		{
			host: 'Bandcamp',
			plays: 'No',
			level: 'no',
			why: 'Its direct audio URLs expire within about a day. The embedded player never expires, but cannot tell this site when a track ends, so it cannot take part in a queue.'
		},
		{
			host: 'YouTube',
			plays: 'No',
			level: 'no',
			why: 'Its terms prohibit playing a video’s audio on its own, and its embed brings ads and tracking this project does not put on your visitors.'
		},
		{
			host: 'Spotify, Apple Music, SoundCloud',
			plays: 'No',
			level: 'no',
			why: 'Platform players cannot hand a file to this site. Link out with source_url instead.'
		}
	];
</script>

<svelte:head>
	<title>Join the ring, IndieNodes</title>
</svelte:head>

<div class="join-page">
	<h1>Join the ring</h1>
	<p class="lede">
		IndieNodes is a webring, not a platform: there is no account to make. Joining means adding one
		entry to a public file and putting a small widget on your own site.
	</p>

	<!-- Says plainly that this is the interim mechanism, not the design. A
	     submission form is the intended front door (docs/submission-form-spec.md
	     is written and ready to build against); a pull request is what exists
	     while that is unbuilt. Presenting PR/issue as though it were the
	     settled process, with no forward pointer, was the actual gap: it read
	     as final rather than as a placeholder. Once the form ships this whole
	     block comes out and the "Send it in" panel below points at it instead. -->
	<div class="interim-note">
		<p>
			<strong>The submission form is not built yet.</strong> Once it exists, it will be the way to join,
			and this page will lead with it. Until then, joining is a pull request or an issue against the public
			repo, which is what the rest of this page walks through.
		</p>
	</div>

	<div class="join-layout">
		<!-- A vertical tab list rather than a table of contents that scrolls:
		     the complaint this answers is length, and an anchor list makes a
		     long page navigable without making it shorter. Showing one section
		     at a time does. Ordered as the steps are actually done, so the list
		     doubles as the sequence. Mirrors the tab mechanics About and
		     Settings already use, rather than introducing a third pattern. -->
		<div class="toc" role="tablist" aria-label="Joining steps" aria-orientation="vertical">
			{#each SECTIONS as section, i (section.id)}
				<button
					type="button"
					role="tab"
					id="join-tab-{section.id}"
					aria-selected={activeSection === section.id}
					aria-controls="join-panel-{section.id}"
					class="toc-item"
					class:active={activeSection === section.id}
					onclick={() => (activeSection = section.id)}
				>
					<span class="toc-num" aria-hidden="true">{i + 1}</span>
					<span class="toc-text">
						<span class="toc-label">{section.label}</span>
						<span class="toc-hint">{section.hint}</span>
					</span>
				</button>
			{/each}
		</div>

		<div class="panel">
			{#if activeSection === 'entry'}
				<div role="tabpanel" id="join-panel-entry" aria-labelledby="join-tab-entry">
					<h2>Add your entry to <code>ring.json</code></h2>
					<p>
						The ring is one public file. Open a pull request adding your entry to it, or open an
						issue with the same details if you would rather not touch the repo yourself.
					</p>
					<pre><code>{EXAMPLE}</code></pre>
					<p class="note">
						<strong>Nothing is rehosted.</strong> Every URL points at infrastructure you control, so you
						can change or remove your own media at any time without asking anyone.
					</p>
				</div>
			{:else if activeSection === 'fields'}
				<div role="tabpanel" id="join-panel-fields" aria-labelledby="join-tab-fields">
					<h2>Every field</h2>
					<p>Eight fields are required for every entry. The rest depend on your type.</p>
					<div class="table-scroll">
						<table>
							<thead>
								<tr>
									<th scope="col">Field</th>
									<th scope="col">Required</th>
									<th scope="col">Applies to</th>
									<th scope="col">What it is</th>
								</tr>
							</thead>
							<tbody>
								{#each FIELDS as field (field.name)}
									<tr>
										<th scope="row"><code>{field.name}</code></th>
										<td>
											<span class="req" data-req={field.level}>{field.required}</span>
										</td>
										<td>{field.applies}</td>
										<td>{field.what}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{:else if activeSection === 'audio'}
				<div role="tabpanel" id="join-panel-audio" aria-labelledby="join-tab-audio">
					<h2>Musicians: what makes a track playable</h2>
					<p>
						A track plays here only when <code>media_url</code> is a direct link to an audio file at a
						host that allows cross-origin requests. That is what lets it join the queue, hand over to
						the next track when it ends, and drive the animated background.
					</p>
					<div class="table-scroll">
						<table>
							<thead>
								<tr>
									<th scope="col">Where your audio lives</th>
									<th scope="col">Plays here</th>
									<th scope="col">Why</th>
								</tr>
							</thead>
							<tbody>
								{#each HOSTING as row (row.host)}
									<tr>
										<th scope="row">{row.host}</th>
										<td><span class="req" data-req={row.level}>{row.plays}</span></td>
										<td>{row.why}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					<p class="note">
						<strong>No file to link? Join anyway.</strong> Leave <code>tracks</code> out entirely. Your
						entry still appears in the field and the members list with your cover art, and still sends
						people to you. It simply will not play here, and that is a perfectly normal kind of member
						to be.
					</p>
				</div>
			{:else if activeSection === 'verify'}
				<div role="tabpanel" id="join-panel-verify" aria-labelledby="join-tab-verify">
					<h2>Prove the site is yours</h2>
					<p>
						Pick any random string as your <code>verification_token</code>, then put it on the page
						you linked as <code>source_url</code>:
					</p>
					<pre><code>&lt;meta name="indienode-verification" content="your-token-here" /&gt;</code
						></pre>
					<p class="note">
						This is the whole of the ownership check: it proves whoever submitted the entry can edit
						that page. No email, no account, nothing stored about you.
					</p>
				</div>
			{:else if activeSection === 'widget'}
				<div role="tabpanel" id="join-panel-widget" aria-labelledby="join-tab-widget">
					<h2>Put the widget on your site</h2>
					<p>
						Paste this wherever you would like it. Set <code>site-id</code> to the same
						<code>id</code> you used above, so Previous and Next land on your actual neighbours in the
						ring.
					</p>
					<pre><code>{snippet}</code></pre>
					<p class="note">
						It is a self-contained custom element in its own shadow root: it cannot restyle your
						page and your stylesheet cannot restyle it. No tracking, no cookies, no analytics.
						<a href={resolve('/widget')}>See it running</a>.
					</p>
				</div>
			{:else}
				<div role="tabpanel" id="join-panel-submit" aria-labelledby="join-tab-submit">
					<h2>Send it in</h2>
					<p>
						For now, everything above goes in one pull request, or one issue if you would rather not
						touch the repo. There is no form yet and no account, ever.
					</p>
					<div class="link-row">
						<!-- eslint-disable svelte/no-navigation-without-resolve -- external URLs from config.js, not app routes -->
						<a class="primary-link" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
							Open the repository
						</a>
						<a
							class="secondary-link"
							href={GITHUB_ISSUES_URL}
							target="_blank"
							rel="noopener noreferrer"
						>
							Submit via an issue instead
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					</div>

					<p class="footnote">
						Submissions are reviewed by a person before they appear. What that review checks, and
						how fast it happens, is still being worked out.
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.join-page {
		/* Wider than a prose measure, because the layout is now two columns and
		   the reference tables carry four. */
		max-width: 72rem;
		margin: 0 auto;
	}

	.join-layout {
		display: grid;
		/* Fixed sidebar, flexible content. `minmax(0, 1fr)` rather than `1fr`
		   on the content column so a wide table scrolls inside its own box
		   instead of forcing the grid track wider than the page. */
		grid-template-columns: 15rem minmax(0, 1fr);
		gap: 2.4rem;
		align-items: start;
	}

	.toc {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		/* Sticky, so the sequence stays visible while reading a long panel.
		   Cleared of the floating header's own space at the top. */
		position: sticky;
		top: 5.5rem;
	}

	.toc-item {
		display: flex;
		align-items: flex-start;
		gap: 0.7rem;
		width: 100%;
		padding: 0.6rem 0.7rem;
		border: none;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.toc-item:hover {
		background: var(--glass-bg);
		color: var(--text);
	}

	.toc-item.active {
		background: color-mix(in oklch, var(--accent) 12%, transparent);
		color: var(--text);
	}

	.toc-num {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 999px;
		background: var(--bg-elevated);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
	}

	.toc-item.active .toc-num {
		background: var(--accent);
		color: #fff;
	}

	.toc-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.toc-label {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.toc-hint {
		color: var(--text-muted);
		font-size: var(--text-xs);
	}

	.panel h2 {
		margin-bottom: 0.6rem;
		font-size: var(--text-lg);
	}

	.panel p {
		margin-bottom: 0.8rem;
	}

	@media (max-width: 60rem) {
		/* One column, with the steps becoming a horizontally scrollable strip
		   above the content. A 15rem sidebar beside a four-column table does
		   not fit a phone, and stacking the full vertical list would put six
		   items of chrome above every panel. */
		.join-layout {
			grid-template-columns: 1fr;
			gap: 1.2rem;
		}

		.toc {
			position: static;
			flex-direction: row;
			gap: 0.4rem;
			padding-bottom: 0.4rem;
			overflow-x: auto;
		}

		.toc-item {
			width: auto;
			flex-shrink: 0;
		}

		.toc-hint {
			display: none;
		}
	}

	/* Tables scroll inside their own box rather than widening the page, which
	   is what keeps this readable on a phone without collapsing the columns
	   into something that no longer reads as a reference. */
	.table-scroll {
		margin-bottom: 1rem;
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	thead th {
		position: sticky;
		top: 0;
		padding: 0.6rem 0.8rem;
		background: var(--bg-elevated);
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		text-align: left;
		white-space: nowrap;
	}

	tbody tr + tr {
		border-top: 1px solid var(--border);
	}

	tbody th,
	tbody td {
		padding: 0.6rem 0.8rem;
		text-align: left;
		vertical-align: top;
		font-weight: 400;
	}

	tbody th {
		white-space: nowrap;
	}

	tbody td:last-child {
		min-width: 18rem;
		color: var(--text-muted);
	}

	/* A word plus a color, not a color alone: a red/green dot would carry the
	   whole meaning for everyone except the people most likely to need it. */
	.req {
		display: inline-block;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		font-size: var(--text-xs);
		font-weight: 700;
		white-space: nowrap;
	}

	.req[data-req='yes'] {
		background: color-mix(in oklch, var(--type-game) 22%, transparent);
		color: var(--text);
	}

	.req[data-req='cond'] {
		background: color-mix(in oklch, var(--type-text) 26%, transparent);
		color: var(--text);
	}

	.req[data-req='no'] {
		background: var(--glass-bg);
		color: var(--text-muted);
	}

	.lede {
		margin-bottom: 1.6rem;
		color: var(--text-muted);
	}

	/* A status notice, not a warning: nothing is wrong, the page is just
	   describing a step that has not shipped yet. Amber rather than the
	   accent color or a neutral border, so it reads as "temporary state"
	   distinctly from every other bordered box on this page. */
	.interim-note {
		margin-bottom: 2.4rem;
		padding: 1rem 1.3rem;
		border: 1px solid color-mix(in oklch, var(--type-text) 45%, transparent);
		border-radius: var(--radius-sm);
		background: color-mix(in oklch, var(--type-text) 10%, transparent);
	}

	.interim-note p {
		margin: 0;
		color: var(--text);
		font-size: var(--text-sm);
	}

	pre {
		overflow-x: auto;
		margin-bottom: 0.8rem;
		padding: 0.9rem 1rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		font-size: var(--text-sm);
		line-height: 1.5;
	}

	.note {
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.note a {
		color: var(--accent);
	}

	.link-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		margin-top: 2.4rem;
	}

	.primary-link {
		padding: 0.7rem 1.4rem;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: white;
		font-weight: 600;
		text-decoration: none;
	}

	.primary-link:hover {
		background: var(--accent-hover);
	}

	.secondary-link {
		color: var(--text-muted);
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
	}

	.secondary-link:hover {
		color: var(--accent);
		text-decoration: underline;
	}

	.footnote {
		margin-top: 2rem;
		padding-top: 1.2rem;
		border-top: 1px solid var(--border);
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
</style>
