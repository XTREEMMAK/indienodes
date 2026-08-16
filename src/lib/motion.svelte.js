import { browser } from '$app/environment';

/**
 * Shared reactive `prefers-reduced-motion` reader. Svelte's transition
 * directives do not consult this on their own, so anything animating
 * (page transitions, modals) reads `reducedMotion.current` and zeroes out
 * its own durations rather than skipping the check.
 */
function createReducedMotion() {
	const query = browser ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
	let reduced = $state(query?.matches ?? false);

	query?.addEventListener('change', () => {
		reduced = query.matches;
	});

	return {
		get current() {
			return reduced;
		}
	};
}

export const reducedMotion = createReducedMotion();
