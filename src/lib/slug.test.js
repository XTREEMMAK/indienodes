import { describe, expect, it } from 'vitest';
import { slugify, entrySlug, uniqueEntryId } from './slug.js';

/** The schema's own constraint on `id`, asserted directly. */
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('slugify', () => {
	it('lowercases and hyphenates', () => {
		expect(slugify('Driftwood Radio')).toBe('driftwood-radio');
	});

	it('reduces accented Latin to base letters rather than dropping them', () => {
		expect(slugify('Café Crème')).toBe('cafe-creme');
		expect(slugify('Sigur Rós')).toBe('sigur-ros');
	});

	it('collapses runs of punctuation into single hyphens', () => {
		expect(slugify('Tin Roof!! (Deluxe) — 2026')).toBe('tin-roof-deluxe-2026');
	});

	it('leaves no leading or trailing hyphen', () => {
		expect(slugify('  ...hello...  ')).toBe('hello');
	});

	it('returns empty for scripts with no Latin decomposition', () => {
		// Documented behaviour, not an accident: entrySlug has the fallback.
		expect(slugify('日本語')).toBe('');
	});

	it('tolerates null and undefined', () => {
		expect(slugify(/** @type {any} */ (undefined))).toBe('');
		expect(slugify(/** @type {any} */ (null))).toBe('');
	});
});

describe('entrySlug', () => {
	it('composes type and creator', () => {
		expect(entrySlug({ type: 'audio', creator: 'Driftwood Radio' })).toBe('audio-driftwood-radio');
	});

	it('always satisfies the schema pattern', () => {
		const awkward = [
			{ type: 'audio', creator: '—' },
			{ type: 'text', creator: '日本語' },
			{ type: 'game', creator: 'a'.repeat(80) },
			{ type: 'comic', creator: '' },
			{}
		];
		for (const entry of awkward) {
			expect(entrySlug(entry), JSON.stringify(entry)).toMatch(ID_PATTERN);
		}
	});

	it('falls back to a usable id when nothing survives slugification', () => {
		expect(entrySlug({ type: '', creator: '日本語' })).toBe('entry');
	});

	it('truncates long input without leaving a trailing hyphen', () => {
		const id = entrySlug({
			type: 'audio',
			creator: 'The Extremely Long Band Name Collective Featuring Absolutely Everyone Involved'
		});
		expect(id.length).toBeLessThanOrEqual(48);
		expect(id).toMatch(ID_PATTERN);
	});

	it('prefers cutting at a word boundary', () => {
		const id = entrySlug({
			type: 'audio',
			creator: 'Driftwood Radio Collective Presents Their Very Best Songs And More'
		});
		// Cut at a hyphen, so the last segment is a whole word.
		expect(id.endsWith('-')).toBe(false);
		expect(id).toMatch(ID_PATTERN);
	});

	it('two nodes from the same creator and type collide on the base id', () => {
		// No work-level title left to disambiguate them; uniqueEntryId's
		// suffix is the only thing that can, which is the case it exists for.
		const a = entrySlug({ type: 'audio', creator: 'Driftwood Radio' });
		const b = entrySlug({ type: 'audio', creator: 'Driftwood Radio' });
		expect(a).toBe(b);
	});
});

describe('uniqueEntryId', () => {
	const entry = { type: 'audio', creator: 'Driftwood' };
	const base = 'audio-driftwood';

	it('uses the plain slug when nothing collides', () => {
		expect(uniqueEntryId(entry, [])).toBe(base);
		expect(uniqueEntryId(entry, ['something-else'])).toBe(base);
	});

	it('starts suffixes at 2, so the original is not implicitly 1', () => {
		expect(uniqueEntryId(entry, [base])).toBe(`${base}-2`);
	});

	it('skips past every taken suffix', () => {
		expect(uniqueEntryId(entry, [base, `${base}-2`, `${base}-3`])).toBe(`${base}-4`);
	});

	it('still satisfies the schema pattern once suffixed', () => {
		expect(uniqueEntryId(entry, [base])).toMatch(ID_PATTERN);
	});

	it('accepts any iterable of existing ids, not just an array', () => {
		expect(uniqueEntryId(entry, new Set([base]))).toBe(`${base}-2`);
	});
});
