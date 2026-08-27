import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const source = join(repoRoot, 'build');
const platformRoot = join(repoRoot, 'platforms', 'wails');
const target = join(platformRoot, 'frontend', 'dist');

if (!target.startsWith(`${platformRoot}${sep}`)) {
	throw new Error(`Refusing to write outside the Wails platform directory: ${target}`);
}

try {
	await stat(join(source, 'index.html'));
} catch {
	throw new Error('The web build is missing. Run npm run build before syncing Wails assets.');
}

await rm(target, { recursive: true, force: true });
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });

try {
	await stat(join(target, 'index.html'));
} catch {
	throw new Error('Wails asset synchronization did not produce frontend/dist/index.html.');
}

console.log(`Copied the shared SvelteKit build to ${target}.`);
