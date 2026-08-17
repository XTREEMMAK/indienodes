/**
 * The one data shape every generator template consumes, and the one place
 * that shape is written down. `render(data) -> {html, css, js}` is the
 * entire template contract: plain strings, no framework runtime, so the
 * exported site is exactly what ships, and the live preview (an
 * `<iframe srcdoc>`) renders that same output rather than a second,
 * hand-kept approximation of it.
 *
 * `iconUrl`/media urls are plain strings on purpose, not `Blob`s: a
 * template has no business knowing whether it is being called for a live
 * preview (where the caller passes an `URL.createObjectURL` blob url) or a
 * real export (where the caller passes a relative `assets/...` path). That
 * split lives in the caller, not here, which is what keeps preview and
 * export unable to drift from each other by construction.
 *
 * @typedef {object} GeneratorData
 * @property {'audio' | 'comic' | 'text' | 'game'} type
 * @property {string} displayName
 * @property {string} why One-line framing, reused from the ring submission's own `why`.
 * @property {string} [bio] Longer-form, generator-only: not part of ring.json (there is no room for it there), collected purely for a creator's own generated page.
 * @property {string | null} [accentColor] Optional creator-chosen main color, `#rrggbb`. A template that supports it overrides its own default accent with this; a template that doesn't just ignores it.
 * @property {string | null} iconUrl
 * @property {{ label: string, url: string }[]} socialLinks
 * @property {string} verificationToken Baked into the export as a meta tag; never rendered as visible copy.
 * @property {string} [widgetEmbed] The ring widget's own `<script>` + `<indienode-widget>` embed markup (see `src/routes/widget/embed-snippet.js`), pre-built by the caller with this creator's site id. Rendered live in the footer, not shown as a code sample — see `widgetEmbedHtml`.
 * @property {{ label: string, url: string }[]} [tracks] Audio only, up to 3.
 * @property {{ url: string, caption?: string }[]} [pages] Comic only, up to 3.
 * @property {string} [excerpt] Text only.
 * @property {string | null} [screenshotUrl] Game only.
 */

/**
 * Every template's own `<head>` needs this; centralized so the verification
 * meta tag can never be typo'd differently across four files, and so a
 * future change to how it is embedded (the spec's own still-open question
 * on meta tag vs. well-known file, see `submission-form-spec.md` section 4)
 * touches one place.
 * @param {string} token
 */
export function verificationMeta(token) {
	return `<meta name="indienode-verification" content="${escapeAttr(token)}" />`;
}

/**
 * A tiny inline `<style>` block overriding `--accent` with the creator's
 * chosen color, or the empty string when they didn't pick one — this is
 * what lets `styles.css` itself stay a genuinely static file (its own
 * `--accent` default untouched) rather than needing to become a `fill()`
 * target just to support one optional per-creator override. Not validated
 * beyond "looks like a hex color": the source is a native `<input
 * type="color">`, which cannot itself produce anything else.
 * @param {string | null | undefined} color
 */
export function accentColorOverride(color) {
	if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return '';
	return `<style>:root{--accent:${color};}</style>`;
}

/**
 * Minimal HTML-attribute escaping. Not a general sanitizer: everything
 * passed through this comes from the creator's own submission form, held in
 * their own browser, about to become their own exported site. The concern
 * here is malformed HTML from a stray quote or angle bracket, not an
 * adversarial input model — nothing here is ever rendered on IndieNodes
 * infrastructure itself, only downloaded and hosted by the person who typed
 * it.
 * @param {string} value
 */
