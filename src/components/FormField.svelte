<script>
	/**
	 * Label, optional hint, and error message around one control.
	 *
	 * The only form primitive extracted for the submission form. Roughly
	 * fifteen fields need exactly this arrangement, and each of them needs
	 * `aria-describedby` wired to whichever of hint and error currently
	 * exists, which is the part that is genuinely tedious to repeat correctly
	 * rather than merely repetitive.
	 *
	 * Inputs stay native and are passed in as children rather than being
	 * wrapped by a component per control type. A `<select>` and a `<textarea>`
	 * have little in common beyond this frame, and hiding them behind props
	 * would mean re-exposing `bind:value`, `rows`, `type`, `autocomplete` and
	 * the rest one at a time.
	 *
	 * The caller is responsible for putting `id`, `class="control"`, and
	 * `aria-describedby={describedBy}` on the control itself; `describedBy` is
	 * handed back through the children snippet so it cannot drift from the
	 * ids this component actually renders.
	 */

	/**
	 * @typedef {object} Props
	 * @property {string} id Must match the control's own id.
	 * @property {string} label
	 * @property {string} [hint]
	 * @property {string} [error]
	 * @property {boolean} [required]
	 * @property {import('svelte').Snippet<[string]>} children
	 */

	/** @type {Props} */
	let { id, label, hint = '', error = '', required = false, children } = $props();

	const hintId = $derived(hint ? `${id}-hint` : '');
	const errorId = $derived(error ? `${id}-error` : '');
	const describedBy = $derived([hintId, errorId].filter(Boolean).join(' '));
</script>

<div class="field" class:has-error={Boolean(error)}>
	<label for={id}>
		{label}
		{#if required}
			<span class="required" aria-hidden="true">*</span>
			<span class="sr-only">(required)</span>
		{/if}
	</label>

	{#if hint}
		<p class="hint" id={hintId}>{hint}</p>
	{/if}

	{@render children(describedBy)}

	<!--
		Always present, so a message appearing is an update to a live region
		rather than a new region being inserted. Screen readers announce the
		former reliably and the latter inconsistently.
	-->
	<p class="error" id={errorId || undefined} role="alert" aria-live="polite">
		{error}
	</p>
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1.8rem;
	}

	label {
		font-weight: 600;
	}

	.required {
		color: var(--accent);
		margin-left: 0.15rem;
	}

	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}

	.error {
		margin: 0;
		min-height: 0;
		color: #e0455f;
		font-size: var(--text-sm);
	}

	.error:empty {
		display: none;
	}
</style>
