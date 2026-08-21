import {
	accentColorOverride,
	emptyState,
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
	const paragraphs = (data.excerpt ?? '')
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean);
	const works = paragraphs.length
		? paragraphs
				.map((paragraph, index) => {
					const first = escapeHtml(paragraph.charAt(0));
					const rest = escapeHtml(paragraph.slice(1));
					const title = escapeHtml(paragraph.slice(0, 54));
					return `<article class="article-card"><div class="date">ARCHIVE // ${String(index + 1).padStart(2, '0')}</div><h2>${title}</h2><p><span class="dropcap">${first}</span>${rest}</p></article>`;
				})
				.join('\n')
		: emptyState('No excerpt yet.');
	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		COLOR_OVERRIDE: accentColorOverride(data.accentColor),
		DISPLAY_NAME: escapeHtml(data.displayName),
		BIO: data.bio?.trim() ? escapeHtml(data.bio) : escapeHtml(data.why || 'No bio yet.'),
		ICON: imageOrPlaceholder(data.iconUrl, 'author-photo', data.displayName, 'CREATOR'),
		WORKS: works,
		SOCIAL_LINKS: socialLinksIconHtml(data.socialLinks, 'outposts'),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	});
	return templateResult(html, css);
}
