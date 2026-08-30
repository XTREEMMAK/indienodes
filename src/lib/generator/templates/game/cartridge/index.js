import {
	escapeAttr,
	escapeHtml,
	socialLinksIconHtml,
	verificationMeta,
	widgetEmbedHtml,
	fill
} from '../../shared.js';
import shell from './shell.html?raw';
import css from './styles.css?raw';
import js from './decorative.js?raw';

/**
 * "Cartridge" — arcade-marquee poster, not a gradient-hero landing page: a
 * cool graphite ground, a two-color marquee palette (bulb-yellow plus
 * poster-red) instead of one neon accent, a diagonal color block holding
 * the logotype the way box art holds a title over its own key art.
 *
 * `shell.html`/`styles.css`/`decorative.js` alongside this file are the real
 * static shell, editable directly. This function's only job is filling in
 * the pieces that actually vary per creator: the icon, the tagline, and the
 * screenshot background.
 *
 * The `<main>` tag's conditional class suffix and conditional inline
 * `style` used to be interpolated together into one opening tag; they are
 * now two separate tokens (`POSTER_MODIFIER`, `POSTER_ART_STYLE`) filled
 * into the same tag in `shell.html`, since `fill()` only does flat
 * substitution and has no per-attribute conditional syntax of its own.
 * `shell.html` supplies the space separating them (Prettier's own HTML
 * formatter inserted it once this became a real, formatted file), so
 * `POSTER_ART_STYLE` no longer carries its own leading space the way the
 * original inline-interpolated version had to.
 * @param {import('../../shared.js').GeneratorData} data
 * @returns {{ html: string, css: string, js: string }}
 */
export function render(data) {
	const icon = data.iconUrl
		? `<img class="icon" src="${escapeAttr(data.iconUrl)}" alt="" width="48" height="48" />`
		: '';

	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		COLOR_OVERRIDE: data.colorOverride ?? '',
		DISPLAY_NAME: escapeHtml(data.displayName),
		WHY: escapeHtml(data.why),
		ICON: icon,
		ART_LABEL: `${escapeAttr(data.displayName)} screenshot`,
		POSTER_MODIFIER: data.screenshotUrl ? '' : ' poster-no-art',
		POSTER_ART_STYLE: data.screenshotUrl
			? `style="--art: url('${escapeAttr(data.screenshotUrl)}')"`
			: '',
		SOCIAL_LINKS: socialLinksIconHtml(data.socialLinks, 'elsewhere'),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	});

	return { html: html.trim(), css: css.trim(), js: js.trim() };
}
