<script>
	/**
	 * Four rounded nodes: audio, games, text, and comic, in their type
	 * colors (brief section 9). Three full-size, one smaller in the
	 * bottom-right corner, standing in for "one more thing connected to the
	 * cluster" rather than a fourth equal quadrant. All four type colors are
	 * now locked (docs/decisions.md), so these fills are stable; the favicon
	 * hardcodes the same hexes and would need updating alongside them.
	 * @type {{ size?: number }}
	 */
	let { size = 28 } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 36 36"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	aria-hidden="true"
>
	<rect x="2" y="2" width="15" height="15" rx="5" fill="var(--type-audio)" />
	<rect x="19" y="2" width="15" height="15" rx="5" fill="var(--type-game)" />
	<rect x="2" y="19" width="15" height="15" rx="5" fill="var(--type-text)" />
	<rect x="21.5" y="21.5" width="10" height="10" rx="3.5" fill="var(--type-comic)" />
</svg>
