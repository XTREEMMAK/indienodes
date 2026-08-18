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
 * "Panel Room" — printed-comic reading, not a generic image gallery: thick
 * ink-black panel borders, a pale cool newsprint ground (deliberately
 * shifted off the warm-cream-plus-terracotta pairing this kind of page
 * reaches for by default), a single Ben-Day-dot red used only for the page
 * counter and captions. Alternating panel tilt reads as hand-placed rather
 * than a CSS grid of thumbnails.
 *
 * `shell.html`/`styles.css`/`decorative.js` alongside this file are the real
 * static shell, editable directly. This function's only job is filling in
 * the handful of pieces that actually vary per creator: the icon, the
 * tagline, and the page list.
 * @param {import('../../shared.js').GeneratorData} data
 * @returns {{ html: string, css: string, js: string }}
 */
export function render(data) {
	const pages = data.pages ?? [];

	const panelsHtml = pages.length
		? pages
				.map(
					(page, i) => `
			<figure class="panel" style="--tilt: ${i % 2 === 0 ? '-0.6deg' : '0.6deg'}">
				<button type="button" class="panel-button" data-index="${i}" aria-label="View page ${i + 1} full size">
					<img src="${escapeAttr(page.url)}" alt="${escapeAttr(page.caption ?? `Page ${i + 1}`)}" loading="lazy" />
				</button>
				${page.caption ? `<figcaption>${escapeHtml(page.caption)}</figcaption>` : ''}
				<span class="page-tag">${String(i + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}</span>
			</figure>`
				)
				.join('')
		: `<p class="empty">No pages uploaded yet.</p>`;

	const icon = data.iconUrl
		? `<img class="icon" src="${escapeAttr(data.iconUrl)}" alt="" width="56" height="56" />`
		: '';

	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		DISPLAY_NAME: escapeHtml(data.displayName),
		WHY: escapeHtml(data.why),
		ICON: icon,
		PANELS: panelsHtml,
		SOCIAL_LINKS: socialLinksIconHtml(data.socialLinks, 'elsewhere'),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	});

	return { html: html.trim(), css: css.trim(), js: js.trim() };
}
