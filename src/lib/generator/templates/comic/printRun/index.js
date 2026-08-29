import {
	emptyState,
	escapeAttr,
	escapeHtml,
	fill,
	imageOrPlaceholder,
	socialLinksIconHtml,
	templateResult,
	verificationMeta,
	widgetEmbedHtml
} from '../../shared.js';
import shell from './shell.html?raw';
import css from './styles.css?raw';

/** @param {import('../../shared.js').GeneratorData} data */
export function render(data) {
	const pages = data.pages ?? [];
	const works = pages.length
		? pages
				.map((page, index) => {
					const caption = escapeHtml(page.caption || `Page ${index + 1}`);
					return `<article class="comic-entry"><div class="panel-meta"><span>PAGE #${index + 1}</span><span>${caption}</span></div><div class="comic-frame"><img src="${escapeAttr(page.url)}" alt="${caption}" loading="lazy" /></div></article>`;
				})
				.join('\n')
		: emptyState('No pages uploaded yet.');
	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		COLOR_OVERRIDE: data.colorOverride ?? '',
		DISPLAY_NAME: escapeHtml(data.displayName),
		BIO: data.bio?.trim() ? escapeHtml(data.bio) : escapeHtml(data.why || 'No bio yet.'),
		ICON: imageOrPlaceholder(data.iconUrl, 'creator-image', data.displayName, 'CREATOR'),
		WORKS: works,
		SOCIAL_LINKS: socialLinksIconHtml(data.socialLinks, 'social-row', 'social-btn'),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	});
	return templateResult(html, css);
}
