/**
 * Assembles the one `GeneratorData` object every template consumes (see
 * `templates/shared.js`) from the two halves a generator draft is split
 * into: `entry` (the ring.json-shaped fields, reused as-is where a field
 * means the same thing in both places) and `generator` (everything that
 * only exists because there is no site yet: a display name, uploaded work
 * files, an icon, social links).
 *
 * **`entry.excerpt` is reused directly for the text type, unchanged.**
 * That is the one case in this whole flow where "avoid asking twice" needs
 * no special handling: a text creator's excerpt is typed words, already
 * collected by the existing `media` step, with nothing about it that
 * differs between "goes in ring.json" and "goes on my own page." Every
 * other type's works are real uploaded files (audio needs an actual
 * playable file, comic needs actual page images, game needs an actual
 * screenshot) which the existing `media` step's *URL* fields cannot supply
 * — those ask for a link to something already hosted, and the entire
 * premise of this flow is that nothing is hosted yet. That is why
 * `generator.works` exists as its own thing rather than a second read of
 * `entry.tracks`/`entry.pages`.
 *
 * **Resolving a stored `Blob` into a usable `src` is the caller's job, not
 * this module's**, via `resolveAssetUrl`. A live preview wants
 * `URL.createObjectURL(blob)`; a real export wants a relative path inside
 * the zip (`assets/icon.webp`, say). Both are "turn a Blob into a string,"
 * and keeping that seam here is what lets one `render()` call serve both
 * without either caller reimplementing the type-by-type field mapping
 * below.
 */

import { absoluteAssetUrl } from './assetPaths.js';

/**
 * @typedef {object} GeneratorWork
 * @property {string} [label] Audio track name.
 * @property {string} [caption] Comic page caption.
 * @property {Blob | null} file
 */

/**
 * @param {Record<string, any>} entry
 * @param {{
 *   displayName?: string,
 *   bio?: string,
 *   accentColor?: string,
 *   works?: GeneratorWork[],
 *   icon?: Blob | null,
 *   socialLinks?: { label: string, url: string }[],
 *   verificationToken?: string,
 *   widgetEmbed?: string
 * }} generator
 * @param {(file: Blob | null | undefined) => string | null} resolveAssetUrl
 * @returns {import('./templates/shared.js').GeneratorData}
 */
export function buildGeneratorData(entry, generator, resolveAssetUrl) {
	const type = /** @type {'audio' | 'comic' | 'text' | 'game'} */ (entry.type);
	const works = generator.works ?? [];

	/** @type {import('./templates/shared.js').GeneratorData} */
	const base = {
		type,
		displayName: generator.displayName?.trim() || entry.creator?.trim() || '',
		why: entry.why?.trim() ?? '',
		bio: generator.bio?.trim() ?? '',
		accentColor: generator.accentColor || null,
		iconUrl: resolveAssetUrl(generator.icon),
		socialLinks: generator.socialLinks ?? [],
		verificationToken: generator.verificationToken ?? '',
		widgetEmbed: generator.widgetEmbed ?? ''
	};

	if (type === 'audio') {
		return {
			...base,
			tracks: works
				.filter((w) => w.file)
				.map((w) => ({ label: w.label?.trim() || 'Untitled', url: resolveAssetUrl(w.file) ?? '#' }))
		};
	}

	if (type === 'comic') {
		return {
			...base,
			pages: works
				.filter((w) => w.file)
				.map((w) => ({ url: resolveAssetUrl(w.file) ?? '', caption: w.caption?.trim() }))
		};
	}

	if (type === 'text') {
		return { ...base, excerpt: entry.excerpt?.trim() ?? '' };
	}

	if (type === 'game') {
		return { ...base, screenshotUrl: resolveAssetUrl(works[0]?.file) };
	}

	return base;
}

/**
 * Fills in the ring.json-shaped fields (`tracks`, `pages`, `excerpt`,
 * `thumb_url`) for a no-own-site entry, once the creator finally has a real
 * `source_url` — which for this branch only happens *after* they have
 * exported and uploaded their site (see `submission-form-spec.md` section 4's
 * sequence). Before that point these fields cannot be filled in at all:
 * they are `${source_url}/assets/...` paths, and there is no `source_url`
 * yet.
 *
 * Takes `assetPaths` from `exportSite`'s own return value rather than
 * recomputing paths independently, because the final file extension for an
 * image depends on whether WebP encoding actually succeeded during that
 * export run — a value only that run knows, not something safe to
 * re-derive from the origin fields alone. `works` supplies the labels and
 * captions the export itself does not carry (it only returns paths), the
 * same `generator.works` array `buildGeneratorData` reads.
 * @param {{ type: string }} entry
 * @param {GeneratorWork[]} works
 * @param {import('./zipExport.js').ExportAssetPaths} assetPaths
 * @param {string} sourceUrl
 * @returns {Record<string, any>} Fields to merge into the submission's `entry`.
 */
export function deriveRingEntry(entry, works, assetPaths, sourceUrl) {
	const abs = (/** @type {string} */ path) => absoluteAssetUrl(sourceUrl, path);

	if (entry.type === 'audio') {
		/** @type {Record<string, any>} */
		const fields = {
			tracks: assetPaths.tracks.map((path, i) => ({
				label: works[i]?.label?.trim() || `Track ${i + 1}`,
				media_url: abs(path)
			}))
		};
		// Cover art is optional for audio, and the icon uploaded for the
		// generated site's own badge is the only image a no-site audio
		// creator has provided at all, so it doubles as thumb_url rather
		// than leaving the ring card with no cover when one already exists.
		if (assetPaths.icon) fields.thumb_url = abs(assetPaths.icon);
		return fields;
	}

	if (entry.type === 'comic') {
		return {
			pages: assetPaths.pages.map((path, i) => {
				/** @type {Record<string, string>} */
				const page = { image_url: abs(path) };
				const caption = works[i]?.caption?.trim();
				if (caption) page.caption = caption;
				return page;
			})
		};
	}

	if (entry.type === 'game') {
		return assetPaths.screenshot ? { thumb_url: abs(assetPaths.screenshot) } : {};
	}

	// Text needs nothing derived: entry.excerpt was already collected
	// directly and is not asset-path-shaped at all.
	return {};
}
