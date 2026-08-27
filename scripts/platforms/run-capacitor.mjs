import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const platformRoot = join(repoRoot, 'platforms', 'capacitor');
const cli = join(repoRoot, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');
const args = process.argv.slice(2);

if (!args.length) {
	console.error('Usage: node scripts/platforms/run-capacitor.mjs <command> [...args]');
	process.exit(2);
}

const result = spawnSync(process.execPath, [cli, ...args], {
	cwd: platformRoot,
	stdio: 'inherit'
});

if (result.error) {
	console.error(`Unable to start Capacitor: ${result.error.message}`);
	process.exit(1);
}

if (result.signal) {
	console.error(`Capacitor stopped after receiving ${result.signal}.`);
	process.exit(1);
}

process.exit(result.status ?? 1);
