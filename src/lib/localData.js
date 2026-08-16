/**
 * Export and import of everything this app keeps about a visitor.
 *
 * The brief (section 8) asks for liked entries to be downloadable and
 * re-importable, to answer the "locked to one device" limitation of
 * localStorage honestly rather than by adding an account system. This covers
 * every local key, not just favorites, because the honest version of "your
 * data lives only in your browser" includes being able to take all of it out,
 * and because a visitor moving devices who gets their likes back but loses
 * the field they arranged has not really moved.
 *
 * Deliberately a plain .js module with no reactive state. It reads and writes
 * localStorage directly rather than going through the stores, for two
 * reasons: an import has to be able to write keys whose stores may not be
 * instantiated on the current route, and a partial write followed by a reload
 * is far easier to reason about than trying to push new values through five
 * separate reactive stores and hoping every derived value settles.
 *
 * WHAT IS IN THE FILE MATTERS, and the UI says so. The journal is a fuller
 * record of a person's browsing than a list of likes is. It never leaves the
 * browser on its own; an export is the one moment it can, and that only
 * happens because someone asked for it.
 */

/** Every key this app owns. Adding a key here is what makes it portable. */
export const LOCAL_KEYS = [
	'indienode:favorites:v1',
	'indienode:journal:v1',
	'indienode:layout:v1',
	'indienode:preferences:v1',
	'indienode:filters:v1',
	'indienode:volume:v1'
];

/** Bumped only if the envelope shape changes, not when a key is added. */
const FORMAT_VERSION = 1;

/**
 * Human labels for the export summary, so the UI can say what is in the file
 * rather than listing storage keys at somebody.
 * @type {Record<string, string>}
 */
export const KEY_LABELS = {
	'indienode:favorites:v1': 'Liked entries',
	'indienode:journal:v1': 'Discovery journal',
	'indienode:layout:v1': 'Field arrangement',
	'indienode:preferences:v1': 'Theme and preferences',
	'indienode:filters:v1': 'Tag filters',
	'indienode:volume:v1': 'Player volume'
};

/**
 * @typedef {object} LocalDataFile
 * @property {string} format
 * @property {number} version
 * @property {string} exported_at
 * @property {Record<string, unknown>} data
 */

/**
 * Everything currently stored, as a plain object.
 *
 * Values are kept as their raw strings rather than parsed. Two of these keys
 * are not JSON at all (`volume` is a bare number string), and re-parsing then
 * re-serializing would mean this module has to know the shape of every store
 * it touches. Treating them as opaque strings means adding a key later is a
 * one-line change here and nothing else.
 * @returns {Record<string, string>}
 */
function readAll() {
	/** @type {Record<string, string>} */
	const data = {};
	for (const key of LOCAL_KEYS) {
		const value = localStorage.getItem(key);
		if (value !== null) data[key] = value;
	}
	return data;
}

/** @returns {LocalDataFile} */
export function buildExport() {
	return {
		format: 'indienodes-local-data',
		version: FORMAT_VERSION,
		exported_at: new Date().toISOString(),
		data: readAll()
	};
}

/**
 * What an export currently contains, for the UI to show before the visitor
 * commits to downloading it.
 * @returns {{ key: string, label: string, count: number | null }[]}
 */
export function summarize() {
	const data = readAll();
	return LOCAL_KEYS.filter((key) => key in data).map((key) => ({
		key,
		label: KEY_LABELS[key] ?? key,
		count: countOf(key, data[key])
	}));
}

/**
 * A rough item count per key, or null where counting means nothing (a volume
 * level is not a quantity of anything).
 * @param {string} key
 * @param {string} raw
 * @returns {number | null}
 */
function countOf(key, raw) {
	try {
		const parsed = JSON.parse(raw);
		if (key === 'indienode:favorites:v1') return Array.isArray(parsed) ? parsed.length : null;
		if (key === 'indienode:journal:v1') return parsed?.events?.length ?? null;
		if (key === 'indienode:layout:v1') return Array.isArray(parsed) ? parsed.length : null;
		if (key === 'indienode:filters:v1') return parsed?.tags?.length ?? null;
		return null;
	} catch {
		return null;
	}
}

/** A filename that sorts chronologically and says what it is. */
export function exportFilename() {
	const stamp = new Date().toISOString().slice(0, 10);
	return `indienodes-data-${stamp}.json`;
}

/**
 * @typedef {object} ImportResult
 * @property {boolean} ok
 * @property {string} [error]
 * @property {string[]} [restored] Labels of what was written.
 * @property {string[]} [ignored] Keys present in the file that this app does not own.
 */

/**
 * Validates and applies an exported file.
 *
 * Rejects anything it does not recognise rather than doing its best with it:
 * this writes directly to storage that other parts of the app read on boot,
 * and a half-understood file is how someone ends up with a corrupt layout and
 * no idea why. Unknown keys are reported rather than written, so a file from a
 * future version does not silently inject keys this build knows nothing about.
 *
 * @param {unknown} parsed the already-JSON-parsed file contents
 * @returns {ImportResult}
 */
export function applyImport(parsed) {
	if (!parsed || typeof parsed !== 'object') {
		return { ok: false, error: 'That file is not valid JSON.' };
	}

	const file = /** @type {Partial<LocalDataFile>} */ (parsed);

	if (file.format !== 'indienodes-local-data') {
		return { ok: false, error: 'That is not an IndieNodes data file.' };
	}
	if (typeof file.version !== 'number' || file.version > FORMAT_VERSION) {
		return {
			ok: false,
			error: `That file was made by a newer version of IndieNodes (format ${file.version}).`
		};
	}
	if (!file.data || typeof file.data !== 'object') {
		return { ok: false, error: 'That file has no data in it.' };
	}

	/** @type {string[]} */
	const restored = [];
	/** @type {string[]} */
	const ignored = [];

	for (const [key, value] of Object.entries(file.data)) {
		if (!LOCAL_KEYS.includes(key)) {
			ignored.push(key);
			continue;
		}
		if (typeof value !== 'string') {
			ignored.push(key);
			continue;
		}
		try {
			localStorage.setItem(key, value);
			restored.push(KEY_LABELS[key] ?? key);
		} catch {
			return { ok: false, error: 'Could not write to local storage. It may be full or disabled.' };
		}
	}

	if (restored.length === 0) {
		return { ok: false, error: 'That file contained nothing this version can restore.' };
	}

	return { ok: true, restored, ignored };
}
