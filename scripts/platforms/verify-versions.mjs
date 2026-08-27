import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const rootPackage = await readJson(join(repoRoot, 'package.json'));
const capacitorPackage = await readJson(join(repoRoot, 'platforms/capacitor/package.json'));
const wailsConfig = await readJson(join(repoRoot, 'platforms/wails/wails.json'));
const androidGradle = await readFile(
	join(repoRoot, 'platforms/capacitor/android/app/build.gradle'),
	'utf8'
);
const androidVersion = androidGradle.match(/\bversionName\s+["']([^"']+)["']/)?.[1];

const expectedVersion = rootPackage.version;
const versionChecks = {
	'Capacitor host package': capacitorPackage.version,
	'Android versionName': androidVersion,
	'Wails productVersion': wailsConfig.info?.productVersion
};

const failures = [];
for (const [label, actual] of Object.entries(versionChecks)) {
	if (actual !== expectedVersion) {
		failures.push(`${label} is ${actual ?? 'missing'}; expected ${expectedVersion}.`);
	}
}

const capacitorVersions = {
	'@capacitor/core': rootPackage.dependencies?.['@capacitor/core'],
	'@capacitor/android': rootPackage.dependencies?.['@capacitor/android'],
	'@capacitor/cli': rootPackage.devDependencies?.['@capacitor/cli']
};
const normalizedCapacitorVersions = new Set(
	Object.values(capacitorVersions).map((value) => value?.replace(/^[~^]/, ''))
);
if (normalizedCapacitorVersions.size !== 1 || normalizedCapacitorVersions.has(undefined)) {
	failures.push(`Capacitor packages must use one version: ${JSON.stringify(capacitorVersions)}.`);
}

if (failures.length) {
	for (const failure of failures) console.error(failure);
	process.exit(1);
}

console.log(
	`Native metadata matches IndieNodes ${expectedVersion}; Capacitor packages are aligned at ${[...normalizedCapacitorVersions][0]}.`
);
