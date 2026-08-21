import {
	accentColorOverride,
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
	const tracks = data.tracks ?? [];
	const works = tracks.length
		? tracks
				.map((track, index) => {
					const number = String(index + 1).padStart(2, '0');
					return `<article class="track-row"><span class="track-num">${number}</span><div class="track-info"><h3>${escapeHtml(track.label)}</h3><p>FEATURED TRACK</p></div><audio controls preload="none" class="custom-audio" src="${escapeAttr(track.url)}"></audio></article>`;
				})
				.join('\n')
		: emptyState('No tracks uploaded yet.');
	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		COLOR_OVERRIDE: accentColorOverride(data.accentColor),
		DISPLAY_NAME: escapeHtml(data.displayName),
		BIO: data.bio?.trim() ? escapeHtml(data.bio) : escapeHtml(data.why || 'No bio yet.'),
		ICON: imageOrPlaceholder(data.iconUrl, 'hero-img', data.displayName, 'CREATOR'),
		WORKS: works,
		SOCIAL_LINKS: socialLinksIconHtml(data.socialLinks, 'social-box', 'btn-link'),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	});
	return templateResult(html, css);
}
