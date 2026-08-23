// Separate build for the embeddable widget (src/widget). It compiles to a
// standalone custom element bundle, not a SvelteKit route, so it needs its
// own entry point and its own `customElement: true` compiler option; the
// main vite.config.js compiles ordinary Svelte components for the app.
//
// Output goes straight into static/, so the main `vite build` (adapter-static)
// picks it up and serves it at /embed.js alongside ring.json. Run this before
// the main build; `npm run build` and `npm run dev` both do this already.
import { copyFile } from 'node:fs/promises';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

/**
 * The widget ships at two URLs, and the distinction matters because this file
 * runs on other people's sites.
 *
 * `/embed.v1.js` is the canonical snippet handed out on /join and /widget. A
 * member who pastes it is pinned to the v1 contract (the `indienode-widget`
 * tag name, its attributes, its behaviour), so a future breaking change can
 * ship as `/embed.v2.js` without reaching into every site that ever embedded
 * this one.
 *
 * `/embed.js` stays as "latest" for anyone who deliberately wants to track
 * it, and for the snippets already pasted before versioning existed.
 *
 * Today they are byte-identical, which is the point: the option costs nothing
 * until it is needed, and it cannot be added retroactively once members have
 * the unversioned URL in their markup.
 */
const WIDGET_MAJOR = 'v1';

export default defineConfig({
	plugins: [
		// The main `npm run check` cannot see this option, so it warns that
		// Widget.svelte uses `<svelte:options customElement>` without it. That
		// warning is about the checker's scope, not the code, and is silenced
		// by name in the `check` script rather than by excluding src/widget/
		// from checking altogether.
		svelte({ compilerOptions: { customElement: true } }),
		{
			name: 'indienode-widget-versioned-copy',
			async writeBundle() {
				await copyFile('static/embed.js', `static/embed.${WIDGET_MAJOR}.js`);
			}
		}
	],
	build: {
		outDir: 'static',
		emptyOutDir: false,
		lib: {
			entry: 'src/widget/embed.js',
			formats: ['es'],
			fileName: () => 'embed.js'
		}
	}
});
