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
	// --- the marquee ------------------------------------------------------
	//
	// A scrolling banner is seamless only if what scrolls away is already on
	// screen behind it. Two rules do that here, and both are about the
	// message being any length at all:
	//
	// One group of the message is repeated until it is wider than any
	// plausible screen, and the track holds exactly two identical groups. The
	// animation then translates the track by -50% — precisely one group — so
	// the moment it wraps, the second group is sitting exactly where the
	// first began. A short message repeated only twice left the track
	// narrower than the viewport, which is where the gaps came from.
	//
	// The duration is derived from how much text a group holds rather than
	// fixed, so the *pace* stays put as the message changes length. A fixed
	// duration means a long message races and a short one crawls.
	const message = (data.tickerMessage ?? '').trim() || ' ';
	const separated = `${message} `;
	// ~130 characters clears a wide desktop at this template's type size.
	const perGroup = Math.max(2, Math.ceil(130 / separated.length));
	const group = separated.repeat(perGroup);
	// 1 (slow) to 10 (fast), read as characters crossing the screen a second.
	const speed = Math.min(10, Math.max(1, data.tickerSpeed || 5));
	const duration = Math.max(4, Math.round(group.length / (4 + speed * 2)));
	const ticker = escapeHtml(group);

	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		TICKER_MESSAGE: ticker,
		TICKER_DURATION: String(duration),
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
