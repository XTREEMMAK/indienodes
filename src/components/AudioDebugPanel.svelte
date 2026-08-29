<script>
	/**
	 * Dev-only tuning panel for `AudioPlayer.svelte`'s bass/beat detector.
	 * Every control here writes directly into `audioTuningStore`, which
	 * `AudioPlayer` reads fresh every animation frame — so a drag takes
	 * effect on the next frame, live, while a track plays, rather than
	 * needing an edit-reload-relisten loop to find the right numbers.
	 *
	 * Two views over the same six values, chosen in the header or by URL:
	 * `?debug=audio` opens the original sliders-and-meter, and
	 * `?debug=audio-graph` opens `AudioDebugGraph.svelte`, which draws the
	 * filter's response curve and the thresholds the bass is being measured
	 * against. The sliders view was kept rather than replaced — it is the
	 * compact one, it fits beside a running app without covering it, and a
	 * number is still the fastest way to check a number.
	 *
	 * Gated on `import.meta.env.DEV` (tree-shaken out of production, same
	 * reasoning as `submissionApi.js`'s own `useMock`) AND a `debug` value in
	 * the URL, so it doesn't clutter an ordinary dev session by default —
	 * self-contained rather than making `+layout.svelte` check anything,
	 * the same "caller never has to know" posture `Turnstile.svelte` uses
	 * for its own site-key gate.
	 */
	import { page } from '$app/state';
	import {
		AUDIO_TUNING_SLIDERS,
		AUDIO_TUNING_DEFAULTS,
		audioTuningStore
	} from '$lib/audioTuning.svelte.js';
	import AudioDebugGraph from './AudioDebugGraph.svelte';
	import AudioTuningSlider from './AudioTuningSlider.svelte';

	/** @type {Record<string, 'sliders' | 'graph'>} */
	const DEBUG_VIEWS = { audio: 'sliders', 'audio-graph': 'graph' };

	const requested = $derived(DEBUG_VIEWS[page.url.searchParams.get('debug') ?? '']);
	const enabled = $derived(import.meta.env.DEV && Boolean(requested));

	let collapsed = $state(false);
	let copyLabel = $state('Copy values');

	/** @type {'sliders' | 'graph'} */
	let view = $state('sliders');
	// Follows the URL when the URL changes, but is a `$state` rather than a
	// `$derived` so the header's own buttons can move it without a navigation.
	$effect(() => {
		if (requested) view = requested;
	});

	/** The live ratio a real hit needs to clear — the one number most worth watching while a track plays. */
	const bassRatio = $derived(
		audioTuningStore.bassAvg > 0 ? audioTuningStore.bass / audioTuningStore.bassAvg : 0
	);

	/** @param {number} value @param {number} min @param {number} max */
	function pct(value, min, max) {
		return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
	}

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
		const keys = /** @type {import('$lib/audioTuning.svelte.js').AudioTuningKey[]} */ (
			Object.keys(AUDIO_TUNING_DEFAULTS)
		);
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
	<div class="audio-debug" class:collapsed class:wide={!collapsed && view === 'graph'}>
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
			<div class="views" role="group" aria-label="Tuning view">
				<button
					type="button"
					class="view-tab"
					class:active={view === 'sliders'}
					aria-pressed={view === 'sliders'}
					onclick={() => (view = 'sliders')}
				>
					Sliders
				</button>
				<button
					type="button"
					class="view-tab"
					class:active={view === 'graph'}
					aria-pressed={view === 'graph'}
					onclick={() => (view = 'graph')}
				>
					Graph
				</button>
			</div>

			{#if view === 'graph'}
				<AudioDebugGraph />
			{:else}
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

				{#each AUDIO_TUNING_SLIDERS as field (field.key)}
					<AudioTuningSlider {field} />
				{/each}
			{/if}

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

	/* The graph view carries two canvases and needs the width to make a log
	   frequency axis readable; the sliders view is deliberately left narrow. */
	.audio-debug.wide {
		width: 27rem;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		overscroll-behavior: contain;
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

	.views {
		display: flex;
		gap: 0.3rem;
		margin-top: 0.7rem;
	}

	.view-tab {
		flex: 1;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-xs);
		cursor: pointer;
	}

	.view-tab.active {
		border-color: var(--accent);
		color: var(--accent);
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
