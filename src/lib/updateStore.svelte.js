/**
 * State for the change-request form on `/update`.
 *
 * Structurally parallel to `submissionStore.svelte.js` (same
 * pending/error/verified/token/submissionId shape, same debounced-persist
 * localStorage draft, same `createAntiBot()` use) but for a narrower job:
 * editing one field of an *existing* ring entry rather than building a new
 * one from scratch. See the Creator Nodes addendum, Section C, and
 * `docs/roadmap.md`'s "Node maintenance and change requests" entry.
 *
 * **The node lookup here is not a security boundary.** It only prefills the
 * edit step from whatever `ring.json` this browser last fetched, which can
 * be stale or (for a not-yet-published node) simply absent. Re-verification
 * — the same token-in-a-`<meta>` mechanism `/join` already uses — is the
 * only real gate, checked server-side against the node's *current*
 * `source_url` on file, never against anything this store sends.
 */

import { browser } from '$app/environment';
import {
	requestUpdateToken,
	bindSourceUrl as bindSourceUrlApi,
	verify,
	submitUpdate
} from './submissionApi.js';
import { validateEntry, toRingEntry } from './submissionValidation.js';
import { createAntiBot } from './antiBot.svelte.js';
import { uid } from './uid.js';
import { SvelteSet } from 'svelte/reactivity';

const STORAGE_KEY = 'indienode:update-draft:v1';

/** Written to storage this long after the last keystroke. */
const PERSIST_DEBOUNCE_MS = 400;

/** @type {{ id: string, label: string }[]} */
export const UPDATE_STEPS = [
	{ id: 'identify', label: 'Identify' },
	{ id: 'verify', label: 'Verify' },
	{ id: 'edit', label: 'Edit' },
	{ id: 'review', label: 'Review' }
];

/** @param {Record<string, any>} fields */
function row(fields) {
	return { uid: uid(), ...fields };
}

function emptyEntry() {
	return {
		creator: '',
		type: '',
		why: '',
		has_own_site: 'yes',
		source_url: '',
		/** @type {string[]} */
		tags: [],
		/** @type {{ uid: string, label: string, media_url: string }[]} */
		tracks: [],
		/** @type {{ uid: string, image_url: string, caption: string }[]} */
		pages: [],
		excerpts: [''],
		thumb_url: '',
		preview_url: '',
		explicit: false
	};
}

/** @returns {{ nodeId: string, entry: ReturnType<typeof emptyEntry>, email: string } | null} */
function loadDraft() {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed?.nodeId) return null;
		return {
			nodeId: parsed.nodeId,
			entry: { ...emptyEntry(), ...parsed.entry },
			email: parsed.email ?? ''
		};
	} catch {
		return null;
	}
}

/**
 * Loose, matching `submissionValidation.js`'s own reasoning: strict enough
 * to catch a typo, no stricter.
 * @param {string} value
 */
