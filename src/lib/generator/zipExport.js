/**
 * Packages a generator draft into the downloadable zip described in
 * `tmp/site-generator-claude-code-prompt.md` section 7: HTML, CSS, JS, and
 * processed image assets, upload-ready as-is for a static host.
 *
 * `jszip` is dynamic-imported rather than a top-level import, so it never
 * lands in the bundle for any route except this one — every other page in
 * this static site has no reason to pay for a zip library.
 */

import { loadTemplate } from './registry.js';
import { buildGeneratorData } from './data.js';
import { ICON_DEFAULTS, WORK_IMAGE_DEFAULTS, toWebp } from './assets.js';
import { iconPath, pagePath, screenshotPath, trackPath } from './assetPaths.js';

/**
 * Only the icon, comic/art works, and a game screenshot are images that get
 * re-encoded to WebP. An audio track's `file` is an audio file, not an
 * image — running it through `toWebp`'s canvas pipeline would simply fail
 * (there is nothing to draw), so audio assets are copied into the archive
 * byte-for-byte instead, under the extension implied by their own mime
 * type.
 * @param {string} mimeType
 */
function extensionFor(mimeType) {
	/** @type {Record<string, string>} */
	const known = {
		'audio/mpeg': 'mp3',
		'audio/mp4': 'm4a',
		'audio/wav': 'wav',
		'audio/x-wav': 'wav',
		'audio/ogg': 'ogg',
		'audio/flac': 'flac',
		'audio/webm': 'weba'
	};
	return known[mimeType] ?? 'bin';
}

/**
 * @typedef {object} ExportAssetPaths
 * @property {string[]} tracks Audio only, same order as `generator.works`.
 * @property {string[]} pages Comic or Art images, same order as `generator.works`.
 * @property {string | null} screenshot Game only.
 * @property {string | null} icon
 */

/**
 * @typedef {object} ExportResult
 * @property {Blob} zip
 * @property {string} filename Suggested download name, derived from the
 *   creator's display name so a folder of exports stays distinguishable.
 * @property {ExportAssetPaths} assetPaths The relative paths actually
 *   written into the archive (`assets/track-1.mp3`, and so on). Returned
 *   rather than left as an internal detail because the final extension for
 *   an image (`.webp` versus a fallback format) is only known after the
 *   encode actually runs — `deriveRingEntry` in `data.js` needs these exact
 *   strings later, once the creator has a real `source_url` to combine them
 *   with, and recomputing them separately could disagree with what this run
 *   actually produced.
 */

/**
 * `generator.provisionalId`, if present, is written into the README only —
 * it never reaches `buildGeneratorData`/the rendered template, since the
 * only place the id is meant to actually appear in the page itself is the
 * "Full widget" tier's own `site-id` attribute (`data.widgetEmbed`, built by
 * the caller before this runs).
 * @param {Record<string, any>} entry
 * @param {Record<string, any>} generator
 * @returns {Promise<ExportResult>}
 */
