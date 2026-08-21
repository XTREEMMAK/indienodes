import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MEMBERS_DIR = fileURLToPath(new URL('../members', import.meta.url));
export const RING_PATH = fileURLToPath(new URL('../ring.json', import.meta.url));

export function memberFiles() {
	return readdirSync(MEMBERS_DIR)
		.filter((file) => file.endsWith('.json'))
		.sort();
}

export function loadMembers() {
	return memberFiles().map((file) => {
		const entry = JSON.parse(readFileSync(join(MEMBERS_DIR, file), 'utf8'));
		return { file, expectedId: basename(file, '.json'), entry };
	});
}

export function serializeRing(entries) {
	return format(JSON.stringify(entries), {
		parser: 'json',
		useTabs: true,
		printWidth: 100
	});
}
