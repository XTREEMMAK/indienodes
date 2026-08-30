import {
	templateResult,
	aboutPageHtml,
	escapeHtml,
	excerptHtml,
	excerptText,
	socialLinksIconHtml,
	verificationMeta,
	widgetEmbedHtml,
	fill
} from '../../shared.js';
import shell from './shell.html?raw';
import css from './styles.css?raw';

/**
 * "Marginalia" — set to actually be read, not browsed: one serif family
 * carrying both display and body, a 65-character measure, a drop cap on
 * the opening paragraph, a plum accent in place of the terracotta this
 * genre defaults to. The page's only job is the words on it.
 *
 * No decorative script: unlike the other three templates, nothing here
 * needs one, so `js` stays the empty string it always was — `shell.html`
 * still links `script.js` for consistency with the other exports' file
 * layout, it is just empty.
 *
 * `shell.html`/`styles.css` alongside this file are the real static shell,
 * editable directly. This function's only job is filling in the pieces
 * that actually vary per creator: the tagline and the excerpt.
 * @param {import('../../shared.js').GeneratorData} data
 * @returns {{ html: string, css: string, js: string }}
 */
export function render(data) {
	const samples = (data.excerpts ?? [])
		.map((sample) => ({ html: excerptHtml(sample), text: excerptText(sample).trim() }))
		.filter((sample) => sample.text);

	const excerptsHtml = samples.length
		? samples.map((sample) => `<article class="excerpt">${sample.html}</article>`).join('\n')
		: '<article class="excerpt"><p class="empty">No text samples yet.</p></article>';

	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		COLOR_OVERRIDE: data.colorOverride ?? '',
		DISPLAY_NAME: escapeHtml(data.displayName),
		WHY: escapeHtml(data.why),
		EXCERPTS: excerptsHtml,
		SOCIAL_LINKS: socialLinksIconHtml(data.socialLinks, 'elsewhere'),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	});

	return templateResult(html, css, '', {
		'about.html': aboutPageHtml(data, {
			iconClass: 'about-image',
			backLabel: 'Back to the writing',
			wrapperClass: '',
			headerClass: '',
			linksClass: 'elsewhere'
		})
	});
}
