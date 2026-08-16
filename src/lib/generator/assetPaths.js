/**
 * The one place the generator's asset-naming convention is written down:
 * `assets/track-1.mp3`, `assets/page-2.webp`, and so on. `zipExport.js`
 * uses these to name files inside the archive; `deriveRingEntry` in
 * `data.js` uses the exact same functions to build the `media_url`/
 * `thumb_url` values that will point at those files once the creator has
 * uploaded them somewhere. Those two things agreeing is not a coincidence
 * to maintain by hand — it is what this module exists to guarantee, by
 * being the only place either one is allowed to compute a path.
 */

/**
 * @param {number} index Zero-based.
 * @param {string} ext
 */
export function trackPath(index, ext) {
	return `assets/track-${index + 1}.${ext}`;
}

/**
 * @param {number} index Zero-based.
 * @param {string} ext
 */
export function pagePath(index, ext) {
	return `assets/page-${index + 1}.${ext}`;
}

/** @param {string} ext */
export function screenshotPath(ext) {
	return `assets/screenshot.${ext}`;
}

/** @param {string} ext */
export function iconPath(ext) {
	return `assets/icon.${ext}`;
}

/**
 * Joins a creator's now-known site root with one of the relative paths
 * above. `sourceUrl` may or may not carry a trailing slash (a submitter
 * typed it by hand), so this is the one place that gets normalized rather
 * than trusting every caller to remember.
 * @param {string} sourceUrl
 * @param {string} relativePath
 */
export function absoluteAssetUrl(sourceUrl, relativePath) {
	return `${sourceUrl.replace(/\/+$/, '')}/${relativePath.replace(/^\/+/, '')}`;
}
