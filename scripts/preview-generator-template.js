#!/usr/bin/env node
// Renders the site-generator templates (src/lib/generator/templates/*) to
// real files on disk and serves them, so a template's actual HTML/CSS/JS
// can be opened in a browser and read directly instead of squinted at
// through template-literal string escapes in a .js source file.
//
// The templates are plain `render(data) -> {html, css, js}` functions by
// design (see templates/shared.js's own doc comment): preview and export
// share one code path so they cannot drift. This script is a second
// *consumer* of that same contract, not a second implementation of it — it
// never re-derives what a template produces, only writes what render()
// already returned to disk.
//
//   node scripts/preview-generator-template.js                  watch, all four types
//   node scripts/preview-generator-template.js audio            watch, one type
//   node scripts/preview-generator-template.js audio late-signal
//   node scripts/preview-generator-template.js audio late-signal --long
//   node scripts/preview-generator-template.js --once           render once and exit, no server
//
// **A single long-lived process, not `node --watch`.** An earlier version
// used `node --watch` to restart this whole script on every file change.
// That looped from the moment it started, with no editing required: every
// `vite.createServer()` call (even one immediately closed) loads this
// project's real vite.config.js through Vite's own config loader, which
// writes a uniquely-named temp file under `<node_modules>/.vite-temp/`,
// natively `import()`s it, then deletes it milliseconds later. Node's
// `--watch` mode has no `node_modules` exclusion (checked directly against
// its source) and registers that native import, so the immediate delete
// reads as a change — which restarts the script, which calls
// `createServer()` again, which writes a *new* uniquely-hashed temp file,
// forever. Restarting the whole process was never going to be the right
// mechanism for this anyway: `shell.html`/`styles.css`/`decorative.js`/
// `index.js` are all loaded through Vite's own in-process SSR evaluator,
// not Node's native module loader, so `node --watch`'s dependency tracking
// never actually covered a template edit even when it wasn't looping.
//
// The fix is structural, not a workaround: create the Vite dev server
// exactly once, keep it open for this process's whole lifetime, and use
// **Vite's own file watcher** (`vite.watcher`, the same chokidar instance
// Vite's own dev server relies on internally) to react to changes,
// re-rendering in-process rather than restarting anything. `configFile:
// false` skips loading vite.config.js altogether — the templates only ever
// use plain relative imports, never SvelteKit's `$lib`/`$app` aliases, so
// nothing here needs that file, and skipping it removes the temp-file
// dance this bug came from rather than just making it rare.

import { createServer } from 'node:http';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const TEMPLATES_DIR = fileURLToPath(new URL('../src/lib/generator/templates/', import.meta.url));
const OUT_ROOT = fileURLToPath(new URL('../.generator-preview/', import.meta.url));
const ASSET_ROOT = fileURLToPath(new URL('../testing/generator-assets/', import.meta.url));
const PORT = Number(process.env.PORT) || 4175;

const args = process.argv.slice(2);
const once = args.includes('--once');
const useLongFixtures = args.includes('--long');
const [typeArg, templateIdArg] = args.filter((a) => !a.startsWith('--'));

const vite = await createViteServer({
	configFile: false,
	root: PROJECT_ROOT,
	// A dedicated cache dir, not the project's default `node_modules/.vite`:
	// that default is shared with `npm run dev`'s own Vite instance, and two
	// independent Vite servers writing to the same dependency-optimization
	// cache stomp on each other's `?v=` hashes — this server re-optimizing
	// anything rewrites the shared metadata file, which invalidates hashes
	// the *other* server already handed out to a real browser tab, and shows
	// up there as "Outdated Optimize Dep" / "Failed to fetch dynamically
	// imported module" for something this script never even touched (jszip,
	// say, which nothing under templates/ imports). Isolating the cache
	// directory is what actually stops the cross-contamination, not just
	// masks one occurrence of it.
	cacheDir: fileURLToPath(new URL('../node_modules/.vite-generator-preview/', import.meta.url)),
	server: { middlewareMode: true },
	appType: 'custom',
	logLevel: 'error'
});

/** Re-runs on every render: `ssrLoadModule` re-evaluates fresh content for
 *  whatever Vite's own watcher has already invalidated in the module graph
 *  by the time a `change` event reaches this script's own listener below —
 *  no manual `moduleGraph.invalidateModule` call needed. */
async function loadRegistry() {
	return vite.ssrLoadModule('/src/lib/generator/registry.js');
}

let { TEMPLATES, loadTemplate } = await loadRegistry();

if (typeArg && !TEMPLATES[typeArg]) {
	console.error(`Unknown type "${typeArg}". Expected one of: ${Object.keys(TEMPLATES).join(', ')}`);
	await vite.close();
	process.exit(1);
}

/** Writes one template's {html, css, js} as real, separately-openable files. */
async function renderOne(type, entry, data) {
	const dir = join(OUT_ROOT, type, entry.id);
	await mkdir(dir, { recursive: true });
	const template = await loadTemplate(type, entry.id);
	if (!template) throw new Error(`Could not load template "${type}/${entry.id}".`);
	const { html, css, js } = template.render(data);
	const liveReload = `<script>
const events = new EventSource('/__generator_events');
events.addEventListener('reload', () => location.reload());
</script>`;
	const previewHtml = html.includes('</body>')
		? html.replace('</body>', `${liveReload}</body>`)
		: `${html}\n${liveReload}`;
	await writeFile(join(dir, 'index.html'), previewHtml, 'utf-8');
	await writeFile(join(dir, 'styles.css'), css, 'utf-8');
	await writeFile(join(dir, 'script.js'), js, 'utf-8');
}

