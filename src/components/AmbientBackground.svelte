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

		const resize = () => {
			width = window.innerWidth;
			height = window.innerHeight;
			el.width = width;
			el.height = height;
		};
		resize();
		window.addEventListener('resize', resize);

		const count = width < MOBILE_BREAKPOINT ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP;

		const particles = Array.from({ length: count }, () => ({
			x: Math.random() * width,
			y: Math.random() * height,
			vx: (Math.random() - 0.5) * 1.2,
			vy: (Math.random() - 0.5) * 1.2,
			r: Math.random() * 3 + 1.2,
			color: colors[Math.floor(Math.random() * colors.length)],
			opacity: reducedMotion ? Math.random() * 0.4 + 0.2 : 0,
			target: Math.random() * 0.55 + 0.45,
			speed: Math.random() * 0.009 + 0.003,
			fadingIn: true
		}));

		const paint = () => {
			ctx.clearRect(0, 0, width, height);
			for (const p of particles) {
				ctx.globalAlpha = p.opacity;
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
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

			// Drift speed follows whatever is playing, when the player is able
			// to analyse it at all (most cross-origin audio cannot be read;
			// see audioLevelStore). `active` is checked rather than treating a
			// level of 0 as "no audio", because silence and no-analysis look
			// identical in the number alone. With nothing playing this stays
			// exactly 1 and the field drifts at its original pace.
			//
			// The beat carries almost all of this, and sustained loudness
			// almost none. That split is deliberate and was measured: overall
			// energy on real music sits around 0.47 and barely moves, so
			// driving speed from it produced a constant 1.9x with no visible
			// variation at all, which read as the background ignoring the
			// audio. Weighting the pulse instead means the field returns to
			// its resting pace between hits, which is what makes a beat
			// legible as a beat rather than as general activity.
			const boost = audioLevelStore.active
				? 1 + audioLevelStore.level * 0.5 + audioLevelStore.pulse * 5
				: 1;

			for (const p of particles) {
				p.x += p.vx * boost;
				p.y += p.vy * boost;
				if (p.x < 0) p.x = width;
				if (p.x > width) p.x = 0;
				if (p.y < 0) p.y = height;
				if (p.y > height) p.y = 0;

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
