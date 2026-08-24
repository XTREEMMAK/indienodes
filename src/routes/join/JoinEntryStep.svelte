<script>
	/**
	 * The entry step of `/join`: who the creator is, what kind of work this is,
	 * and the one line explaining why it is worth someone's time.
	 *
	 * Owns tag entry, which is the only genuinely interactive part: a free-text
	 * field that commits on Enter or comma, with suggestions drawn from what
	 * the ring already uses.
	 *
	 * Reads the submission store directly, like the other steps — it is a step
	 * of one specific form, not a reusable widget. The route passes only where
	 * this sits in the walk.
	 *
	 * @type {{ canAdvance: boolean, onBack: () => void, onNext: () => void }}
	 */
	let { canAdvance, onBack, onNext } = $props();

	import FormField from '../../components/FormField.svelte';
	import { submissionStore as form } from '$lib/submissionStore.svelte.js';
	import { ringStore } from '$lib/ringStore.svelte.js';
	import { focusHeading } from '$lib/formRowFocus.svelte.js';
	import { ENTRY_TYPES, ENTRY_TYPE_LABELS, WHY_MAX_LENGTH } from '$lib/submissionValidation.js';

	const entry = $derived(form.entry);

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

	/** Whatever the ring already uses, minus what this entry has taken. */
	const suggestedTags = $derived(
		[...new Set(ringStore.entries.flatMap((e) => e.tags ?? []))]
			.filter((t) => !entry.tags.includes(t))
			.sort()
			.slice(0, 14)
	);

	let tagDraft = $state('');

	function commitTag() {
		const value = tagDraft.trim().toLowerCase();
		if (value && !entry.tags.includes(value)) {
			entry.tags = [...entry.tags, value];
			form.touch();
		}
		tagDraft = '';
	}

	/** @param {KeyboardEvent} event */
	function onTagKeydown(event) {
		// Comma as well as Enter: people type tag lists with commas, and
		// swallowing that is friendlier than adding "a, b, c" as one tag.
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			commitTag();
		} else if (event.key === 'Backspace' && !tagDraft && entry.tags.length) {
			entry.tags = entry.tags.slice(0, -1);
		}
	}
</script>

<h2 tabindex="-1" use:focusHeading>Your entry</h2>
<p>This is what people see on your card in the ring.</p>

