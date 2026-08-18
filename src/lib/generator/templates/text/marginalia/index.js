import {
	escapeHtml,
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
	const paragraphs = (data.excerpt ?? '')
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean);

	const excerptHtml = paragraphs.length
		? paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')
		: '<p class="empty">No excerpt yet.</p>';

	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		DISPLAY_NAME: escapeHtml(data.displayName),
		WHY: escapeHtml(data.why),
		EXCERPT: excerptHtml,
		SOCIAL_LINKS: socialLinksIconHtml(data.socialLinks, 'elsewhere'),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	});

	return { html: html.trim(), css: css.trim(), js: '' };
}
