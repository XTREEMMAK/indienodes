/**
 * Assembles the one `GeneratorData` object every template consumes (see
 * `templates/shared.js`) from the two halves a generator draft is split
 * into: `entry` (the ring.json-shaped fields, reused as-is where a field
 * means the same thing in both places) and `generator` (everything that
 * only exists because there is no site yet: a display name, uploaded work
 * files, an icon, social links).
 *
 * **`entry.excerpts` is reused directly for the text type after the same HTML
 * sanitization used for ring publication.** That is the one case in this
 * whole flow where "avoid asking twice" needs no second authoring field: a
 * text creator's formatted sample is already collected by the existing
 * `media` step, with nothing about it that differs between "goes in
 * ring.json" and "goes on my own page." Every
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
import { findTemplate } from './registry.js';
import { resolveColorVariables, switchValue, textValue } from './templateOptions.js';
import { sanitizeBioHtml, sanitizeExcerptHtml, stripHtml } from '../ring.js';
import { colorVariableOverrides, escapeHtml } from './templates/shared.js';

/**
 * @typedef {object} GeneratorWork
 * @property {string} [label] Audio track name.
 * @property {string} [caption] Comic page caption.
 * @property {string} [alt] Artwork text alternative.
 * @property {string} [title] Artwork title.
 * @property {string} [year] Artwork year.
 * @property {string} [medium] Artwork medium.
 * @property {string} [external_url] Artwork destination.
 * @property {Blob | null} file
 */

/**
 * @param {Record<string, any>} entry
 * @param {{
 *   audioHosting?: 'bundle' | 'external',
 *   templateId?: string | null,
 *   displayName?: string,
 *   bio?: string,
 *   colors?: Record<string, string>,
 *   options?: Record<string, unknown>,
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
	const type = /** @type {'audio' | 'comic' | 'text' | 'game' | 'art'} */ (entry.type);
	const works = generator.works ?? [];

	// The *effective* template, not the stored one. `findTemplate` falls back
	// to the type's first template when a creator has not explicitly chosen,
	// and both the preview and the export render that fallback — so resolving
	// colors against the stored id would silently drop every color choice made
	// by anyone who never opened the picker. One rule, read from one place.
	const templateId = findTemplate(type, generator.templateId ?? undefined)?.id ?? null;

	/** @type {import('./templates/shared.js').GeneratorData} */
	const base = {
		type,
		displayName: generator.displayName?.trim() || entry.creator?.trim() || '',
		why: entry.why?.trim() ?? '',
		bio: stripHtml(generator.bio ?? '').trim(),
		// Sanitized here, once, so no template has to decide whether the bio it
		// was handed is safe to render as markup. `bio` above stays the plain
		// text for anywhere a tag would be wrong.
		bioHtml: sanitizeBioHtml(generator.bio),
		// Resolved here rather than in each template, because which CSS
		// variable a role maps to is a fact about the template and the
		// creator's choice is a fact about the draft — the only place both
		// are in scope is this one. Templates receive a finished `<style>`
		// block and stay ignorant of roles entirely.
		colorOverride: colorVariableOverrides(resolveColorVariables(templateId, generator.colors)),
		backgroundGlowMotion: switchValue(templateId, generator.options, 'backgroundGlowMotion'),
		tickerMessage: textValue(templateId, generator.options, 'tickerMessage'),
		iconUrl: resolveAssetUrl(generator.icon),
		socialLinks: generator.socialLinks ?? [],
		verificationToken: generator.verificationToken ?? '',
		widgetEmbed: generator.widgetEmbed ?? ''
	};

	if (type === 'audio') {
		if (generator.audioHosting === 'external') {
			/** @type {{ label?: string, media_url?: string }[]} */
			const externalTracks = entry.tracks ?? [];
			return {
				...base,
				tracks: externalTracks
					.filter((track) => track.media_url?.trim())
					.map((track) => ({
						label: track.label?.trim() || 'Untitled',
						url: (track.media_url ?? '').trim()
					}))
			};
		}
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

	if (type === 'art') {
		return {
			...base,
			artworks: works
				.filter((work) => work.file && work.alt?.trim())
				.map((work) => ({
					url: resolveAssetUrl(work.file) ?? '',
					alt: work.alt?.trim() ?? '',
					title: work.title?.trim(),
					year: work.year?.trim(),
					medium: work.medium?.trim(),
					externalUrl: work.external_url?.trim()
				}))
		};
	}

	if (type === 'text') {
		return {
			...base,
			// Keep the editor's deliberately small formatting vocabulary for
			// generated sites too. Sanitizing here protects the live iframe
			// preview; templates repeat the same sanitization at their rendering
			// boundary so direct callers cannot accidentally bypass it.
			// A sample's optional title rides along as a heading inside its own
			// HTML rather than becoming a second field on `GeneratorData`. The
			// templates take `excerpts` as a list of ready-to-print strings, so
			// this keeps all four of them working unchanged while still carrying
			// the title onto the generated page, where each template's existing
			// heading styles pick it up. `h3` is inside the same allowlist the
			// sanitizer permits, so it survives the pass below.
			excerpts: (entry.excerpts ?? [])
				.map((/** @type {{ title?: string, text?: string }} */ sample) => {
					const body = sanitizeExcerptHtml(sample?.text ?? '').trim();
					const title = sample?.title?.trim();
					if (!title || !stripHtml(body)) return body;
					return `${sanitizeExcerptHtml(`<h3>${escapeHtml(title)}</h3>`)}${body}`;
				})
				.filter((/** @type {string} */ sample) => Boolean(stripHtml(sample)))
		};
	}

	if (type === 'game') {
		return { ...base, screenshotUrl: resolveAssetUrl(works[0]?.file) };
	}

	return base;
}

