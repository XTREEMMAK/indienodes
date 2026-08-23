/**
 * Dealing entries so everything gets seen before anything repeats.
 *
 * Two surfaces rotate content — the field's nodes and ambient view's lanes —
 * and both had grown their own copy of this: shuffle a deck of ids, deal from
 * it, refill when it runs out, skip whatever is already on screen. Same
 * algorithm, different shapes, neither tested, because in both places it was a
 * closure over component state with no seam to reach.
 *
 * A deck rather than picking at random each time, which is the whole point and
 * worth restating here since it is the reason this is not three lines: plain
 * random repeats. At the ring sizes a young webring actually has, the same
 * entry reappears while others go unseen for long stretches. Dealing from a
 * shuffled deck shows everything once before anything repeats, then reshuffles
 * differently for the next pass.
 *
 * Keyed because both callers deal several independent sequences at once — the
 * field one per entry type, ambient one per lane — and a shared deck would let
 * one sequence consume another's upcoming entries.
 */

/**
 * Fisher-Yates, on a copy. Not seeded: the shuffle is per visitor per session
 * and nothing needs to reproduce it.
 * @param {string[]} ids
 * @returns {string[]}
 */
export function shuffle(ids) {
	const deck = [...ids];
	for (let i = deck.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck;
}

/**
 * A set of independent decks, one per key.
 *
 * Deliberately plain state rather than a rune store: both callers already own
 * the reactive state that matters (which entry is in which slot) and write
 * this from inside the same functions that update it. Making the deck itself
 * reactive would mean every deal invalidating whatever reads it, for a value
 * nothing renders.
 */
export function createDecks() {
	/** @type {Record<string, string[]>} */
	let decks = {};

	return {
		/**
		 * Deals the next id for `key` that is not in `exclude`.
		 *
		 * @param {string} key which sequence to deal from
		 * @param {string[]} poolIds every id currently eligible; the pool can
		 *   change between calls (a filter toggled, an entry dismissed) and ids
		 *   that have left it are dropped rather than dealt
		 * @param {(string | null)[]} [exclude] ids spoken for right now, so the
		 *   same entry is never in two places at once
		 * @returns {string | null} null only when every eligible id is excluded
		 */
		take(key, poolIds, exclude = []) {
			if (poolIds.length === 0) return null;

			const valid = new Set(poolIds);
			// Drop ids that have left the pool since this deck was shuffled,
			// otherwise a dismissed entry keeps getting dealt and skipped.
			let deck = (decks[key] ?? []).filter((id) => valid.has(id));
			if (deck.length === 0) deck = shuffle(poolIds);

			let index = deck.findIndex((id) => !exclude.includes(id));

			// A deck near the end of its pass can hold nothing but ids already
			// on screen while the pool still has plenty that are not. Refill and
			// look again rather than reporting the pool exhausted.
			if (index === -1 && deck.length < poolIds.length) {
				deck = shuffle(poolIds);
				index = deck.findIndex((id) => !exclude.includes(id));
			}

			// A full deck with nothing usable means every eligible entry really
			// is spoken for.
			if (index === -1) {
				decks[key] = deck;
				return null;
			}

			const [id] = deck.splice(index, 1);
			decks[key] = deck;
			return id;
		},

		/**
		 * Forgets dealt history, so the next take starts a fresh pass.
		 * @param {string} [key] one sequence, or all of them when omitted
		 */
		reset(key) {
			if (key === undefined) decks = {};
			else delete decks[key];
		}
	};
}
