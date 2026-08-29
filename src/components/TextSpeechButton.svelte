<script>
	/**
	 * Hear one text sample: the creator's own recording when they supplied
	 * one for it, otherwise an automatic read-aloud via the browser's speech
	 * synthesiser (see `$lib/speech.js` for why that engine and not a
	 * shipped one).
	 *
	 * Takes `entry` plus an `excerptIndex` rather than the whole entry alone,
	 * because a card no longer shows every sample at once — `TextStage`
	 * rotates through them — so this control has to act on whichever one is
	 * actually on screen, not silently read all three back to back. The
	 * full-sample viewer reuses this same component once per excerpt instead
	 * of duplicating the play-or-speak logic a second time.
	 */
	import { onDestroy, onMount } from 'svelte';
	import { audioPlayerStore } from '$lib/audioPlayerStore.svelte.js';
	import { pickVoice, speak, speechSupported } from '$lib/speech.js';
	import { stripHtml } from '$lib/ring.js';

	/** @type {{ entry: import('$lib/ring.js').RingEntry, excerptIndex?: number }} */
	let { entry, excerptIndex = 0 } = $props();

	const sample = $derived(entry.excerpts?.[excerptIndex] ?? null);
	const passage = $derived(stripHtml(sample?.text ?? '').trim());
	const hasRecording = $derived(Boolean(sample?.audio_url?.trim()));

	let voice = $state(/** @type {SpeechSynthesisVoice | null} */ (null));
	// Covers both playback kinds: a recording and a synthesised reading are
	// mutually exclusive and look identical from the button's own point of
	// view, so one flag serves both rather than two that could disagree.
	let active = $state(false);
	/** @type {(() => void) | null} */
	let stopSpeech = null;
	let audioEl = $state(/** @type {HTMLAudioElement | undefined} */ (undefined));
	let pausedTrackKey = /** @type {string | null} */ (null);

	onMount(() => {
		if (!speechSupported()) return;
		const resolveVoice = () => (voice = pickVoice(document.documentElement.lang || 'en'));
		resolveVoice();
		window.speechSynthesis.addEventListener('voiceschanged', resolveVoice);
		return () => window.speechSynthesis.removeEventListener('voiceschanged', resolveVoice);
	});

	// Either kind of playback competes with the main audio player for the
	// visitor's attention, the same way the field-wide player already ducks
	// for a game trailer (see FieldNode's handleTrailerChange): the queue
	// pauses while this reads or plays, and resumes only if it was this
	// control that paused it.
	function duckMainQueue() {
		if (audioPlayerStore.playing && audioPlayerStore.current) {
			pausedTrackKey = audioPlayerStore.current.key;
			audioPlayerStore.setPlaying(false);
		}
	}

	function returnAudioLane() {
		const shouldResume = pausedTrackKey && audioPlayerStore.current?.key === pausedTrackKey;
		pausedTrackKey = null;
		if (shouldResume && !audioPlayerStore.playing) audioPlayerStore.setPlaying(true);
	}

	function stop() {
		active = false;
		const cancel = stopSpeech;
		stopSpeech = null;
		cancel?.();
		if (audioEl && !audioEl.paused) {
			audioEl.pause();
			audioEl.currentTime = 0;
		}
		returnAudioLane();
	}

	function toggle() {
		if (active) {
			stop();
			return;
		}
		if (!hasRecording && (!passage || !voice)) return;

		duckMainQueue();
		active = true;

		if (hasRecording) {
			audioEl?.play().catch(() => {
				active = false;
				returnAudioLane();
			});
			return;
		}

		stopSpeech = speak(passage, {
			voice,
			onDone: () => {
				active = false;
				stopSpeech = null;
				returnAudioLane();
			}
		});
	}

	onDestroy(stop);
</script>

{#if hasRecording || (passage && voice)}
	{#if hasRecording}
		<audio
			bind:this={audioEl}
			src={sample?.audio_url}
			preload="none"
			onended={() => {
				active = false;
				returnAudioLane();
			}}
		></audio>
	{/if}
	<button
		type="button"
		class="speech-button"
		class:reading={active}
		onclick={toggle}
		aria-pressed={active}
		aria-label={active
			? `Stop reading ${entry.creator}`
			: hasRecording
				? `Play ${entry.creator}'s recording of this sample`
				: `Read ${entry.creator}'s excerpt aloud`}
		title={active ? 'Stop reading' : hasRecording ? 'Play recording' : 'Read aloud'}
	>
		{#if active}
			<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
				<rect x="6" y="6" width="4" height="12" rx="1" />
				<rect x="14" y="6" width="4" height="12" rx="1" />
			</svg>
		{:else}
			<svg
				viewBox="0 0 24 24"
				width="16"
				height="16"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" stroke-linejoin="round" />
				<path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.4 6.4a8 8 0 0 1 0 11.2" />
			</svg>
		{/if}
	</button>
{/if}

<style>
	/* The one control on a text node that is easy to miss and most worth
	   finding, so it carries the node's colour as its own ground rather than
	   sitting in the same neutral chip every other control uses. Those chips
	   read as a row of equal, quiet affordances; against them a filled button
	   is the thing the eye lands on, which is the whole point — "hear this"
	   is the offer a text node is actually making.

	   The ring is not decoration either: this sits over an arbitrary cover
	   photo, and a filled shape with no edge can land on artwork close enough
	   to its own colour to disappear. A light hairline guarantees an edge
	   whatever is behind it, the same problem the queue button's own note
	   describes solving with a solid ground. */
	.speech-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 2.1rem;
		height: 2.1rem;
		border: 1px solid rgb(255 255 255 / 0.35);
		border-radius: 999px;
		background: var(--node-color);
		color: var(--bg-elevated);
		box-shadow: 0 0.15rem 0.5rem rgb(0 0 0 / 0.35);
		cursor: pointer;
	}

	.speech-button:hover,
	.speech-button:focus-visible {
		background: color-mix(in oklch, var(--node-color) 75%, white);
		color: var(--bg-elevated);
	}

	/* Reading inverts rather than brightening: the button is now a stop
	   control, and it should not keep advertising itself as the invitation it
	   was a moment ago. */
	.speech-button.reading {
		background: var(--bg-elevated);
		color: var(--node-color);
	}
</style>
