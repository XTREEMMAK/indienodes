/** @type {import('../../contracts.js').UiSkinManifest} */
const manifest = {
	id: 'glassmorphic',
	label: 'Glassmorphic',
	description: 'Translucent panels, soft borders, and depth over the ambient field.',
	category: 'ui',
	// The default stylesheet is imported by app.css so it is present during
	// server rendering and before hydration. Non-default UI skins load their
	// scoped styles from their own manifest.
	load: async () => {}
};

export default manifest;
