import { browser } from '$app/environment';

/** @typedef {'light' | 'dark' | 'system'} ThemeMode */

const MEDIA_QUERY = '(prefers-color-scheme: dark)';

/**
 * Applies a theme mode to the document root as a `data-theme` attribute.
 * `system` removes the attribute entirely so the `prefers-color-scheme`
 * media query in app.css takes over.
 * @param {ThemeMode} mode
 */
export function applyTheme(mode) {
	if (!browser) return;
	const root = document.documentElement;
	if (mode === 'system') {
		root.removeAttribute('data-theme');
	} else {
		root.setAttribute('data-theme', mode);
	}
}

/**
 * Starts a matchMedia listener that reapplies the resolved theme whenever
 * the OS setting changes, so `system` tracks it live rather than only at
 * load. No-op, and returns a no-op cleanup, outside the browser.
 * @param {() => ThemeMode} getMode
 * @returns {() => void}
 */
export function watchSystemTheme(getMode) {
	if (!browser) return () => {};
	const query = window.matchMedia(MEDIA_QUERY);
	const onChange = () => {
		if (getMode() === 'system') applyTheme('system');
	};
	query.addEventListener('change', onChange);
	return () => query.removeEventListener('change', onChange);
}
