<script>
	/**
	 * The one audio element in the app, plus its transport and queue.
	 *
	 * Mounted once in the root layout and hidden entirely until something is
	 * queued, so the resting field carries no player chrome. `audioPlayerStore`
	 * owns the queue and the playhead; this component owns the `<audio>` tag
	 * and keeps the two in sync in both directions (store changes drive the
	 * element, and the element's own events, ending a track, being paused by
	 * the OS or a headset button, report back).
	 *
	 * A plain `<audio>` rather than Wavesurfer.js, which the brief names
	 * (section 4). Wavesurfer draws a waveform, which is a reader-surface
	 * feature: it wants a tall, focused view of one track. This is a transport
	 * bar for a queue, where a waveform would be decoration at 3rem tall and
	 * would mean decoding every queued file up front. Wavesurfer still fits
	 * the reader when the reader exists; the two are not competing.
	 *
	 * @type {{ entries?: import('../lib/ring.js').RingEntry[] }}
	 */
	let { entries = [] } = $props();

	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { fade, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { audioPlayerStore } from '$lib/audioPlayerStore.svelte.js';
	import { audioLevelStore } from '$lib/audioLevelStore.svelte.js';
	import { journalStore } from '$lib/journalStore.svelte.js';
	import { favoritesStore } from '$lib/favoritesStore.svelte.js';
	import { hiddenStore } from '$lib/hiddenStore.svelte.js';
	import { suggestNext } from '$lib/audioSuggest.js';
	import { rampVolume } from '$lib/audioRamp.js';
	import { coverImageUrl } from '$lib/ring.js';
	import { flyFade } from '$lib/transitions.js';

	/** @type {HTMLAudioElement | undefined} */
	let audioEl = $state(undefined);
	let elapsed = $state(0);
	let duration = $state(0);

	const current = $derived(audioPlayerStore.current);
	const queue = $derived(audioPlayerStore.queue);
	const previewing = $derived(audioPlayerStore.isPreviewing);

	// Load a new source only when the track actually changes. Assigning `src`
	// unconditionally on every state change would restart the current track
	// every time the queue was reordered or the panel toggled.
	let loadedUrl = '';

	/**
	 * Origins known to refuse CORS, learned by trying. Anything not in here
	 * is loaded optimistically in CORS mode, which is what makes the reactive
	 * background available from the very first track.
	 *
	 * This replaced a `HEAD` probe before playback. The probe was worse in
	 * two ways: it delayed the first track of every new host, and a blocked
	 * cross-origin request always writes to the console, so it left an error
	 * on screen for every host that simply did not opt in.
	 * @type {Set<string>}
	 */
	const corsDenied = new SvelteSet();

	/** @param {string} url */
	function originOf(url) {
		try {
			return new URL(url, location.href).origin;
		} catch {
			return '';
		}
	}

	/**
	 * Points the element at a track, choosing CORS mode up front.
	 *
	 * `crossOrigin` has to be set *before* `src`, because it selects the mode
	 * the resource is fetched in. Setting it afterwards was the cause of two
	 * separate bugs: it invalidated the already-loaded resource, so seeking
	 * restarted the track from zero, and the analyser could never attach to
	 * the track that was actually playing.
	 * @param {HTMLAudioElement} el
	 * @param {string} url
	 */
	function loadTrack(el, url) {
		loadedUrl = url;
		// `null` rather than '' removes the attribute, which is the "no CORS"
		// mode; '' is treated as "anonymous".
		el.crossOrigin = corsDenied.has(originOf(url)) ? null : 'anonymous';
		el.src = url;
		elapsed = 0;
		duration = 0;
	}

	$effect(() => {
		const track = current;
		const el = audioEl;
		if (!el || !track) return;
		if (track.url !== loadedUrl) loadTrack(el, track.url);
	});

	/**
	 * A host that will not serve the file in CORS mode fails the load
	 * outright (`MEDIA_ELEMENT_ERROR`, code 4, measured against Bandcamp).
	 * Rather than probing every host in advance to avoid this, learn it here
	 * and reload once without CORS. The cost lands only on hosts that refuse,
	 * only on their first track, and it costs them the reactive background
	 * rather than their audio.
	 */
	function handleMediaError() {
		const el = audioEl;
		if (!el || !current) return;
		const origin = originOf(current.url);
		if (el.crossOrigin !== 'anonymous' || corsDenied.has(origin)) return;

		corsDenied.add(origin);
		const wasPlaying = audioPlayerStore.playing;
		loadTrack(el, current.url);
		if (wasPlaying) el.play().catch(() => audioPlayerStore.setPlaying(false));
	}

	// Playback intent is state, not an imperative call, so the store can be
	// driven from anywhere (a node's play button, the end-of-queue prompt)
	// without those callers reaching for the element. `play()` rejects when a
	// browser blocks it or the source 404s, and an unhandled rejection there
	// would leave the UI claiming to play silence, so a failure is reported
	// back into the store as "not playing."
	// Idempotent on purpose, and this is load-bearing rather than tidiness.
	//
	// The element's own `play` and `pause` events write back into the store
	// (see the handlers on <audio>), and this effect reads that same store
	// value. So an effect that issued a command every time it ran was a
	// feedback loop waiting for a trigger: one interruption mid-playback was
	// enough to set up a sustained oscillation, measured at over ten thousand
	// play/pause pairs in six seconds, which is what the play button flapping
	// actually was. The audio kept playing; the *state* never settled.
	//
	// Comparing against the element's real state first means a re-run for any
	// reason at all is a no-op, so nothing can feed itself.
	//
	// The preview lane suspends this rather than changing what it wants. While
	// a preview is sounding, the main element is paused but `playing` stays
	// true, because the visitor never asked it to stop: auditioning something
	// else is not a pause. That is also what makes resuming free. The moment
	// `previewing` flips back, this effect re-runs and restores the element to
	// whatever the store still says it should be doing.
	//
	// `suspended` is read *before* the guards on purpose. An effect's tracked
	// dependencies come from what it actually reads on its own run, so reading
	// it after an early return would mean the run that first passes the guard
	// decides the dependency set forever, and the preview would never release
	// the main element. That exact trap has already cost this codebase a
	// silently-disabled drag handler.
	$effect(() => {
		const el = audioEl;
		const wantPlaying = audioPlayerStore.playing;
		const track = current;
		const suspended = previewing;
		if (!el || !track) return;
		if (suspended) return;
		if (wantPlaying && el.paused) {
			el.play().catch(() => audioPlayerStore.setPlaying(false));
		} else if (!wantPlaying && !el.paused) {
			el.pause();
		}
	});

	/** @param {number} seconds */
	function formatTime(seconds) {
		if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
		const whole = Math.floor(seconds);
		return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
	}

	function handlePrev() {
		// Past three seconds, Previous restarts the track rather than leaving
		// it, which is what every other transport does and what people expect
		// from a button in this position.
		if (audioEl && audioEl.currentTime > 3) {
			audioEl.currentTime = 0;
			return;
		}
		audioPlayerStore.prev();
		if (audioEl) audioEl.currentTime = 0;
	}

	/** @param {Event} event */
	function handleSeek(event) {
		const value = Number(/** @type {HTMLInputElement} */ (event.currentTarget).value);
		if (audioEl && Number.isFinite(value)) audioEl.currentTime = value;
	}

	// Volume lives here rather than in the store: it is a property of this
	// device's playback, not of the queue, and it is the one piece of player
	// state worth remembering between sessions (a queue is not, see the
	// store's own note). Restored from localStorage on mount.
	let volume = $state(1);
	let muted = $state(false);
	/** Volume before the last mute, so unmuting returns to where it was. */
	let volumeBeforeMute = 1;

	const VOLUME_KEY = 'indienode:volume:v1';

	$effect(() => {
		const stored = localStorage.getItem(VOLUME_KEY);
		if (stored === null) return;
		const parsed = Number(stored);
		if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
			volume = parsed;
			volumeBeforeMute = parsed || 1;
		}
	});

	// Ducking multiplier for the main element, applied on top of `volume` and
	// deliberately NOT part of it. The slider is bound to `volume` alone, so a
	// preview fading the music down never drags the control the visitor set:
	// the duck is the app briefly borrowing the sound, not a change to their
	// chosen level. Keeping them as two numbers is what makes that structural
	// rather than something the UI has to remember not to display.
	let duckGain = $state(1);
	/** @type {import('$lib/audioRamp.js').RampHandle | null} */
	let duckRamp = null;

	const DUCK_OUT_MS = 240;
	const DUCK_IN_MS = 420;

	$effect(() => {
		const el = audioEl;
		const value = (muted ? 0 : volume) * duckGain;
		if (el) el.volume = value;
	});

	// Drives the duck in both directions. Reads `duckGain` through `untrack`
	// because it also writes it, and an effect that both reads and writes the
	// same value re-triggers itself forever otherwise. Reading it at all is
	// only so a ramp interrupted mid-fade continues from where it actually is
	// rather than jumping.
	$effect(() => {
		const active = previewing;
		const el = audioEl;
		if (!el) return;

		duckRamp?.cancel();
		const from = untrack(() => duckGain);

		if (active) {
			duckRamp = rampVolume({
				from,
				to: 0,
				duration: DUCK_OUT_MS,
				onValue: (value) => (duckGain = value),
				// Paused only once it is silent, so the stop is never audible.
				// The element keeps its currentTime and its loaded resource, so
				// resuming costs nothing and seeks nowhere.
				onDone: () => {
					if (!el.paused) el.pause();
				}
			});
		} else {
			duckRamp = rampVolume({
				from,
				to: 1,
				duration: DUCK_IN_MS,
				onValue: (value) => (duckGain = value)
			});
		}
	});

	$effect(() => {
		return () => duckRamp?.cancel();
	});

	// ----------------------------------------------------------- preview ---
	// A second element, not a second use of the first one. Sharing would mean
	// reassigning `src`, which discards the main track's loaded resource and
	// its position, and would drag the whole crossOrigin-before-src problem
	// into a path that has no need of it. Two elements make "put it back" a
	// no-op instead of a reload.

	/** @type {HTMLAudioElement | undefined} */
	let previewEl = $state(undefined);
	let previewLoadedUrl = '';

	$effect(() => {
		const el = previewEl;
		const value = muted ? 0 : volume;
		if (el) el.volume = value;
	});

	$effect(() => {
		const el = previewEl;
		const item = audioPlayerStore.previewItem;
		const wantPlaying = audioPlayerStore.previewPlaying;
		if (!el) return;

		if (!item) {
			if (!el.paused) el.pause();
			previewLoadedUrl = '';
			return;
		}

		if (item.url !== previewLoadedUrl) {
			previewLoadedUrl = item.url;
			// No CORS mode here: the preview lane never feeds the analyser, so
			// there is nothing to gain from it, and a host that refuses would
			// fail the load outright for no benefit.
			el.crossOrigin = null;
			el.src = item.url;
		}

		// Same idempotence rule as the main element: compare against the real
		// state first so a re-run for any reason cannot issue a command.
		if (wantPlaying && el.paused) {
			el.play().catch(() => audioPlayerStore.stopPreview());
		} else if (!wantPlaying && !el.paused) {
			el.pause();
		}
	});

	/** @param {Event} event */
	function handleVolume(event) {
		const value = Number(/** @type {HTMLInputElement} */ (event.currentTarget).value);
		if (!Number.isFinite(value)) return;
		volume = value;
		muted = value === 0;
		if (value > 0) volumeBeforeMute = value;
		try {
			localStorage.setItem(VOLUME_KEY, String(value));
		} catch {
			// Private mode or a full quota: volume just will not persist.
		}
	}

	function toggleMute() {
		if (muted || volume === 0) {
			muted = false;
			volume = volumeBeforeMute || 1;
		} else {
			volumeBeforeMute = volume;
			muted = true;
		}
	}

	// ---------------------------------------------------------- analysis ---
	// Feeds AmbientBackground so the drifting particles can react to what is
	// playing. Everything here is conditional on the source allowing CORS;
	// see audioLevelStore's own note for why attaching this blindly would
	// silence playback rather than merely fail to analyse it.

	/** @type {AudioContext | undefined} */
	let audioCtx;
	/** @type {AnalyserNode | undefined} */
	let analyser;
	/** @type {MediaElementAudioSourceNode | undefined} */
	let sourceNode;
	/** Element the source node was created from. Web Audio allows exactly one per element. */
	let wiredEl = /** @type {HTMLAudioElement | undefined} */ (undefined);
	let rafId = 0;
	/**
	 * Beat detection state.
	 *
	 * Measured against real music before being written this way: a full
	 * spectrum average of XENO sat between 0.40 and 0.53 for six seconds
	 * straight. As a driver for anything visual that is a constant, not a
	 * signal, and the first version of this drove particle speed with it
	 * directly, which is why the background looked like it was doing nothing.
	 *
	 * Beats are found in the bass instead, and relative to the recent past
	 * rather than absolutely: a kick is not "loud", it is *louder than the
	 * last second and a half was*. That is what survives a track being quiet
	 * or dense, and it is what makes the value return to zero between hits so
	 * there is something to slow back down to.
	 */
	let bassHistory = /** @type {number[]} */ ([]);
	let smoothed = 0;
	let pulseValue = 0;
	let lastBeatAt = 0;

	/** Roughly 1.5s at 60fps. Long enough to average over a bar, short enough to track a build. */
	const BASS_WINDOW = 90;
	/**
	 * How far above its own recent average the bass has to jump to count.
	 *
	 * 1.12 rather than something more dramatic, because loud modern masters
	 * leave very little headroom: measured across XENO the bass band averages
	 * 0.87 of full scale, so a kick simply cannot be 1.3x its own average.
	 * At this ratio roughly a tenth of frames qualify, which after the
	 * minimum-gap below lands around two beats a second.
	 */
	const BEAT_RATIO = 1.12;
	/** Floor, so near-silence does not manufacture beats out of noise. */
	const BEAT_FLOOR = 0.1;
	/** Minimum gap between beats, so one kick is not counted three times. */
	const BEAT_GAP_MS = 110;

	function readFrame() {
		if (!analyser) return;
		const bins = new Uint8Array(analyser.frequencyBinCount);
		analyser.getByteFrequencyData(bins);

		let sum = 0;
		for (const value of bins) sum += value;
		const energy = sum / bins.length / 255;

		// Bins 1 to 6 of a 128-bin analyser at 44.1kHz is roughly 170Hz to
		// 1.2kHz: kick and bass, where the beat actually lives. Bin 0 is DC
		// and carries no useful signal.
		let bass = 0;
		for (let i = 1; i <= 6; i += 1) bass += bins[i];
		bass = bass / 6 / 255;

		bassHistory.push(bass);
		if (bassHistory.length > BASS_WINDOW) bassHistory.shift();
		const bassAvg = bassHistory.reduce((a, b) => a + b, 0) / bassHistory.length;

		const now = performance.now();
		if (bass > bassAvg * BEAT_RATIO && bass > BEAT_FLOOR && now - lastBeatAt > BEAT_GAP_MS) {
			// Snapped to full rather than accumulated: a beat is an event, and
			// scaling it by how hard it hit made quiet passages produce
			// half-beats that read as jitter.
			pulseValue = 1;
			lastBeatAt = now;
		}
		// Fast decay, so the field is visibly settling back between hits
		// rather than riding a plateau.
		pulseValue *= 0.86;

		// Sustained loudness still gets a gentle say, but relative to its own
		// recent floor so a constant 0.47 contributes almost nothing.
		smoothed = energy > smoothed ? smoothed + (energy - smoothed) * 0.35 : smoothed * 0.94;

		audioLevelStore.report(Math.min(1, smoothed), pulseValue);
		rafId = requestAnimationFrame(readFrame);
	}

	/**
	 * Wires the element into an analyser once, for a source that permits it.
	 * @param {HTMLAudioElement} el
	 */
	function ensureAnalysis(el) {
		if (wiredEl === el && analyser) return;

		// Only a resource fetched in CORS mode can be read by Web Audio, and
		// `crossOrigin` is set before `src` (see loadTrack), so this attribute
		// is a reliable statement about the resource currently loaded. It is
		// also the whole guard: connecting a node whose source was fetched
		// without CORS does not fail loudly, it outputs silence, which would
		// mean breaking the audio to animate a background.
		if (el.crossOrigin !== 'anonymous') {
			audioLevelStore.reset();
			return;
		}

		try {
			audioCtx ??= new AudioContext();
			analyser ??= audioCtx.createAnalyser();
			analyser.fftSize = 256;
			analyser.smoothingTimeConstant = 0.2;
			sourceNode ??= audioCtx.createMediaElementSource(el);
			sourceNode.connect(analyser);
			analyser.connect(audioCtx.destination);
			wiredEl = el;
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(readFrame);
		} catch {
			// A browser that refuses any part of this leaves playback alone.
			audioLevelStore.reset();
		}
	}

	$effect(() => {
		const el = audioEl;
		const track = current;
		const isPlaying = audioPlayerStore.playing;
		if (!el || !track) return;
		if (!isPlaying) return;
		audioCtx?.resume().catch(() => {});
		ensureAnalysis(el);
	});

	$effect(() => {
		// Stop reporting the moment the queue empties, so the background
		// settles back to its idle drift instead of holding the last level.
		if (audioPlayerStore.isEmpty) {
			cancelAnimationFrame(rafId);
			audioLevelStore.reset();
		}
	});

	$effect(() => {
		return () => {
			cancelAnimationFrame(rafId);
			audioLevelStore.reset();
			audioCtx?.close().catch(() => {});
		};
	});

	// A track reaching its own end is the only thing recorded as "listened":
	// starting something and skipping it is not listening to it, and a preview
	// is explicitly an audition rather than a play. Nothing reads this back
	// into what gets shown; see journalStore's own note on why that matters.
	function handleTrackEnded() {
		const entryId = audioPlayerStore.current?.entryId;
		if (entryId) journalStore.record(entryId, 'listened');
		audioPlayerStore.next();
	}

	/**
	 * Mirrors FieldNode's own like handler, including the mutual exclusion
	 * with a hide and recording the journal event on the way in only, so
	 * liking from here and liking from a card are the same action rather than
	 * two that drift apart.
	 * @param {string} entryId
	 */
	function toggleFavoriteCurrent(entryId) {
		if (favoritesStore.isLiked(entryId)) {
			favoritesStore.toggle(entryId);
			return;
		}
		if (hiddenStore.isHidden(entryId)) hiddenStore.toggle(entryId);
		journalStore.record(entryId, 'liked');
		favoritesStore.toggle(entryId);
	}

	/**
	 * Mirrors FieldNode's own hide handler. The brief (section 8) calls this
	 * case out specifically: marking the currently playing node Not for Me
	 * has to drop its remaining queued tracks and move on to the next node's
	 * first track, not just keep playing what it was already playing.
	 * @param {string} entryId
	 */
	function toggleHiddenCurrent(entryId) {
		if (hiddenStore.isHidden(entryId)) {
			hiddenStore.toggle(entryId);
			return;
		}
		if (favoritesStore.isLiked(entryId)) favoritesStore.toggle(entryId);
		journalStore.record(entryId, 'hidden');
		hiddenStore.toggle(entryId);
		audioPlayerStore.removeEntry(entryId);
	}

	// ---------------------------------------------------------- reactions ---

	/**
	 * A one-shot speech-bubble flourish on hover for the like/hide buttons —
	 * purely decorative, carries no state ("Yah!"/"Nah.." say nothing the
	 * button's own pressed state doesn't already), so it is never gated
	 * behind anything and never needs restoring after a reload.
	 * @type {'like' | 'hide' | null}
	 */
	let reactionBubble = $state(null);

	/**
	 * Screen coordinates for the bubble, taken from its trigger button at the
	 * moment it's shown. `.player` itself is `overflow: hidden` (it clips its
	 * own rounded corners around the queue panel and preview strip), which
	 * would otherwise clip a bubble meant to poke out above the bar entirely.
	 * Rendered `position: fixed` and outside `.player`'s own markup rather
	 * than nested inside it, computed fresh on each hover rather than kept
	 * reactive to scroll/resize: the bar is itself `position: fixed`, so its
	 * buttons don't move under a hover that's already in progress.
	 * @type {{ top: number, left: number } | null}
	 */
	let reactionPos = $state(null);

	/** @type {ReturnType<typeof setTimeout> | null} */
	let reactionTimer = null;

	/**
	 * Shows the bubble and starts its own one-second countdown to dismiss —
	 * deliberately not tied to `mouseleave`, so a visitor who hovers and
	 * holds still still sees it go away rather than it sitting there for as
	 * long as the pointer does. Re-hovering restarts the full second.
	 * @param {'like' | 'hide'} which
	 * @param {HTMLElement} anchorEl
	 */
	function showReactionBubble(which, anchorEl) {
		if (reactionTimer) clearTimeout(reactionTimer);
		const rect = anchorEl.getBoundingClientRect();
		reactionPos = { top: rect.top, left: rect.left + rect.width / 2 };
		reactionBubble = which;
		reactionTimer = setTimeout(() => {
			reactionBubble = null;
			reactionTimer = null;
		}, 1000);
	}

	function hideReactionBubble() {
		if (reactionTimer) {
			clearTimeout(reactionTimer);
			reactionTimer = null;
		}
		reactionBubble = null;
	}

	$effect(() => {
		return () => {
			if (reactionTimer) clearTimeout(reactionTimer);
		};
	});

	const suggestion = $derived(audioPlayerStore.atEnd ? suggestNext(entries, queue) : null);

	/**
	 * True once the visitor has clicked "Keep going" at least once this
	 * session. Not persisted, same as the queue itself: it describes
	 * "still going along with the queue mode I just started," not a
	 * durable preference.
	 */
	let autoKeepGoing = $state(false);

	/** Queues one more suggested node and advances into it. */
	function pullNext() {
		const next = suggestNext(entries, queue);
		if (!next) {
			// A genuine dead end, not a pause: nothing left to suggest, so
			// there is nothing left to keep going with either. Falls through
			// to the prompt below, which reads this as "Nothing else in the
			// ring to play."
			autoKeepGoing = false;
			return;
		}
		audioPlayerStore.addEntry(next, coverImageUrl(next));
		audioPlayerStore.next();
	}

	/**
	 * The first "Keep going" click. This *is* the brief's own "visitor
	 * explicitly starts a playlist/queue mode" (section 11) — everything
	 * after it is that same mode continuing, not a new request each time.
	 */
	function keepGoing() {
		autoKeepGoing = true;
		pullNext();
	}

	/** Stops pulling more without touching what's already queued. */
	function stopKeepGoing() {
		autoKeepGoing = false;
	}

	// Re-fires `pullNext` on every later run-out once the visitor has
	// opted in, instead of re-showing the prompt each time a node finishes
	// (this used to ask again on every single one). Guarded on `suggestion`
	// so it never fights the prompt's own "nothing else" branch: `pullNext`
	// already clears `autoKeepGoing` on a genuine dead end, and by the time
	// that happens `suggestion` is already null, so this effect has nothing
	// left to do either.
	$effect(() => {
		if (audioPlayerStore.atEnd && autoKeepGoing && suggestion) pullNext();
	});

	// This component mounts once at the layout root and never unmounts
	// across navigation (see the mount comment in +layout.svelte), so
	// `autoKeepGoing` would otherwise survive from one queue into a
	// completely unrelated later one — clearing the queue, or letting it
	// empty out, is the actual session boundary, and a fresh queue after
	// that boundary should always ask the first time again.
	$effect(() => {
		if (audioPlayerStore.isEmpty) autoKeepGoing = false;
	});
