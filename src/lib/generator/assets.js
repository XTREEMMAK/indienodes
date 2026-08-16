/**
 * Client-side image processing for the site generator, per
 * `tmp/site-generator-claude-code-prompt.md` section 6: everything here
 * runs in the browser, nothing is uploaded anywhere to be processed. The
 * generator is the one place in this project that touches raw image bytes
 * at all; `thumb_url` and friends everywhere else in the app are always
 * just a link to a file the creator already hosts (see the `not:` rule on
 * `$defs/externalMediaUrl` in `schema/ring.schema.json`), which is exactly
 * the constraint this module exists to remove for someone who has nowhere
 * to host anything yet.
 */

/**
 * Icons are small and load-bearing for layout (they sit in a fixed slot in
 * every template), so a stronger size cap makes sense than a work image,
 * which is free to be as large as the template's own hero treatment wants.
 * Both are proposed defaults, not settings a creator is asked to tune: the
 * spec explicitly asks for "sane out of the box," not a dial.
 */
export const ICON_DEFAULTS = Object.freeze({ maxDimension: 512, quality: 0.82 });

/** @type {{ maxDimension: number, quality: number }} */
export const WORK_IMAGE_DEFAULTS = Object.freeze({ maxDimension: 1600, quality: 0.82 });

/**
 * @typedef {object} ProcessedImage
 * @property {Blob} blob
 * @property {string} mimeType Whatever `blob.type` actually ended up being;
 *   read this rather than assuming `'image/webp'`, since a browser without
 *   WebP encoding support falls back to the source's own mime type.
 * @property {number} width
 * @property {number} height
 */

/**
 * Decodes `blob` and re-encodes it as WebP, downscaled to fit within
 * `maxDimension` on its longer side (never upscaled: a small source image
 * stays its own size rather than being blown up and softened).
 *
 * Falls back to the source's own mime type when the browser's canvas cannot
 * produce WebP at all. That is a real, still-shipping browser gap for
 * `toBlob`, not a hypothetical: the standard way to detect it client-side is
 * to attempt the encode and check what `blob.type` actually came back as,
 * which is exactly what happens below, rather than trying to feature-sniff
 * WebP support some other way that could disagree with what `toBlob` itself
 * decides to honor.
 * @param {Blob} blob
 * @param {{ maxDimension?: number, quality?: number }} [options]
 * @returns {Promise<ProcessedImage>}
 */
export async function toWebp(blob, options = {}) {
	const { maxDimension = WORK_IMAGE_DEFAULTS.maxDimension, quality = WORK_IMAGE_DEFAULTS.quality } =
		options;

	const bitmap = await createImageBitmap(blob);
	const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
	const width = Math.round(bitmap.width * scale);
	const height = Math.round(bitmap.height * scale);

	const canvas = new OffscreenCanvas(width, height);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable.');
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	let out = await canvas.convertToBlob({ type: 'image/webp', quality });
	if (out.type !== 'image/webp') {
		// The browser silently gave back something else (commonly a PNG)
		// instead of honoring the requested type, which is how a lack of
		// WebP encoding support actually manifests here rather than as a
		// thrown error. Ask explicitly for the source's own type instead of
		// trusting whatever the first call produced.
		out = await canvas.convertToBlob({ type: blob.type || 'image/png' });
	}

	return { blob: out, mimeType: out.type, width, height };
}

/**
 * Accepted upload formats for both the icon and work images, per section 6.
 * Exported so the file input's own `accept` attribute and any validation
 * message read from the same list rather than two hand-typed copies of it.
 */
export const ACCEPTED_IMAGE_TYPES = Object.freeze([
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif'
]);
