import { audioPlayerStore } from './audioPlayerStore.svelte.js';
import { favoritesStore } from './favoritesStore.svelte.js';
import { hiddenStore } from './hiddenStore.svelte.js';
import { journalStore } from './journalStore.svelte.js';

/**
 * The rules for liking and dismissing an entry, in one place.
 *
 * These are brief rules, not component behaviour, but until now they were
 * written out separately in every surface that offers the actions —
 * `FieldNode`, `ComicViewer`, and `AmbientView` — because there was no shared
 * vocabulary for "act on an entry" for those surfaces to reach for. Three
 * copies of a rule is three chances to state it differently, and that had
 * already happened: two of the three dropped a dismissed node's queued tracks
 * and the third did not (see `hideEntry` below).
 *
 * What lives here is only what the rules say. Anything a *surface* decides —
 * whether un-liking needs a confirmation (Lists), what to rotate to after a
 * dismissal (ambient) — stays at the call site, which is why both functions
 * report which way they went rather than swallowing it.
 *
 * Deliberately plain functions over the stores rather than a store of their
 * own: there is no state here that the four stores do not already hold, and
 * adding a fifth would mean inventing one.
 */

/**
 * Likes an entry, or un-likes one already liked.
 *
 * Liking clears a conflicting dismissal: like and Not for Me are mutually
 * exclusive (brief section 8), so an entry is never both wanted and not
 * wanted at once.
 *
 * Only the way *in* is recorded. Un-liking is not an event in the visitor's
 * own history, it is a correction to one, and a journal that logs both reads
 * as a log of clicks rather than a trail of what they actually liked.
 *
 * Note this never asks before un-liking. On a surface that only shows liked
 * entries the card disappears from under the pointer, which is worth a
 * confirmation — but that is the surface's call, not this rule's, so Lists
 * intercepts before reaching here (`onUnlikeRequest` in `FieldNode`).
 *
 * @param {string} entryId
 * @returns {'liked' | 'unliked'} which way it went, so a caller can follow up
 */
export function likeEntry(entryId) {
	if (favoritesStore.isLiked(entryId)) {
		favoritesStore.toggle(entryId);
		return 'unliked';
	}
	if (hiddenStore.isHidden(entryId)) hiddenStore.toggle(entryId);
	journalStore.record(entryId, 'liked');
	favoritesStore.toggle(entryId);
	return 'liked';
}

/**
 * Marks an entry Not for Me, or restores one already dismissed.
 *
 * Mutually exclusive with liking, for the same reason and in the same
 * direction as `likeEntry`. No confirmation on this side either, and here
 * that is not merely the surface's call: dismissing a liked entry moves it
 * from the Liked tab to the Not for Me tab on Lists rather than removing it
 * from that surface altogether, so nothing is lost to find again.
 *
 * Dismissing also drops whatever the node had queued. The brief spells this
 * out for "Play my Liked" specifically — drop the node's remaining tracks,
 * advance to the next node's first track — but the reasoning holds for a
 * queue built any other way, so it is not gated behind that feature.
 *
 * That last step is the one the three former copies disagreed about: the
 * comic reader omitted it. That was safe only by accident, because two
 * unrelated type gates happen to keep a comic's tracks out of the queue, and
 * nothing said so. Stating the rule once removes the question.
 *
 * Restoring is not recorded, mirroring un-liking, and does not touch the
 * queue: there is nothing queued to drop, and re-queueing on the visitor's
 * behalf would be inventing an intent they never expressed.
 *
 * @param {string} entryId
 * @returns {'hidden' | 'restored'} which way it went, so a caller can follow up
 */
export function hideEntry(entryId) {
	if (hiddenStore.isHidden(entryId)) {
		hiddenStore.toggle(entryId);
		return 'restored';
	}
	if (favoritesStore.isLiked(entryId)) favoritesStore.toggle(entryId);
	journalStore.record(entryId, 'hidden');
	hiddenStore.toggle(entryId);
	audioPlayerStore.removeEntry(entryId);
	return 'hidden';
}