/**
 * Fills in the ring.json-shaped fields (`tracks`, `pages`, `excerpts`,
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
	const coverFields = assetPaths.icon ? { thumb_url: abs(assetPaths.icon) } : {};

	if (entry.type === 'audio') {
		/** @type {Record<string, any>} */
		const fields = { ...coverFields };
		// Only assign `tracks` when something was actually bundled. A creator
		// who chose to host their audio separately (see JoinMediaStep's
		// `audioHosting === 'external'` branch) already has real URLs sitting
		// in `entry.tracks` by the time this runs — typed by hand, not derived
		// from an export. `bindSourceUrl` merges this return value straight
		// into `entry` with `Object.assign`, so unconditionally returning
		// `tracks: []` here would silently overwrite those typed URLs with
		// nothing the instant the creator verified their generated page,
		// destroying exactly the data the external-hosting choice exists to
		// collect. Bundle mode is unaffected either way: with files uploaded
		// this is non-empty as before, and with none uploaded it was already
		// writing `[]` onto an `entry.tracks` that started as `[]`, a no-op.
		if (assetPaths.tracks.length) {
			fields.tracks = assetPaths.tracks.map((path, i) => ({
				label: works[i]?.label?.trim() || `Track ${i + 1}`,
				media_url: abs(path)
			}));
		}
		return fields;
	}

	if (entry.type === 'comic') {
		return {
			...coverFields,
			pages: assetPaths.pages.map((path, i) => {
				/** @type {Record<string, string>} */
				const page = { image_url: abs(path) };
				const caption = works[i]?.caption?.trim();
				if (caption) page.caption = caption;
				return page;
			})
		};
	}

	if (entry.type === 'art') {
		return {
			...coverFields,
			artworks: assetPaths.pages.map((path, i) => {
				const work = works[i];
				/** @type {Record<string, string>} */
				const artwork = {
					image_url: abs(path),
					alt: work?.alt?.trim() || `Artwork ${i + 1}`
				};
				const optional = {
					title: work?.title,
					year: work?.year,
					medium: work?.medium,
					external_url: work?.external_url
				};
				for (const [key, value] of Object.entries(optional)) {
					const clean = value?.trim();
					if (clean) artwork[key] = clean;
				}
				return artwork;
			})
		};
	}

	if (entry.type === 'game') {
		return assetPaths.icon
			? coverFields
			: assetPaths.screenshot
				? { thumb_url: abs(assetPaths.screenshot) }
				: {};
	}

	// Text excerpts are already collected directly, but its optional node
	// cover is still an exported asset and needs its final hosted URL.
	return coverFields;
}
