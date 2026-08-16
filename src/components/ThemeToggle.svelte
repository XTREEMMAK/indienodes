<script>
	/**
	 * Cycles light, dark, system on each click; the full three-way choice
	 * with descriptions lives on the Settings page. One cycling control with
	 * three presentations, rather than three components sharing nothing but
	 * a click handler:
	 *
	 * - `pill` (default): the original compact standalone control.
	 * - `drawer`: a full-width row, for the desktop nav drawer.
	 * - `icon`: a square, icon-only button, for the mobile floating tool
	 *   cluster. Replaced the old `bar` variant when theme moved off the
	 *   bottom tab bar; that bar is destinations only now.
	 *
	 * @type {{ variant?: 'pill' | 'drawer' | 'icon' }}
	 */
	let { variant = 'pill' } = $props();

	import { preferencesStore } from '$lib/preferencesStore.svelte.js';

	const ORDER = /** @type {const} */ (['light', 'dark', 'system']);

	const LABELS = {
		light: 'Light',
		dark: 'Dark',
		system: 'System'
	};

	function cycle() {
		const next = ORDER[(ORDER.indexOf(preferencesStore.theme) + 1) % ORDER.length];
		preferencesStore.setTheme(next);
	}
</script>

<button
	type="button"
	onclick={cycle}
	class="theme-toggle"
	class:pill={variant === 'pill'}
	class:drawer={variant === 'drawer'}
	class:icon={variant === 'icon'}
	class:glass-panel={variant === 'icon'}
	aria-label="Theme: {LABELS[preferencesStore.theme]}. Click to change."
>
	{#if preferencesStore.theme === 'light'}
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="4" />
			<path
				d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
			/>
		</svg>
	{:else if preferencesStore.theme === 'dark'}
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
		</svg>
	{:else}
		<svg
			viewBox="0 0 24 24"
			width="18"
			height="18"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<rect x="2" y="4" width="20" height="14" rx="2" />
			<path d="M8 21h8M12 18v3" />
		</svg>
	{/if}
	<span class="theme-toggle-label">{LABELS[preferencesStore.theme]}</span>
</button>

<style>
	.theme-toggle {
		display: inline-flex;
		align-items: center;
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}

	.theme-toggle.pill {
		gap: 0.65rem;
		padding: 0.65rem 1.1rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--glass-border);
		font-size: var(--text-sm);
	}

	.theme-toggle.pill:hover {
		background: var(--glass-bg);
	}

	/* Matches NavDrawer's other rows exactly, so the theme control does not
	   read as a different kind of thing sitting at the bottom of the same
	   list. */
	.theme-toggle.drawer {
		gap: 0.85rem;
		width: 100%;
		padding: 0.75rem 0.6rem;
		border: none;
		border-radius: var(--radius-sm);
		font-size: var(--text-base);
	}

	.theme-toggle.drawer:hover {
		background: var(--glass-bg);
	}

	/* Square and icon-only, for the mobile floating tool cluster
	   (+layout.svelte's .tool-button, whose dimensions these match). The
	   label is dropped rather than hidden with `display: none` on the span
	   alone, because the accessible name already comes from the button's own
	   aria-label, which states the current theme in full. */
	.theme-toggle.icon {
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		padding: 0;
		border: none;
		transition: transform 120ms ease;
	}

	.theme-toggle.icon:active {
		transform: scale(0.9);
	}

	.theme-toggle.icon .theme-toggle-label {
		display: none;
	}

	.theme-toggle-label {
		font-family: var(--font-body);
	}
</style>
