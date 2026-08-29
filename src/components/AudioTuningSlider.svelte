<script>
	/**
	 * One labelled range input bound to one `audioTuningStore` field.
	 *
	 * Extracted when `?debug=audio` grew a second view: both the slider view
	 * and the graph view need these rows, the graph view needs a subset of
	 * them in a different order, and having the markup in one place is what
	 * keeps a value edited in either view reading back identically in the
	 * other. The range and step come from `AUDIO_TUNING_SLIDERS`, not from
	 * this component, for the same reason.
	 */
	import { audioTuningStore } from '$lib/audioTuning.svelte.js';

	/** @type {{ field: import('$lib/audioTuning.svelte.js').AudioTuningSlider }} */
	let { field } = $props();

	// Whole numbers for Hz and ms, two decimals for a ratio — driven off the
	// field's own step so a new field does not need this component edited.
	const decimals = $derived(field.step < 1 ? 2 : 0);
</script>

<label class="slider-row">
	<span class="slider-label">
		{field.label}
		<span class="slider-value">{audioTuningStore[field.key].toFixed(decimals)}{field.unit}</span>
	</span>
	<input
		type="range"
		min={field.min}
		max={field.max}
		step={field.step}
		value={audioTuningStore[field.key]}
		oninput={(event) => {
			audioTuningStore[field.key] = Number(event.currentTarget.value);
		}}
	/>
</label>

<style>
	.slider-row {
		display: block;
		margin-top: 0.7rem;
	}

	.slider-label {
		display: flex;
		justify-content: space-between;
		margin-bottom: 0.2rem;
		color: var(--text-muted);
	}

	.slider-value {
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}

	.slider-row input[type='range'] {
		width: 100%;
	}
</style>
