<script>
	import FormField from './FormField.svelte';

	/**
	 * Shared metadata controls for one artwork row. The image source itself is
	 * deliberately owned by the parent: `/join` can collect either a hosted URL
	 * or an uploaded File, while `/update` always edits the published URL.
	 *
	 * @type {{ artwork: Record<string, any>, index: number, idPrefix: string, errors?: Record<string, string>, onInput: () => void }}
	 */
	let { artwork, index, idPrefix, errors = {}, onInput } = $props();
</script>

<FormField
	id="{idPrefix}-alt"
	label="Text description"
	hint="Describe what is visually important, not just its title."
	required
	error={errors[`artworks.${index}.alt`]}
>
	{#snippet children(describedBy)}
		<textarea
			id="{idPrefix}-alt"
			class="control"
			rows="3"
			bind:value={artwork.alt}
			oninput={onInput}
			aria-describedby={describedBy}
			aria-invalid={Boolean(errors[`artworks.${index}.alt`])}></textarea>
	{/snippet}
</FormField>

<div class="metadata-grid">
	<FormField id="{idPrefix}-title" label="Title (optional)">
		{#snippet children(describedBy)}
			<input
				id="{idPrefix}-title"
				class="control"
				type="text"
				bind:value={artwork.title}
				oninput={onInput}
				aria-describedby={describedBy}
			/>
		{/snippet}
	</FormField>

	<FormField id="{idPrefix}-year" label="Year (optional)">
		{#snippet children(describedBy)}
			<input
				id="{idPrefix}-year"
				class="control"
				type="text"
				placeholder="2026, circa 2024, or 2022–2025"
				bind:value={artwork.year}
				oninput={onInput}
				aria-describedby={describedBy}
			/>
		{/snippet}
	</FormField>

	<FormField id="{idPrefix}-medium" label="Medium (optional)">
		{#snippet children(describedBy)}
			<input
				id="{idPrefix}-medium"
				class="control"
				type="text"
				placeholder="Ink, oil on canvas, pixel art…"
				bind:value={artwork.medium}
				oninput={onInput}
				aria-describedby={describedBy}
			/>
		{/snippet}
	</FormField>
</div>

<FormField
	id="{idPrefix}-external"
	label="Link for this work (optional)"
	error={errors[`artworks.${index}.external_url`]}
>
	{#snippet children(describedBy)}
		<input
			id="{idPrefix}-external"
			class="control"
			type="url"
			placeholder="https://"
			bind:value={artwork.external_url}
			oninput={onInput}
			aria-describedby={describedBy}
			aria-invalid={Boolean(errors[`artworks.${index}.external_url`])}
		/>
	{/snippet}
</FormField>

<style>
	.metadata-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
		gap: 0.75rem;
	}
</style>
