/**
 * `/contact`'s only contact with the outside world: one action, one
 * webhook, no token/verify contract — a message either sends or it
 * doesn't. See `config.js`'s `CONTACT_WEBHOOK_URL` doc comment for why this
 * is a separate webhook from the submission one rather than one more
 * `action` on it.
 */

import { CONTACT_WEBHOOK_URL } from './config.js';
import { WebhookError } from './submissionError.js';
import { postWebhook } from './webhookClient.js';
import * as mock from './contactApi.mock.js';

export { WebhookError };

/** Whether a real backend is configured. See `submissionApi.js`'s own `hasBackend` for the same reasoning. */
export const hasBackend = Boolean(CONTACT_WEBHOOK_URL);

/** True when the form should run against canned responses. See `submissionApi.js`'s own `useMock`. */
export const useMock = import.meta.env.DEV && !hasBackend;

/**
 * Sends the message. Never retried automatically, same reasoning as
 * `submissionApi.submit`: a send that timed out may well have gone
 * through, and a silent retry would risk a duplicate.
 * @param {{ name: string, email: string, message: string, website: string, elapsed_ms: number, turnstile_token?: string }} input
 * @returns {Promise<{ reference: string }>}
 */
export async function send(input) {
	if (useMock) return mock.send(input);
	if (!hasBackend) {
		throw new WebhookError('The contact form is closed right now.', { code: 'no_backend' });
	}
	const body = await postWebhook(CONTACT_WEBHOOK_URL, input);
	return { reference: body.reference };
}
