/**
 * Validates the two optional theming query parameters `/embed-frame` accepts
 * (`accent`, `font`) before they ever reach a CSS custom property. Not a
 * security boundary in the way sanitizing HTML or a URL scheme is — a CSS
 * custom property can only ever resolve to the value of the one specific
 * property it is substituted into (see Widget.svelte's own comment), so an
 * unfiltered string here cannot inject a rule, a property, or a `url()` the
 * widget doesn't already declare; the worst a hostile value can do is fail
 * that one substitution and fall back to the default. This exists for
 * hygiene and a predictable failure mode anyway: a narrow, allowlisted
 * character set is cheap to reason about and keeps a stray `?accent=` from
 * silently carrying something nobody intended as a color.
 *
 * Both return the trimmed value unchanged when it passes, or `undefined`
 * when it doesn't — `undefined` composes directly with `style:` bindings,
 * which unset the property entirely rather than setting it to the word
 * "undefined".
 */

const MAX_ACCENT_LENGTH = 64;
const MAX_FONT_LENGTH = 128;

// Hex, rgb()/rgba()/hsl()/hsla()/oklch() and friends, and named colors --
// letters, digits, and the punctuation any of those forms use. No `;`, `{`,
// `}`, quotes, or `<`/`>`: nothing here needs them, and excluding them is
// free.
const ACCENT_PATTERN = /^[a-zA-Z0-9#(),.%\s-]+$/;

// Font-family lists: unquoted keywords (sans-serif, system-ui, ...) and
// quoted family names (a name containing a space needs quotes to be valid
// CSS at all), comma-separated.
const FONT_PATTERN = /^[a-zA-Z0-9\s,'"-]+$/;

/** @param {string | null | undefined} value @returns {string | undefined} */
export function sanitizeAccentColor(value) {
	const trimmed = (value ?? '').trim();
	if (!trimmed || trimmed.length > MAX_ACCENT_LENGTH) return undefined;
	return ACCENT_PATTERN.test(trimmed) ? trimmed : undefined;
}

/** @param {string | null | undefined} value @returns {string | undefined} */
export function sanitizeFontFamily(value) {
	const trimmed = (value ?? '').trim();
	if (!trimmed || trimmed.length > MAX_FONT_LENGTH) return undefined;
	return FONT_PATTERN.test(trimmed) ? trimmed : undefined;
}
