/**
 * The one-time app rating's only contact with the outside world: one webhook,
 * no `action` field, no token contract — the same shape as `contactApi.js`,
 * because the webhook does exactly one thing.
 *
 * What is deliberately NOT sent: any identifier, anonymous or otherwise. The
 * brief rules one out and nothing here needs one — localStorage already
 * prevents a second prompt on this device, which is the only job an id would
 * have done. No visitor id, no session id, no fingerprint, no referrer, and no
 * record of anything the visitor looked at.
 */

import { RATING_WEBHOOK_URL } from './config.js';
// Named import, not the default, for the reason AboutModal.svelte spells out:
// `import pkg from package.json` ships the whole file — every script and every
// dependency — to visitors for one string. A named import tree-shakes to it.
import { version } from '../../package.json';
import { WebhookError } from './submissionError.js';
import { postWebhook } from './webhookClient.js';
import * as mock from './ratingApi.mock.js';

export { WebhookError };

/** Whether a real backend is configured. See `submissionApi.js`'s own `hasBackend`. */
export const hasBackend = Boolean(RATING_WEBHOOK_URL);

/** True when the prompt should run against canned responses. See `submissionApi.js`'s own `useMock`. */
export const useMock = import.meta.env.DEV && !hasBackend;

/**
 * Sends the rating. Never retried automatically, same reasoning as the other
 * two clients: a send that timed out may well have arrived, and this is not
 * worth a duplicate.
 *
 * The caller marks the prompt answered BEFORE calling this, so a rejection
 * here cannot bring the dialog back. A rating that fails to send is simply
 * lost, which is the correct trade for something nobody is waiting on.
 * @param {{ rating: number, website: string, elapsed_ms: number }} input
 * @returns {Promise<void>}
 */
export async function submitRating(input) {
	if (useMock) return mock.submitRating(input);
	if (!hasBackend) {
		throw new WebhookError('Ratings are not being collected right now.', {
			code: 'no_backend'
		});
	}
	await postWebhook(RATING_WEBHOOK_URL, {
		rating: input.rating,
		submitted_at: new Date().toISOString(),
		app_version: version,
		website: input.website,
		elapsed_ms: input.elapsed_ms
	});
}
