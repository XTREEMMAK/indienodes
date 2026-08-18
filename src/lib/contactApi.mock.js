/**
 * Canned backend for `/contact`, used in dev when no webhook is configured
 * — same reasoning and `?mock=` vocabulary as `submissionApi.mock.js`, but
 * only the states that make sense for a single fire-and-forget post (no
 * `fail-verify`/`unreachable`: there is no verify step here to fail).
 *
 *   /contact?mock=network        Fails as a network error
 *   /contact?mock=rate-limited   Fails as a 429
 *   /contact?mock=slow           Takes 6s, for testing the pending state
 */

import { WebhookError } from './submissionError.js';

const LATENCY_MS = 600;

/** @returns {string} */
function mode() {
	if (typeof window === 'undefined') return '';
	return new URLSearchParams(window.location.search).get('mock') ?? '';
}

/** @param {number} ms */
function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {Record<string, any>} input
 */
export async function send(input) {
	await wait(mode() === 'slow' ? 6000 : LATENCY_MS);

	if (mode() === 'network') {
		throw new WebhookError('Could not reach the contact service.', {
			code: 'network',
			retryable: true
		});
	}
	if (mode() === 'rate-limited') {
		throw new WebhookError('Too many messages from here. Try again in a few minutes.', {
			code: 'rate_limited',
			retryable: true,
			status: 429
		});
	}

	console.info('[mock] contact payload', input);
	return { reference: `MOCK-MSG-${Math.random().toString(36).slice(2, 8).toUpperCase()}` };
}
