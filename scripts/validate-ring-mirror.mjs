#!/usr/bin/env node
// Structural check on the committed ring.json mirror, with no network
// access -- deliberately separate from sync-ring-mirror.mjs, which fetches.
//
// This runs in ci.yml on every push and PR, so it has to be fast and cannot
// depend on ring.indienodes.us being reachable at that moment: this repo's
// own CI reliability should not be coupled to another repo's endpoint uptime.
// Freshness (does the mirror match the canonical source right now) is
// sync-ring-mirror.mjs's job, run separately on repository_dispatch from
// indienodes-ring publishing a change. This script only asks "is what's
// already committed here well-formed," against whatever schema
// sync-ring-mirror.mjs last wrote alongside it.

import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const RING_PATH = new URL('../ring.json', import.meta.url);
const ENTRY_SCHEMA_PATH = new URL('../schema/ring.schema.json', import.meta.url);
const DOCUMENT_SCHEMA_PATH = new URL('../schema/ring-document.schema.json', import.meta.url);

const ring = JSON.parse(readFileSync(RING_PATH, 'utf8'));
const entrySchema = JSON.parse(readFileSync(ENTRY_SCHEMA_PATH, 'utf8'));
const documentSchema = JSON.parse(readFileSync(DOCUMENT_SCHEMA_PATH, 'utf8'));

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
ajv.addSchema(entrySchema);
const validateDocument = ajv.compile(documentSchema);

if (!validateDocument(ring)) {
	console.error('validate-ring-mirror: ring.json does not match the envelope schema:');
	for (const error of validateDocument.errors) {
		console.error(`  ${error.instancePath || '(root)'} ${error.message}`);
	}
	process.exit(1);
}

if (!Array.isArray(ring.entries) || ring.entries.length === 0) {
	console.error('validate-ring-mirror: ring.json has no entries.');
	process.exit(1);
}

console.log(`validate-ring-mirror: ring.json is valid, ${ring.entries.length} entries.`);
