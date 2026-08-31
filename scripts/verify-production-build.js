#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../build', import.meta.url));
const builtRing = join(root, 'ring.json');
const sourceRing = fileURLToPath(new URL('../ring.json', import.meta.url));
const textExtensions = new Set(['.css', '.html', '.js', '.json']);
const forbiddenContent = ['/dev/skins', 'Skin Laboratory', 'Developer surface'];
const failures = [];

function visit(directory) {
	for (const item of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, item.name);
		const outputPath = relative(root, path);
		if (outputPath === 'dev' || outputPath.startsWith(`dev/`)) failures.push(outputPath);
		if (item.isDirectory()) {
			visit(path);
		} else if (textExtensions.has(extname(item.name))) {
			const content = readFileSync(path, 'utf8');
			if (forbiddenContent.some((value) => content.includes(value))) failures.push(outputPath);
		}
	}
}

visit(root);

// The built ring must be the repo's ring, byte for byte.
//
// `testing/scripts/seed-e2e-ring.mjs` deliberately overwrites build/ring.json
// with the five-entry e2e fixture rather than setting VITE_RING_URL, so that
// the artifact under test stays byte-identical to production in every other
// respect. The cost is that `build/` is left holding test data afterwards, and
// nothing downstream could tell: `npm run preview` serves it, and
// `desktop:assets` and the Capacitor sync copy it into a shipped client. Both
// of those run `npm run build` first, which lands here and overwrites the
// seed — so this check is what makes that ordering load-bearing instead of
// merely usual.
//
// Bytes, not parsed content: static/ring.json is a symlink to the file this
// compares against, so anything other than an exact match means something
// rewrote it, and which entries differ is not the interesting part.
try {
	if (readFileSync(builtRing, 'utf8') !== readFileSync(sourceRing, 'utf8')) {
		console.error(
			'Built ring.json does not match the repository ring.json. The build directory is ' +
				'holding data from somewhere else — most likely the e2e fixture left by ' +
				'testing/scripts/seed-e2e-ring.mjs. Re-run `npm run build`.'
		);
		process.exit(1);
	}
} catch (error) {
	console.error(`Could not compare built ring.json against the repository copy: ${error.message}`);
	process.exit(1);
}

if (failures.length) {
	console.error(
		`Development skin laboratory leaked into production: ${[...new Set(failures)].join(', ')}`
	);
	process.exit(1);
}

console.log(
	'Production output excludes the development skin laboratory and carries the real ring.'
);