<FormField id="f-creator" label="Your name or studio" required error={form.entryErrors.creator}>
	{#snippet children(describedBy)}
		<input
			id="f-creator"
			class="control"
			type="text"
			autocomplete="off"
			bind:value={entry.creator}
			oninput={() => form.touch()}
			aria-describedby={describedBy}
			aria-invalid={Boolean(form.entryErrors.creator)}
		/>
	{/snippet}
</FormField>

<FormField id="f-type" label="What kind of work is this?" required error={form.entryErrors.type}>
	{#snippet children(describedBy)}
		<select
			id="f-type"
			class="control"
			bind:value={entry.type}
			onchange={() => form.touch()}
			aria-describedby={describedBy}
			aria-invalid={Boolean(form.entryErrors.type)}
		>
			<option value="" disabled>Choose one</option>
			{#each ENTRY_TYPES as type (type)}
				<option value={type}>{ENTRY_TYPE_LABELS[type]}</option>
			{/each}
		</select>
	{/snippet}
</FormField>

<FormField
	id="f-why"
	label="Why is this worth someone's time?"
	hint="One line, in your own voice. A node here is you, not one release — this is your introduction and your pitch combined, so it does more work than anything else on the card."
	required
	error={form.entryErrors.why}
>
	{#snippet children(describedBy)}
		<input
			id="f-why"
			class="control"
			type="text"
			maxlength={WHY_MAX_LENGTH + 20}
			bind:value={entry.why}
			oninput={() => form.touch()}
			aria-describedby={describedBy}
			aria-invalid={Boolean(form.entryErrors.why)}
		/>
	{/snippet}
</FormField>
<p class="counter" class:over={entry.why.length > WHY_MAX_LENGTH}>
	{entry.why.length} / {WHY_MAX_LENGTH}
</p>

{#if entry.has_own_site === 'yes'}
	<FormField
		id="f-source"
		label="Where does this live?"
		hint="The page you want visitors sent to, and the page you will prove you control in a moment."
		required
		error={form.entryErrors.source_url}
	>
		{#snippet children(describedBy)}
			<input
				id="f-source"
				class="control"
				type="url"
				inputmode="url"
				placeholder="https://"
				bind:value={entry.source_url}
				oninput={() => form.touch()}
				aria-describedby={describedBy}
				aria-invalid={Boolean(form.entryErrors.source_url)}
			/>
		{/snippet}
	</FormField>
{/if}

<FormField
	id="f-tags"
	label="Tags"
	hint="At least one. Genre, medium, mood, whatever fits. Enter or comma to add."
	required
	error={form.entryErrors.tags}
>
	{#snippet children(describedBy)}
		<input
			id="f-tags"
			class="control"
			type="text"
			autocomplete="off"
			bind:value={tagDraft}
			onkeydown={onTagKeydown}
			onblur={commitTag}
			aria-describedby={describedBy}
			aria-invalid={Boolean(form.entryErrors.tags)}
		/>
	{/snippet}
</FormField>

{#if entry.tags.length}
	<ul class="tag-list">
		{#each entry.tags as tag (tag)}
			<li>
				<button type="button" class="chip checked" onclick={() => form.toggleTag(tag)}>
					{tag}
					<span aria-hidden="true">×</span>
					<span class="sr-only">Remove tag</span>
				</button>
			</li>
		{/each}
	</ul>
{/if}

{#if suggestedTags.length}
	<p class="hint-inline">Already used in the ring:</p>
	<ul class="tag-list">
		{#each suggestedTags as tag (tag)}
			<li>
				<button type="button" class="chip" onclick={() => form.toggleTag(tag)}>
					{tag}
				</button>
			</li>
		{/each}
	</ul>
{/if}

<div class="explicit-panel">
	<label class="option">
		<input type="checkbox" bind:checked={entry.explicit} onchange={() => form.touch()} />
		<span>
			<span class="option-label">This entry is exclusively explicit / NSFW content</span>
			<span class="option-description">
				Not "contains some mature moments" — this is for a creator whose work here is adult content
				through and through. Checking it hides this entry from the field, Members, and Lists until a
				visitor explicitly turns explicit content on for themselves.
			</span>
		</span>
	</label>

	<div class="explicit-examples">
		<div>
			<p class="explicit-examples-title">Check this for</p>
			<ul>
				<li>Explicit sexual content or nudity</li>
				<li>Graphic violence, gore, or fetish content</li>
				<li>Substance use depicted explicitly as a central theme</li>
				<li>Explicit language throughout, not occasional</li>
			</ul>
		</div>
		<div>
			<p class="explicit-examples-title">Leave unchecked for</p>
			<ul>
				<li>Occasional strong language</li>
				<li>Suggestive humor or romance without explicit depiction</li>
				<li>Violence typical of an M-rated game or a thriller novel</li>
				<li>Dark or mature themes handled without graphic depiction</li>
			</ul>
		</div>
	</div>
</div>

{#if entry.type === 'audio'}
	<details class="help">
		<summary>Musicians: what makes a track actually playable here</summary>
		<p>
			A track plays here only when its link points at a direct audio file at a host that allows
			cross-origin requests. That is what lets it join the queue, hand over to the next track when
			it ends, and drive the animated background.
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
			<strong>No file to link? Join anyway.</strong> Skip the tracks step entirely. Your entry still appears
			with your cover art and still sends people to you. It simply will not play here, and that is a perfectly
			normal kind of member to be.
		</p>
	</details>
{/if}

<div class="actions">
	<button type="button" class="btn btn-ghost" onclick={onBack}>Back</button>
	<button type="button" class="btn btn-primary" disabled={!canAdvance} onclick={onNext}>
		Continue
	</button>
</div>

<style>
	.table-scroll {
		overflow-x: auto;
		margin-bottom: 1.2rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	th,
	td {
		padding: 0.6rem 0.8rem;
		border-bottom: 1px solid var(--border);
		text-align: left;
		vertical-align: top;
	}

	thead th {
		color: var(--text-muted);
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	tbody th {
		font-weight: 600;
		white-space: nowrap;
	}

	.req {
		display: inline-block;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		font-size: var(--text-xs);
		font-weight: 600;
		white-space: nowrap;
	}

	.req[data-req='yes'] {
		background: var(--type-game-soft);
		color: var(--type-game);
	}

	.req[data-req='no'] {
		background: var(--bg-elevated);
		color: var(--text-faint);
		border: 1px solid var(--border);
	}

	.hint-inline {
		margin-bottom: 0.5rem !important;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.counter {
		margin-top: -1.4rem;
		margin-bottom: 1.8rem !important;
		color: var(--text-faint);
		font-size: var(--text-xs);
		text-align: right;
		max-width: 100%;
	}

	.counter.over {
		color: #e0455f;
	}

	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		margin: 0 0 1.6rem;
		padding: 0;
		list-style: none;
	}

	.explicit-panel {
		margin: 1rem 0 2rem;
		max-width: 62ch;
		padding: 1.1rem 1.3rem;
		border: 1px solid rgb(234 179 8 / 0.5);
		border-radius: var(--radius-sm);
		background: rgb(234 179 8 / 0.1);
	}

	.explicit-panel .option {
		margin: 0;
	}

	.explicit-examples {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem 1.5rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid rgb(234 179 8 / 0.35);
	}

	.explicit-examples-title {
		margin: 0 0 0.4rem;
		color: var(--text);
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.explicit-examples ul {
		margin: 0;
		padding-left: 1.1rem;
		list-style: disc;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
	@media (max-width: 32rem) {
		.explicit-examples {
			grid-template-columns: 1fr;
		}
	}
</style>
