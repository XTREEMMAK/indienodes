import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const platformRoot = resolve(repoRoot, 'platforms/wails');
const args = process.argv.slice(2);
const executable = process.platform === 'win32' ? 'wails.exe' : 'wails';

if (!args.length) {
	console.error('Usage: node scripts/platforms/run-wails.mjs <command> [...args]');
	process.exit(2);
}

const result = spawnSync(executable, args, {
	cwd: platformRoot,
	stdio: 'inherit'
});

if (result.error?.code === 'ENOENT') {
	console.error(
		'Wails v2 is not installed. Install Go and then run: ' +
			'go install github.com/wailsapp/wails/v2/cmd/wails@v2.13.0'
	);
	process.exit(1);
}

if (result.error) {
	console.error(`Unable to start Wails: ${result.error.message}`);
	process.exit(1);
}

process.exit(result.status ?? 1);
