/**
 * A unique-enough id for a form row's `{#each}` key. Never used for
 * anything security-sensitive (not a token, not an id anything is looked
 * up by across sessions), so it doesn't need to be a real UUID — only
 * unique among the rows on screen at once.
 *
 * `crypto.randomUUID()` only exists in secure contexts (HTTPS, or
 * `localhost` specifically) — it is simply `undefined` on a plain-HTTP LAN
 * address, which is an ordinary way to test this app from another device
 * on the same network, not an edge case worth ignoring. Falls back to a
 * manually assembled random string there instead of throwing.
 * @returns {string}
 */
export function uid() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
