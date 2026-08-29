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
	const tracks = data.tracks ?? [];
	const works = tracks.length
		? tracks
				.map((track, index) => {
					const number = String(index + 1).padStart(2, '0');
					return `<article class="track-row"><span class="track-num">${number}</span><div class="track-info"><h3>${escapeHtml(track.label)}</h3><p>FEATURED TRACK</p></div><audio controls preload="none" class="custom-audio" src="${escapeAttr(track.url)}"></audio></article>`;
				})
				.join('\n')
		: emptyState('No tracks uploaded yet.');
	// Repeated twice in the shell: the marquee translates by -50% forever, so
	// the line has to appear twice for the loop to be seamless.
	const ticker = escapeHtml(data.tickerMessage ?? '');
	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		TICKER_MESSAGE: ticker,
		COLOR_OVERRIDE: data.colorOverride ?? '',
		DISPLAY_NAME: escapeHtml(data.displayName),
		BIO: data.bioHtml || escapeHtml(data.why || 'No bio yet.'),
		ICON: imageOrPlaceholder(data.iconUrl, 'hero-img', data.displayName, 'CREATOR'),
		WORKS: works,
		SOCIAL_LINKS: socialLinksIconHtml(data.socialLinks, 'social-box', 'btn-link'),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	});
	return templateResult(html, css);
}