export function escapeAttr(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/** @param {string} value */
export function escapeHtml(value) {
	return escapeAttr(value);
}

/**
 * Social links footer markup, identical across all four templates: same
 * data shape, same job. Each template supplies its own class name so it can
 * still be styled to match its own visual language.
 * @param {{ label: string, url: string }[]} links
 * @param {string} [className]
 */
export function socialLinksHtml(links, className = 'social-links') {
	if (!links?.length) return '';
	const items = links
		.map(
			(link) =>
				`<a href="${escapeAttr(link.url)}" rel="me noopener noreferrer" target="_blank">${escapeHtml(link.label)}</a>`
		)
		.join('\n');
	return `<nav class="${className}" aria-label="Elsewhere">\n${items}\n</nav>`;
}

const ICON_MUSIC =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18V5l12-2v13" stroke-linecap="round" stroke-linejoin="round" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>';
const ICON_CHAT =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke-linecap="round" stroke-linejoin="round" /></svg>';
const ICON_CAMERA =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="6" width="20" height="14" rx="2" /><circle cx="12" cy="13" r="4" /><path d="M8 6l1.5-2h5L16 6" stroke-linecap="round" stroke-linejoin="round" /></svg>';
const ICON_PLAY =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" /></svg>';
const ICON_MAIL =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" stroke-linecap="round" stroke-linejoin="round" /></svg>';
const ICON_LINK =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 1 0-5.66-5.66l-1 1" stroke-linecap="round" stroke-linejoin="round" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 1 0 5.66 5.66l1-1" stroke-linecap="round" stroke-linejoin="round" /></svg>';

/**
 * A small set of generic pictograms for common "elsewhere" link categories,
 * matched by loose substring on the link's own label — deliberately generic
 * rather than exact brand marks (a simple geometric icon per category, not
 * a logo), which sidesteps trademark-accuracy concerns entirely and stays
 * consistent with every other icon across this app and these templates:
 * hand-authored inline SVG, `currentColor`, no icon font or library. Falls
 * back to a generic link icon for anything unmatched.
 * @param {string} label
 */
export function socialIcon(label) {
	const key = (label ?? '').toLowerCase();
	if (/bandcamp|soundcloud|spotify|music/.test(key)) return ICON_MUSIC;
	if (/mastodon|twitter|threads|bluesky|discord|social/.test(key)) return ICON_CHAT;
	if (/instagram|photo/.test(key)) return ICON_CAMERA;
	if (/youtube|video|vimeo|twitch/.test(key)) return ICON_PLAY;
	if (/mail|newsletter/.test(key)) return ICON_MAIL;
	return ICON_LINK;
}

/**
 * Like `socialLinksHtml`, but each link carries `socialIcon`'s pictogram
 * alongside its label rather than being text-only. Its own function rather
 * than an options flag on `socialLinksHtml`, so the three templates already
 * using the plain text version are untouched by this.
 * @param {{ label: string, url: string }[]} links
 * @param {string} [className]
 */
export function socialLinksIconHtml(links, className = 'social-links') {
	if (!links?.length) return '';
	const items = links
		.map(
			(link) =>
				`<a href="${escapeAttr(link.url)}" rel="me noopener noreferrer" target="_blank">${socialIcon(link.label)}<span>${escapeHtml(link.label)}</span></a>`
		)
		.join('\n');
	return `<nav class="${className}" aria-label="Elsewhere">\n${items}\n</nav>`;
}

/**
 * Wraps the ring widget's embed markup for a template's footer, centered:
 * every generated site carries a real, working widget by default (the
 * `/join` form's own last step used to only ask a creator to paste this in
 * themselves, which a generator export can just do for them, the same way
 * it already does everything else about the page). Empty when `embed` is
 * missing rather than emitting an empty wrapper, so a template preview
 * rendered without one (an older fixture, say) shows nothing rather than a
 * stray empty `<div>`.
 * @param {string | undefined} embed
 */
export function widgetEmbedHtml(embed) {
	if (!embed) return '';
	return `<div class="ring-widget">\n${embed}\n</div>`;
}

/**
 * Fills `{{token}}` placeholders in a loaded shell string with pre-built
 * values. Deliberately dumb: no nested lookup, no escaping, no control
 * flow — the caller already builds each value with the right escaping
 * (`escapeHtml` for user text, a raw HTML fragment for things like
 * `socialLinksHtml`'s own output), exactly as it did when these values were
 * interpolated inline. This only moves *where* each template's static shell
 * lives (a real, directly-openable `.html` file per template, loaded via
 * Vite's `?raw` import suffix), not who is responsible for escaping safety.
 *
 * A missing key is left as the literal `{{token}}` in the output rather
 * than silently becoming an empty string, so a typo'd token name is visible
 * immediately in the rendered page instead of quietly vanishing.
 * @param {string} shell
 * @param {Record<string, string>} values
 */
export function fill(shell, values) {
	return shell.replace(/\{\{(\w+)\}\}/g, (match, key) =>
		Object.hasOwn(values, key) ? values[key] : match
	);
}
