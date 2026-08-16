/**
 * The submission flow's error type, in its own module so that
 * `submissionApi.js` and `submissionApi.mock.js` can both throw it without
 * importing each other.
 *
 * The mock has to raise errors indistinguishable from the real client's, or
 * the failure branches it exists to exercise would be testing different code
 * than production runs. Since the real client is what imports the mock, the
 * shared type cannot live in either of them without a cycle.
 */
export class SubmissionError extends Error {
	/**
	 * @param {string} message Shown to the submitter as-is, so it is written
	 *   for them rather than for a log.
	 * @param {{ code?: string, retryable?: boolean, status?: number }} [meta]
	 */
	constructor(message, meta = {}) {
		super(message);
		this.name = 'SubmissionError';
		/** Machine-readable, for branching. */
		this.code = meta.code ?? 'unknown';
		/** Whether offering a retry button is honest. */
		this.retryable = meta.retryable ?? false;
		/** 0 when the request never got a response at all. */
		this.status = meta.status ?? 0;
	}
}
