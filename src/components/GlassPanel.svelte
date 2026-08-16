<script>
	/**
	 * Shared translucent container for chrome: header, settings sheet, About
	 * and Support panels, field-view node cards, the reader's control bar.
	 * Not meant for body text or form inputs; those keep solid surfaces.
	 */
	let { as = 'div', class: className = '', children, ...rest } = $props();
</script>

<svelte:element this={as} class="glass-panel {className}" {...rest}>
	{@render children?.()}
</svelte:element>