/** A root index linking every rendered variant, so nothing has to be typed by hand. */
async function renderIndex(rendered) {
	const items = rendered
		.map(
			({ type, id, label }) =>
				`<li><a href="/${type}/${id}/">${label}</a> <span class="type">${type}</span></li>`
		)
		.join('\n');
	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Generator template preview</title>
<style>
	body { font: 15px/1.5 system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1.5rem; }
	h1 { font-size: 1.25rem; }
	ul { list-style: none; padding: 0; }
	li { display: flex; justify-content: space-between; padding: 0.6rem 0; border-bottom: 1px solid #ddd; }
	a { color: inherit; }
	.type { color: #888; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em; }
</style>
</head>
<body>
<h1>Generator template preview</h1>
<p>Reflects the last successful render. Edit a template file and save; this updates within a moment.</p>
<ul>${items}</ul>
</body>
</html>`;
	await writeFile(join(OUT_ROOT, 'index.html'), html, 'utf-8');
}

async function renderAll() {
	const { FIXTURES, LONG_FIXTURES } = await vite.ssrLoadModule(
		'/src/lib/generator/templates/fixtures.js'
	);
	const fixtures = useLongFixtures ? LONG_FIXTURES : FIXTURES;
	await rm(OUT_ROOT, { recursive: true, force: true });
	const rendered = [];
	const types = typeArg ? [typeArg] : Object.keys(TEMPLATES);
	for (const type of types) {
		const list = templateIdArg
			? TEMPLATES[type].filter((t) => t.id === templateIdArg)
			: TEMPLATES[type];
		for (const entry of list) {
			await renderOne(type, entry, fixtures[type]);
			rendered.push({ type, id: entry.id, label: entry.label });
		}
	}
	await renderIndex(rendered);
	return rendered;
}

function printSummary(rendered) {
	console.log(`Rendered ${rendered.length} template(s):`);
	for (const { type, id, label } of rendered) {
		console.log(`  http://localhost:${PORT}/${type}/${id}/  (${label})`);
	}
}

let rendered = await renderAll();

if (once) {
	printSummary(rendered);
	await vite.close();
	process.exit(0);
}

const MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.wav': 'audio/wav'
};

const liveReloadClients = new Set();
const server = createServer(async (req, res) => {
	let path = decodeURIComponent(new URL(req.url ?? '/', `http://localhost:${PORT}`).pathname);
	if (path === '/__generator_events') {
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		});
		res.write(': connected\n\n');
		liveReloadClients.add(res);
		req.on('close', () => liveReloadClients.delete(res));
		return;
	}
	let root = OUT_ROOT;
	if (path.startsWith('/__generator_assets/')) {
		root = ASSET_ROOT;
		path = path.slice('/__generator_assets'.length);
	}
	if (path.endsWith('/')) path += 'index.html';

	const filePath = join(root, path);
	if (!filePath.startsWith(root)) {
		res.writeHead(403).end('Forbidden');
		return;
	}

	res.setHeader('Content-Type', MIME_TYPES[extname(filePath)] ?? 'application/octet-stream');
	const stream = createReadStream(filePath);
	stream.on('error', () => res.writeHead(404).end('Not found'));
	stream.pipe(res);
});

server.listen(PORT, () => {
	printSummary(rendered);
	console.log(`\nIndex: http://localhost:${PORT}/`);
	console.log('Watching src/lib/generator/templates/ for changes. Ctrl-C to stop.');
});

// Vite's own watcher covers the whole project by default; react only to
// paths under templates/ rather than reconfiguring what it watches. This
// script's own writes to OUT_ROOT (a sibling of src/, not excluded from
// Vite's default watch root) do fire these same events, but the prefix
// check below rejects them — no feedback loop, by construction.
/** @type {ReturnType<typeof setTimeout> | undefined} */
let debounceTimer;
function scheduleRerender(changedPath) {
	if (!changedPath.startsWith(TEMPLATES_DIR)) return;
	clearTimeout(debounceTimer);
	// 200ms mirrors Node's own internal watch-mode debounce window: enough
	// to coalesce the several filesystem events one editor save can produce
	// without adding noticeable latency to seeing a change reflected.
	debounceTimer = setTimeout(async () => {
		try {
			({ TEMPLATES, loadTemplate } = await loadRegistry());
			rendered = await renderAll();
			printSummary(rendered);
			for (const client of liveReloadClients) client.write('event: reload\ndata: updated\n\n');
			console.log('');
		} catch (err) {
			// A bad in-progress edit must not take down the dev server —
			// log it and keep serving the last good render.
			console.error('Re-render failed, still serving the last good output:');
			console.error(err);
		}
	}, 200);
}
vite.watcher.on('change', scheduleRerender);
vite.watcher.on('add', scheduleRerender);
vite.watcher.on('unlink', scheduleRerender);

async function shutdown() {
	clearTimeout(debounceTimer);
	for (const client of liveReloadClients) client.end();
	await vite.close();
	await new Promise((resolve) => server.close(resolve));
	process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
