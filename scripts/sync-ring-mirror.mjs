#!/usr/bin/env node
// Refreshes this repo's committed ring.json and schema mirror from the
// canonical source, https://ring.indienodes.us.
//
// This repo no longer owns member data -- that moved to indienodes-ring
// (see docs/decisions.md, "LOCKED: ring.json is a versioned envelope, and
// the ring is being split into its own repository"). What this repo owns
// instead is a *mirror*: a committed copy good enough to build and ship even
// if the canonical endpoint is briefly unreachable at build time, refreshed
// whenever indienodes-ring publishes a change.
//
// Written byte-for-byte from the fetched response text, not re-serialized
// through JSON.stringify + a fresh prettier pass. The two repos share the
// same prettier settings for these files, so the fetched bytes are already
// canonically formatted -- re-flowing them locally only risks drifting from
// that formatting on files, the schemas especially, that were hand-authored
// with deliberate multi-line structure a fresh auto-wrap would collapse.
// (This bit a first version of this script directly: see the commit this
// comment was added in.)
//
// Schema fetched fresh every run, not from a stale local copy, so a schema
// change is validated against on the same run that would otherwise let bad
// data slip past an outdated local schema. Both schema files are also
// rewritten here, which is what keeps `validate-ring-mirror.mjs`'s
// network-free structural check honest -- it only ever compares against
// whatever this script last wrote.
//
// Fails loudly and writes nothing on any error: a fetch failure, a
// non-2xx response, malformed JSON, or a document that fails schema
// validation. The previous good mirror stays in place either way. See
// docs/decisions.md's "the app repo's build must fail loudly rather than
// ship an empty array" -- this is that guarantee's enforcement point.

import { readFileSync, writeFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const RING_ORIGIN = 'https://ring.indienodes.us';
const RING_PATH = new URL('../ring.json', import.meta.url);
const ENTRY_SCHEMA_PATH = new URL('../schema/ring.schema.json', import.meta.url);
const DOCUMENT_SCHEMA_PATH = new URL('../schema/ring-document.schema.json', import.meta.url);

/**
 * @param {string} path
 * @returns {Promise<{ text: string, parsed: unknown }>}
 */
async function fetchJson(path) {
	const url = `${RING_ORIGIN}${path}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${url}: ${response.status}`);
	}
	const text = await response.text();
	return { text, parsed: JSON.parse(text) };
}

let ring, entrySchema, documentSchema;
try {
	[ring, entrySchema, documentSchema] = await Promise.all([
		fetchJson('/ring.json'),
		fetchJson('/schema/ring-entry.json'),
		fetchJson('/schema/ring-document.json')
	]);
} catch (error) {
	console.error(`sync-ring-mirror: could not fetch from ${RING_ORIGIN}: ${error.message}`);
	console.error('The existing mirror is unchanged.');
	process.exit(1);
}

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
ajv.addSchema(entrySchema.parsed);
const validateDocument = ajv.compile(documentSchema.parsed);

if (!validateDocument(ring.parsed)) {
	console.error(`sync-ring-mirror: fetched ring.json failed schema validation:`);
	for (const error of validateDocument.errors) {
		console.error(`  ${error.instancePath || '(root)'} ${error.message}`);
	}
	console.error('The existing mirror is unchanged.');
	process.exit(1);
}

const entries = /** @type {{ entries?: unknown[] }} */ (ring.parsed).entries;
if (!Array.isArray(entries) || entries.length === 0) {
	console.error(
		'sync-ring-mirror: fetched ring.json has no entries. Refusing to mirror an empty ring ' +
			'-- this is almost certainly the canonical source being unreachable or misconfigured, ' +
			'not a real empty ring. The existing mirror is unchanged.'
	);
	process.exit(1);
}

const targets = [
	[RING_PATH, ring.text],
	[ENTRY_SCHEMA_PATH, entrySchema.text],
	[DOCUMENT_SCHEMA_PATH, documentSchema.text]
];

let changed = 0;
for (const [path, content] of targets) {
	const current = (() => {
		try {
			return readFileSync(path, 'utf8');
		} catch {
			return null;
		}
	})();
	if (current === content) continue;
	writeFileSync(path, content);
	changed++;
}

if (changed === 0) {
	console.log('sync-ring-mirror: mirror already matches the canonical source. Nothing to do.');
} else {
	console.log(
		`sync-ring-mirror: refreshed ${changed} file(s) from ${RING_ORIGIN} (${entries.length} entries).`
	);
}
