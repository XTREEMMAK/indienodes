#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../build', import.meta.url));
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

if (failures.length) {
	console.error(
		`Development skin laboratory leaked into production: ${[...new Set(failures)].join(', ')}`
	);
	process.exit(1);
}

console.log('Production output excludes the development skin laboratory.');
