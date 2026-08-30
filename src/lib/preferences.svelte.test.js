import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_ROTATION_MS, loadPreferences } from './preferences.js';
import { STORAGE_KEYS } from './storageKeys.js';

const STORAGE_KEY = STORAGE_KEYS.preferences.key;

afterEach(() => {
	localStorage.removeItem(STORAGE_KEY);
});

describe('Art rotation preferences', () => {
	it('has its own default pace instead of borrowing the Any node pace', () => {
		expect(DEFAULT_ROTATION_MS.art).toBe(14000);
		expect(loadPreferences().rotationMs.art).toBe(14000);
	});

	it('keeps a saved Art pace when preferences are loaded again', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ rotationMs: { art: 5000, any: 14000 } }));

		expect(loadPreferences().rotationMs.art).toBe(5000);
	});
});