export async function exportSite(entry, generator) {
	const template = await loadTemplate(entry.type, generator.templateId);
	if (!template) {
		throw new Error(`No template available for type "${entry.type}".`);
	}

	const JSZip = (await import('jszip')).default;
	const zip = new JSZip();
	const assets = zip.folder('assets');
	if (!assets) throw new Error('Could not create the assets folder in the export archive.');

	/**
	 * Every asset the export actually needs to write, keyed by the relative
	 * path `data.js`'s `resolveAssetUrl` will be told to use. Collected in
	 * one pass up front so `buildGeneratorData` (synchronous) can be handed
	 * a plain lookup rather than an async resolver — image processing is
	 * genuinely async (canvas decode + encode), which does not fit inside
	 * `resolveAssetUrl`'s synchronous, per-field contract.
	 * @type {Map<Blob, string>}
	 */
	const paths = new Map();

	/** @type {ExportAssetPaths} */
	const assetPaths = { tracks: [], pages: [], screenshot: null, icon: null };

	if (entry.type === 'audio') {
		const works = generator.works ?? [];
		for (const [i, work] of works.entries()) {
			if (!work.file) continue;
			const ext = extensionFor(work.file.type);
			const path = trackPath(i, ext);
			assets.file(path.replace('assets/', ''), work.file);
			paths.set(work.file, path);
			assetPaths.tracks[i] = path;
		}
	} else if (entry.type === 'comic' || entry.type === 'art') {
		const works = generator.works ?? [];
		for (const [i, work] of works.entries()) {
			if (!work.file) continue;
			const { blob, mimeType } = await toWebp(work.file, WORK_IMAGE_DEFAULTS);
			const ext = mimeType === 'image/webp' ? 'webp' : (mimeType.split('/')[1] ?? 'img');
			const path = pagePath(i, ext);
			assets.file(path.replace('assets/', ''), blob);
			paths.set(work.file, path);
			assetPaths.pages[i] = path;
		}
	} else if (entry.type === 'game') {
		const shot = generator.works?.[0];
		if (shot?.file) {
			const { blob, mimeType } = await toWebp(shot.file, WORK_IMAGE_DEFAULTS);
			const ext = mimeType === 'image/webp' ? 'webp' : (mimeType.split('/')[1] ?? 'img');
			const path = screenshotPath(ext);
			assets.file(path.replace('assets/', ''), blob);
			paths.set(shot.file, path);
			assetPaths.screenshot = path;
		}
	}

	if (generator.icon) {
		const { blob, mimeType } = await toWebp(generator.icon, ICON_DEFAULTS);
		const ext = mimeType === 'image/webp' ? 'webp' : (mimeType.split('/')[1] ?? 'img');
		const path = iconPath(ext);
		assets.file(path.replace('assets/', ''), blob);
		paths.set(generator.icon, path);
		assetPaths.icon = path;
	}

	/** @param {Blob | null | undefined} file */
	const resolveAssetUrl = (file) => (file ? (paths.get(file) ?? null) : null);

	const data = buildGeneratorData(entry, generator, resolveAssetUrl);
	const { html, css, js, pages } = template.render(data);

	zip.file('index.html', html);
	zip.file('styles.css', css);
	if (js) zip.file('script.js', js);
	// Additional pages a template chose to emit (the text templates' About
	// page). They share the one stylesheet and script, so nothing else here
	// changes with them.
	for (const [name, markup] of Object.entries(pages ?? {})) zip.file(name, markup);
	zip.file(
		'README.txt',
		[
			`${data.displayName || 'Your site'}, generated by IndieNodes.`,
			'',
			'This is a plain static site: index.html, styles.css, script.js, and an assets/',
			'folder. Upload the contents of this zip to any static host (Neocities, GitHub',
			'Pages, your own server) so index.html sits at the root of what you upload.',
			'',
			'Do not edit or remove the <meta name="indienode-verification"> tag in',
			'index.html until your ring submission has been approved: it is how IndieNodes',
			'confirms this site is yours. It will not match the id below — it is a separate,',
			'one-time token, not your entry id.',
			'',
			...(generator.provisionalId
				? [
						`Your provisional entry id is: ${generator.provisionalId}`,
						'This is a best guess made before your submission was approved and may come out',
						"differently once it's actually assigned — check the confirmation email if",
						"you're not sure. You'll need this id later if you ever use /update to request",
						'a change (a dead link, a swapped track, and so on).',
						''
					]
				: []),
			'The ring widget (Previous/Next to your neighbours), if your embed choice included',
			'one, is already in the footer of index.html. Only the "Full widget" tier carries',
			'a site-id of its own — the badge and text-link tiers link to a random member',
			'instead and have no id in them at all, which is expected, not a bug. If you did',
			'get a full widget and the id above turns out to differ from what you were',
			'actually assigned, edit the site-id attribute on the <indienode-widget> tag.'
		].join('\n')
	);

	const zipBlob = await zip.generateAsync({ type: 'blob' });
	const slug = (data.displayName || 'site')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return { zip: zipBlob, filename: `${slug || 'site'}.zip`, assetPaths };
}
