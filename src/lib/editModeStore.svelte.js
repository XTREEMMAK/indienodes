/**
 * Whether the field view is being arranged.
 *
 * Shared rather than local to the field page because the toggle lives
 * elsewhere: in NavDrawer on desktop, in the bottom tab bar on mobile,
 * neither of which is the field page itself. Same shape as
 * `aboutModalStore` for the same reason: components that never meet need
 * one piece of state between them.
 *
 * Grouped with the theme control in both of those places rather than
 * treated as a nav destination: both change how the app behaves, while
 * every nav link changes where you are.
 *
 * Deliberately not persisted: arranging is something you finish, and coming
 * back later to find the field still in edit mode would be a small betrayal
 * of the resting state the brief asks that surface to have.
 */
function createEditModeStore() {
	let active = $state(false);

	return {
		get active() {
			return active;
		},
		toggle() {
			active = !active;
		},
		enable() {
			active = true;
		},
		disable() {
			active = false;
		}
	};
}

export const editModeStore = createEditModeStore();
