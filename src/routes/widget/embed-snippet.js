// Kept out of +page.svelte on purpose: a literal `<script>...</script>` tag
// pair inside a .svelte file's own <script> block confuses Svelte's
// single-file-component parser, which scans for those tags the same way an
// HTML parser does, regardless of them being inside a JS string. A plain .js
// file has no such constraint.

/**
 * `site-id` is included in the snippet rather than left for the member to
 * discover: it is what makes Previous and Next resolve to *that member's*
 * actual neighbours in the ring instead of an arbitrary starting point, and
 * a snippet that quietly omits it would leave every embed slightly wrong in
 * a way nobody would think to look for. Shown with a placeholder value so it
 * reads as something to fill in.
 * The versioned URL is what gets handed out, not the bare `/embed.js`. A
 * member pastes this once and then never thinks about it again, so pinning
 * them to a major version is what lets this project ship a breaking change
 * later without silently altering something on their site. `/embed.js` still
 * exists and still tracks latest, for anyone who wants that on purpose.
 * @param {string} origin
 * @param {string} [siteId] the member's own ring.json `id`
 * @returns {string}
 */
export function embedSnippet(origin, siteId = 'your-ring-entry-id') {
	return `<script type="module" src="${origin}/embed.v1.js"></script>\n<indienode-widget site-id="${siteId}"></indienode-widget>`;
}
