/**
 * Persistence for the site generator's draft, per
 * `tmp/site-generator-claude-code-prompt.md` section 5.
 *
 * **IndexedDB, not `localStorage`, and that is not interchangeable with how
 * `submissionStore.svelte.js` persists its own draft.** A generator draft
 * can hold an icon and several work images, as real `Blob`/`File` objects.
 * IndexedDB stores those natively; `localStorage` only holds strings, which
 * would mean base64-encoding every image, inflating it by roughly a third,
 * and holding the inflated copy in memory as a JS string on every read and
 * write. Nothing here needs a library: IndexedDB's callback API is annoying
 * to use directly, not hard to wrap, and this project already avoids adding
 * a runtime dependency where a small hand-rolled module does the job (see
 * `submissionValidation.js`'s own reasoning for the same call).
 *
 * **Single slot, not a table of drafts.** Nothing in the spec asks for more
 * than one in-progress generator draft per browser, and `submissionStore`'s
 * own draft is the same shape: one key, overwritten in place. Multi-draft
 * support is complexity nobody asked for.
 *
 * **Expiry is measured from the last edit, not from creation.** The spec is
 * explicit about this: the point is dropping abandoned drafts, not
 * penalizing someone who is genuinely still working through the form across
 * several sessions. Every `put` bumps `updatedAt`, and that is the only
 * timestamp this module keeps.
 */

const DB_NAME = 'indienode-generator';
const DB_VERSION = 1;
const STORE = 'drafts';
const KEY = 'current';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const WARNING_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * @typedef {object} GeneratorDraft
 * @property {number} updatedAt Epoch ms, bumped on every `put`.
 * @property {Record<string, any>} entry The ring.json-shaped half.
 * @property {Record<string, any>} generator Everything the ring never sees:
 *   display name, works (each optionally carrying a `Blob`/`File`), icon,
 *   social links, chosen template, and the submission/token ids issued by
 *   the backend once the generator flow reaches that point.
 */

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/**
 * Opens (and lazily creates) the database. Memoized: every caller in one
 * page load shares one open connection rather than negotiating a new one
 * per call, which is the standard IndexedDB footgun this avoids.
 * @returns {Promise<IDBDatabase>}
 */
function openDb() {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) {
				request.result.createObjectStore(STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	return dbPromise;
}

/**
 * Wraps an `IDBRequest` in a promise. The small, repeated piece of
 * boilerplate every other function here is written to avoid duplicating.
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function promisify(request) {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

/**
 * Reads the current draft.
 *
 * A draft untouched for 30 days is deleted here, silently, and reported as
 * absent — the spec asks for no confirmation on an already-expired draft,
 * since it is past the window that would have made it worth asking about.
 * @returns {Promise<GeneratorDraft | null>}
 */
export async function getDraft() {
	const db = await openDb();
	const tx = db.transaction(STORE, 'readonly');
	/** @type {GeneratorDraft | undefined} */
	const record = await promisify(tx.objectStore(STORE).get(KEY));
	if (!record) return null;

	if (Date.now() - record.updatedAt > THIRTY_DAYS_MS) {
		await deleteDraft();
		return null;
	}
	return record;
}

/**
 * Merges `patch` into the stored draft (creating one if none exists yet)
 * and bumps `updatedAt` to now. Shallow merge on `entry`/`generator`
 * individually, so a caller updating one field does not have to first read
 * and spread the entire record back in.
 * @param {{ entry?: Record<string, any>, generator?: Record<string, any> }} patch
 * @returns {Promise<GeneratorDraft>}
 */
export async function putDraft(patch) {
	const db = await openDb();
	const tx = db.transaction(STORE, 'readwrite');
	const store = tx.objectStore(STORE);
	/** @type {GeneratorDraft | undefined} */
	const existing = await promisify(store.get(KEY));

	/** @type {GeneratorDraft} */
	const next = {
		updatedAt: Date.now(),
		entry: { ...existing?.entry, ...patch.entry },
		generator: { ...existing?.generator, ...patch.generator }
	};
	await promisify(store.put(next, KEY));
	return next;
}

/** Deletes the draft outright. Used both by expiry and by an explicit "start fresh." */
export async function deleteDraft() {
	const db = await openDb();
	const tx = db.transaction(STORE, 'readwrite');
	await promisify(tx.objectStore(STORE).delete(KEY));
}

/**
 * Whether a stored draft is close enough to expiring to warn about it.
 *
 * Kept as a separate, cheap read rather than folded into `getDraft`'s return
 * shape, so a caller that only wants to know "should I show the low-key
 * notice" does not have to also handle the full draft object.
 * @returns {Promise<boolean>}
 */
export async function isNearExpiry() {
	const draft = await getDraft();
	if (!draft) return false;
	return Date.now() - draft.updatedAt > THIRTY_DAYS_MS - WARNING_WINDOW_MS;
}
