import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MEMBERS_DIR = fileURLToPath(new URL('../members', import.meta.url));
export const RING_PATH = fileURLToPath(new URL('../ring.json', import.meta.url));

/**
 * The member files, or none.
 *
 * A missing `members/` directory means no members, not an error. Git does not
 * track empty directories, so a ring with no members has no directory at all —
 * which is the state a fresh clone of this repo is in right now, and the state
 * anyone forking it to run their own ring starts from. Without this guard both
 * `ring:build` and `validate:publish` die with ENOENT on their first run, which
 * makes an empty ring something to work around rather than something to grow
 * out of.
 *
 * Only ENOENT is swallowed. A permissions error or a file where the directory
 * should be is a real problem and still throws.
 */
export function memberFiles() {
	let files;
	try {
		files = readdirSync(MEMBERS_DIR);
	} catch (error) {
		if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return [];
		throw error;
	}
	return files.filter((file) => file.endsWith('.json')).sort();
}

export function loadMembers() {
	return memberFiles().map((file) => {
		const entry = JSON.parse(readFileSync(join(MEMBERS_DIR, file), 'utf8'));
		return { file, expectedId: basename(file, '.json'), entry };
	});
}

/**
 * The canonical on-disk form of ring.json.
 *
 * Typed because `src/lib/publishedRing.test.js` imports this module, which
 * pulls the file into svelte-check's graph — nothing under src/ referenced it
 * before, so the parameter had gone unchecked rather than been decided against.
 * @param {import('../src/lib/ring.js').RingEntry[]} entries
 */
export function serializeRing(entries) {
	return format(JSON.stringify(entries), {
		parser: 'json',
		useTabs: true,
		printWidth: 100
	});
}
