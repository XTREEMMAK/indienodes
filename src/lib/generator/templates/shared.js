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
 * @property {string | null} [accentColor] Optional creator-chosen main color.
 * @property {string | null} [groundColor] Late Signal page background.
 * @property {string | null} [surfaceColor] Late Signal raised-section background.
 * @property {string | null} [backgroundGlowColor] Neon Signal background glow color.
 * @property {boolean} [backgroundGlowMotion] Whether Neon Signal's glow follows a slow path.
 * @property {string | null} iconUrl
 * @property {{ label: string, url: string }[]} socialLinks
 * @property {string} verificationToken Baked into the export as a meta tag; never rendered as visible copy.
 * @property {string} [widgetEmbed] The ring widget's own `<script>` + `<indienode-widget>` embed markup (see `src/routes/widget/embed-snippet.js`), pre-built by the caller with this creator's site id. Rendered live in the footer, not shown as a code sample — see `widgetEmbedHtml`.
 * @property {{ label: string, url: string }[]} [tracks] Audio only, up to 3.
 * @property {{ url: string, caption?: string }[]} [pages] Comic only, up to 3.
 * @property {string[]} [excerpts] Text only, up to 3.
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
	return colorVariableOverrides({ '--accent': color });
}

/**
 * Builds a safe inline override for template CSS variables.
 * @param {Record<string, string | null | undefined>} variables
 */
