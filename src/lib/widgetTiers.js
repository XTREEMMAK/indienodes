import { embedSnippet } from '../routes/widget/embed-snippet.js';

/**
 * Three independent embeddable artifacts a creator can paste onto their own
 * site (brief section 7a, amended by `tmp/IndieNode_Section7a_Widget_Tiers_Addendum.md`).
 * Not visual variants of one component: the full widget is the existing
 * Prev/Next/Random custom element, and the other two are plain links this
 * module builds as strings, with no shared runtime between any of them
 * (addendum section 1, "every client is disposable").
 *
 * Tier choice is purely a display preference. Nothing here writes to
 * `ring.json`, the submission payload, or anything the backend sees: a
 * creator's choice only decides which snippet this app hands them (or, for
 * a generator-built site, which markup gets embedded in the export), never
 * anything about the entry's own visibility, rotation, or placement
 * (addendum section 3, mirroring brief section 3's "money never changes
 * what surfaces").
 */

/** @typedef {'widget' | 'badge' | 'text-link'} WidgetTierId */

/** @type {{ id: WidgetTierId, label: string, description: string }[]} */
export const WIDGET_TIERS = [
	{
		id: 'widget',
		label: 'Full widget',
		description: 'Prev / Next / Random. The original embed, unchanged.'
	},
	{
		id: 'badge',
		label: 'Badge',
		description: 'A small 88×31 image, the traditional webring size. Click goes to a random member.'
	},
	{
		id: 'text-link',
		label: 'Text link',
		description: 'A plain line of text, no image. For footer space too thin for even a badge.'
	}
];

/**
 * `typesOnly`, when present, would restrict a style to a subset of
 * `ring.json` entry types. The addendum itself (section 5) only resolves
 * type-coded for audio (blue) and games (green), deferring comic/text on
 * the grounds that brief section 9 left those two colors open — but that
 * was stale by the time this was built: `src/app.css`'s comic (`#a855f7`)
 * and text (`#f59e0b`) tokens are already locked (see "LOCKED: All four
 * type colors" above), not placeholders, so all four types get a real,
 * settled color and none of them need `typesOnly` to exclude anything.
 */

/** @type {{ id: string, label: string, description: string, typesOnly?: string[] }[]} */
export const BADGE_STYLES = [
	{
		id: 'classic',
		label: 'Classic',
		description: 'The official IndieNodes logo on a dark ground.'
	},
	{
		id: 'minimal',
		label: 'Minimal',
		description: 'Official logo only, no text. The smallest visual weight.'
	},
	{
		id: 'type-coded',
		label: 'Type-coded',
		description: "Tinted with your node's own content-type color."
	},
	{
		id: 'mono',
		label: 'Mono',
		description: 'The official logo with an adaptive frame and wordmark for unusual sites.'
	}
];

/**
 * @param {string} entryType
 * @returns {typeof BADGE_STYLES}
 */
export function badgeStylesFor(entryType) {
	return BADGE_STYLES.filter((style) => !style.typesOnly || style.typesOnly.includes(entryType));
}

/**
 * @param {string} style
 * @param {string} entryType
 * @returns {string} path under `static/badges/`
 */
export function badgeAssetPath(style, entryType) {
	const file = style === 'type-coded' ? `type-coded-${entryType}.svg` : `${style}.svg`;
	return `/badges/${file}`;
}

/**
 * Where every badge and text-link click goes. A real page on this site
 * rather than an inline script: the text-link tier's own markup is not
 * allowed to carry a script at all (addendum section 2.3, "no script beyond
 * the link target itself"), so the redirect has to be reachable purely by
 * URL for both lighter tiers to share one mechanism instead of two.
 * @param {string} origin
 */
export function randomRedirectUrl(origin) {
	return `${origin}/go/random`;
}

/**
 * The copy-paste markup for a given tier. Mirrors `embedSnippet` for the
 * `widget` tier exactly (same function, so a tier switch to "full widget"
 * is never a second, slightly different implementation of what that
 * already does).
 * @param {{
 *   tier: WidgetTierId,
 *   badgeStyle?: string,
 *   origin: string,
 *   siteId?: string,
 *   entryType: string
 * }} options
 * @returns {string}
 */
export function embedHtmlFor({ tier, badgeStyle, origin, siteId, entryType }) {
	if (tier === 'widget') return embedSnippet(origin, siteId);

	const href = randomRedirectUrl(origin);

	if (tier === 'text-link') {
		// A fixed phrase, not freely editable, so the ring stays recognizable
		// across every member site that carries it (addendum section 2.3).
		return `<a href="${href}" target="_blank" rel="noopener noreferrer">&lt;&lt; Member of IndieNodes &gt;&gt;</a>`;
	}

	const style = badgeStylesFor(entryType).some((s) => s.id === badgeStyle) ? badgeStyle : 'classic';
	const src = `${origin}${badgeAssetPath(/** @type {string} */ (style), entryType)}`;
	return `<a href="${href}" target="_blank" rel="noopener noreferrer"><img src="${src}" width="88" height="31" alt="Member of IndieNodes" /></a>`;
}
