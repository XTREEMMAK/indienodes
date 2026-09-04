<script>
	/**
	 * Ambient particle background.
	 *
	 * Ported from GG Requestz's AmbientBackground.svelte (itself ported from
	 * LBHQ's GlobalBackground). Hand-rolled 2D canvas, no dependencies:
	 * drifting particles over four CSS-only gradient blobs on slow orbits.
	 *
	 * The source has no light theme (it is dark-only by its own comment).
	 * This version drives both the base gradient and the blobs from theme
	 * CSS custom properties in app.css, so a light variant exists without
	 * duplicating the component, and repalettes the source's ember/gold set
	 * to fit IndieNodes rather than a game library.
	 */
	import { onMount } from 'svelte';
	import { audioLevelStore } from '$lib/audioLevelStore.svelte.js';
	import {
		AUDIO_REACTION_DEFAULTS,
		driftBoost,
		burstOpacity,
		decayHitScale
	} from '$lib/audioReaction.js';

	/**
	 * Which background to render. "drifty-stars" is the only effect today;
	 * the prop exists so a second one is a branch here plus a value in the
	 * settings list, rather than a refactor. The layout does not mount this
	 * component at all when the preference is "none".
	 */
	let { variant = 'drifty-stars' } = $props();

	/** @type {HTMLCanvasElement | null} */
	let canvas = $state(null);

	// Cap the frame rate. The particle drift is slow enough that 30fps reads
	// as smooth as 60 to the eye, and it halves the compositing work.
	const TARGET_FPS = 30;
	const FRAME_MS = 1000 / TARGET_FPS;

	// Scale down on small viewports rather than rendering 60 particles on a
	// phone, where the GPU and the battery both care more.
	const PARTICLE_COUNT_DESKTOP = 60;
	const PARTICLE_COUNT_MOBILE = 24;
	const MOBILE_BREAKPOINT = 768;

	const PARTICLE_COLOR_VARS = [
		'--ambient-particle-1',
		'--ambient-particle-2',
		'--ambient-particle-3',
		'--ambient-particle-4',
		'--ambient-particle-5'
	];

	onMount(() => {
		const el = canvas;
		const ctx = el?.getContext('2d');
		if (!el || !ctx) return;

		const rootStyle = getComputedStyle(document.documentElement);
		const colors = PARTICLE_COLOR_VARS.map((name) => rootStyle.getPropertyValue(name).trim());

		// Respect the OS setting. For an effect that exists purely for
		// atmosphere there is no reason to override someone who has asked for
		// less motion. Render one static frame so the palette still reads,
		// then stop.
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		let width = 0;
		let height = 0;

		/** Matches the backing store to the viewport. Clears the canvas. */
		const measure = () => {
			width = window.innerWidth;
			height = window.innerHeight;
			el.width = width;
			el.height = height;
		};
		measure();

		/** @param {number} w */
		const countFor = (w) =>
			w < MOBILE_BREAKPOINT ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP;

		/**
		 * @param {number} w
		 * @param {number} h
		 */
		const makeParticle = (w, h) => ({
			x: Math.random() * w,
			y: Math.random() * h,
			vx: (Math.random() - 0.5) * 1.2,
			vy: (Math.random() - 0.5) * 1.2,
			r: Math.random() * 3 + 1.2,
			color: colors[Math.floor(Math.random() * colors.length)],
			opacity: reducedMotion ? Math.random() * 0.4 + 0.2 : 0,
			target: Math.random() * 0.55 + 0.45,
			speed: Math.random() * 0.009 + 0.003,
			fadingIn: true,
			// Multiplies `r` at paint time; see the big-hit reaction below.
			hitScale: 1
		});

		const particles = Array.from({ length: countFor(width) }, () => makeParticle(width, height));

		// Resizing is not just a matter of the backing store. The field only
		// wraps particles at the edges, so growing the viewport left the new
		// area empty until they happened to drift into it — at roughly half a
		// pixel a frame, that is tens of seconds of visibly bare screen down one
		// side, which reads as the background having failed to resize at all.
		// Positions are rescaled into the new box instead, so the field always
		// covers the viewport, and the count is re-derived because crossing the
		// mobile breakpoint should change the density rather than leaving
		// whichever one happened to apply at mount.
		const resize = () => {
			const previousW = width;
			const previousH = height;
			measure();

			if (previousW > 0 && previousH > 0) {
				const scaleX = width / previousW;
				const scaleY = height / previousH;
				for (const p of particles) {
					p.x *= scaleX;
					p.y *= scaleY;
				}
				for (const bp of burstParticles) {
					bp.x *= scaleX;
					bp.y *= scaleY;
				}
			}

			const wanted = countFor(width);
			while (particles.length > wanted) particles.pop();
			while (particles.length < wanted) particles.push(makeParticle(width, height));

			// Nothing else will ever repaint under reduced motion: that path
			// draws a single frame and stops, and `measure` just cleared it.
			if (reducedMotion) paint();
		};
		window.addEventListener('resize', resize);

		/**
		 * The reaction to an especially strong beat (see AudioPlayer's own
		 * `audioTuningStore.bigHitRatio`) used to be a low-opacity full-screen
		 * radial flash. That is a real photosensitive-seizure trigger risk —
		 * a rapid, large-area luminance change, timed to music, is exactly
		 * the pattern seizure-safe-content guidelines warn against — so it
		 * was removed outright rather than just dimmed. What replaced it
		 * reacts spatially instead of by flashing: every existing particle's
		 * own radius pulses up and settles back (`hitScale`, updated per
		 * particle below), and a small burst of extra particles spawns and
		 * fades out over a couple of seconds (`burstParticles`). Both read
		 * as "something just hit" through many small, localized changes
		 * rather than one large, rapid one.
		 * @typedef {{ x: number, y: number, vx: number, vy: number, r: number, color: string, opacity: number, bornAt: number }} BurstParticle
		 */
		let lastSeenBigHitId = audioLevelStore.bigHitId;
		/** @type {BurstParticle[]} */
		let burstParticles = [];

		function spawnBurst() {
			for (let i = 0; i < AUDIO_REACTION_DEFAULTS.burst.count; i += 1) {
				const angle = Math.random() * Math.PI * 2;
				const speed = Math.random() * 1.8 + 0.6;
				burstParticles.push({
					// Origin biased toward the middle of the viewport rather than
					// literally centered, so repeated hits don't all radiate from
					// one exact point.
					x: width / 2 + (Math.random() - 0.5) * width * 0.4,
					y: height / 2 + (Math.random() - 0.5) * height * 0.4,
					vx: Math.cos(angle) * speed,
					vy: Math.sin(angle) * speed,
					r: Math.random() * 2.5 + 1.5,
					color: colors[Math.floor(Math.random() * colors.length)],
					opacity: 0,
					bornAt: performance.now()
				});
			}
		}

		const paint = () => {
			ctx.clearRect(0, 0, width, height);
			for (const p of particles) {
				ctx.globalAlpha = p.opacity;
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.r * p.hitScale, 0, Math.PI * 2);
				ctx.fill();
			}
			for (const bp of burstParticles) {
				ctx.globalAlpha = bp.opacity;
				ctx.fillStyle = bp.color;
				ctx.beginPath();
				ctx.arc(bp.x, bp.y, bp.r, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = 1;
		};

		if (reducedMotion) {
			paint();
			return () => window.removeEventListener('resize', resize);
		}

		let raf = 0;
		let last = 0;
		let paused = false;

		/** @param {number} now */
		const tick = (now) => {
			raf = requestAnimationFrame(tick);

			if (now - last < FRAME_MS) return;
			last = now;

			// Drift speed follows whatever is playing; see `driftBoost`'s own
			// doc comment in `audioReaction.js` for the reasoning and the
			// measurement behind it. With nothing playing this stays exactly 1
			// and the field drifts at its original pace.
			const boost = driftBoost(audioLevelStore);

			// Edge-triggered: a new id means a big hit happened since the last
			// frame, regardless of how many frames it's been (a dropped frame
			// under load should not eat a hit). See audioLevelStore's own
			// comment on why this is a counter rather than a boolean.
			if (audioLevelStore.bigHitId !== lastSeenBigHitId) {
				lastSeenBigHitId = audioLevelStore.bigHitId;
				for (const p of particles) p.hitScale = AUDIO_REACTION_DEFAULTS.hitScale.peak;
				spawnBurst();
			}

			for (const p of particles) {
				p.x += p.vx * boost;
				p.y += p.vy * boost;
				if (p.x < 0) p.x = width;
				if (p.x > width) p.x = 0;
				if (p.y < 0) p.y = height;
				if (p.y > height) p.y = 0;

				p.hitScale = decayHitScale(p.hitScale);

				// Each particle breathes independently between opacity targets.
				if (p.fadingIn) {
					p.opacity = Math.min(p.opacity + p.speed, p.target);
					if (p.opacity >= p.target) {
						p.fadingIn = false;
						p.target = Math.random() * 0.65;
					}
				} else {
					p.opacity = Math.max(p.opacity - p.speed, 0);
					if (p.opacity <= 0) {
						p.fadingIn = true;
						p.target = Math.random() * 0.65 + 0.15;
					}
				}
			}

			if (burstParticles.length) {
				const bnow = performance.now();
				burstParticles = burstParticles.filter((bp) => {
					const age = bnow - bp.bornAt;
					if (age > AUDIO_REACTION_DEFAULTS.burst.lifetimeMs) return false;
					bp.x += bp.vx;
					bp.y += bp.vy;
					// Gentle drag so they settle into drifting rather than flying
					// off screen for the whole of their lifetime.
					bp.vx *= 0.985;
					bp.vy *= 0.985;
					bp.opacity = burstOpacity(age);
					return true;
				});
			}

			paint();
		};

		// Browsers throttle rAF in background tabs but do not reliably stop it.
		// Stopping explicitly means a backgrounded tab costs nothing at all.
		const onVisibility = () => {
			if (document.hidden) {
				if (!paused) {
					paused = true;
					cancelAnimationFrame(raf);
				}
			} else if (paused) {
				paused = false;
				last = 0;
				raf = requestAnimationFrame(tick);
			}
		};
		document.addEventListener('visibilitychange', onVisibility);

		raf = requestAnimationFrame(tick);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', resize);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<div class="ambient-bg" data-variant={variant} aria-hidden="true">
	<div class="blob blob-warm"></div>
	<div class="blob blob-warm-2"></div>
	<div class="blob blob-gold"></div>
	<div class="blob blob-cool"></div>

	<canvas bind:this={canvas}></canvas>
</div>

<style>
	/* Sits behind page content. body sets background-color, which propagates
     to the canvas because html has none, so a negative z-index paints above
     that background but below in-flow content. */
	.ambient-bg {
		position: fixed;
		inset: 0;
		z-index: -1;
		overflow: hidden;
		pointer-events: none;
		background: linear-gradient(
			165deg,
			var(--ambient-base-start) 0%,
			var(--ambient-base-mid) 48%,
			var(--ambient-base-end) 100%
		);
	}

	.blob {
		position: absolute;
		border-radius: 50%;
		backface-visibility: hidden;
		animation: orbit linear infinite;
	}

	/* Held still while a node is being dragged. These are the most expensive
	   thing on the page to rasterize — each one is a soft radial gradient up to
	   80vmax across, and rotating it repaints that whole area — and arranging
	   is the one time the browser is already busy laying the field out under
	   the pointer. Measured on the drag path: with the orbits running, roughly a
	   quarter of frames came in at half rate; held, none did.

	   Free, visually: a full orbit takes 22 to 45 seconds, so pausing one for
	   the length of a drag and resuming it in place is not something anyone can
	   see. `field-dragging` is set on <body> by FieldGrid for the duration of
	   the gesture. */
	:global(body.field-dragging) .blob {
		animation-play-state: paused;
	}

	.blob-warm {
		width: 80vmax;
		height: 80vmax;
		background: radial-gradient(circle, var(--ambient-blob-warm) 0%, transparent 68%);
		right: -18%;
		bottom: -18%;
		animation-duration: 22s;
		animation-delay: -5s;
		transform-origin: -20vw -14vh;
	}

	.blob-warm-2 {
		width: 55vmax;
		height: 55vmax;
		background: radial-gradient(circle, var(--ambient-blob-warm-2) 0%, transparent 68%);
		left: 8%;
		top: 52%;
		animation-duration: 16s;
		animation-delay: -4s;
		transform-origin: 18vw -12vh;
	}

	.blob-gold {
		width: 50vmax;
		height: 50vmax;
		background: radial-gradient(circle, var(--ambient-blob-gold) 0%, transparent 65%);
		left: 32%;
		top: -12%;
		animation-duration: 26s;
		animation-delay: -10s;
		transform-origin: -8vw 16vh;
	}

	.blob-cool {
		width: 72vmax;
		height: 72vmax;
		background: radial-gradient(circle, var(--ambient-blob-cool) 0%, transparent 65%);
		left: -18%;
		top: -18%;
		animation-duration: 18s;
		animation-delay: -7s;
		transform-origin: 22vw 20vh;
	}

	@keyframes orbit {
		100% {
			transform: translate3d(0, 0, 1px) rotate(360deg);
		}
	}

	/* Unlike the source, the blob orbits stop for reduced motion too. A 45s
     rotation is still motion. */
	@media (prefers-reduced-motion: reduce) {
		.blob {
			animation: none;
		}
	}

	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
</style>
