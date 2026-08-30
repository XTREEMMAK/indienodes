import { browser } from '$app/environment';

/** @typedef {'light' | 'dark' | 'system'} ThemeMode */

const MEDIA_QUERY = '(prefers-color-scheme: dark)';

/**
 * Applies a theme mode to the document root as a `data-theme` attribute.
 * `system` removes the attribute entirely so the `prefers-color-scheme`
 * media query in app.css takes over.
 *
 * A `dark` class is mirrored onto the same element, resolved to a concrete
 * light or dark rather than left as three states. This app's own styling
 * does not read it and should keep using `data-theme`; it exists for
 * third-party CSS that only understands Tailwind's class-based dark variant.
 * The rich-text editor on the join and update forms is compiled that way, and
 * without this it never sees dark mode at all — it keeps its light palette,
 * which is how its body text ended up black on a dark surface.
 *
 * `watchSystemTheme` below already re-calls this whenever the OS setting
 * changes, so the resolved class tracks `system` live rather than only at
 * load.
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
	const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia(MEDIA_QUERY).matches);
	root.classList.toggle('dark', isDark);
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
