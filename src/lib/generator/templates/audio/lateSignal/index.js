import {
	colorVariableOverrides,
	escapeAttr,
	escapeHtml,
	socialLinksIconHtml,
	verificationMeta,
	widgetEmbedHtml,
	fill
} from '../../shared.js';
import shell from './shell.html?raw';
import css from './styles.css?raw';
import js from './decorative.js?raw';

/**
 * "Late Signal" — an editorial artist page: a large, close-to-full-width
 * sans-serif name whose text rises up from behind a mask on load, a big
 * rectangular portrait beside a real bio, a slant-edged tracks section
 * (via `clip-path`, see `styles.css`) that reveals itself track-by-track
 * on scroll, icon-labelled elsewhere links, and a light/dark toggle (dark
 * by default — this page never opens light on its own, only when a
 * visitor asks for it, and remembers that choice via `localStorage`).
 * Same warm, near-black ground and muted teal accent as the dark default;
 * `--accent` alone can be overridden per-creator (see `accentColorOverride`).
 *
 * System font stacks only, no embedded webfonts: this ships to a creator's
 * own static host, and the whole point of the export is a small footprint
 * they don't have to think about (see the generator spec's section 6).
 *
 * `shell.html`/`styles.css`/`decorative.js` alongside this file are the real
 * static shell, editable directly. This function's only job is filling in
 * the handful of pieces that actually vary per creator: the icon, the
 * tagline, the bio, the track list (each row stamped with its own index as
 * a `--i` custom property, which is what lets `styles.css` stagger the
 * scroll-triggered reveal per row without any JS needing to know the count),
 * and the optional accent-color override.
 * @param {import('../../shared.js').GeneratorData} data
 * @returns {{ html: string, css: string, js: string }}
 */
export function render(data) {
	const tracks = data.tracks ?? [];

	const trackRows = tracks.length
		? tracks
				.map(
					(track, i) => `
			<li class="track" style="--i: ${i}">
				<span class="track-num">${String(i + 1).padStart(2, '0')}</span>
				<span class="track-title">${escapeHtml(track.label)}</span>
				<a class="track-play" href="${escapeAttr(track.url)}" download>play</a>
			</li>`
				)
				.join('')
		: `<li class="track track-empty"><span class="track-num">&mdash;</span><span class="track-title">No tracks uploaded yet.</span></li>`;

	const badge = data.iconUrl
		? `<img src="${escapeAttr(data.iconUrl)}" alt="" />`
		: '<div class="photo-placeholder" aria-hidden="true"></div>';

	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		DISPLAY_NAME: escapeHtml(data.displayName),
		WHY: escapeHtml(data.why),
		BIO: data.bio?.trim() ? escapeHtml(data.bio) : 'No bio yet.',
		BADGE: badge,
		TRACK_ROWS: trackRows,
		SOCIAL_LINKS: socialLinksIconHtml(data.socialLinks, 'elsewhere'),
		COLOR_OVERRIDE: colorVariableOverrides({
			'--accent': data.accentColor,
			'--ground': data.groundColor,
			'--surface': data.surfaceColor
		}),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	});

	return { html: html.trim(), css: css.trim(), js: js.trim() };
}
