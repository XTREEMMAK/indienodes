<script>
	/**
	 * The media step of `/join`: the work itself.
	 *
	 * Split out of the route because it is the largest single step and the one
	 * with the most branches — four entry types, each collecting something
	 * different, doubled by whether the submitter already has a site (URLs they
	 * host) or is having one generated (files we embed).
	 *
	 * Reads the two stores directly rather than being handed them. They are
	 * singletons and this is a step of one specific form, not a reusable
	 * widget; passing them would add ceremony without adding a seam. What the
	 * route still owns, and passes, is where this step sits in the walk —
	 * whether Continue is allowed, and what Back and Continue do.
	 *
	 * @type {{ canAdvance: boolean, onBack: () => void, onNext: () => void }}
	 */
	let { canAdvance, onBack, onNext } = $props();

	import FormField from '../../components/FormField.svelte';
	import { submissionStore as form, newPage, newTrack } from '$lib/submissionStore.svelte.js';
	import { generatorDraftStore } from '$lib/generator/generatorDraftStore.svelte.js';
	import { MAX_EXCERPTS, MAX_TRACKS } from '$lib/submissionValidation.js';
	import { ACCEPTED_IMAGE_TYPES } from '$lib/generator/assets.js';
	import { createNewRowFocus, focusHeading } from '$lib/formRowFocus.svelte.js';
	import { uid } from '$lib/uid.js';

	// This step's own rows. A separate tracker from the one the route keeps for
	// the site step's social links: they are independent lists, and sharing one
	// would let adding a row in one place scroll the other.
	const { mark: markNewRow, scrollNewRowIntoView } = createNewRowFocus();

	const entry = $derived(form.entry);
	const generator = $derived(generatorDraftStore.generator);

	/** The generated-page branch caps works at the same three tracks do. */
	const MAX_WORKS = MAX_TRACKS;

	const mediaHeading = $derived(
		/** @type {Record<string, string>} */ ({
			audio: 'Your tracks',
			comic: 'Your pages',
			text: 'Your text samples',
			game: 'Your screenshots'
		})[entry.type] ?? 'The work itself'
	);

	/**
	 * A named predicate rather than an inline arrow with a `@type` cast on its
	 * own parameter: Svelte's compiler mishandles that idiom in `.svelte`
	 * files, wrapping the parameter in parens and emitting invalid syntax.
	 * @param {{ uid: string }} row
	 * @param {string} uid
	 */
	function isNotUid(row, uid) {
		return row.uid !== uid;
	}

	/** @param {string} uid */
	function removeTrack(uid) {
		entry.tracks = entry.tracks.filter((row) => isNotUid(row, uid));
	}

	/** @param {string} uid */
	function removePage(uid) {
		entry.pages = entry.pages.filter((row) => isNotUid(row, uid));
	}

	function addExcerpt() {
		if (entry.excerpts.length < MAX_EXCERPTS) entry.excerpts = [...entry.excerpts, ''];
	}

	/** @param {number} index */
	function removeExcerpt(index) {
		entry.excerpts = entry.excerpts.filter((_, sampleIndex) => sampleIndex !== index);
	}

	// Named, rather than an inline arrow, specifically so the newly created
	// row's own uid is available to hand to markNewRow — an inline arrow
	// discards that value the instant the assignment finishes, with nothing
	// left to scroll to afterward.
	function addTrack() {
		const track = newTrack();
		entry.tracks = [...entry.tracks, track];
		markNewRow(track.uid);
	}

	function addPage() {
		const page = newPage();
		entry.pages = [...entry.pages, page];
		markNewRow(page.uid);
	}

	/**
	 * The no-site branch's own repeatable rows, holding real uploaded files
	 * rather than URLs. `generatorDraftStore.save` is debounced for text fields
	 * (label/caption), same as everywhere else in this form, but a file
	 * selection calls `saveNow` instead: a chosen file is exactly the kind of
	 * change worth writing to IndexedDB immediately, since losing it to a
	 * closed tab a moment later would mean re-picking it.
	 *
	 * Every function below reads `generator.works` into an explicitly-typed
	 * local first, rather than calling `.map`/`.filter` directly on the
	 * loosely-typed store value, for the same compiler reason `isNotUid` exists.
	 * @typedef {{ uid: string, label?: string, caption?: string, file: File | null }} WorkRow
	 */

	function addWork() {
		const row = { uid: uid(), file: null };
		/** @type {WorkRow[]} */
		const works = [...(generator.works ?? []), row];
		generatorDraftStore.save({ generator: { works } });
		markNewRow(row.uid);
	}

	/** @param {string} uid */
	function removeWork(uid) {
		/** @type {WorkRow[]} */
		const current = generator.works ?? [];
		generatorDraftStore.saveNow({ generator: { works: current.filter((w) => w.uid !== uid) } });
	}

	/**
	 * @param {string} uid
	 * @param {Record<string, any>} patch
	 */
	function updateWorkText(uid, patch) {
		/** @type {WorkRow[]} */
		const current = generator.works ?? [];
		const works = current.map((w) => (w.uid === uid ? { ...w, ...patch } : w));
		generatorDraftStore.save({ generator: { works } });
	}

	/**
	 * @param {string} uid
	 * @param {Event} event
	 */
	function updateWorkFile(uid, event) {
		const file = /** @type {HTMLInputElement} */ (event.currentTarget).files?.[0] ?? null;
		/** @type {WorkRow[]} */
		const current = generator.works ?? [];
		const works = current.map((w) => (w.uid === uid ? { ...w, file } : w));
		generatorDraftStore.saveNow({ generator: { works } });
	}
