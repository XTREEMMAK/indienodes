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
/**
 * Turns a stored `Blob` into a `data:` URI.
 *
 * The live preview needs this rather than `URL.createObjectURL`, and the
 * reason is the iframe's sandbox. `join/+page.svelte` renders the preview
 * into a `srcdoc` iframe sandboxed **without** `allow-same-origin`, which
 * gives that document an opaque origin. A blob URL belongs to the origin
 * that created it, so an opaque-origin document cannot fetch one: every
 * uploaded cover, page, artwork and screenshot silently failed to load, with
 * no console error the creator would ever see. A `data:` URI carries its own
 * bytes and has no origin to check, so it loads under the same sandbox.
 *
 * Adding `allow-same-origin` back would also have fixed it and is the wrong
 * trade: combined with `allow-scripts` it would let anything that escaped the
 * bio sanitizer run as this site's own origin, against a visitor's stored
 * journal, likes and draft — which is exactly why the sandbox was tightened
 * in the first place.
 *
 * Blob URLs remain correct for the zip download and for the entry-step cover
 * thumbnail, neither of which crosses a sandbox boundary.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function toDataUrl(blob) {
	const buffer = new Uint8Array(await blob.arrayBuffer());
	let binary = '';
	// Chunked because String.fromCharCode(...arr) on a multi-megabyte array
	// overflows the argument limit and throws RangeError.
	const CHUNK = 0x8000;
	for (let i = 0; i < buffer.length; i += CHUNK) {
		binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
	}
	return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

/**
 * Upload ceilings.
 *
 * Everything in the generator is local-first: the bytes reach no server, so
 * these are not protecting infrastructure. They protect the creator's own
 * browser, which is where the whole pipeline runs — decode, canvas re-encode,
 * IndexedDB persistence, base64 into a preview document, and a JSZip archive
 * built entirely in memory. Before this there was no ceiling at all, so a
 * dragged-in 600 MB WAV was a hang with no explanation rather than a message.
 *
 * The image cap is generous because `toWebp` immediately downscales to
 * `WORK_IMAGE_DEFAULTS.maxDimension`; it only has to stop a file too large to
 * decode at all. Audio is copied byte-for-byte into the archive, never
 * re-encoded, so its cap is the one that actually bounds an export.
 */
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

/**
 * Audio formats the export can name a real extension for. `zipExport.js`
 * falls back to `.bin` for anything else, which is a file no browser will
 * play and no creator asked for.
 */
export const ACCEPTED_AUDIO_TYPES = Object.freeze([
	'audio/mpeg',
	'audio/mp4',
	'audio/wav',
	'audio/x-wav',
	'audio/ogg',
	'audio/flac',
	'audio/webm'
]);

/**
 * Checks an upload before anything holds onto it.
 *
 * The `accept` attribute on a file input is a filter in the picker dialog and
 * nothing more — drag-and-drop bypasses it, and so does choosing "All files".
 * For images the real gate has always been `createImageBitmap` in `toWebp`,
 * which throws on anything it cannot decode and re-encodes what it can, so a
 * payload smuggled inside an image does not survive. Audio had no equivalent:
 * it is copied into the zip byte-for-byte, so an arbitrary file picked by
 * mistake shipped inside the creator's own site under a `.bin` extension.
 *
 * Returns a human-readable reason, or `null` when the file is acceptable.
 * @param {File | Blob} file
 * @param {'image' | 'audio'} kind
 * @returns {string | null}
 */
export function rejectionReason(file, kind) {
	const accepted = kind === 'image' ? ACCEPTED_IMAGE_TYPES : ACCEPTED_AUDIO_TYPES;
	const limit = kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
	const type = (file.type || '').toLowerCase();

	if (!accepted.includes(/** @type {never} */ (type))) {
		const names = accepted.map((t) => t.split('/')[1].toUpperCase()).join(', ');
		return type
			? `${type} is not a supported ${kind} format. Use one of: ${names}.`
			: `That file has no recognizable ${kind} format. Use one of: ${names}.`;
	}
	if (file.size > limit) {
		return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${limit / 1024 / 1024} MB.`;
	}
	return null;
}

export const ACCEPTED_IMAGE_TYPES = Object.freeze([
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif'
]);
