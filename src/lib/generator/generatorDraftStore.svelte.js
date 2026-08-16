import { browser } from '$app/environment';
import { deleteDraft, getDraft, isNearExpiry, putDraft } from './draftDb.js';

/**
 * Reactive wrapper over `draftDb.js`, the same relationship
 * `submissionStore.svelte.js` has to `localStorage`: the DB module knows
 * nothing about Svelte, this module is the seam where its async, callback-
 * shaped reads and writes become `$state` a component can just read.
 *
 * **Loading is asynchronous and explicit** (`load()`, not a constructor-time
 * side effect), because IndexedDB access has to be — there is no synchronous
 * read like `localStorage.getItem`. Callers (the generator's entry point)
 * call `load()` once on mount and get a `resumeAvailable` flag back to
 * decide what to show, rather than the store silently deciding for them.
 */

function createGeneratorDraftStore() {
	/** @type {Record<string, any>} */
	let entry = $state({});
	/** @type {Record<string, any>} */
	let generator = $state({});
	let hasDraft = $state(false);
	let nearExpiry = $state(false);
	let loaded = $state(false);

	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let saveTimer;

	/**
	 * Reads whatever draft exists (if any) into reactive state.
	 *
	 * Idempotent and safe to call more than once — the generator's own entry
	 * step calls this on mount, and there is no harm in a second call
	 * re-confirming the same state.
	 * @returns {Promise<{ resumeAvailable: boolean, nearExpiry: boolean }>}
	 */
	async function load() {
		if (!browser) return { resumeAvailable: false, nearExpiry: false };
		const draft = await getDraft();
		if (draft) {
			entry = draft.entry ?? {};
			generator = draft.generator ?? {};
			hasDraft = true;
			nearExpiry = await isNearExpiry();
		} else {
			hasDraft = false;
			nearExpiry = false;
		}
		loaded = true;
		return { resumeAvailable: hasDraft, nearExpiry };
	}

	/**
	 * Debounced, matching `submissionStore`'s own ~400ms `persist()` timing.
	 * File inputs bypass the debounce entirely by calling `saveNow` instead
	 * (see below) — a chosen image is exactly the kind of change worth
	 * writing immediately rather than risking on a closed tab.
	 * @param {{ entry?: Record<string, any>, generator?: Record<string, any> }} patch
	 */
	function save(patch) {
		if (patch.entry) entry = { ...entry, ...patch.entry };
		if (patch.generator) generator = { ...generator, ...patch.generator };
		if (!browser) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			putDraft(patch).catch(() => {
				// Private browsing, a full quota, or IndexedDB unavailable
				// entirely. Losing the draft is survivable; there is nothing
				// actionable to surface mid-keystroke.
			});
		}, 400);
	}

	/**
	 * @param {{ entry?: Record<string, any>, generator?: Record<string, any> }} patch
	 */
	async function saveNow(patch) {
		if (patch.entry) entry = { ...entry, ...patch.entry };
		if (patch.generator) generator = { ...generator, ...patch.generator };
		clearTimeout(saveTimer);
		if (!browser) return;
		try {
			await putDraft(patch);
		} catch {
			// Same as the debounced save() below: private browsing, a full
			// quota, or a transient IndexedDB failure. The in-memory state
			// above already has the change, which is what the rest of the
			// page reads from, so a failed write here costs only
			// persistence, not correctness of what is on screen right now.
		}
	}

	/** Explicit "start fresh," per the spec's resume-or-restart choice. */
	async function discard() {
		clearTimeout(saveTimer);
		entry = {};
		generator = {};
		hasDraft = false;
		nearExpiry = false;
		if (browser) await deleteDraft();
	}

	return {
		get entry() {
			return entry;
		},
		get generator() {
			return generator;
		},
		get hasDraft() {
			return hasDraft;
		},
		get nearExpiry() {
			return nearExpiry;
		},
		get loaded() {
			return loaded;
		},
		load,
		save,
		saveNow,
		discard
	};
}

export const generatorDraftStore = createGeneratorDraftStore();
