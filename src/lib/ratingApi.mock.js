/**
 * Canned rating backend for `npm run dev` with no `VITE_RATING_WEBHOOK_URL`
 * configured, mirroring `contactApi.mock.js`'s shape so the prompt can be
 * exercised end to end without standing up a workflow.
 */

import { WebhookError } from './submissionError.js';

/**
 * Matches the real client's shape: resolves with nothing on success.
 * @param {{ rating: number, website: string, elapsed_ms: number }} input
 * @returns {Promise<void>}
 */
export async function submitRating(input) {
	await new Promise((resolve) => setTimeout(resolve, 400));
	if (!Number.isInteger(input?.rating) || input.rating < 1 || input.rating > 5) {
		throw new WebhookError('That rating is not valid.', { code: 'invalid_rating' });
	}
	console.info('[ratingApi.mock] rating received', input.rating);
}