function isValidEmail(value) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function createUpdateStore() {
	const draft = loadDraft();

	let nodeId = $state(draft?.nodeId ?? '');
	/**
	 * The published node as last fetched, or null before lookup / if not
	 * found locally.
	 * @type {Record<string, any> | null}
	 */
	let node = $state(null);
	let notFound = $state(false);
	let entry = $state(draft?.entry ?? emptyEntry());
	let email = $state(draft?.email ?? '');
	let rightsReaffirmed = $state(false);

	/** uids seeded from the published node, so a row added afterward reads as new work. */
	let seededTrackUids = new SvelteSet();
	let seededPageUids = new SvelteSet();

	let step = $state('identify');
	let submissionId = $state('');
	let token = $state('');
	let expiresAt = $state('');
	let verified = $state(false);
	/** Set once the (changed) `source_url` has actually been attached to this submission. */
	let sourceUrlBound = $state(false);
	/** @type {'idle' | 'issuing' | 'verifying' | 'submitting'} */
	let pending = $state('idle');
	/** @type {import('./submissionError.js').WebhookError | null} */
	let error = $state(null);
	let verifyFailure = $state('');
	let reference = $state('');

	const antiBot = createAntiBot();

	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let persistTimer;

	function persist() {
		if (!browser) return;
		clearTimeout(persistTimer);
		persistTimer = setTimeout(() => {
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodeId, entry, email }));
			} catch {
				// Private browsing, or a full quota — same posture as submissionStore.
			}
		}, PERSIST_DEBOUNCE_MS);
	}

	const entryErrors = $derived(validateEntry(entry));

	const emailError = $derived(
		email.trim()
			? isValidEmail(email.trim())
				? ''
				: 'That does not look like an email address.'
			: 'Needed so we can tell you what happened to your request.'
	);

	/**
	 * Named rather than an inline `node !== null && ...` expression directly
	 * inside `$derived(...)` — TS narrowing on `node` did not survive being
	 * written that way here (reported `node.source_url` against type
	 * `never`), the same class of svelte-check quirk `isNotUid`'s own doc
	 * comment describes elsewhere in this file. A real function body is
	 * narrowed correctly.
	 */
	function computeSourceUrlChanged() {
		if (node === null) return false;
		return entry.source_url.trim() !== node.source_url;
	}

	const sourceUrlChanged = $derived(computeSourceUrlChanged());

	/**
	 * Named rather than inline arrow functions passed to `.some()` below,
	 * and typed via `@param` on the function itself rather than a cast
	 * inside the arrow's parameter list — see `submissionStore.svelte.js`'s
	 * own `isNotUid` doc comment on why an inline `@type` cast written
	 * directly inside an arrow function's parens breaks under SSR here.
	 * @param {{ uid: string, label?: string, media_url?: string }} t
	 */
	function isNewTrack(t) {
		return !seededTrackUids.has(t.uid) && Boolean(t.label?.trim()) && Boolean(t.media_url?.trim());
	}

	/** @param {{ uid: string, image_url?: string }} p */
	function isNewPage(p) {
		return !seededPageUids.has(p.uid) && Boolean(p.image_url?.trim());
	}

	/** @param {{ label: string, media_url: string }} t */
	function seedTrack(t) {
		const r = row({ label: t.label, media_url: t.media_url });
		seededTrackUids.add(r.uid);
		return r;
	}

	/** @param {{ image_url: string, caption?: string }} p */
	function seedPage(p) {
		const r = row({ image_url: p.image_url, caption: p.caption ?? '' });
		seededPageUids.add(r.uid);
		return r;
	}

	/** Any track/page row that was not part of the published node — the thing the rights re-affirmation is scoped to. */
	const hasNewWork = $derived(entry.tracks.some(isNewTrack) || entry.pages.some(isNewPage));

	return {
		get nodeId() {
			return nodeId;
		},
		set nodeId(value) {
			nodeId = value;
		},
		get node() {
			return node;
		},
		get notFound() {
			return notFound;
		},
		get entry() {
			return entry;
		},
		get email() {
			return email;
		},
		set email(value) {
			email = value;
			persist();
		},
		get emailError() {
			return emailError;
		},
		get rightsReaffirmed() {
			return rightsReaffirmed;
		},
		set rightsReaffirmed(value) {
			rightsReaffirmed = value;
		},
		get step() {
			return step;
		},
		set step(value) {
			step = value;
		},
		get pending() {
			return pending;
		},
		get error() {
			return error;
		},
		get verifyFailure() {
			return verifyFailure;
		},
		get token() {
			return token;
		},
		get expiresAt() {
			return expiresAt;
		},
		get verified() {
			return verified;
		},
		get reference() {
			return reference;
		},
		get honeypot() {
			return antiBot.honeypot;
		},
		set honeypot(value) {
			antiBot.honeypot = value;
		},
		get entryErrors() {
			return entryErrors;
		},
		get sourceUrlChanged() {
			return sourceUrlChanged;
		},
		get hasNewWork() {
			return hasNewWork;
		},

		/** The entry exactly as it will be sent, for the review step. */
		get preview() {
			try {
				return toRingEntry(entry);
			} catch {
				return null;
			}
		},

		/** Called on first interaction, to start the dwell clock. */
		touch() {
			antiBot.touch();
			persist();
		},

		clearError() {
			error = null;
			verifyFailure = '';
		},

		/**
		 * Whether `stepId` may be considered done, for gating Continue/the
		 * progress bar's click-to-jump — same shape as
		 * `submissionStore.isStepComplete`, just against this form's own,
		 * shorter step list.
		 * @param {string} stepId
		 */
		isStepComplete(stepId) {
			if (stepId === 'identify') return Boolean(nodeId.trim());
			if (stepId === 'verify') return verified;
			if (stepId === 'edit') {
				return Object.keys(entryErrors).length === 0 && (!hasNewWork || rightsReaffirmed);
			}
			if (stepId === 'review') return Boolean(reference);
			return false;
		},

		/**
		 * Client-side lookup only — see this module's own top comment on why
		 * that is fine here. Seeds `entry` from whatever this browser has
		 * cached for `nodeId`; a miss leaves `entry` mostly blank rather than
		 * blocking anything, since the backend is the real authority.
		 * @param {Record<string, any>[]} entries
		 */
		lookup(entries) {
			const id = nodeId.trim();
			const found = entries.find((e) => e.id === id) ?? null;
			node = found;
			notFound = !found;
			if (!found) return;

			seededTrackUids = new SvelteSet();
			seededPageUids = new SvelteSet();
			entry = {
				creator: found.creator,
				type: found.type,
				why: found.why ?? '',
				has_own_site: 'yes',
				source_url: found.source_url ?? '',
				tags: [...(found.tags ?? [])],
				tracks: (found.tracks ?? []).map(seedTrack),
				pages: (found.pages ?? []).map(seedPage),
				excerpts: [...(found.excerpts ?? (found.excerpt ? [found.excerpt] : ['']))],
				thumb_url: found.thumb_url ?? '',
				preview_url: found.preview_url ?? '',
				explicit: found.explicit === true
			};
			sourceUrlBound = false;
			persist();
		},

		/**
		 * Step one: get a token to place, tied to this node id rather than a
		 * brand-new submission. The backend looks up `nodeId`'s *current*
		 * `source_url` itself; nothing about which URL to check ever comes
		 * from this call.
		 */
		async requestToken() {
			if (pending !== 'idle' || !nodeId.trim()) return;
			pending = 'issuing';
			error = null;
			verifyFailure = '';
			try {
				const result = await requestUpdateToken(nodeId.trim(), {
					website: antiBot.honeypot,
					elapsed_ms: antiBot.elapsedMs
				});
				submissionId = result.submission_id;
				token = result.verification_token;
				expiresAt = result.expires_at;
				verified = false;
			} catch (e) {
				error = /** @type {any} */ (e);
			} finally {
				pending = 'idle';
			}
		},

		async runVerify() {
			if (pending !== 'idle' || !submissionId) return;
			pending = 'verifying';
			error = null;
			verifyFailure = '';
			try {
				const result = await verify(submissionId);
				verified = result.verified;
				if (!result.verified) verifyFailure = result.reason ?? 'token_not_found';
			} catch (e) {
				error = /** @type {any} */ (e);
			} finally {
				pending = 'idle';
			}
		},

		/**
		 * Sends the change request. If `source_url` was edited away from the
		 * published value, it is attached to this submission first — reusing
		 * `bind_source_url`'s existing contract rather than a new one, the
		 * same verify-old-then-bind-new sequencing `/join`'s own
		 * site-generator branch already established. Never retried
		 * automatically, for the same reason `submissionStore.send` isn't.
		 * @param {string} [turnstileToken] Omitted when `Turnstile.svelte` isn't rendering one (`TURNSTILE_SITE_KEY` unset).
		 */
		async send(turnstileToken) {
			if (pending !== 'idle' || !verified) return;
			pending = 'submitting';
			error = null;
			try {
				if (sourceUrlChanged && !sourceUrlBound) {
					await bindSourceUrlApi(submissionId, entry.source_url.trim());
					sourceUrlBound = true;
				}
				const result = await submitUpdate({
					submission_id: submissionId,
					node_id: nodeId.trim(),
					entry: toRingEntry(entry),
					email: email.trim(),
					website: antiBot.honeypot,
					elapsed_ms: antiBot.elapsedMs,
					...(turnstileToken ? { turnstile_token: turnstileToken } : {})
				});
				reference = result.reference;
				if (browser) {
					clearTimeout(persistTimer);
					localStorage.removeItem(STORAGE_KEY);
				}
			} catch (e) {
				error = /** @type {any} */ (e);
			} finally {
				pending = 'idle';
			}
		},

		/** Used by the "start over" affordance on the success screen. */
		reset() {
			nodeId = '';
			node = null;
			notFound = false;
			entry = emptyEntry();
			email = '';
			rightsReaffirmed = false;
			seededTrackUids = new SvelteSet();
			seededPageUids = new SvelteSet();
			step = 'identify';
			submissionId = '';
			token = '';
			expiresAt = '';
			verified = false;
			sourceUrlBound = false;
			reference = '';
			error = null;
			verifyFailure = '';
			antiBot.reset();
			if (browser) {
				clearTimeout(persistTimer);
				localStorage.removeItem(STORAGE_KEY);
			}
		}
	};
}

export const updateStore = createUpdateStore();
