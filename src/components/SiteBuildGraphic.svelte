<script>
	// The illustration on the "Build your page" step: an abstract site
	// assembling itself, standing in for the thing the editor produces.
	//
	// Drawn rather than screenshotted on purpose. A screenshot would show one
	// template and quietly promise that look; a wireframe shows the *shape* of
	// a page — header, hero, a row of work, a footer strip — which is what
	// every template has in common and all this needs to say.
	//
	// The colours are the app's own type accents, so the blocks read as the
	// kinds of content a node holds rather than as arbitrary decoration.
	//
	// One SVG, animated with CSS. `prefers-reduced-motion` stops the assembly
	// and shows the finished page, which is the informative state anyway —
	// the motion is a flourish on top of a picture that already works still.

	/** @type {{ label?: string }} */
	let { label = 'A page assembling itself: header, hero image, work, and a footer' } = $props();
</script>

<svg
	class="site-graphic"
	viewBox="0 0 320 220"
	role="img"
	aria-label={label}
	preserveAspectRatio="xMidYMid meet"
>
	<!-- Browser chrome, drawn once and static: it is the frame the animation
	     happens inside, so animating it too would leave nothing at rest. -->
	<rect class="chrome" x="8" y="8" width="304" height="204" rx="12" />
	<rect class="bar" x="8" y="8" width="304" height="26" rx="12" />
	<rect class="bar-foot" x="8" y="26" width="304" height="8" />
	<circle class="dot" cx="24" cy="21" r="4" />
	<circle class="dot" cx="38" cy="21" r="4" />
	<circle class="dot" cx="52" cy="21" r="4" />
	<rect class="url" x="68" y="15" width="150" height="12" rx="6" />

	<g class="page">
		<rect class="hero block" x="24" y="48" width="180" height="58" rx="8" />
		<rect class="line block" x="24" y="116" width="120" height="10" rx="5" />
		<rect class="line short block" x="24" y="132" width="80" height="10" rx="5" />

		<rect class="art block" x="216" y="48" width="80" height="58" rx="8" />

		<rect class="work a block" x="24" y="156" width="76" height="34" rx="8" />
		<rect class="work b block" x="108" y="156" width="76" height="34" rx="8" />
		<rect class="work c block" x="192" y="156" width="104" height="34" rx="8" />

		<rect class="block ring" x="112" y="198" width="96" height="6" rx="3" />
	</g>
</svg>

<style>
	.site-graphic {
		display: block;
		width: 100%;
		height: auto;
		max-width: 32rem;
	}

	.chrome {
		fill: var(--bg);
		stroke: var(--border);
		stroke-width: 1.5;
	}

	.bar,
	.bar-foot {
		fill: var(--bg-elevated);
	}

	.dot {
		fill: var(--border);
	}

	.url {
		fill: var(--border);
		opacity: 0.7;
	}

	.block {
		fill: var(--text-muted);
		opacity: 0.25;
	}

	.hero {
		fill: var(--accent);
		opacity: 0.55;
	}

	.art {
		fill: var(--type-art, var(--accent));
		opacity: 0.5;
	}

	.work.a {
		fill: var(--type-audio, var(--accent));
		opacity: 0.45;
	}

	.work.b {
		fill: var(--type-comic, var(--accent));
		opacity: 0.45;
	}

	.work.c {
		fill: var(--type-text, var(--accent));
		opacity: 0.45;
	}

	.ring {
		fill: var(--accent);
		opacity: 0.8;
	}

	@media (prefers-reduced-motion: no-preference) {
		/* Each block rises into place and stays. The stagger is the whole
		   point — a page arriving piece by piece rather than all at once is
		   what reads as "built". `transform-box: fill-box` so a translate is
		   measured against the shape rather than the whole SVG viewport. */
		.page .block {
			transform-box: fill-box;
			transform-origin: center;
			animation: settle 560ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
		}

		.hero {
			animation-delay: 120ms;
		}
		.art {
			animation-delay: 220ms;
		}
		.line {
			animation-delay: 300ms;
		}
		.line.short {
			animation-delay: 360ms;
		}
		.work.a {
			animation-delay: 440ms;
		}
		.work.b {
			animation-delay: 520ms;
		}
		.work.c {
			animation-delay: 600ms;
		}
		.ring {
			animation:
				settle 560ms cubic-bezier(0.22, 1, 0.36, 1) 720ms backwards,
				ring-pulse 3.2s ease-in-out 1.4s infinite;
		}

		@keyframes settle {
			from {
				opacity: 0;
				transform: translateY(10px) scale(0.96);
			}
		}

		/* The one loop, and deliberately the smallest element: the ring strip
		   is what this page is joining, so it keeps a slow pulse while
		   everything else comes to rest. */
		@keyframes ring-pulse {
			0%,
			100% {
				opacity: 0.8;
			}
			50% {
				opacity: 0.35;
			}
		}
	}
</style>
