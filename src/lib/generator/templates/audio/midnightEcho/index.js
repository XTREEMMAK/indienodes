import {
	emptyState,
	escapeAttr,
	escapeHtml,
	fill,
	imageOrPlaceholder,
	socialLinksIconOnlyHtml,
	templateResult,
	verificationMeta,
	widgetEmbedHtml
} from '../../shared.js';
import shell from './shell.html?raw';
import css from './styles.css?raw';
import js from './player.js?raw';

/** @param {import('../../shared.js').GeneratorData} data */
export function render(data) {
	const tracks = data.tracks ?? [];
	const works = tracks.length
		? tracks
				.map((track, index) => {
					const number = String(index + 1).padStart(2, '0');
					return `<article class="track-card"><div class="track-meta"><span class="track-number">${number}</span><div><h3>${escapeHtml(track.label)}</h3><p class="track-sub">FEATURED TRACK</p></div></div><div class="track-player"><button class="player-toggle" type="button" aria-label="Play ${escapeAttr(track.label)}"><span class="play-mark" aria-hidden="true">&#9654;</span><span class="pause-mark" aria-hidden="true">&#10074;&#10074;</span></button><div class="player-timeline"><input class="player-seek" type="range" min="0" max="0" value="0" step="0.1" aria-label="Seek ${escapeAttr(track.label)}" /><div class="player-time"><span class="player-current">0:00</span><span class="player-duration">--:--</span></div></div><audio preload="metadata" src="${escapeAttr(track.url)}"></audio></div></article>`;
				})
				.join('\n')
		: emptyState('No tracks uploaded yet.');
	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		COLOR_OVERRIDE: data.colorOverride ?? '',
		DISPLAY_NAME: escapeHtml(data.displayName),
		BIO: data.bio?.trim() ? escapeHtml(data.bio) : escapeHtml(data.why || 'No bio yet.'),
		ICON: imageOrPlaceholder(data.iconUrl, 'artist-avatar', data.displayName, 'CREATOR'),
		WORKS: works,
		SOCIAL_LINKS: socialLinksIconOnlyHtml(data.socialLinks, 'social-row', 'social-card'),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	});
	return templateResult(html, css, js);
}