</script>

{#if !audioPlayerStore.isEmpty}
	<div class="player glass-panel" transition:flyFade={{ y: 24, duration: 220 }}>
		<!-- While previewing, this element's own play/pause events are the app
		     ducking it, not the visitor pausing it, so they must not be written
		     back as intent. Without that guard the preview's pause would record
		     "not playing" and the music would never come back on its own. -->
		<audio
			bind:this={audioEl}
			preload="metadata"
			ontimeupdate={() => (elapsed = audioEl?.currentTime ?? 0)}
			onloadedmetadata={() => (duration = audioEl?.duration ?? 0)}
			onerror={handleMediaError}
			onended={handleTrackEnded}
			onplay={() => !previewing && audioPlayerStore.setPlaying(true)}
			onpause={() => !previewing && audioPlayerStore.setPlaying(false)}
		></audio>

		<!-- The preview lane. Silent and idle unless something is being
		     auditioned; it is never a queue member and never advances. -->
		<audio
			bind:this={previewEl}
			preload="metadata"
			onended={() => audioPlayerStore.stopPreview()}
			onerror={() => audioPlayerStore.stopPreview()}
			onplay={() => audioPlayerStore.setPreviewPlaying(true)}
			onpause={() => audioPlayerStore.setPreviewPlaying(false)}
		></audio>

		{#if audioPlayerStore.previewItem}
			<div class="preview-strip" transition:slide={{ duration: 180, easing: cubicOut }}>
				<span class="preview-label">Previewing</span>
				<span class="preview-title">
					{audioPlayerStore.previewItem.label}
					<span class="preview-creator">by {audioPlayerStore.previewItem.creator}</span>
				</span>
				<div class="preview-actions">
					<button
						type="button"
						class="prompt-yes"
						onclick={() => audioPlayerStore.promotePreview()}
					>
						Add to queue
					</button>
					<button type="button" class="prompt-no" onclick={() => audioPlayerStore.stopPreview()}>
						Stop
					</button>
				</div>
			</div>
		{/if}

		{#if audioPlayerStore.atEnd && (!autoKeepGoing || !suggestion)}
			<!-- The brief's "keep going" prompt (section 8): a visible yes/no
			     the first time a queue runs out, never an automatic
			     continuation nobody asked for. Once the visitor has said yes,
			     that IS the brief's "explicitly starts a playlist/queue mode"
			     (section 11) — this stops re-appearing on every later node
			     that finishes (see `autoKeepGoing`, above) and only comes back
			     if there's genuinely nothing left to suggest. -->
			<div class="prompt">
				<p>
					{#if suggestion}
						Queue finished. Play more from <strong>{suggestion.creator}</strong> next?
					{:else}
						Queue finished. Nothing else in the ring to play.
					{/if}
				</p>
				<div class="prompt-actions">
					{#if suggestion}
						<button type="button" class="prompt-yes" onclick={keepGoing}>Keep going</button>
					{/if}
					<button type="button" class="prompt-no" onclick={() => audioPlayerStore.clear()}>
						Stop
					</button>
				</div>
			</div>
		{/if}

		<div class="bar">
			<div class="now-playing">
				{#if current?.cover}
					<img class="cover" src={current.cover} alt="" decoding="async" />
				{:else}
					<div class="cover placeholder" aria-hidden="true"></div>
				{/if}
				<div class="meta">
					<p class="track">{current?.label ?? ''}</p>
					<p class="entry">{current?.creator ?? ''}</p>
				</div>

				<!-- Liking and dismissing from the player, not only from the node.
				     Rotation keeps running while something plays, and navigating
				     away from the field drops the card entirely, so by the time you
				     have decided how you feel about what you are hearing the node
				     that started it may be long gone. These are the only controls
				     always attached to the thing actually making sound. -->
				{#if current}
					<!-- role="presentation": this only tracks hover/focus to show the
					     reaction bubble, the same as FieldSlot's own hover tracking
					     elsewhere. Every actionable thing inside is the button itself. -->
					<div
						class="reaction"
						role="presentation"
						onmouseenter={(event) =>
							showReactionBubble('hide', /** @type {HTMLElement} */ (event.currentTarget))}
						onmouseleave={hideReactionBubble}
						onfocusin={(event) =>
							showReactionBubble('hide', /** @type {HTMLElement} */ (event.currentTarget))}
						onfocusout={hideReactionBubble}
					>
						<button
							type="button"
							class="fav-toggle hide-toggle"
							class:dismissed={hiddenStore.isHidden(current.entryId)}
							onclick={() => toggleHiddenCurrent(current.entryId)}
							aria-pressed={hiddenStore.isHidden(current.entryId)}
							aria-label={hiddenStore.isHidden(current.entryId)
								? `Show ${current.creator} in the field again`
								: `${current.creator} is not for me`}
							title={hiddenStore.isHidden(current.entryId) ? 'Show in field again' : 'Not for me'}
						>
							<svg
								viewBox="0 0 24 24"
								width="16"
								height="16"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							>
								<path
									d="M2.5 12S6 4.5 12 4.5c1.28 0 2.46.28 3.52.74M21.5 12S19.4 16.4 15.4 18.4M17.4 6.6A18.5 18.5 0 0 1 21.5 12M2.5 12A18.4 18.4 0 0 0 8.6 17.4"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
								<path
									d="M9.7 9.7a3 3 0 0 0 4.24 4.24"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
								<path d="M2.5 2.5l19 19" stroke-linecap="round" />
							</svg>
						</button>
					</div>
					<div
						class="reaction"
						role="presentation"
						onmouseenter={(event) =>
							showReactionBubble('like', /** @type {HTMLElement} */ (event.currentTarget))}
						onmouseleave={hideReactionBubble}
						onfocusin={(event) =>
							showReactionBubble('like', /** @type {HTMLElement} */ (event.currentTarget))}
						onfocusout={hideReactionBubble}
					>
						<button
							type="button"
							class="fav-toggle"
							class:liked={favoritesStore.isLiked(current.entryId)}
							onclick={() => toggleFavoriteCurrent(current.entryId)}
							aria-pressed={favoritesStore.isLiked(current.entryId)}
							aria-label={favoritesStore.isLiked(current.entryId)
								? `Remove ${current.creator} from favorites`
								: `Add ${current.creator} to favorites`}
							title={favoritesStore.isLiked(current.entryId)
								? 'Remove from favorites'
								: 'Add to favorites'}
						>
							<svg
								viewBox="0 0 24 24"
								width="17"
								height="17"
								fill={favoritesStore.isLiked(current.entryId) ? 'currentColor' : 'none'}
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							>
								<path
									d="M12 20.5s-7.5-4.6-10-9.3C.4 8 1.7 4.5 5 3.4c2.1-.7 4.3.1 5.6 1.9L12 7l1.4-1.7c1.3-1.8 3.5-2.6 5.6-1.9 3.3 1.1 4.6 4.6 3 7.8-2.5 4.7-10 9.3-10 9.3Z"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</button>
					</div>
				{/if}
			</div>

			<div class="transport">
				<button
					type="button"
					onclick={handlePrev}
					aria-label="Previous track"
					title="Previous track"
				>
					<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
						<path d="M7 6h2v12H7zM19 6v12l-9-6z" />
					</svg>
				</button>
				<button
					type="button"
					class="play"
					onclick={() => audioPlayerStore.toggle()}
					aria-label={audioPlayerStore.playing ? 'Pause' : 'Play'}
					title={audioPlayerStore.playing ? 'Pause' : 'Play'}
				>
					{#if audioPlayerStore.playing}
						<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
							<path d="M7 5h4v14H7zM13 5h4v14h-4z" />
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
							<path d="M7 5l12 7-12 7z" />
						</svg>
					{/if}
				</button>
				<button
					type="button"
					onclick={() => audioPlayerStore.next()}
					aria-label="Next track"
					title="Next track"
				>
					<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
						<path d="M15 6h2v12h-2zM5 6l9 6-9 6z" />
					</svg>
				</button>
			</div>

			<div class="seek">
				<span class="time">{formatTime(elapsed)}</span>
				<input
					type="range"
					min="0"
					max={duration || 0}
					value={elapsed}
					step="0.1"
					oninput={handleSeek}
					aria-label="Seek"
					disabled={!duration}
				/>
				<span class="time">{formatTime(duration)}</span>
			</div>

			<div class="volume">
				<button
					type="button"
					class="mute"
					onclick={toggleMute}
					aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
					title={muted || volume === 0 ? 'Unmute' : 'Mute'}
				>
					{#if muted || volume === 0}
						<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
							<path d="M4 9h3l5-4v14l-5-4H4z" />
							<path
								d="M16 9.5l4 5M20 9.5l-4 5"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								fill="none"
							/>
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
							<path d="M4 9h3l5-4v14l-5-4H4z" />
							<path
								d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								fill="none"
							/>
						</svg>
					{/if}
				</button>
				<input
					type="range"
					class="volume-slider"
					min="0"
					max="1"
					step="0.01"
					value={muted ? 0 : volume}
					oninput={handleVolume}
					aria-label="Volume"
				/>
			</div>

			<div class="right-controls">
				{#if autoKeepGoing}
					<!-- The only visible sign, once the prompt stops re-asking,
					     that something is still pulling in more of the ring on
					     its own — and the visitor's one way to say stop without
					     clearing the queue outright (the close button does that,
					     but that also drops everything already queued). -->
					<button
						type="button"
						class="auto-toggle"
						onclick={stopKeepGoing}
						aria-label="Stop auto-continuing the queue"
						title="Stop auto-continuing"
					>
						<svg
							viewBox="0 0 24 24"
							width="14"
							height="14"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<path d="M12 3a9 9 0 1 1-6.36 2.64" stroke-linecap="round" stroke-linejoin="round" />
							<path d="M4 3v5h5" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
						<span>Auto</span>
					</button>
				{/if}
				<button
					type="button"
					class="queue-toggle"
					class:active={audioPlayerStore.queueOpen}
					aria-expanded={audioPlayerStore.queueOpen}
					onclick={() => audioPlayerStore.toggleQueueOpen()}
					aria-label={audioPlayerStore.queueOpen
						? `Hide queue, ${queue.length} tracks`
						: `Show queue, ${queue.length} tracks`}
					title={audioPlayerStore.queueOpen ? 'Hide queue' : 'Show queue'}
				>
					<!-- Stacked lines with a play caret: the standard "up next"
					     mark. The count stays as text because it is information,
					     not decoration, and no icon can carry it. -->
					<svg
						viewBox="0 0 24 24"
						width="16"
						height="16"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path d="M4 6h11M4 11h11M4 16h7" stroke-linecap="round" />
						<path d="M16 12.5l5 3-5 3z" fill="currentColor" stroke="none" />
					</svg>
					<span class="count">{queue.length}</span>
				</button>
				<button
					type="button"
					class="close"
					onclick={() => audioPlayerStore.clear()}
					aria-label="Close player and clear queue"
					title="Close player and clear queue"
				>
					<svg
						viewBox="0 0 24 24"
						width="18"
						height="18"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
					</svg>
				</button>
			</div>
		</div>

		{#if audioPlayerStore.queueOpen}
			<!-- `slide` rather than a fade: the panel is physically growing out
			     of the bar it is attached to, and animating its height is what
			     makes it read as the bar expanding rather than a separate
			     surface appearing on top of one. Svelte keeps the element
			     mounted for the outro, so this closes as well as opens, which
			     a CSS-only max-height toggle on a keyed block would not. -->
			<ol class="queue-list" transition:slide={{ duration: 220, easing: cubicOut }}>
				{#each queue as item, i (item.key)}
					<li class="queue-item" class:current={i === audioPlayerStore.index}>
						<button
							type="button"
							class="queue-main"
							onclick={() => audioPlayerStore.jumpTo(i)}
							aria-current={i === audioPlayerStore.index}
						>
							<span class="queue-label">{item.label}</span>
							<span class="queue-entry">{item.creator}</span>
						</button>
						<!-- Up/down rather than drag: this list is as usable with a
						     thumb on a phone as with a mouse, and it needs no pointer
						     capture, no drop targets, and no keyboard equivalent
						     bolted on afterwards. -->
						<div class="queue-actions">
							<button
								type="button"
								onclick={() => audioPlayerStore.move(i, i - 1)}
								disabled={i === 0}
								aria-label="Move {item.label} earlier"
							>
								&uarr;
							</button>
							<button
								type="button"
								onclick={() => audioPlayerStore.move(i, i + 1)}
								disabled={i === queue.length - 1}
								aria-label="Move {item.label} later"
							>
								&darr;
							</button>
							<button
								type="button"
								onclick={() => audioPlayerStore.removeAt(i)}
								aria-label="Remove {item.label} from queue"
							>
								&times;
							</button>
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</div>

	<!-- A sibling of `.player`, not nested inside it: `.player` is
	     `overflow: hidden` (it clips its own rounded corners around the
	     queue panel and preview strip), which would otherwise clip this
	     right where it's meant to poke out above the bar. `position: fixed`
	     plus `reactionPos` (computed from the trigger button itself) is what
	     lets it sit in the right place without being inside that box at all. -->
	{#if reactionBubble && reactionPos}
		<div
			class="reaction-bubble"
			class:reaction-bubble-like={reactionBubble === 'like'}
			class:reaction-bubble-hide={reactionBubble === 'hide'}
			style:top="{reactionPos.top}px"
			style:left="{reactionPos.left}px"
			transition:fade={{ duration: 100 }}
		>
			{reactionBubble === 'like' ? 'Yah!' : 'Nah..'}
		</div>
	{/if}
{/if}

<style>
	.player {
		position: fixed;
		left: 0.75rem;
		right: 0.75rem;
		bottom: 0.75rem;
		/* Above the field and its menus, below the nav drawer's backdrop (100)
		   so opening the menu still covers the player rather than leaving it
		   floating over a dimmed page. */
		z-index: 40;
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	/* Clears the mobile tab bar, which occupies this same corner. */
	@media (max-width: 64rem) {
		.player {
			bottom: 5.25rem;
		}
	}

	.bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 0.8rem;
	}

	.now-playing {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
		flex: 1 1 14rem;
	}

	/* One per button, purely for the speech bubble's own anchor: it needs a
	   positioned ancestor no bigger than the button itself, so the bubble
	   centers on the control it belongs to rather than on the wider
	   `.now-playing` row. */
	.reaction {
		position: relative;
		display: inline-flex;
	}

	/* Sits inside .now-playing rather than with the transport controls: it
	   acts on the *entry*, not on playback, so it belongs beside the title
	   it refers to. Same heart and same liked color as the node's own toggle,
	   so the two read as one control in two places.

	   Bigger and carrying its own resting border/ground now, rather than a
	   bare transparent icon: this is the one control on the whole bar that
	   asks for an opinion, and it was reading as equal weight to Prev/Next
	   before, which is functionally what it is but not what it should feel
	   like next to a lit-up cover and creator name. */
	.fav-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 2.4rem;
		height: 2.4rem;
		border: 1.5px solid var(--border);
		border-radius: 999px;
		background: var(--bg-elevated);
		color: var(--text-muted);
		cursor: pointer;
		transition:
			transform 200ms ease,
			box-shadow 200ms ease,
			background 150ms ease,
			color 150ms ease,
			border-color 150ms ease;
	}

	.fav-toggle.liked {
		border-color: #e0455f;
		color: #e0455f;
	}

	/* Same neutral "toggled off" tone as FieldNode's own hide button, not the
	   heart's red: this isn't a warning state, just a control that's on. */
	.hide-toggle.dismissed {
		background: var(--text-muted);
		border-color: var(--text-muted);
		color: var(--bg-elevated);
	}

	/* Raises and glows red on hover — the one gesture that means "yes,
	   this." Applies whether or not it's already liked, so committing to a
	   like you've already made still feels the same as making a new one. */
	.fav-toggle:not(.hide-toggle):hover {
		transform: translateY(-3px);
		border-color: #e0455f;
		color: #e0455f;
		box-shadow:
			0 6px 16px rgb(224 69 95 / 0.4),
			0 0 0 1px rgb(224 69 95 / 0.15);
	}

	/* A shake rather than a lift: this is the "no thanks" gesture, and a
	   head-shake reads as that the way a raise reads as enthusiasm. */
	.hide-toggle:hover {
		animation: reaction-wiggle 500ms ease-in-out;
		border-color: var(--text);
		color: var(--text);
	}

	@keyframes reaction-wiggle {
		0%,
		100% {
			transform: rotate(0deg);
		}
		20% {
			transform: rotate(-14deg);
		}
		40% {
			transform: rotate(11deg);
		}
		60% {
			transform: rotate(-8deg);
		}
		80% {
			transform: rotate(5deg);
		}
	}

	/* One-shot flourish, not a persistent tooltip: shown on hover and
	   dismissed on its own after a second regardless of whether the pointer
	   is still there (see `showReactionBubble`), so it reads as a reaction
	   to the hover rather than a label that follows it. */
	/* `top`/`left` are the trigger button's own coordinates (set inline from
	   `reactionPos`); the transform is what shifts the bubble up and centers
	   it over that point rather than anchoring its own top-left corner there. */
	.reaction-bubble {
		position: fixed;
		transform: translate(-50%, calc(-100% - 0.6rem));
		padding: 0.3rem 0.65rem;
		border-radius: var(--radius-sm);
		background: var(--text);
		color: var(--bg);
		font-size: var(--text-xs);
		font-weight: 700;
		white-space: nowrap;
		pointer-events: none;
		z-index: 60;
	}

	.reaction-bubble::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 5px solid transparent;
		border-top-color: var(--text);
	}

	.reaction-bubble-like {
		background: #e0455f;
		color: #fff;
	}

	.reaction-bubble-like::after {
		border-top-color: #e0455f;
	}

	@media (prefers-reduced-motion: reduce) {
		.fav-toggle:not(.hide-toggle):hover {
			transform: none;
		}

		.hide-toggle:hover {
			animation: none;
		}
	}

	.cover {
		flex-shrink: 0;
		width: 2.8rem;
		height: 2.8rem;
		border-radius: var(--radius-sm);
		object-fit: cover;
	}

	.cover.placeholder {
		background: color-mix(in oklch, var(--type-audio) 35%, var(--bg));
	}

	.meta {
		min-width: 0;
	}

	.track {
		font-weight: 700;
		font-size: var(--text-sm);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.entry {
		color: var(--text-muted);
		font-size: var(--text-xs);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.transport {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-shrink: 0;
	}

	.transport button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.2rem;
		height: 2.2rem;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}

	.transport button:hover {
		background: var(--glass-bg);
	}

	.transport .play {
		width: 2.6rem;
		height: 2.6rem;
		background: var(--accent);
		color: white;
	}

	.transport .play:hover {
		background: var(--accent-hover);
	}

	.seek {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 2 1 12rem;
		min-width: 0;
	}

	.seek input {
		flex: 1;
		min-width: 0;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.time {
		color: var(--text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.volume {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex: 0 1 8rem;
		min-width: 0;
	}

	.mute {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.mute:hover {
		color: var(--text);
		background: var(--glass-bg);
	}

	.volume-slider {
		flex: 1;
		min-width: 3rem;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.right-controls {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.queue-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.7rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
	}

	.queue-toggle.active,
	.queue-toggle:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	/* Same shape as .queue-toggle, tinted with the accent from the start
	   rather than only on hover/active: unlike the queue toggle, this
	   button's mere presence is already the "something is happening"
	   signal, so it should not look identical to a plain, inactive control. */
	.auto-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.65rem;
		border-radius: 999px;
		border: 1px solid var(--accent);
		background: transparent;
		color: var(--accent);
		font: inherit;
		font-size: var(--text-xs);
		font-weight: 600;
		cursor: pointer;
	}

	.auto-toggle:hover {
		background: var(--accent);
		color: var(--bg-elevated);
	}

	.count {
		padding: 0 0.35rem;
		border-radius: 999px;
		background: var(--glass-bg);
		font-variant-numeric: tabular-nums;
	}

	.close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.close:hover {
		color: var(--text);
		background: var(--glass-bg);
	}

	.queue-list {
		max-height: 14rem;
		overflow-y: auto;
		margin: 0;
		padding: 0 0.4rem 0.5rem;
		border-top: 1px solid var(--border);
		list-style: none;
	}

	.queue-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.2rem 0.4rem;
		border-radius: var(--radius-sm);
	}

	.queue-item.current {
		background: color-mix(in oklch, var(--accent) 12%, transparent);
	}

	.queue-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.05rem;
		padding: 0.4rem 0.2rem;
		border: none;
		background: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.queue-label {
		max-width: 100%;
		font-size: var(--text-sm);
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.queue-entry {
		max-width: 100%;
		color: var(--text-muted);
		font-size: var(--text-xs);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.queue-actions {
		display: flex;
		gap: 0.15rem;
		flex-shrink: 0;
	}

	.queue-actions button {
		width: 1.9rem;
		height: 1.9rem;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		cursor: pointer;
	}

	.queue-actions button:hover:not(:disabled) {
		background: var(--glass-bg);
		color: var(--text);
	}

	.queue-actions button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.prompt {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.8rem;
		padding: 0.7rem 0.9rem;
		border-bottom: 1px solid var(--border);
		background: color-mix(in oklch, var(--accent) 10%, transparent);
		font-size: var(--text-sm);
	}

	/* Tinted with the audio type's own color rather than the accent the
	   end-of-queue prompt uses, so the two bands above the bar are not
	   mistaken for each other: one is asking a question, this one is just
	   reporting that something temporary is sounding. */
	.preview-strip {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem 0.8rem;
		padding: 0.55rem 0.9rem;
		border-bottom: 1px solid var(--border);
		background: color-mix(in oklch, var(--type-audio) 12%, transparent);
		font-size: var(--text-sm);
	}

	.preview-label {
		flex-shrink: 0;
		padding: 0.1rem 0.5rem;
		border-radius: 999px;
		background: color-mix(in oklch, var(--type-audio) 30%, transparent);
		color: var(--text);
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.preview-title {
		flex: 1;
		min-width: 0;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.preview-creator {
		color: var(--text-muted);
		font-weight: 400;
	}

	.preview-actions {
		display: flex;
		flex-shrink: 0;
		gap: 0.5rem;
	}

	.prompt-actions {
		display: flex;
		gap: 0.5rem;
	}

	.prompt-yes,
	.prompt-no {
		padding: 0.35rem 0.9rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		cursor: pointer;
	}

	.prompt-yes {
		border-color: var(--accent);
		background: var(--accent);
		color: white;
	}

	.prompt-yes:hover {
		background: var(--accent-hover);
	}

	.prompt-no:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	@media (max-width: 60rem) {
		/* Volume goes before seek does: a phone has hardware volume keys and
		   almost never a precise pointer, so an on-screen slider is the least
		   useful control in this row on a small screen. */
		.volume {
			display: none;
		}
	}

	@media (max-width: 48rem) {
		/* The seek row is next: the transport and what is playing both matter
		   more than scrubbing on a narrow screen. */
		.seek {
			display: none;
		}
	}
</style>
