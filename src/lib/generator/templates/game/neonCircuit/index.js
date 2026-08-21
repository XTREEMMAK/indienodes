import {
	accentColorOverride,
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
	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		COLOR_OVERRIDE: accentColorOverride(data.accentColor),
		DISPLAY_NAME: escapeHtml(data.displayName),
		WHY: escapeHtml(data.why),
		BIO: data.bio?.trim() ? escapeHtml(data.bio) : escapeHtml(data.why || 'No bio yet.'),
		ICON: imageOrPlaceholder(data.iconUrl, 'studio-logo', data.displayName, 'CREATOR'),
		SCREENSHOT: imageOrPlaceholder(
			data.screenshotUrl,
			'game-banner',
			`${data.displayName} screenshot`,
			'GAME ART'
		),
		SOCIAL_LINKS: socialLinksIconHtml(data.socialLinks, 'social-flex'),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	});
	return templateResult(html, css);
}
