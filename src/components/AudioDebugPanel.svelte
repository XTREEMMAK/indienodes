<script>
	/**
	 * Dev-only tuning panel for `AudioPlayer.svelte`'s bass/beat detector.
	 * Every slider here writes directly into `audioTuningStore`, which
	 * `AudioPlayer` reads fresh every animation frame — so a drag takes
	 * effect on the next frame, live, while a track plays, rather than
	 * needing an edit-reload-relisten loop to find the right numbers.
	 *
	 * Gated on `import.meta.env.DEV` (tree-shaken out of production, same
	 * reasoning as `submissionApi.js`'s own `useMock`) AND `?debug=audio` in
	 * the URL, so it doesn't clutter an ordinary dev session by default —
	 * self-contained rather than making `+layout.svelte` check anything,
	 * the same "caller never has to know" posture `Turnstile.svelte` uses
	 * for its own site-key gate.
	 */
	import { page } from '$app/state';
	import { audioTuningStore, AUDIO_TUNING_DEFAULTS } from '$lib/audioTuning.svelte.js';

	const enabled = $derived(import.meta.env.DEV && page.url.searchParams.get('debug') === 'audio');

	let collapsed = $state(false);
	let copyLabel = $state('Copy values');

	/** The live ratio a real hit needs to clear — the one number most worth watching while a track plays. */
	const bassRatio = $derived(
		audioTuningStore.bassAvg > 0 ? audioTuningStore.bass / audioTuningStore.bassAvg : 0
	);

	/** @param {number} value @param {number} min @param {number} max */
	function pct(value, min, max) {
		return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
	}

	/** @typedef {'lowpassFrequency' | 'lowpassQ' | 'beatRatio' | 'bigHitRatio' | 'beatFloor' | 'beatGapMs'} TuningKey */

	/** @type {{ key: TuningKey, label: string, unit: string, min: number, max: number, step: number }[]} */
	const SLIDERS = [
		{
			key: 'lowpassFrequency',
			label: 'Low-pass frequency',
			unit: 'Hz',
			min: 40,
			max: 500,
			step: 5
		},
		{ key: 'lowpassQ', label: 'Low-pass Q', unit: '', min: 0.1, max: 10, step: 0.1 },
		{ key: 'beatRatio', label: 'Beat ratio', unit: '×', min: 1, max: 3, step: 0.01 },
		{ key: 'bigHitRatio', label: 'Big-hit ratio', unit: '×', min: 1, max: 4, step: 0.01 },
		{ key: 'beatFloor', label: 'Beat floor', unit: '', min: 0, max: 0.5, step: 0.01 },
		{ key: 'beatGapMs', label: 'Beat gap', unit: 'ms', min: 0, max: 500, step: 10 }
	];

	/**
	 * `navigator.clipboard.writeText` silently rejects outside a focused,
	 * secure-context tab (a background dev tab, some embedded/sandboxed
	 * webviews) with no useful reason surfaced to the caller. Rather than
	 * just reporting failure and losing the values, fall back to the
	 * old `execCommand('copy')` path via a throwaway textarea, which works
	 * in most of the cases the Clipboard API refuses.
	 * @param {string} text
	 * @returns {boolean}
	 */
	function copyViaFallback(text) {
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.style.position = 'fixed';
		textarea.style.opacity = '0';
		document.body.appendChild(textarea);
		textarea.select();
		try {
			return document.execCommand('copy');
		} catch {
			return false;
		} finally {
			textarea.remove();
		}
	}

	async function copyValues() {
		const keys = /** @type {TuningKey[]} */ (Object.keys(AUDIO_TUNING_DEFAULTS));
		const lines = keys.map((key) => `\t${key}: ${audioTuningStore[key]},`);
		const text = `{\n${lines.join('\n')}\n}`;
		try {
			await navigator.clipboard.writeText(text);
			copyLabel = 'Copied!';
		} catch {
			copyLabel = copyViaFallback(text) ? 'Copied!' : 'Copy failed — see console';
			if (copyLabel !== 'Copied!') console.info('Audio tuning values:\n' + text);
		}
		setTimeout(() => (copyLabel = 'Copy values'), 1500);
	}