</script>

<h2 tabindex="-1" use:focusHeading>{mediaHeading}</h2>

{#if !entry.type}
	<p class="note">Pick a type on the previous step first.</p>
{:else if entry.has_own_site === 'no' && entry.type === 'audio'}
	<p>
		Up to {MAX_WORKS} tracks. Upload the actual files: they will be embedded in the page we build for
		you in a moment.
	</p>
	{#each generator.works ?? [] as work, i (work.uid)}
		<div class="repeat-row" use:scrollNewRowIntoView={work.uid}>
			<FormField id="f-work-label-{work.uid}" label="Track {i + 1} name">
				{#snippet children(describedBy)}
					<input
						id="f-work-label-{work.uid}"
						class="control"
						type="text"
						value={work.label ?? ''}
						oninput={(e) =>
							updateWorkText(work.uid, {
								label: /** @type {HTMLInputElement} */ (e.currentTarget).value
							})}
						aria-describedby={describedBy}
					/>
				{/snippet}
			</FormField>
			<FormField
				id="f-work-file-{work.uid}"
				label="Audio file"
				hint={work.file ? work.file.name : 'MP3, WAV, or similar.'}
			>
				{#snippet children(describedBy)}
					<input
						id="f-work-file-{work.uid}"
						class="control"
						type="file"
						accept="audio/*"
						onchange={(e) => updateWorkFile(work.uid, e)}
						aria-describedby={describedBy}
					/>
				{/snippet}
			</FormField>
			<button type="button" class="clear-button" onclick={() => removeWork(work.uid)}>
				Remove track {i + 1}
			</button>
		</div>
	{/each}
	{#if (generator.works?.length ?? 0) < MAX_WORKS}
		<button type="button" class="btn btn-ghost" onclick={addWork}>Add a track</button>
	{:else}
		<p class="note">That is the cap of {MAX_WORKS}.</p>
	{/if}
	<p class="note">
		<strong>No files yet? Skip this.</strong> Your generated page will still list you with a cover image
		if you add one on the next step.
	</p>
{:else if entry.has_own_site === 'no' && entry.type === 'comic'}
	<p>Up to {MAX_WORKS} pages. Upload the actual page images.</p>
	{#each generator.works ?? [] as work, i (work.uid)}
		<div class="repeat-row" use:scrollNewRowIntoView={work.uid}>
			<FormField
				id="f-work-file-{work.uid}"
				label="Page {i + 1} image"
				required
				hint={work.file ? work.file.name : undefined}
			>
				{#snippet children(describedBy)}
					<input
						id="f-work-file-{work.uid}"
						class="control"
						type="file"
						accept={ACCEPTED_IMAGE_TYPES.join(',')}
						onchange={(e) => updateWorkFile(work.uid, e)}
						aria-describedby={describedBy}
					/>
				{/snippet}
			</FormField>
			<FormField id="f-work-caption-{work.uid}" label="Caption (optional)">
				{#snippet children(describedBy)}
					<input
						id="f-work-caption-{work.uid}"
						class="control"
						type="text"
						value={work.caption ?? ''}
						oninput={(e) =>
							updateWorkText(work.uid, {
								caption: /** @type {HTMLInputElement} */ (e.currentTarget).value
							})}
						aria-describedby={describedBy}
					/>
				{/snippet}
			</FormField>
			<button type="button" class="clear-button" onclick={() => removeWork(work.uid)}>
				Remove page {i + 1}
			</button>
		</div>
	{/each}
	{#if (generator.works?.length ?? 0) < MAX_WORKS}
		<button type="button" class="btn btn-ghost" onclick={addWork}>Add a page</button>
	{:else}
		<p class="note">That is the cap of {MAX_WORKS}.</p>
	{/if}
{:else if entry.has_own_site === 'no' && entry.type === 'game'}
	<p>One screenshot or cover image, required so your page has something to show.</p>
	{#if generator.works?.[0]}
		<div use:scrollNewRowIntoView={generator.works[0].uid}>
			<FormField
				id="f-work-file-{generator.works[0].uid}"
				label="Screenshot"
				required
				hint={generator.works[0].file
					? generator.works[0].file.name
					: 'Any size works; wide screenshots read best.'}
			>
				{#snippet children(describedBy)}
					<input
						id="f-work-file-{generator.works[0].uid}"
						class="control"
						type="file"
						accept={ACCEPTED_IMAGE_TYPES.join(',')}
						onchange={(e) => updateWorkFile(generator.works[0].uid, e)}
						aria-describedby={describedBy}
					/>
				{/snippet}
			</FormField>
		</div>
	{:else}
		<button type="button" class="btn btn-ghost" onclick={addWork}> Add a screenshot </button>
	{/if}
{:else if entry.type === 'audio'}
	<p>
		Up to {MAX_TRACKS}, so the ring stays a sampler rather than a catalog. Each link must point at a
		direct audio file you host.
	</p>
	{#each entry.tracks as track, i (track.uid)}
		<div class="repeat-row" use:scrollNewRowIntoView={track.uid}>
			<FormField
				id="f-track-label-{track.uid}"
				label="Track {i + 1} name"
				error={form.entryErrors[`tracks.${i}.label`]}
			>
				{#snippet children(describedBy)}
					<input
						id="f-track-label-{track.uid}"
						class="control"
						type="text"
						bind:value={track.label}
						oninput={() => form.touch()}
						aria-describedby={describedBy}
						aria-invalid={Boolean(form.entryErrors[`tracks.${i}.label`])}
					/>
				{/snippet}
			</FormField>
			<FormField
				id="f-track-url-{track.uid}"
				label="Direct link to the file"
				error={form.entryErrors[`tracks.${i}.media_url`]}
			>
				{#snippet children(describedBy)}
					<input
						id="f-track-url-{track.uid}"
						class="control"
						type="url"
						placeholder="https://"
						bind:value={track.media_url}
						oninput={() => form.touch()}
						aria-describedby={describedBy}
						aria-invalid={Boolean(form.entryErrors[`tracks.${i}.media_url`])}
					/>
				{/snippet}
			</FormField>
			<button type="button" class="clear-button" onclick={() => removeTrack(track.uid)}>
				Remove track {i + 1}
			</button>
		</div>
	{/each}

	{#if entry.tracks.length < MAX_TRACKS}
		<button type="button" class="btn btn-ghost" onclick={addTrack}>Add a track</button>
	{:else}
		<p class="note">
			That is the cap of {MAX_TRACKS}. Remove one if you would rather include something else;
			nothing is dropped silently.
		</p>
	{/if}

	<p class="note">
		<strong>No direct file? Skip this.</strong> Your entry still joins the ring with its cover art and
		a link out. It simply will not play here.
	</p>
{:else if entry.type === 'comic'}
	<p>At least one page. Each is an image you host.</p>
	{#if form.entryErrors.pages}
		<p class="inline-error" role="alert">{form.entryErrors.pages}</p>
	{/if}
	{#each entry.pages as page, i (page.uid)}
		<div class="repeat-row" use:scrollNewRowIntoView={page.uid}>
			<FormField
				id="f-page-url-{page.uid}"
				label="Page {i + 1} image"
				required
				error={form.entryErrors[`pages.${i}.image_url`]}
			>
				{#snippet children(describedBy)}
					<input
						id="f-page-url-{page.uid}"
						class="control"
						type="url"
						placeholder="https://"
						bind:value={page.image_url}
						oninput={() => form.touch()}
						aria-describedby={describedBy}
						aria-invalid={Boolean(form.entryErrors[`pages.${i}.image_url`])}
					/>
				{/snippet}
			</FormField>
			<FormField id="f-page-cap-{page.uid}" label="Caption (optional)">
				{#snippet children(describedBy)}
					<input
						id="f-page-cap-{page.uid}"
						class="control"
						type="text"
						bind:value={page.caption}
						oninput={() => form.touch()}
						aria-describedby={describedBy}
					/>
				{/snippet}
			</FormField>
			<button type="button" class="clear-button" onclick={() => removePage(page.uid)}>
				Remove page {i + 1}
			</button>
		</div>
	{/each}
	<button type="button" class="btn btn-ghost" onclick={addPage}>Add a page</button>
{:else if entry.type === 'text'}
	{#each entry.excerpts as sample, i (i)}
		<div class="repeat-card">
			<FormField
				id={`f-excerpt-${i}`}
				label={`Text sample ${i + 1}`}
				hint={i === 0
					? 'Enough to give someone the voice of it. You can include up to three samples.'
					: undefined}
				required={i === 0}
				error={i === 0 ? form.entryErrors.excerpts : undefined}
			>
				{#snippet children(describedBy)}
					<textarea
						id={`f-excerpt-${i}`}
						class="control"
						rows="6"
						value={sample}
						oninput={(event) => {
							entry.excerpts[i] = event.currentTarget.value;
							form.touch();
						}}
						aria-describedby={describedBy}
						aria-invalid={Boolean(i === 0 && form.entryErrors.excerpts)}></textarea>
				{/snippet}
			</FormField>
			{#if entry.excerpts.length > 1}
				<button type="button" class="clear-button" onclick={() => removeExcerpt(i)}>
					Remove sample {i + 1}
				</button>
			{/if}
		</div>
	{/each}
	{#if entry.excerpts.length < MAX_EXCERPTS}
		<button type="button" class="btn btn-ghost" onclick={addExcerpt}>Add a sample</button>
	{/if}
{:else if entry.type === 'game'}
	<FormField
		id="f-preview"
		label="Muted preview clip (optional)"
		hint="Never plays audio on its own, and never autoplays with sound."
		error={form.entryErrors.preview_url}
	>
		{#snippet children(describedBy)}
			<input
				id="f-preview"
				class="control"
				type="url"
				placeholder="https://"
				bind:value={entry.preview_url}
				oninput={() => form.touch()}
				aria-describedby={describedBy}
				aria-invalid={Boolean(form.entryErrors.preview_url)}
			/>
		{/snippet}
	</FormField>
{/if}

{#if entry.has_own_site !== 'no'}
	<FormField
		id="f-thumb"
		label={entry.type === 'game' ? 'Screenshot or cover image' : 'Cover image'}
		hint={entry.type === 'game'
			? 'Required for games. This is the card. Any size works; wide screenshots read best.'
			: entry.type === 'audio'
				? 'Optional but strongly encouraged. Without one, your card falls back to a flat color. Square (1:1) is the norm for album art.'
				: 'Optional but strongly encouraged. Without one, your card falls back to a flat color. Square works well; other ratios are fine too.'}
		required={entry.type === 'game'}
		error={form.entryErrors.thumb_url}
	>
		{#snippet children(describedBy)}
			<input
				id="f-thumb"
				class="control"
				type="url"
				placeholder="https://"
				bind:value={entry.thumb_url}
				oninput={() => form.touch()}
				aria-describedby={describedBy}
				aria-invalid={Boolean(form.entryErrors.thumb_url)}
			/>
		{/snippet}
	</FormField>
{:else if entry.type === 'audio'}
	<p class="note">
		A cover image is optional. You can add one for your generated page on the next step, and we will
		use it here too.
	</p>
{/if}

<div class="actions">
	<button type="button" class="btn btn-ghost" onclick={onBack}>Back</button>
	<button type="button" class="btn btn-primary" disabled={!canAdvance} onclick={onNext}>
		Continue
	</button>
</div>
