/**
 * The submission form's only contact with the outside world.
 *
 * Three actions over one webhook, discriminated by an `action` field rather
 * than split across three URLs: one CORS configuration to get right, one
 * variable to rotate, one place for the workflow to branch. See
 * `docs/submission-form-spec.md` section 7 for the contract itself.
 *
 * **`verify` deliberately sends only a `submission_id`.** The backend holds
 * the token *and the `source_url` it was issued against*, and checks that
 * stored URL. If this sent the URL alongside the request, a submitter could
 * verify a page they control and then submit a different one, and the whole
 * verification step would be decorative.
 */

import { SUBMISSION_WEBHOOK_URL } from './config.js';
import { SubmissionError } from './submissionError.js';
import * as mock from './submissionApi.mock.js';

export { SubmissionError };

/**
 * Whether a real backend is configured.
 *
 * Exported because the UI needs to say different things in the two unset
 * cases, and deriving that from a falsy check at each call site is how the
 * production case ends up silently behaving like the dev one.
 */
export const hasBackend = Boolean(SUBMISSION_WEBHOOK_URL);

/**
 * True when the form should run against canned responses.
 *
 * Dev with no webhook configured is the normal way to work on this form, so
 * it mocks. A **production** build with no webhook does not: it reports that
 * submissions are closed. That asymmetry is the point of this flag existing
 * rather than being inlined; a production build must never look like it is
 * accepting submissions it is dropping.
 */
export const useMock = import.meta.env.DEV && !hasBackend;

/** Long enough for a real reachability check, short enough to not feel hung. */
const TIMEOUT_MS = 15000;

/**
 * Posts one action and normalizes every failure mode into SubmissionError.
 *
 * A non-JSON body is treated as a failure even on a 2xx, because the most
 * likely source of one is an intermediary (a proxy error page, a CORS
 * rejection rendered as HTML) rather than the backend, and parsing it as
 * success would produce an undefined-shaped object the caller then trusts.
 * @param {string} action
 * @param {Record<string, unknown>} payload
 * @returns {Promise<Record<string, any>>}
 */
async function post(action, payload) {
	if (!hasBackend) {
		throw new SubmissionError('Submissions are closed right now.', { code: 'no_backend' });
	}

	let response;
	try {
		response = await fetch(SUBMISSION_WEBHOOK_URL, {
			method: 'POST',
			// Kept as application/json so this is always a preflighted request
			// rather than a "simple" one. The backend has to answer OPTIONS
			// either way for the JSON response to be readable cross-origin, and
			// a consistent preflight is easier to configure than two paths.
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action, ...payload }),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch (error) {
		// Network failure, CORS rejection, and timeout all land here, and the
		// browser deliberately does not distinguish CORS from offline.
		const timedOut = error instanceof Error && error.name === 'TimeoutError';
		throw new SubmissionError(
			timedOut ? 'That took too long to answer.' : 'Could not reach the submission service.',
			{ code: timedOut ? 'timeout' : 'network', retryable: true }
		);
	}

	/** @type {Record<string, any> | null} */
	let body;
	try {
		body = await response.json();
	} catch {
		body = null;
	}

	if (!response.ok || !body || body.ok === false) {
		const error = body?.error ?? {};
		throw new SubmissionError(error.message ?? 'The submission service returned an error.', {
			code: error.code ?? `http_${response.status}`,
			// 5xx and 429 are worth retrying; a 400 means the payload is wrong
			// and retrying it unchanged will fail identically.
			retryable: error.retryable ?? (response.status >= 500 || response.status === 429),
			status: response.status
		});
	}

	return body;
}

/**
 * Step one: commit to a `source_url` (or, for a creator with no site yet,
 * commit only to a `type` and get a token before one exists at all) and
 * receive a token to place.
 *
 * **`source_url: null` is the site-generator branch's whole reason for
 * existing as a separate case.** The generator's own token has to be baked
 * into the exported site *before* the creator uploads it anywhere
 * (`docs/submission-form-spec.md` section 4's six-step sequence), which
 * means there is no URL yet at the point the token is issued. `bindSourceUrl`
 * below is the second half of that: once the creator has somewhere to point
 * `source_url` at, it gets attached to this same `submission_id` rather than
 * re-running `issueToken`, which would mint a second, unrelated token.
 *
 * The honeypot and dwell values ride along from the first call onward so the
 * backend can drop an obvious bot before it ever allocates a token.
 * @param {{ source_url: string | null, type: string, website: string, elapsed_ms: number }} input
 * @returns {Promise<{ submission_id: string, verification_token: string, expires_at: string }>}
 */
export async function issueToken(input) {
	if (useMock) return mock.issueToken(input);
	const body = await post('issue_token', input);
	return {
		submission_id: body.submission_id,
		verification_token: body.verification_token,
		expires_at: body.expires_at
	};
}

/**
 * Attaches a `source_url` to a submission whose token was issued without
 * one (the site-generator branch). A separate action from `issue_token`
 * rather than allowing a second call with a URL this time, so the backend
 * can enforce "accepted once" server-side — see this file's own top
 * comment on why `verify` trusting a client-supplied URL would make
 * verification decorative; letting `issue_token` be called twice for one
 * submission would reopen exactly that hole through a side door.
 * @param {string} submissionId
 * @param {string} sourceUrl
 * @returns {Promise<{ bound: boolean }>}
 */
export async function bindSourceUrl(submissionId, sourceUrl) {
	if (useMock) return mock.bindSourceUrl();
	const body = await post('bind_source_url', {
		submission_id: submissionId,
		source_url: sourceUrl
	});
	return { bound: body.bound !== false };
}

/**
 * Step two: ask the backend to go and look for the token.
 *
 * Resolves with `verified: false` rather than throwing when the token simply
 * is not there yet. That is the expected case, not an error: the submitter is
 * still on the page and pressing Verify again is the whole retry story.
 * Throwing is reserved for not getting an answer at all.
 * @param {string} submissionId
 * @returns {Promise<{ verified: boolean, reason?: string }>}
 */
export async function verify(submissionId) {
	if (useMock) return mock.verify();
	const body = await post('verify', { submission_id: submissionId });
	return { verified: body.verified === true, reason: body.reason };
}

/**
 * Step three: hand over the entry and the review-only block.
 *
 * The caller builds `entry` with `toRingEntry`, which names its fields rather
 * than spreading form state, so nothing from `review` can reach the public
 * half by accident.
 *
 * **Never retried automatically.** A submit that times out may well have
 * succeeded, and a silent retry would create a second pending submission for
 * the same person. Retrying is offered to the submitter as a button, which
 * keeps the choice with the one party who knows whether they got a
 * confirmation.
 * @param {{ submission_id: string, entry: Record<string, any>, review: Record<string, any>, website: string, elapsed_ms: number }} input
 * @returns {Promise<{ reference: string }>}
 */
export async function submit(input) {
	if (useMock) return mock.submit(input);
	const body = await post('submit', input);
	return { reference: body.reference };
}
