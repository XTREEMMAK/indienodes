import { describe, expect, it } from 'vitest';
import { createDecks, shuffle } from './entryDeck.js';

/**
 * The rotation behaviour both the field and ambient view depend on, tested
 * for the first time. It was previously a closure inside each component, so
 * the property that actually matters — everything is seen once before
 * anything repeats — had never been asserted anywhere.
 */

const POOL = ['a', 'b', 'c', 'd', 'e'];

describe('shuffle', () => {
	it('returns the same ids without mutating the input', () => {
		const input = [...POOL];
		const out = shuffle(input);

		expect(out).toHaveLength(POOL.length);
		expect([...out].sort()).toEqual([...POOL].sort());
		expect(input).toEqual(POOL);
	});

	it('handles empty and single-item lists', () => {
		expect(shuffle([])).toEqual([]);
		expect(shuffle(['only'])).toEqual(['only']);
	});
});

describe('dealing a full pass', () => {
	it('shows every entry once before any repeats', () => {
		const decks = createDecks();
		const dealt = POOL.map(() => decks.take('t', POOL));

		expect(dealt).toHaveLength(POOL.length);
		expect([...dealt].sort()).toEqual([...POOL].sort());
	});

	it('starts a fresh pass once the deck is spent', () => {
		const decks = createDecks();
		for (let i = 0; i < POOL.length; i += 1) decks.take('t', POOL);

		const second = POOL.map(() => decks.take('t', POOL));

		expect([...second].sort()).toEqual([...POOL].sort());
	});
});

describe('keys are independent sequences', () => {
	it('does not let one key consume another key’s upcoming entries', () => {
		const decks = createDecks();
		const a = POOL.map(() => decks.take('audio', POOL));
		const v = POOL.map(() => decks.take('visual', POOL));

		// Each key completes its own full pass regardless of the other.
		expect([...a].sort()).toEqual([...POOL].sort());
		expect([...v].sort()).toEqual([...POOL].sort());
	});

	it('resets one key without disturbing the others', () => {
		const decks = createDecks();
		decks.take('a', POOL);
		decks.take('b', POOL);
		decks.reset('a');

		// 'a' starts over and can deal a full pass again.
		const afterReset = POOL.map(() => decks.take('a', POOL));
		expect([...afterReset].sort()).toEqual([...POOL].sort());
	});
});

describe('exclusions', () => {
	it('never deals an id that is spoken for', () => {
		const decks = createDecks();
		const exclude = ['a', 'b'];

		for (let i = 0; i < 20; i += 1) {
			const id = decks.take('t', POOL, exclude);
			if (id === null) continue;
			expect(exclude).not.toContain(id);
		}
	});

	it('returns null only when every eligible id is excluded', () => {
		const decks = createDecks();
		expect(decks.take('t', POOL, POOL)).toBeNull();
	});

	it('still deals when the deck is partly spent but the pool has room', () => {
		const decks = createDecks();
		// Spend most of the pass, then exclude exactly what is likely left.
		const first = decks.take('t', POOL);
		const second = decks.take('t', POOL);

		// Excluding two dealt ids must not report the pool exhausted: three
		// others remain eligible.
		const third = decks.take('t', POOL, [first, second]);
		expect(third).not.toBeNull();
		expect([first, second]).not.toContain(third);
	});

	it('tolerates nulls in the exclude list', () => {
		const decks = createDecks();
		// Callers pass slot assignments straight through, and an empty slot is
		// null rather than being filtered out first.
		expect(decks.take('t', POOL, [null, 'a'])).not.toBeNull();
	});
});

describe('a pool that changes underneath', () => {
	it('never deals an id that has left the pool', () => {
		const decks = createDecks();
		decks.take('t', POOL);

		const shrunk = ['a', 'b'];
		for (let i = 0; i < 10; i += 1) {
			const id = decks.take('t', shrunk);
			if (id !== null) expect(shrunk).toContain(id);
		}
	});

	it('deals newly added ids without waiting for the pass to end', () => {
		const decks = createDecks();
		decks.take('t', ['a']);

		const grown = ['a', 'b', 'c'];
		const seen = new Set();
		for (let i = 0; i < 12; i += 1) {
			const id = decks.take('t', grown);
			if (id) seen.add(id);
		}
		expect(seen).toContain('b');
		expect(seen).toContain('c');
	});

	it('returns null for an empty pool rather than throwing', () => {
		const decks = createDecks();
		expect(decks.take('t', [])).toBeNull();
	});
});
