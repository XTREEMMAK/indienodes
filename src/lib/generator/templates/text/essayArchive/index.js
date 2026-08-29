import {
	aboutPageHtml,
	emptyState,
	escapeHtml,
	excerptHtml,
	excerptText,
	fill,
	socialLinksIconHtml,
	templateResult,
	verificationMeta,
	widgetEmbedHtml
} from '../../shared.js';
import shell from './shell.html?raw';
import css from './styles.css?raw';

/** @param {import('../../shared.js').GeneratorData} data */
export function render(data) {
	const samples = (data.excerpts ?? [])
		.map((sample) => ({ html: excerptHtml(sample), text: excerptText(sample).trim() }))
		.filter((sample) => sample.text);
	const works = samples.length
		? samples
				.map((sample, index) => {
					const title = escapeHtml(sample.text.slice(0, 54));
					return `<article class="article-card"><div class="date">ARCHIVE // ${String(index + 1).padStart(2, '0')}</div><h2>${title}</h2><div class="article-body">${sample.html}</div></article>`;
				})
				.join('\n')
		: emptyState('No text samples yet.');
	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		COLOR_OVERRIDE: data.colorOverride ?? '',
		DISPLAY_NAME: escapeHtml(data.displayName),
		WORKS: works,
		SOCIAL_LINKS: socialLinksIconHtml(data.socialLinks, 'outposts'),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	});
	return templateResult(html, css, '', {
		'about.html': aboutPageHtml(data, {
			iconClass: 'author-photo',
			backLabel: 'Back to the archive',
			wrapperClass: 'container',
			headerClass: 'author-grid',
			linksClass: 'outposts'
		})
	});
}