export function colorVariableOverrides(variables) {
	const declarations = Object.entries(variables)
		.filter(([name, color]) => /^--[a-z-]+$/.test(name) && color && /^#[0-9a-f]{6}$/i.test(color))
		.map(([name, color]) => `${name}:${color}`)
		.join(';');
	return declarations ? `<style>:root{${declarations};}</style>` : '';
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

// Seventeen brand marks get a real (hand-drawn, not traced from any official
// asset) glyph instead of the generic pictograms below, because the
// generic-only approach made Bluesky, Twitter/X, and Discord all render the
// same speech-bubble, folded Bandcamp/Spotify/SoundCloud into one generic
// music note, folded Twitch into the generic "video" icon, and left
// Facebook, DeviantArt, TikTok, League of Comic Geeks, ArtStation, WeChat,
// Tumblr, Pinterest, Snapchat, and Apple (Music/Podcasts) with no match at
// all. Kept as plain `currentColor` inline SVG, same convention as
// everything else here.
const ICON_BLUESKY =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 9.5C10.3 6.2 7 4 4.5 4 3 4 2 4.9 2 6.6c0 3 2.3 6.9 5.5 9 1.6 1.1 3 1.7 4.5 2.4-1.9-.4-3.9-.1-5.4.9-1 .7-1.3 1.7-.7 2.4.7.8 2.4.8 4.1-.1 1.7-.9 3-2.4 4-4.2 1 1.8 2.3 3.3 4 4.2 1.7.9 3.4.9 4.1.1.6-.7.3-1.7-.7-2.4-1.5-1-3.5-1.3-5.4-.9 1.5-.7 2.9-1.3 4.5-2.4C19.7 13.5 22 9.6 22 6.6 22 4.9 21 4 19.5 4 17 4 13.7 6.2 12 9.5z" /></svg>';
const ICON_TWITTER =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M4.5 4.5l15 15M19.5 4.5l-15 15" stroke-linecap="round" /></svg>';
const ICON_FACEBOOK =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M14.5 3h-2C10.1 3 8.6 4.6 8.6 7.1V10H6.2v3.3h2.4V21h3.4v-7.7h2.7l.4-3.3h-3.1V7.4c0-.9.4-1.5 1.7-1.5h1.8V3z" /></svg>';
const ICON_DISCORD =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 5.5c-2.6.5-4.4 1.3-4.4 1.3S2 10 2 15.5c0 0 1.5 2.4 5.4 2.6 0 0 .5-.7 1-1.4-2-.6-2.7-1.7-2.7-1.7l.5.3c2 1.1 4.9 1.5 7.6.4.4-.1.9-.3 1.5-.7 0 0-.7 1.1-2.8 1.7.5.7 1 1.4 1 1.4 3.9-.2 5.4-2.6 5.4-2.6 0-5.5-1.9-9.7-1.9-9.7S15 5.8 12.4 5.4l-.3.5c2.3.6 3.4 1.4 3.4 1.4-1.4-.7-2.8-1.1-4.1-1.3a9.8 9.8 0 0 0-4.3 0c-1.3.2-2.7.6-4.1 1.3 0 0 1-.8 3.4-1.4L8 5.5z" stroke-linejoin="round" /><circle cx="9" cy="12.3" r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy="12.3" r="1.1" fill="currentColor" stroke="none" /></svg>';
const ICON_BANDCAMP =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M4 6h11l5 12H9L4 6z" /></svg>';
const ICON_SPOTIFY =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M7 9.5c3.5-1 8-.6 10.5 1" stroke-linecap="round" /><path d="M7.3 12.7c3-.8 6.8-.5 9 .8" stroke-linecap="round" /><path d="M7.8 15.8c2.4-.6 5.4-.4 7.2.7" stroke-linecap="round" /></svg>';
const ICON_DEVIANTART =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M4 4h9l3 3v3h4v6h-9l-3-3v-3H4V4z" /></svg>';
const ICON_TIKTOK =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M14 3v10.5a3.5 3.5 0 1 1-2.5-3.35V8.6a5.9 5.9 0 1 0 4.9 5.8V9.2a6.9 6.9 0 0 0 4.1 1.3V7.9a4.4 4.4 0 0 1-2.8-1 4.4 4.4 0 0 1-1.2-2.5V3h-2.5z" /></svg>';
const ICON_LEAGUE =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3.2 8.5-7 10-3.8-1.5-7-5-7-10V6l7-3z" stroke-linejoin="round" /><path d="M12 8.5l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3 1-2.1z" fill="currentColor" stroke="none" /></svg>';
const ICON_SOUNDCLOUD =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 17h11a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8.2 9.1 3.2 3.2 0 0 0 6 17z" stroke-linejoin="round" /><path d="M8 13v4M10.3 12v5M12.6 12.5v4.5" stroke-linecap="round" /></svg>';
const ICON_ARTSTATION =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 3l9 15.5h-4L12 8.5 6.8 17H10l-1.7 3H2L12 3z" /></svg>';
const ICON_WECHAT =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9 4.5c-4 0-7 2.6-7 6 0 2 1.1 3.7 2.9 4.8L4 18l2.7-1.3c.7.2 1.5.3 2.3.3h.3a5.6 5.6 0 0 1-.3-1.9c0-3.6 3.4-6.5 7.6-6.5h.3C16 6 12.8 4.5 9 4.5z" stroke-linejoin="round" /><path d="M16.3 10c-3.5 0-6.3 2.3-6.3 5.2 0 2.8 2.8 5.2 6.3 5.2.7 0 1.3-.1 2-.3L20.5 21l-1-2.4c1.5-1 2.5-2.5 2.5-4.2 0-2.9-2.8-5.2-6.3-5.2v.8z" stroke-linejoin="round" /><circle cx="6.5" cy="9.5" r="0.9" fill="currentColor" stroke="none" /><circle cx="10.5" cy="9.5" r="0.9" fill="currentColor" stroke="none" /><circle cx="14.3" cy="14" r="0.8" fill="currentColor" stroke="none" /><circle cx="18.3" cy="14" r="0.8" fill="currentColor" stroke="none" /></svg>';
const ICON_TWITCH =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 3h16v11l-4 4h-4l-2.5 2.5H8V18H4V3z" stroke-linejoin="round" /><path d="M11 7.5v5M15.5 7.5v5" stroke-linecap="round" /></svg>';
const ICON_TUMBLR =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M13 3v4h3.5v3H13v6c0 1.4.7 2 2 2 .6 0 1.1-.1 1.5-.3v3.1c-.7.3-1.7.5-2.8.5-3 0-4.7-1.7-4.7-4.6V10H7V7.4c1.9-.5 3-1.9 3.3-4.4H13z" /></svg>';
const ICON_PINTEREST =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M9.5 19c.6-1.8 1.6-5.7 1.6-5.7m0 0c-.4-.7-.6-1.6-.6-2.5 0-2.1 1.3-3.7 3.2-3.7 1.6 0 2.6 1.1 2.6 2.7 0 1.7-1 4.1-2.5 4.1-.8 0-1.4-.6-1.2-1.5.3-1.1 1-2.4 1-3.2 0-.8-.4-1.4-1.2-1.4-1 0-1.7.9-1.7 2.2 0 .8.3 1.3.3 1.3" stroke-linecap="round" stroke-linejoin="round" /></svg>';
const ICON_SNAPCHAT =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3.5c-3.3 0-5.6 2.5-5.6 6v2c-.9.5-1.9.9-2.9 1 0 .8.9 1.3 1.9 1.7-.2.5-.5.9-.9 1.2.5.5 1.4.7 2.1.8.1.6.2 1.1.7 1.3.7.3 1.7-.1 2.7-.1s1.7.9 2 .9.9-.9 2-.9 2 .4 2.7.1c.5-.2.6-.7.7-1.3.7-.1 1.6-.3 2.1-.8-.4-.3-.7-.7-.9-1.2 1-.4 1.9-.9 1.9-1.7-1-.1-2-.5-2.9-1v-2c0-3.5-2.3-6-5.6-6z" stroke-linejoin="round" /><circle cx="9.3" cy="10.5" r="0.8" fill="currentColor" stroke="none" /><circle cx="14.7" cy="10.5" r="0.8" fill="currentColor" stroke="none" /></svg>';
const ICON_APPLE =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M16.5 12.3c0-2.3 1.7-3.5 1.8-3.6-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.2.8-.7 0-1.7-.7-2.8-.7-1.4 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.7-.7s1.6.7 2.8.7c1.1 0 1.9-1 2.7-2.1.6-.8.8-1.2 1.2-2.1-3.1-1.2-3.5-2.2-3.5-3.4z" /><path d="M14 5.9c.6-.8 1-1.9.9-3-1 .1-2.1.7-2.7 1.5-.5.7-1 1.8-.9 2.9 1.1.1 2.1-.5 2.7-1.4z" /></svg>';

/** @type {[RegExp, string][]} */
const BRAND_HOSTS = [
	[/(^|\.)bsky\.app$/, ICON_BLUESKY],
	[/(^|\.)(twitter\.com|x\.com)$/, ICON_TWITTER],
	[/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, ICON_FACEBOOK],
	[/(^|\.)(discord\.gg|discord\.com|discordapp\.com)$/, ICON_DISCORD],
	[/(^|\.)bandcamp\.com$/, ICON_BANDCAMP],
	[/(^|\.)spotify\.com$/, ICON_SPOTIFY],
	[/(^|\.)deviantart\.com$/, ICON_DEVIANTART],
	[/(^|\.)tiktok\.com$/, ICON_TIKTOK],
	[/(^|\.)leagueofcomicgeeks\.com$/, ICON_LEAGUE],
	[/(^|\.)soundcloud\.com$/, ICON_SOUNDCLOUD],
	[/(^|\.)artstation\.com$/, ICON_ARTSTATION],
	[/(^|\.)(wechat\.com|weixin\.qq\.com)$/, ICON_WECHAT],
	[/(^|\.)twitch\.tv$/, ICON_TWITCH],
	[/(^|\.)tumblr\.com$/, ICON_TUMBLR],
	[/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, ICON_PINTEREST],
	[/(^|\.)snapchat\.com$/, ICON_SNAPCHAT],
	[/(^|\.)apple\.com$/, ICON_APPLE]
];

/**
 * Lowercased hostname for a (possibly partial/invalid, since this also runs
 * against a URL field while a creator is still typing it) URL string. Fails
 * soft to `''` rather than throwing, so an incomplete URL just falls through
 * to the label-based match below instead of breaking the live preview.
 * @param {string | undefined} url
 */
function hostnameOf(url) {
	if (!url) return '';
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
}

/**
 * A pictogram for a link's own icon slot: a real brand mark for the
 * networks in `BRAND_HOSTS` (matched by the URL's hostname first, since
 * that's a stronger signal than whatever the creator typed as a label, then
 * by label substring as a fallback for a URL that isn't typed yet), and
 * otherwise a small set of generic pictograms for common "elsewhere" link
 * categories, matched by loose substring on the label — deliberately
 * generic rather than exact brand marks for everything outside that list
 * (a simple geometric icon per category, not a logo), which sidesteps
 * trademark-accuracy concerns for the long tail and stays consistent with
 * every other icon across this app and these templates: hand-authored
 * inline SVG, `currentColor`, no icon font or library. Falls back to a
 * generic link icon for anything unmatched.
 * @param {string} label
 * @param {string} [url]
 */
export function socialIcon(label, url) {
	const host = hostnameOf(url);
	for (const [pattern, icon] of BRAND_HOSTS) {
		if (host && pattern.test(host)) return icon;
	}
	const key = (label ?? '').toLowerCase();
	if (/bluesky/.test(key)) return ICON_BLUESKY;
	if (/twitter|\bx\b/.test(key)) return ICON_TWITTER;
	if (/facebook/.test(key)) return ICON_FACEBOOK;
	if (/discord/.test(key)) return ICON_DISCORD;
	if (/bandcamp/.test(key)) return ICON_BANDCAMP;
	if (/spotify/.test(key)) return ICON_SPOTIFY;
	if (/deviantart/.test(key)) return ICON_DEVIANTART;
	if (/tiktok/.test(key)) return ICON_TIKTOK;
	if (/league of comic geeks|leagueofcomicgeeks|comic geeks/.test(key)) return ICON_LEAGUE;
	if (/soundcloud/.test(key)) return ICON_SOUNDCLOUD;
	if (/artstation|art station/.test(key)) return ICON_ARTSTATION;
	if (/wechat|we chat/.test(key)) return ICON_WECHAT;
	if (/twitch/.test(key)) return ICON_TWITCH;
	if (/tumblr/.test(key)) return ICON_TUMBLR;
	if (/pinterest/.test(key)) return ICON_PINTEREST;
	if (/snapchat|snap chat/.test(key)) return ICON_SNAPCHAT;
	if (/apple/.test(key)) return ICON_APPLE;
	if (/music/.test(key)) return ICON_MUSIC;
	if (/mastodon|threads|social/.test(key)) return ICON_CHAT;
	if (/instagram|photo/.test(key)) return ICON_CAMERA;
	if (/youtube|video|vimeo/.test(key)) return ICON_PLAY;
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
 * @param {string} [linkClass]
 */
export function socialLinksIconOnlyHtml(links, className = 'social-links', linkClass = '') {
	if (!links?.length) return '';
	const classAttribute = linkClass ? ` class="${escapeAttr(linkClass)}"` : '';
	const items = links
		.map(
			(link) =>
				`<a${classAttribute} href="${escapeAttr(link.url)}" rel="me noopener noreferrer" target="_blank" aria-label="${escapeAttr(link.label)}">${socialIcon(link.label, link.url)}</a>`
		)
		.join('\n');
	return `<nav class="${className}" aria-label="Elsewhere">\n${items}\n</nav>`;
}

/**
 * @param {{ label: string, url: string }[]} links
 * @param {string} [className]
 * @param {string} [linkClass]
 */
export function socialLinksIconHtml(links, className = 'social-links', linkClass = '') {
	if (!links?.length) return '';
	const classAttribute = linkClass ? ` class="${escapeAttr(linkClass)}"` : '';
	const items = links
		.map(
			(link) =>
				`<a${classAttribute} href="${escapeAttr(link.url)}" rel="me noopener noreferrer" target="_blank">${socialIcon(link.label, link.url)}<span>${escapeHtml(link.label)}</span></a>`
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

/**
 * Small, layout-neutral helpers used by templates that show an image slot
 * even when the creator has not uploaded an image. Template-specific class
 * names and markup remain in each template's own index.js.
 */
export const PLACEHOLDER_CSS = `
.generator-placeholder {
	display: grid;
	place-items: center;
	min-height: 8rem;
	background: color-mix(in srgb, var(--accent, currentColor) 14%, transparent);
	color: inherit;
	font: 800 0.8rem/1 system-ui, sans-serif;
	letter-spacing: 0.12em;
	text-align: center;
}`;

/**
 * @param {string | null | undefined} url
 * @param {string} className
 * @param {string} alt
 * @param {string} fallback
 */
export function imageOrPlaceholder(url, className, alt, fallback) {
	return url
		? `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" class="${escapeAttr(className)}" />`
		: `<div class="${escapeAttr(className)} generator-placeholder" aria-hidden="true">${escapeHtml(fallback)}</div>`;
}

/** @param {string} message */
export function emptyState(message) {
	return `<p class="generator-empty">${escapeHtml(message)}</p>`;
}

/**
 * @param {string} html
 * @param {string} css
 * @param {string} [js]
 */
export function templateResult(html, css, js = '') {
	return {
		html: html.trim(),
		css: `${css.trim()}\n${PLACEHOLDER_CSS}`,
		js: js.trim()
	};
}
