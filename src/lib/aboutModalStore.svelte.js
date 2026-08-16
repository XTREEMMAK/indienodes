/**
 * Shared open/close state for the About modal. Rendered once, at the root
 * layout; anything on any page (the nav link, an inline text link) can open
 * it without needing to be a parent of where it's mounted.
 */
function createAboutModalStore() {
	let open = $state(false);

	return {
		get open() {
			return open;
		},
		show() {
			open = true;
		},
		hide() {
			open = false;
		}
	};
}

export const aboutModalStore = createAboutModalStore();