</script>

{#if enabled}
	<div class="audio-debug" class:collapsed>
		<div class="header">
			<span>Audio tuning (dev)</span>
			<button
				type="button"
				class="collapse-toggle"
				onclick={() => (collapsed = !collapsed)}
				aria-expanded={!collapsed}
			>
				{collapsed ? 'Show' : 'Hide'}
			</button>
		</div>

		{#if !collapsed}
			<div class="meter">
				<div class="meter-track">
					<div class="meter-fill" style="width: {pct(audioTuningStore.bass, 0, 1)}%"></div>
					<div
						class="meter-line"
						style="left: {pct(audioTuningStore.bassAvg * audioTuningStore.beatRatio, 0, 1)}%"
						title="Beat threshold"
					></div>
					<div
						class="meter-line big"
						style="left: {pct(audioTuningStore.bassAvg * audioTuningStore.bigHitRatio, 0, 1)}%"
						title="Big-hit threshold"
					></div>
				</div>
				<p class="readout">
					bass {audioTuningStore.bass.toFixed(3)} · avg {audioTuningStore.bassAvg.toFixed(3)} · ratio
					<strong>{bassRatio.toFixed(2)}×</strong>
				</p>
				<p class="readout">
					beats: {audioTuningStore.beatCount} · big hits: {audioTuningStore.bigHitCount}
				</p>
			</div>

			{#each SLIDERS as slider (slider.key)}
				<label class="slider-row">
					<span class="slider-label">
						{slider.label}
						<span class="slider-value"
							>{audioTuningStore[slider.key].toFixed(slider.step < 1 ? 2 : 0)}{slider.unit}</span
						>
					</span>
					<input
						type="range"
						min={slider.min}
						max={slider.max}
						step={slider.step}
						value={audioTuningStore[slider.key]}
						oninput={(event) => {
							audioTuningStore[slider.key] = Number(event.currentTarget.value);
						}}
					/>
				</label>
			{/each}

			<div class="actions">
				<button type="button" class="btn-small" onclick={() => audioTuningStore.resetCounts()}>
					Reset counts
				</button>
				<button type="button" class="btn-small" onclick={() => audioTuningStore.resetToDefaults()}>
					Reset to defaults
				</button>
				<button type="button" class="btn-small" onclick={copyValues}>
					{copyLabel}
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.audio-debug {
		position: fixed;
		left: 1rem;
		bottom: 1rem;
		z-index: 60;
		width: 19rem;
		max-width: calc(100vw - 2rem);
		padding: 0.9rem 1rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-elevated);
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
		font-size: var(--text-xs);
		color: var(--text);
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.collapsed .header {
		margin: 0;
	}

	.collapse-toggle {
		padding: 0.2rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-xs);
		cursor: pointer;
	}

	.meter {
		margin: 0.8rem 0;
	}

	.meter-track {
		position: relative;
		height: 0.6rem;
		border-radius: 999px;
		background: var(--border);
		overflow: visible;
	}

	.meter-fill {
		height: 100%;
		border-radius: 999px;
		background: var(--accent);
		transition: width 0.05s linear;
	}

	.meter-line {
		position: absolute;
		top: -0.15rem;
		width: 2px;
		height: 0.9rem;
		background: var(--text-muted);
	}

	.meter-line.big {
		background: #e0455f;
	}

	.readout {
		margin: 0.35rem 0 0;
		color: var(--text-muted);
	}

	.readout strong {
		color: var(--text);
	}

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

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.9rem;
	}

	.btn-small {
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text);
		font: inherit;
		font-size: var(--text-xs);
		cursor: pointer;
	}

	.btn-small:hover {
		background: var(--glass-bg);
	}
</style>
