import { describe, expect, it } from 'vitest';
import { KOFI_URL, RING_REPO_URL } from './config.js';

/**
 * Optional build-time links are absent when unset, never half-configured.
 *
 * Both of these follow the same posture, stated in `config.js` and in
 * `.env.example`: unset means the feature is simply not there, rather than a
 * control that renders and leads nowhere. The About modal drops its Support
 * tab without `KOFI_URL`; `/join` says only that submissions are not open here
 * without `RING_REPO_URL`.
 *
 * The failure this guards against is a default that looks helpful and is
 * wrong. `RING_REPO_URL` is the sharper case: falling back to this codebase's
 * own repository would point a fork's would-be member at *somebody else's
 * ring*, and it would look like it was working. An empty string is the only
 * safe default, and `??` would have quietly reintroduced the bad one — an
 * empty env var is a string, not nullish, so only `||` collapses it here.
 *
 * These assertions hold because the test environment sets neither variable. A
 * deployment that sets them is exercising the other branch, which is one
 * interpolation with nothing to get wrong.
 */
describe('optional build-time links default to absent', () => {
	it.each([
		['KOFI_URL', KOFI_URL],
		['RING_REPO_URL', RING_REPO_URL]
	])('%s is an empty string when unset', (_name, value) => {
		expect(value).toBe('');
	});

	it('never falls back to the upstream repository for the ring repo', async () => {
		// The two are deliberately different things: GITHUB_URL is the codebase's
		// own home and is right to hardcode; the ring repo is per-deployment.
		const { GITHUB_URL } = await import('./config.js');
		expect(RING_REPO_URL).not.toBe(GITHUB_URL);
	});
});
