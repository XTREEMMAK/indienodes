/**
 * Runs under the "client" vitest project (real `indexedDB`, via Playwright's
 * chromium), not "server": Node has no IndexedDB, and this module has no
 * reason to run anywhere but the browser regardless. The `.svelte.test.js`
 * name is what routes it there — see the two projects' `include` patterns in
 * `vite.config.js` — even though nothing in this file uses Svelte itself.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDraft, getDraft, isNearExpiry, putDraft } from './draftDb.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

beforeEach(async () => {
	// No fixed database name to reset between tests, so start each test by
	// clearing whatever the previous one left, rather than pointing every
	// test at its own database (which would mean re-deriving the open/
	// upgrade path per test instead of exercising the module's own memoized
	// connection, which is itself worth covering).
	await deleteDraft();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('putDraft / getDraft', () => {
	it('returns null when nothing has been saved', async () => {
		expect(await getDraft()).toBeNull();
	});

	it('round-trips entry and generator data', async () => {
		await putDraft({ entry: { creator: 'X' }, generator: { displayName: 'X Studio' } });
		const draft = await getDraft();
		expect(draft?.entry.creator).toBe('X');
		expect(draft?.generator.displayName).toBe('X Studio');
	});

	it('shallow-merges successive writes rather than overwriting the whole record', async () => {
		await putDraft({ entry: { creator: 'X' } });
		await putDraft({ entry: { why: 'Y' } });
		const draft = await getDraft();
		expect(draft?.entry).toEqual({ creator: 'X', why: 'Y' });
	});

	it('merges entry and generator independently', async () => {
		await putDraft({ entry: { creator: 'X' }, generator: { displayName: 'A' } });
		await putDraft({ generator: { templateId: 'gallery-1' } });
		const draft = await getDraft();
		expect(draft?.entry).toEqual({ creator: 'X' });
		expect(draft?.generator).toEqual({ displayName: 'A', templateId: 'gallery-1' });
	});

	it('stores a Blob in generator data and reads the same bytes back', async () => {
		const blob = new Blob(['fake-icon-bytes'], { type: 'image/webp' });
		await putDraft({ generator: { icon: blob } });
		const draft = await getDraft();
		expect(draft?.generator.icon).toBeInstanceOf(Blob);
		expect(await draft?.generator.icon.text()).toBe('fake-icon-bytes');
	});

	it('bumps updatedAt on every write', async () => {
		const first = await putDraft({ entry: { creator: 'X' } });
		await new Promise((r) => setTimeout(r, 5));
		const second = await putDraft({ entry: { creator: 'Y' } });
		expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
	});
});

describe('expiry', () => {
	it('deletes and reports absent a draft untouched for over 30 days', async () => {
		await putDraft({ entry: { creator: 'Stale' } });
		// putDraft always stamps "now"; backdate directly rather than trying
		// to fake the system clock across an IndexedDB round trip.
		const stale = await getDraft();
		await putDraft({}); // no-op merge to get a handle, then patch the timestamp manually below
		const db = await new Promise((resolve, reject) => {
			const req = indexedDB.open('indienode-generator');
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		await new Promise((resolve, reject) => {
			const tx = db.transaction('drafts', 'readwrite');
			tx.objectStore('drafts').put(
				{ ...stale, updatedAt: Date.now() - THIRTY_DAYS_MS - 1000 },
				'current'
			);
			tx.oncomplete = () => resolve(undefined);
			tx.onerror = () => reject(tx.error);
		});

		expect(await getDraft()).toBeNull();
	});

	it('keeps a draft well inside the 30-day window', async () => {
		await putDraft({ entry: { creator: 'Fresh' } });
		const draft = await getDraft();
		expect(draft).not.toBeNull();
		expect(draft?.entry.creator).toBe('Fresh');
	});

	it('isNearExpiry is false for a freshly saved draft', async () => {
		await putDraft({ entry: { creator: 'Fresh' } });
		expect(await isNearExpiry()).toBe(false);
	});

	it('isNearExpiry is false once a draft has actually expired (it is just gone, not "near")', async () => {
		await putDraft({ entry: { creator: 'Ancient' } });
		const stale = await getDraft();
		const db = await new Promise((resolve, reject) => {
			const req = indexedDB.open('indienode-generator');
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
		await new Promise((resolve, reject) => {
			const tx = db.transaction('drafts', 'readwrite');
			tx.objectStore('drafts').put(
				{ ...stale, updatedAt: Date.now() - THIRTY_DAYS_MS - 1000 },
				'current'
			);
			tx.oncomplete = () => resolve(undefined);
			tx.onerror = () => reject(tx.error);
		});
		expect(await isNearExpiry()).toBe(false);
	});
});

describe('deleteDraft', () => {
	it('clears an existing draft', async () => {
		await putDraft({ entry: { creator: 'X' } });
		await deleteDraft();
		expect(await getDraft()).toBeNull();
	});

	it('is a no-op when nothing was stored', async () => {
		await expect(deleteDraft()).resolves.not.toThrow();
	});
});
