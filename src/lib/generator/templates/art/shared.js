import {
	escapeAttr,
	escapeHtml,
	safeExternalHref,
	socialLinksIconHtml,
	verificationMeta,
	widgetEmbedHtml
} from '../shared.js';
/** @typedef {{ url: string, alt: string, title?: string, year?: string, medium?: string, externalUrl?: string }} Artwork */

/** @param {Artwork} work */
export function artMetaHtml(work) {
	const details = [work.title, work.medium, work.year]
		.flatMap((value) => (value ? [escapeHtml(value)] : []))
		.join(' · ');
	return details ? `<figcaption>${details}</figcaption>` : '';
}

/**
 * A contained artwork figure shared by all five layouts. Templates decide
 * arrangement and emphasis; this helper owns escaping, alt text, optional
 * work links, and the stable markup that makes mixed aspect ratios safe.
 * @param {Artwork} work
 * @param {number} index
 * @param {string} [className]
 */
export function artworkFigure(work, index, className = 'artwork') {
	const image = `<img src="${escapeAttr(work.url)}" alt="${escapeAttr(work.alt)}" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async" />`;
	const href = safeExternalHref(work.externalUrl ?? '');
	const media = href
		? `<a class="work-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeAttr(work.title || `artwork ${index + 1}`)}">${image}</a>`
		: image;
	return `<figure class="${className}" data-artwork="${index}">${media}${artMetaHtml(work)}</figure>`;
}

/** @param {import('../shared.js').GeneratorData} data @param {string} worksHtml */
export function artTokens(data, worksHtml) {
	const icon = data.iconUrl
		? `<img class="artist-icon" src="${escapeAttr(data.iconUrl)}" alt="" width="72" height="72" />`
		: '';
	return {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		DISPLAY_NAME: escapeHtml(data.displayName),
		WHY: escapeHtml(data.why),
		BIO: data.bio ? escapeHtml(data.bio) : '',
		ICON: icon,
		ARTWORKS: worksHtml || '<p class="empty">No artwork uploaded yet.</p>',
		SOCIAL_LINKS: socialLinksIconHtml(data.socialLinks, 'elsewhere'),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	};
}
