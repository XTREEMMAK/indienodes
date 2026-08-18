/**
 * The honeypot + dwell-timer pair every local webhook-backed form sends
 * along with its payload, factored out once a second and third form
 * (`/update`, `/contact`) needed the identical fields — a singleton would
 * have let one form's dwell clock leak into another's.
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
	let startedAt = 0;

	return {
		get honeypot() {
			return honeypot;
		},
		set honeypot(value) {
			honeypot = value;
		},

		/** Called on first interaction, to start the dwell clock. */
		touch() {
			if (!startedAt) startedAt = Date.now();
		},

		get elapsedMs() {
			return startedAt ? Date.now() - startedAt : 0;
		},

		reset() {
			honeypot = '';
			startedAt = 0;
		}
	};
}
