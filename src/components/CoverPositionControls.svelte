<script>
	/**
	 * Normalized cover focal-point controls. Percentages survive responsive
	 * node sizes and can be applied directly as CSS object-position.
	 * @type {{ position?: { x?: number, y?: number }, onChange: (position: { x: number, y: number }) => void }}
	 */
	let { position = { x: 50, y: 50 }, onChange } = $props();

	const x = $derived(Number.isFinite(position?.x) ? Number(position.x) : 50);
	const y = $derived(Number.isFinite(position?.y) ? Number(position.y) : 50);

	/** @param {'x' | 'y'} axis @param {Event} event */
	function update(axis, event) {
		const value = Number(/** @type {HTMLInputElement} */ (event.currentTarget).value);
		onChange({ x: axis === 'x' ? value : x, y: axis === 'y' ? value : y });
	}
</script>

<fieldset class="cover-position">
	<legend>Position cover</legend>
	<p>Move the focus until the important part of the image sits inside the square crop.</p>
	<label>
		<span>Left / right <output>{x}%</output></span>
		<input
			type="range"
			min="0"
			max="100"
			step="1"
			value={x}
			oninput={(event) => update('x', event)}
		/>
	</label>
	<label>
		<span>Up / down <output>{y}%</output></span>
		<input
			type="range"
			min="0"
			max="100"
			step="1"
			value={y}
			oninput={(event) => update('y', event)}
		/>
	</label>
</fieldset>

<style>
	.cover-position {
		max-width: 36rem;
		margin: -0.8rem 0 1.6rem;
		padding: 0.9rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: color-mix(in oklch, var(--bg-elevated) 72%, transparent);
	}
	legend {
		padding: 0 0.35rem;
		font-size: var(--text-sm);
		font-weight: 700;
	}
	p {
		margin: 0 0 0.8rem;
		color: var(--text-muted);
		font-size: var(--text-xs);
	}
	label + label {
		display: block;
		margin-top: 0.65rem;
	}
	label span {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-weight: 700;
	}
	input {
		width: 100%;
		accent-color: var(--accent);
	}
	output {
		font-variant-numeric: tabular-nums;
	}
</style>
