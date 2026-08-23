import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_STORAGE_KEYS, EXPORTABLE_KEYS, KEY_LABELS, STORAGE_KEYS } from './storageKeys.js';

const SRC = new URL('..', import.meta.url).pathname;

/** Every `indienode:*` literal appearing anywhere under src/. */
function keysUsedInSource() {
	/** @type {Set<string>} */
	const found = new Set();
	/** @param {string} dir */
	function walk(dir) {
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) {
				walk(path);
				continue;
			}
			if (!/\.(js|ts|svelte)$/.test(name)) continue;
			// The catalog itself is the declaration, not a usage.
			if (path.endsWith('storageKeys.js') || path.endsWith('storageKeys.test.js')) continue;
			const source = readFileSync(path, 'utf8');
			for (const match of source.matchAll(/'(indienode:[a-z0-9:.-]+)'/g)) found.add(match[1]);
		}
	}
	walk(SRC);
	return found;
}

describe('the catalog is the source of truth', () => {
	it('knows every storage key the source actually uses', () => {
		const catalogued = new Set(ALL_STORAGE_KEYS.map((entry) => entry.key));
		const orphans = [...keysUsedInSource()].filter((key) => !catalogued.has(key));

		// A new key that reaches localStorage without being catalogued is
		// exactly how the export registry drifted in the first place. Add it to
		// STORAGE_KEYS with an explicit `exportable` decision.
		expect(orphans).toEqual([]);
	});

	it('has no catalogued key that nothing uses', () => {
		const used = keysUsedInSource();
		const stale = ALL_STORAGE_KEYS.filter((entry) => !used.has(entry.key)).map(
			(entry) => entry.key
		);
		expect(stale).toEqual([]);
	});
});

describe('portability is always an explicit decision', () => {
	it('states exportable as a boolean for every key', () => {
		for (const entry of ALL_STORAGE_KEYS) {
			expect(typeof entry.exportable, `${entry.key} must declare exportable`).toBe('boolean');
		}
	});

	it('requires a stated reason for anything held back', () => {
		for (const entry of ALL_STORAGE_KEYS.filter((candidate) => !candidate.exportable)) {
			expect(entry.reason, `${entry.key} is not exportable and must say why`).toBeTruthy();
		}
	});

	it('gives every key a human label', () => {
		for (const entry of ALL_STORAGE_KEYS) {
			expect(entry.label, `${entry.key} needs a label`).toBeTruthy();
			expect(KEY_LABELS[entry.key]).toBe(entry.label);
		}
	});

	it('uses each literal key exactly once', () => {
		const keys = ALL_STORAGE_KEYS.map((entry) => entry.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe('what an export carries', () => {
	it('includes the keys a visitor would expect to move devices with', () => {
		for (const name of [
			'favorites',
			'hidden',
			'journal',
			'layout',
			'preferences',
			'filters',
			'volume',
			'skins'
		]) {
			expect(EXPORTABLE_KEYS, `${name} should be portable`).toContain(STORAGE_KEYS[name].key);
		}
	});

	it('holds back drafts and viewport-specific geometry', () => {
		for (const name of ['submissionDraft', 'updateDraft', 'playerPosition']) {
			expect(EXPORTABLE_KEYS).not.toContain(STORAGE_KEYS[name].key);
		}
	});
});
