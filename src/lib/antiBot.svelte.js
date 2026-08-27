/**
 * The honeypot + dwell-timer pair every local webhook-backed form sends
 * along with its payload, factored out once a second and third form
 * (`/update`, `/contact`) needed the identical fields — a singleton would
 * have let one form's dwell clock leak into another's.
 *
 * The clock begins when the form store is created, matching the backend
 * contract's "time since the form was rendered." Starting only on field
 * input breaks restored drafts: someone can click through already-filled
 * steps without firing an input event, which used to send elapsed_ms: 0
 * and make n8n silently bot-drop a legitimate token request.
 */

/**
 * @returns {{
 *   honeypot: string,
 *   touch(): void,
 *   elapsedMs: number,
 *   reset(): void
 * }}
 */
export function createAntiBot() {
	let honeypot = $state('');
	let startedAt = Date.now();

	return {
		get honeypot() {
			return honeypot;
		},
		set honeypot(value) {
			honeypot = value;
		},

		/**
		 * Retained as the form stores' interaction hook. The dwell clock
		 * already runs from creation; calling this must not restart it.
		 */
		touch() {},

		get elapsedMs() {
			return Math.max(0, Date.now() - startedAt);
		},

		reset() {
			honeypot = '';
			startedAt = Date.now();
		}
	};
}
