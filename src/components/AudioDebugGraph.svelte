<script>
	/**
	 * The graph view of `?debug=audio`: the same six numbers as the slider
	 * view, drawn as the two pictures they actually describe.
	 *
	 * The slider view answers "what is this value" well and "what is this
	 * value *doing*" not at all. Two things in this detector are shapes
	 * rather than numbers, and both were invisible:
	 *
	 * - **The filter.** `lowpassFrequency` and `lowpassQ` are a curve. A
	 *   cutoff of 125 Hz does not mean 130 Hz is gone; it means 130 Hz is a
	 *   decibel or so down and 1 kHz is thirty. The EQ graph draws that
	 *   curve, so what the RMS stage is actually measuring is visible before
	 *   any of the threshold numbers are argued about.
	 * - **The thresholds.** `beatRatio` and `bigHitRatio` are lines that move
	 *   with a rolling average, and whether a kick clears them is a crossing
	 *   over time. The scope draws the last few seconds of bass against both
	 *   thresholds, the floor, and the refractory window, so a missed or
	 *   doubled beat can be seen rather than inferred from a counter.
	 *
	 * Both canvases are painted from one `requestAnimationFrame` loop that
	 * reads the store directly rather than through Svelte reactivity: at 60
	 * frames a second the reactive path would re-render the component for
	 * every sample, and nothing here needs it — a canvas is not markup.
	 *
	 * Dev-only by inheritance: `AudioDebugPanel.svelte` holds the
	 * `import.meta.env.DEV` gate and only ever renders this inside it.
	 */
	import { audioLevelStore } from '$lib/audioLevelStore.svelte.js';
	import {
		AUDIO_TUNING_SLIDERS,
		audioTuningStore,
		clampTuning,
		tuningSlider
	} from '$lib/audioTuning.svelte.js';
	import {
		MAX_GRAPH_HZ,
		MIN_GRAPH_HZ,
		frequencyAtGainDb,
		frequencyToRatio,
		lowpassCoefficients,
		lowpassResponseDb,
		magnitudeAt,
		ratioToFrequency,
		toDecibels
	} from '$lib/audioFilterResponse.js';
	import AudioTuningSlider from './AudioTuningSlider.svelte';

	const TAU = Math.PI * 2;

	// Tall enough that the Q slider's 0.1..10 dB range is a usable vertical
	// drag (roughly 27px of travel) rather than a few pixels. Dragging stays
	// the coarse control regardless — the slider underneath is what a 0.1 dB
	// step is for.
	const EQ_HEIGHT = 160;
	const SCOPE_HEIGHT = 132;

	/** The drawn dB window. Below -48 a low-pass is academic; +12 clears the loudest Q. */
	const EQ_MAX_DB = 12;
	const EQ_MIN_DB = -48;
	const EQ_DB_SPAN = EQ_MAX_DB - EQ_MIN_DB;

	const GRID_HZ = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
	const LABELLED_HZ = new Set([20, 100, 1000, 10000]);

	/** ~17s of history at 60fps; the scope shows however much of it fits the canvas. */
	const HISTORY = 1024;

	/** Matches the slider view's big-hit line, which is not a themed colour. */
	const DANGER = '#e0455f';

	const frequencyField = tuningSlider('lowpassFrequency');
	const qField = tuningSlider('lowpassQ');
	const detectorFields = AUDIO_TUNING_SLIDERS.filter(
		(field) => field.key !== 'lowpassFrequency' && field.key !== 'lowpassQ'
	);

	/** @type {HTMLDivElement | undefined} */
	let host = $state();
	/** @type {HTMLCanvasElement | undefined} */
	let eqCanvas = $state();
	/** @type {HTMLCanvasElement | undefined} */
	let scopeCanvas = $state();

	/** Top of the scope's amplitude axis is 1/zoom, for tracks that never get loud. */
	let scopeZoom = $state(1);
	let dragging = $state(false);

	// ------------------------------------------------------------ history ---
	//
	// Plain typed arrays, not `$state`: written once per animation frame and
	// read only by the draw loop, so making them reactive would buy nothing
	// and cost a proxy write per sample.
	const historyBass = new Float32Array(HISTORY);
	const historyAvg = new Float32Array(HISTORY);
	/** 0 none, 1 beat, 2 big hit. */
	const historyFlag = new Uint8Array(HISTORY);
	const historyTime = new Float64Array(HISTORY);
	let historyCount = 0;
	let lastBeatCount = 0;
	let lastBigHitCount = 0;

	/**
	 * One sample of the detector's current state.
	 *
	 * Beats are picked up as *increments* of the store's own counters rather
	 * than as a flag, which is what makes them impossible to miss: the
	 * detector runs on its own throttle, so a frame here may span more than
	 * one of its frames, and a boolean would have been overwritten.
	 * @param {number} now
	 */
	function sample(now) {
		const active = audioLevelStore.active;
		const beats = audioTuningStore.beatCount;
		const bigHits = audioTuningStore.bigHitCount;
		const index = historyCount % HISTORY;
		historyFlag[index] = beats > lastBeatCount ? (bigHits > lastBigHitCount ? 2 : 1) : 0;
		lastBeatCount = beats;
		lastBigHitCount = bigHits;
		// Zeroed rather than held when analysis stops: `bass` keeps its last
		// value forever once the loop stops reporting, and a flat line at 0.4
		// would read as sustained signal instead of as silence.
		historyBass[index] = active ? audioTuningStore.bass : 0;
		historyAvg[index] = active ? audioTuningStore.bassAvg : 0;
		historyTime[index] = now;
		historyCount += 1;
	}

	// ------------------------------------------------------------ palette ---

	let palette = {
		text: '#eef1f6',
		muted: '#9aa7bd',
		border: '#2a3346',
		accent: '#6ea8f0',
		surface: '#171d2c'
	};
	let paletteReadAt = 0;

	/**
	 * Canvas cannot read a CSS custom property, so the themed colours are
	 * pulled off the host element instead. Re-read on a timer rather than
	 * once, because the theme can be switched underneath a panel that is
	 * already open; twice a second is far below anything measurable and far
	 * above anything noticeable.
	 * @param {number} now
	 */
	function refreshPalette(now) {
		if (!host || now - paletteReadAt < 500) return;
		paletteReadAt = now;
		const styles = getComputedStyle(host);
		/** @param {string} name @param {string} fallback */
		const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
		palette = {
			text: read('--text', palette.text),
			muted: read('--text-muted', palette.muted),
			border: read('--border', palette.border),
			accent: read('--accent', palette.accent),
			surface: read('--bg-elevated', palette.surface)
		};
	}

	/**
	 * A plain record rather than a `Map`: nothing here is reactive — it is a
	 * memo for a string-to-string conversion done a few times per frame — and
	 * `svelte/prefer-svelte-reactivity` would otherwise, correctly in general
	 * and wrongly here, ask for a `SvelteMap` (see `audioSuggest.js` for the
	 * same trade-off resolved the same way).
	 * @type {Record<string, string>}
	 */
	const alphaCache = Object.create(null);

	/**
	 * A themed colour at a chosen alpha. The custom properties are whatever
	 * `app.css` says they are — six-digit hex today, eight-digit for
	 * `--border` — so rather than parse CSS, the colour is round-tripped
	 * through the 2D context, which normalises anything it accepts into
	 * `#rrggbb` or `rgba(...)`, and the channels are read back out of that.
	 * @param {CanvasRenderingContext2D} ctx
	 * @param {string} color
	 * @param {number} alpha
	 */
	function withAlpha(ctx, color, alpha) {
		const cacheKey = `${color}|${alpha}`;
		const cached = alphaCache[cacheKey];
		if (cached) return cached;
		const previous = ctx.fillStyle;
		ctx.fillStyle = color;
		const normalized = String(ctx.fillStyle);
		ctx.fillStyle = previous;
		let resolved = normalized;
		if (/^#[0-9a-f]{6}$/i.test(normalized)) {
			const value = parseInt(normalized.slice(1), 16);
			resolved = `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
		} else {
			const channels = normalized.match(/rgba?\(([^)]+)\)/);
			if (channels) {
				const [r, g, b] = channels[1].split(',').map((part) => parseFloat(part));
				resolved = `rgba(${r}, ${g}, ${b}, ${alpha})`;
			}
		}
		alphaCache[cacheKey] = resolved;
		return resolved;
	}

	// ------------------------------------------------------------- canvas ---

	/**
	 * Sizes a canvas to its own CSS box at device resolution and hands back a
	 * context already scaled so everything after can be drawn in CSS pixels.
	 * @param {HTMLCanvasElement} canvas
	 * @param {number} cssHeight
	 */
	function fitCanvas(canvas, cssHeight) {
		const width = canvas.clientWidth;
		if (width <= 0) return null;
		const ratio = window.devicePixelRatio || 1;
		const pixelWidth = Math.round(width * ratio);
		const pixelHeight = Math.round(cssHeight * ratio);
		if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
			canvas.width = pixelWidth;
			canvas.height = pixelHeight;
		}
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
		ctx.clearRect(0, 0, width, cssHeight);
		return { ctx, width, height: cssHeight };
	}

	/**
	 * Half-pixel offsets, so a 1px line lands on a pixel instead of straddling two.
	 * @param {number} value
	 */
	function crisp(value) {
		return Math.round(value) + 0.5;
	}

	// ---------------------------------------------------------- EQ canvas ---

	/** @param {number} hz @param {number} width */
	function xForHz(hz, width) {
		return frequencyToRatio(hz, MIN_GRAPH_HZ, MAX_GRAPH_HZ) * width;
	}

	/** @param {number} db @param {number} height */
	function yForDb(db, height) {
		return ((EQ_MAX_DB - db) / EQ_DB_SPAN) * height;
	}

	function drawEq() {
		if (!eqCanvas) return;
		const fitted = fitCanvas(eqCanvas, EQ_HEIGHT);
		if (!fitted) return;
		const { ctx, width, height } = fitted;

		const frequency = audioTuningStore.lowpassFrequency;
		const q = audioTuningStore.lowpassQ;
		const sampleRate = audioTuningStore.sampleRate;

		// The plot bed, then the reachable band painted again on top of it.
		// The band is exactly the range the sliders allow, so the brighter
		// rectangle is also the region a pointer drag will respond in — the
		// interactive area states its own bounds instead of a drag silently
		// clamping somewhere off-screen.
		ctx.fillStyle = withAlpha(ctx, palette.border, 0.14);
		ctx.fillRect(0, 0, width, height);
		const bandLeft = xForHz(frequencyField.min, width);
		const bandRight = xForHz(frequencyField.max, width);
		ctx.fillStyle = withAlpha(ctx, palette.border, 0.3);
		ctx.fillRect(bandLeft, 0, bandRight - bandLeft, height);
		// Edged as well as shaded. The fill alone reads as a gradient artefact
		// on a dark theme, and this boundary is load-bearing: it is where a
		// press starts responding at all.
		ctx.lineWidth = 1;
		ctx.strokeStyle = withAlpha(ctx, palette.muted, 0.4);
		ctx.beginPath();
		ctx.moveTo(crisp(bandLeft), 0);
		ctx.lineTo(crisp(bandLeft), height);
		ctx.moveTo(crisp(bandRight), 0);
		ctx.lineTo(crisp(bandRight), height);
		ctx.stroke();

		ctx.lineWidth = 1;
		ctx.strokeStyle = withAlpha(ctx, palette.border, 0.75);
		ctx.beginPath();
		for (const hz of GRID_HZ) {
			const x = crisp(xForHz(hz, width));
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
		}
		for (let db = EQ_MAX_DB; db >= EQ_MIN_DB; db -= 12) {
			const y = crisp(yForDb(db, height));
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
		}
		ctx.stroke();

		// Unity gain gets its own weight: everything on the curve is read as
		// "how far below this".
		ctx.strokeStyle = withAlpha(ctx, palette.muted, 0.55);
		ctx.beginPath();
		ctx.moveTo(0, crisp(yForDb(0, height)));
		ctx.lineTo(width, crisp(yForDb(0, height)));
		ctx.stroke();

		const points = Math.max(2, Math.round(width));
		const curve = lowpassResponseDb({ frequency, q, sampleRate }, points);
		ctx.beginPath();
		for (let i = 0; i < curve.length; i += 1) {
			const x = (i / (curve.length - 1)) * width;
			const y = yForDb(curve[i], height);
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		const stroked = new Path2D();
		// Re-walked into a closed path for the fill so the stroke above can be
		// drawn without the baseline seam a single closed path would show.
		for (let i = 0; i < curve.length; i += 1) {
			const x = (i / (curve.length - 1)) * width;
			const y = yForDb(curve[i], height);
			if (i === 0) stroked.moveTo(x, y);
			else stroked.lineTo(x, y);
		}
		stroked.lineTo(width, height);
		stroked.lineTo(0, height);
		stroked.closePath();
		const gradient = ctx.createLinearGradient(0, 0, 0, height);
		gradient.addColorStop(0, withAlpha(ctx, palette.accent, 0.34));
		gradient.addColorStop(1, withAlpha(ctx, palette.accent, 0.02));
		ctx.fillStyle = gradient;
		ctx.fill(stroked);
		ctx.strokeStyle = palette.accent;
		ctx.lineWidth = 2;
		ctx.stroke();

		// The -3 dB corner, which is where the filter's name actually lands:
		// with any resonance at all it sits above the cutoff the slider says.
		const corner = frequencyAtGainDb({ frequency, q, sampleRate });
		const cornerX = xForHz(corner, width);
		ctx.setLineDash([2, 3]);
		ctx.lineWidth = 1;
		ctx.strokeStyle = withAlpha(ctx, palette.text, 0.4);
		ctx.beginPath();
		ctx.moveTo(crisp(cornerX), yForDb(-3, height));
		ctx.lineTo(crisp(cornerX), height);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.beginPath();
		ctx.arc(cornerX, yForDb(-3, height), 3, 0, TAU);
		ctx.strokeStyle = withAlpha(ctx, palette.text, 0.7);
		ctx.stroke();

		// The handle sits on the curve rather than beside it, and that is not
		// decoration: an RBJ low-pass has |H(f0)| equal to its own linear Q,
		// and Web Audio states this filter's Q in dB, so the height of the
		// curve at the cutoff *is* the Q value. Dragging the handle up is
		// therefore the same gesture as raising Q, read off the same axis.
		const handleX = xForHz(frequency, width);
		const handleY = yForDb(q, height);
		ctx.setLineDash([3, 3]);
		ctx.strokeStyle = withAlpha(ctx, palette.accent, 0.65);
		ctx.beginPath();
		ctx.moveTo(crisp(handleX), 0);
		ctx.lineTo(crisp(handleX), height);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.beginPath();
		ctx.arc(handleX, handleY, dragging ? 7 : 5.5, 0, TAU);
		ctx.fillStyle = palette.accent;
		ctx.fill();
		ctx.lineWidth = 2;
		ctx.strokeStyle = palette.surface;
		ctx.stroke();

		ctx.font = '11px system-ui, sans-serif';
		ctx.fillStyle = withAlpha(ctx, palette.muted, 0.95);
		ctx.textBaseline = 'alphabetic';
		ctx.textAlign = 'center';
		for (const hz of GRID_HZ) {
			if (!LABELLED_HZ.has(hz)) continue;
			const x = Math.min(width - 12, Math.max(12, xForHz(hz, width)));
			ctx.fillText(hz >= 1000 ? `${hz / 1000}k` : String(hz), x, height - 3);
		}
		ctx.textAlign = 'left';
		for (let db = 0; db >= EQ_MIN_DB + 12; db -= 12) {
			ctx.fillText(`${db}`, 3, yForDb(db, height) - 3);
		}
	}

	// ------------------------------------------------------- scope canvas ---

	/** @param {number} now */
	function drawScope(now) {
		if (!scopeCanvas) return;
		const fitted = fitCanvas(scopeCanvas, SCOPE_HEIGHT);
		if (!fitted) return;
		const { ctx, width, height } = fitted;

		ctx.fillStyle = withAlpha(ctx, palette.border, 0.18);
		ctx.fillRect(0, 0, width, height);

		const top = 1 / scopeZoom;
		/** @param {number} value */
		const yFor = (value) => height - (Math.min(value, top) / top) * height;

		const columns = Math.min(historyCount, HISTORY, Math.max(2, Math.floor(width)));
		if (columns < 2) return;
		const start = historyCount - columns;
		/** @param {number} k */
		const xFor = (k) => (k / (columns - 1)) * width;
		/** @param {number} k */
		const at = (k) => (start + k) % HISTORY;

		ctx.lineWidth = 1;
		ctx.strokeStyle = withAlpha(ctx, palette.border, 0.75);
		ctx.beginPath();
		for (let step = 1; step < 4; step += 1) {
			const y = crisp((height * step) / 4);
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
		}
		ctx.stroke();

		// Every counted beat opens a refractory window, and `beatGapMs` is the
		// only tuning value with no visible consequence in a number — it shows
		// up purely as beats that did not get counted. Shading the window it
		// creates puts it on the same picture as the peaks it suppresses.
		const beatGapMs = audioTuningStore.beatGapMs;
		ctx.fillStyle = withAlpha(ctx, palette.accent, 0.1);
		for (let k = 0; k < columns; k += 1) {
			if (!historyFlag[at(k)]) continue;
			const beatAt = historyTime[at(k)];
			let end = k;
			while (end + 1 < columns && historyTime[at(end + 1)] - beatAt < beatGapMs) end += 1;
			ctx.fillRect(xFor(k), 0, Math.max(1, xFor(end) - xFor(k)), height);
		}

		/**
		 * Every line on this canvas is recomputed from the *stored* averages
		 * against the *current* tuning, not against whatever the tuning was
		 * when each sample was taken. That is the point of it: dragging the
		 * beat-ratio slider re-draws the threshold through the last few
		 * seconds of real bass, so where it would have landed is visible
		 * immediately, instead of only affecting hits that have not happened
		 * yet. The beat ticks are the exception and stay historical — they
		 * record what the detector actually fired.
		 * @param {(index: number) => number} valueAt
		 * @param {string} color
		 * @param {number[]} dash
		 * @param {number} lineWidth
		 */
		function line(valueAt, color, dash, lineWidth) {
			ctx.setLineDash(dash);
			ctx.lineWidth = lineWidth;
			ctx.strokeStyle = color;
			ctx.beginPath();
			for (let k = 0; k < columns; k += 1) {
				const y = yFor(valueAt(at(k)));
				if (k === 0) ctx.moveTo(xFor(k), y);
				else ctx.lineTo(xFor(k), y);
			}
			ctx.stroke();
			ctx.setLineDash([]);
		}

		const beatFloor = audioTuningStore.beatFloor;
		const beatRatio = audioTuningStore.beatRatio;
		const bigHitRatio = audioTuningStore.bigHitRatio;

		// Filled first, stroked last, so the bass line stays legible where it
		// crosses the thresholds it is being judged against.
		ctx.beginPath();
		ctx.moveTo(xFor(0), height);
		for (let k = 0; k < columns; k += 1) ctx.lineTo(xFor(k), yFor(historyBass[at(k)]));
		ctx.lineTo(xFor(columns - 1), height);
		ctx.closePath();
		ctx.fillStyle = withAlpha(ctx, palette.accent, 0.16);
		ctx.fill();

		ctx.strokeStyle = withAlpha(ctx, palette.muted, 0.9);
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, crisp(yFor(beatFloor)));
		ctx.lineTo(width, crisp(yFor(beatFloor)));
		ctx.stroke();

		line((index) => historyAvg[index], withAlpha(ctx, palette.text, 0.45), [], 1);
		line(
			(index) => historyAvg[index] * beatRatio,
			withAlpha(ctx, palette.text, 0.85),
			[4, 3],
			1.25
		);
		line((index) => historyAvg[index] * bigHitRatio, DANGER, [4, 3], 1.25);
		line((index) => historyBass[index], palette.accent, [], 1.75);

		for (let k = 0; k < columns; k += 1) {
			const flag = historyFlag[at(k)];
			if (!flag) continue;
			ctx.fillStyle = flag === 2 ? DANGER : palette.accent;
			ctx.fillRect(crisp(xFor(k)) - 1, height - (flag === 2 ? 12 : 7), 2, flag === 2 ? 12 : 7);
		}

		ctx.font = '11px system-ui, sans-serif';
		ctx.fillStyle = withAlpha(ctx, palette.muted, 0.95);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.fillText(top.toFixed(2), 3, 3);
		const spanMs = historyTime[at(columns - 1)] - historyTime[at(0)];
		ctx.textAlign = 'right';
		ctx.fillText(`${(spanMs / 1000).toFixed(1)}s`, width - 3, 3);

		if (!audioLevelStore.active) {
			ctx.fillStyle = withAlpha(ctx, palette.muted, 0.9);
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('no analysis running', width / 2, height / 2);
		}
		// `now` participates only through the samples already taken this
		// frame; kept in the signature so the two draws share one clock.
		void now;
	}

	$effect(() => {
		let frame = 0;
		const tick = () => {
			frame = requestAnimationFrame(tick);
			const now = performance.now();
			sample(now);
			refreshPalette(now);
			drawEq();
			drawScope(now);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});

	// ---------------------------------------------------------- dragging ---
	//
	// Pointer only, deliberately. The two sliders below the graph are the
	// keyboard and assistive-technology route to these same values and are
	// always rendered, so the canvas can be an enhancement rather than a
	// custom widget with an invented role — the same posture the field's
	// tappable cards take toward their own labelled buttons.

	let dragOriginY = 0;
	let dragOriginQ = 0;

	/** @param {PointerEvent} event */
	function handlePointerDown(event) {
		if (!eqCanvas || event.button !== 0) return;
		const rect = eqCanvas.getBoundingClientRect();
		const hz = ratioToFrequency((event.clientX - rect.left) / rect.width);
		// Outside the sliders' own range there is no value to set, so the
		// press is left alone rather than clamped into a jump.
		if (hz < frequencyField.min || hz > frequencyField.max) return;
		eqCanvas.setPointerCapture(event.pointerId);
		dragging = true;
		dragOriginY = event.clientY;
		dragOriginQ = audioTuningStore.lowpassQ;
		audioTuningStore.lowpassFrequency = clampTuning('lowpassFrequency', hz);
	}

	/** @param {PointerEvent} event */
	function handlePointerMove(event) {
		if (!dragging || !eqCanvas) return;
		const rect = eqCanvas.getBoundingClientRect();
		audioTuningStore.lowpassFrequency = clampTuning(
			'lowpassFrequency',
			ratioToFrequency((event.clientX - rect.left) / rect.width)
		);
		// Q moves by the graph's own dB-per-pixel scale from where the drag
		// started, rather than snapping to the pointer's absolute height. The
		// gesture still means what the axis says a vertical pixel means, but
		// pressing anywhere in the band does not fling Q to the top of the
		// graph before the drag has begun.
		const dbPerPixel = EQ_DB_SPAN / rect.height;
		audioTuningStore.lowpassQ = clampTuning(
			'lowpassQ',
			dragOriginQ - (event.clientY - dragOriginY) * dbPerPixel
		);
	}

	/** @param {PointerEvent} event */
	function handlePointerUp(event) {
		if (!dragging) return;
		dragging = false;
		eqCanvas?.releasePointerCapture(event.pointerId);
	}

	// ---------------------------------------------------------- readouts ---

	const corner = $derived(
		frequencyAtGainDb({
			frequency: audioTuningStore.lowpassFrequency,
			q: audioTuningStore.lowpassQ,
			sampleRate: audioTuningStore.sampleRate
		})
	);

	/** @param {number} hz */
	function gainDbAt(hz) {
		const coefficients = lowpassCoefficients(
			audioTuningStore.lowpassFrequency,
			audioTuningStore.lowpassQ,
			audioTuningStore.sampleRate
		);
		return toDecibels(magnitudeAt(coefficients, hz, audioTuningStore.sampleRate));
	}

	/**
	 * Measured off the drawn curve rather than asserted as "12, it is a
	 * biquad": a second-order low-pass only reaches its asymptotic slope
	 * above the corner, so quoting the textbook figure next to a curve that
	 * has not got there yet would be the one number on screen not backed by
	 * the graph.
	 */
	const slopeDb = $derived(
		gainDbAt(audioTuningStore.lowpassFrequency * 8) -
			gainDbAt(audioTuningStore.lowpassFrequency * 4)
	);

	/** A kick fundamental usually lives here; how much of it survives the filter is the point. */
	const kickGainDb = $derived(gainDbAt(60));

	const bassRatio = $derived(
		audioTuningStore.bassAvg > 0 ? audioTuningStore.bass / audioTuningStore.bassAvg : 0
	);
</script>

<div class="graph-view" bind:this={host}>
	<section>
		<h3>Low-pass response</h3>
		<!-- The role and label go on the wrapper, not the canvas: a canvas is
		     an embedded element and cannot be relabelled as an image, and the
		     wrapper being a leaf node to assistive technology is right anyway
		     — there is nothing inside it to reach. -->
		<div
			class="plot"
			role="img"
			aria-label="Frequency response of the beat detector's low-pass filter, {audioTuningStore.lowpassFrequency.toFixed(
				0
			)} hertz cutoff at {audioTuningStore.lowpassQ.toFixed(1)} decibels of resonance."
		>
			<canvas
				bind:this={eqCanvas}
				style="height: {EQ_HEIGHT}px"
				class:dragging
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
				onpointercancel={handlePointerUp}
			></canvas>
		</div>
		<p class="readout">Drag in the lit band — across for cutoff, up/down for Q.</p>
		<p class="readout">
			-3 dB <strong>{corner.toFixed(0)} Hz</strong> · {slopeDb.toFixed(1)} dB/oct · 60 Hz
			<strong>{kickGainDb.toFixed(1)}</strong>
		</p>
		<AudioTuningSlider field={frequencyField} />
		<AudioTuningSlider field={qField} />
	</section>

	<section>
		<h3>
			Bass vs. thresholds
			<button
				type="button"
				class="zoom"
				onclick={() => (scopeZoom = scopeZoom >= 4 ? 1 : scopeZoom * 2)}
			>
				{scopeZoom}× zoom
			</button>
		</h3>
		<div
			class="plot"
			role="img"
			aria-label="Recent bass amplitude plotted against the beat and big-hit thresholds. Bass {audioTuningStore.bass.toFixed(
				2
			)}, average {audioTuningStore.bassAvg.toFixed(
				2
			)}, {audioTuningStore.beatCount} beats counted."
		>
			<canvas bind:this={scopeCanvas} style="height: {SCOPE_HEIGHT}px"></canvas>
		</div>
		<ul class="legend">
			<li><i class="swatch bass"></i>bass</li>
			<li><i class="swatch avg"></i>avg</li>
			<li><i class="swatch beat"></i>beat ×{audioTuningStore.beatRatio.toFixed(2)}</li>
			<li><i class="swatch big"></i>big ×{audioTuningStore.bigHitRatio.toFixed(2)}</li>
			<li><i class="swatch floor"></i>floor</li>
		</ul>
		<p class="readout">
			bass {audioTuningStore.bass.toFixed(3)} · avg {audioTuningStore.bassAvg.toFixed(3)} · ratio
			<strong>{bassRatio.toFixed(2)}×</strong>
		</p>
		<p class="readout">
			beats: {audioTuningStore.beatCount} · big hits: {audioTuningStore.bigHitCount} · {(
				audioTuningStore.sampleRate / 1000
			).toFixed(1)} kHz
		</p>
		{#each detectorFields as field (field.key)}
			<AudioTuningSlider {field} />
		{/each}
	</section>
</div>

<style>
	.graph-view {
		margin-top: 0.6rem;
	}

	section + section {
		margin-top: 1.1rem;
		padding-top: 0.9rem;
		border-top: 1px solid var(--border);
	}

	h3 {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin: 0 0 0.4rem;
		font-size: var(--text-xs);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.plot {
		display: block;
		line-height: 0;
	}

	canvas {
		display: block;
		width: 100%;
		border-radius: var(--radius-sm);
		/* Without this a drag on a touch screen scrolls the page instead of
		   reaching the pointer handlers. */
		touch-action: none;
		cursor: crosshair;
	}

	canvas.dragging {
		cursor: grabbing;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.1rem 0.7rem;
		margin: 0.45rem 0 0;
		padding: 0;
		list-style: none;
		color: var(--text-muted);
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.swatch {
		width: 0.7rem;
		height: 0;
		border-top-width: 2px;
		border-top-style: solid;
	}

	.swatch.bass {
		border-top-color: var(--accent);
	}

	.swatch.avg {
		border-top-color: var(--text-muted);
	}

	.swatch.beat {
		border-top-style: dashed;
		border-top-color: var(--text);
	}

	.swatch.big {
		border-top-style: dashed;
		border-top-color: #e0455f;
	}

	.swatch.floor {
		border-top-color: var(--text-muted);
		opacity: 0.7;
	}

	.readout {
		margin: 0.35rem 0 0;
		color: var(--text-muted);
	}

	.readout strong {
		color: var(--text);
	}

	.zoom {
		flex: none;
		white-space: nowrap;
		padding: 0.15rem 0.4rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--text-xs);
		text-transform: none;
		letter-spacing: 0;
		cursor: pointer;
	}

	.zoom:hover {
		background: var(--glass-bg);
	}
</style>
