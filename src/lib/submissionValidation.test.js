/**
 * Cross-checks the hand-written client validation against the real JSON
 * schema.
 *
 * `submissionValidation.js` explains why it does not simply run Ajv in the
 * browser (roughly 120 KB shipped to every visitor so one page can check a
 * form). The cost of that choice is the risk of drift: the schema changes,
 * the hand-written rules do not, and the form starts cheerfully accepting
 * entries the publish step will reject.
 *
 * This is the mechanism that makes that safe. It compiles the actual
 * `schema/ring.schema.json` with the same Ajv configuration
 * `scripts/validate-ring.js` uses, then asserts both agree in **both**
 * directions across a table of cases: anything the form accepts must
 * validate, and anything the form rejects must either fail the schema or
 * fail a rule the schema deliberately does not encode.
 *
 * That second clause is the interesting one. A few rules exist only in the
 * form (a length cap on `why`, requiring an email) because they are product
 * decisions rather than data-integrity ones. Those cases are marked
 * `formOnly` so the test asserts the asymmetry deliberately rather than
 * papering over it.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
	ENTRY_TYPES,
	ENTRY_TYPE_LABELS,
	validateEntry,
	toRingEntry,
	validateReview,
	consentGiven
} from './submissionValidation.js';

describe('entry type labels', () => {
	it('presents the internal audio type as Music without changing its stored value', () => {
		expect(ENTRY_TYPES).toContain('audio');
		expect(ENTRY_TYPE_LABELS.audio).toBe('Music');
	});
});

const schema = JSON.parse(readFileSync('schema/ring.schema.json', 'utf8'));
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validateAgainstSchema = ajv.compile(schema);

/** The backend supplies these; the form never collects them. */
const BACKEND_FIELDS = { id: 'test-entry', verification_token: 'tok-abc123' };

/** A complete, valid form draft. Cases below vary one thing about it. */
function draft(overrides = {}) {
	return {
		creator: 'Driftwood Radio',
		type: 'text',
		why: 'A short essay about tape hiss.',
		has_own_site: 'yes',
		source_url: 'https://example.com/loose-leaf',
		tags: ['essay'],
		excerpts: ['The hiss was the point.'],
		tracks: [],
		pages: [],
		...overrides
	};
}

/**
 * Runs a draft through the form's own pipeline and then through the schema,
 * the way a real submission travels.
 * @param {Record<string, any>} entry
 */
function schemaVerdict(entry) {
	const candidate = { ...toRingEntry(entry), ...BACKEND_FIELDS };
	return validateAgainstSchema(candidate);
}

/**
 * @type {{ name: string, entry: Record<string, any>, formValid: boolean, formOnly?: boolean }[]}
 */
const cases = [
	{ name: 'a complete text entry', entry: draft(), formValid: true },
	{
		name: 'audio with no tracks (link-only member, a supported shape)',
		entry: draft({ type: 'audio', excerpts: undefined }),
		formValid: true
	},
	{
		name: 'audio with three tracks',
		entry: draft({
			type: 'audio',
			excerpts: undefined,
			tracks: [
				{ label: 'One', media_url: 'https://archive.org/1.mp3' },
				{ label: 'Two', media_url: 'https://archive.org/2.mp3' },
				{ label: 'Three', media_url: 'https://archive.org/3.mp3' }
			]
		}),
		formValid: true
	},
	{
		name: 'audio with four tracks',
		entry: draft({
			type: 'audio',
			excerpts: undefined,
			tracks: Array.from({ length: 4 }, (_, i) => ({
				label: `T${i}`,
				media_url: `https://archive.org/${i}.mp3`
			}))
		}),
		formValid: false
	},
	{
		name: 'a comic with one page',
		entry: draft({
			type: 'comic',
			excerpts: undefined,
			pages: [{ image_url: 'https://example.com/p1.png', caption: 'One' }]
		}),
		formValid: true
	},
	{
		name: 'a comic with no pages',
		entry: draft({ type: 'comic', excerpts: undefined, pages: [] }),
		formValid: false
	},
	{
		name: 'a game with a thumb',
		entry: draft({
			type: 'game',
			excerpts: undefined,
			thumb_url: 'https://example.com/shot.png'
		}),
		formValid: true
	},
	{
		name: 'a game with no thumb',
		entry: draft({ type: 'game', excerpts: undefined }),
		formValid: false
	},
	{ name: 'text with no samples', entry: draft({ excerpts: [] }), formValid: false },
	{
		name: 'text with three samples',
		entry: draft({ excerpts: ['One', 'Two', 'Three'] }),
		formValid: true
	},
	{
		name: 'text with four samples',
		entry: draft({ excerpts: ['One', 'Two', 'Three', 'Four'] }),
		formValid: false
	},
	{ name: 'no tags', entry: draft({ tags: [] }), formValid: false },
	{ name: 'tags that are only whitespace', entry: draft({ tags: ['  '] }), formValid: false },
	{
		name: 'an http source_url',
		entry: draft({ source_url: 'http://example.com/x' }),
		formValid: false
	},
	{ name: 'a nonsense source_url', entry: draft({ source_url: 'not a url' }), formValid: false },
	{
		name: 'a cover image rehosted on IndieNodes',
		entry: draft({ thumb_url: 'https://indienodes.us/cover.png' }),
		formValid: false
	},
	{
		name: 'a cover image on an IndieNodes subdomain',
		entry: draft({ thumb_url: 'https://cdn.indienodes.us/cover.png' }),
		formValid: false
	},
	{
		name: 'a cover image on a domain that merely ends in the same letters',
		entry: draft({ thumb_url: 'https://notindienodes.us/cover.png' }),
		formValid: true
	},
	{
		name: 'a track rehosted on IndieNodes',
		entry: draft({
			type: 'audio',
			excerpts: undefined,
			tracks: [{ label: 'One', media_url: 'https://indienodes.us/1.mp3' }]
		}),
		formValid: false
	},
	{ name: 'a missing creator', entry: draft({ creator: '   ' }), formValid: false },
	{
		name: 'a why longer than the cap',
		entry: draft({ why: 'x'.repeat(200) }),
		formValid: false,
		// The schema only asks for minLength 1. The cap is the form keeping
		// `why` to the one line the field is for, which is a product rule.
		formOnly: true
	},
	{
		name: 'has_own_site left unanswered',
		entry: draft({ has_own_site: '' }),
		formValid: false,
		// has_own_site never reaches the ring entry (toRingEntry never emits
		// it), so the schema has no opinion on it at all.
		formOnly: true
	},
	{
		name: 'has_own_site "no" does not require source_url up front',
		entry: draft({ has_own_site: 'no', source_url: '' }),
		// A no-site draft cannot be sent to the schema check at all yet: it
		// has no source_url, which the schema itself still requires (the
		// generator flow fills that in later, from a real uploaded site).
		// This case exists only to prove the FORM does not block on it here.
		formValid: true,
		formOnly: true
	}
];

describe('validateEntry agrees with ring.schema.json', () => {
	for (const { name, entry, formValid, formOnly } of cases) {
		it(name, () => {
			const errors = validateEntry(entry);
			expect(Object.keys(errors).length === 0, `form verdict for: ${name}`).toBe(formValid);

			// formOnly marks a case as a form-level product rule with nothing
			// for the schema to agree or disagree with, in either direction:
			// most commonly the form rejecting something the schema's silence
			// permits (why's length cap, has_own_site itself), but also, for
			// the no-site branch, the form *accepting* a draft that is not
			// schema-checkable yet at all (no source_url exists until after
			// the generator flow produces one).
			if (formOnly) return;

			if (formValid) {
				// Anything the form accepts must survive the publish step.
				const ok = schemaVerdict(entry);
				expect(
					ok,
					`schema rejected a form-accepted entry: ${JSON.stringify(validateAgainstSchema.errors)}`
				).toBe(true);
			} else {
				// And anything it rejects must be rejected downstream too,
				// otherwise the form is inventing a rule it did not declare.
				expect(schemaVerdict(entry), `schema accepted a form-rejected entry: ${name}`).toBe(false);
			}
		});
	}
});

describe('toRingEntry produces only ring-shaped fields', () => {
	it('never carries review-only data into the entry', () => {
		const out = toRingEntry({
			...draft(),
			email: 'someone@example.com',
			eula_agreement: true,
			rights_confirmation: true,
			pro_membership: 'BMI'
		});
		for (const leaked of ['email', 'eula_agreement', 'rights_confirmation', 'pro_membership']) {
			expect(out, `${leaked} must never reach the entry`).not.toHaveProperty(leaked);
		}
	});

	it('drops half-filled repeatable rows rather than emitting invalid ones', () => {
		const out = toRingEntry(
			draft({
				type: 'audio',
				excerpts: undefined,
				tracks: [
					{ label: 'Real', media_url: 'https://archive.org/a.mp3' },
					{ label: 'Abandoned', media_url: '' }
				]
			})
		);
		expect(out.tracks).toHaveLength(1);
		expect(validateAgainstSchema({ ...out, ...BACKEND_FIELDS })).toBe(true);
	});

	it('omits explicit rather than writing false', () => {
		expect(toRingEntry(draft())).not.toHaveProperty('explicit');
		expect(toRingEntry(draft({ explicit: true })).explicit).toBe(true);
	});

	it('trims whitespace the submitter did not mean to send', () => {
		const out = toRingEntry(draft({ creator: '  Driftwood  ', tags: [' essay ', '  '] }));
		expect(out.creator).toBe('Driftwood');
		expect(out.tags).toEqual(['essay']);
	});
});

describe('validateReview', () => {
	const base = { email: 'a@b.co', pro_membership: 'Not a member' };

	it('accepts a minimal valid review block', () => {
		expect(validateReview(base)).toEqual({});
	});

	it('requires an email', () => {
		expect(validateReview({ ...base, email: '' })).toHaveProperty('email');
	});

	it('requires an organization name only when "Other" is picked', () => {
		expect(validateReview({ ...base, pro_membership: 'Other' })).toHaveProperty(
			'pro_membership_name'
		);
		expect(
			validateReview({ ...base, pro_membership: 'Other', pro_membership_name: 'A local guild' })
		).toEqual({});
		expect(validateReview({ ...base, pro_membership: 'Not sure' })).toEqual({});
	});

	it('never rejects a submission for its PRO membership itself, and does not re-ask for a name a named option already gave', () => {
		for (const org of ['ASCAP', 'BMI', 'SESAC', 'GMR']) {
			expect(validateReview({ ...base, pro_membership: org })).toEqual({});
		}
		expect(
			validateReview({ ...base, pro_membership: 'Other', pro_membership_name: 'Other' })
		).toEqual({});
	});
});

describe('consentGiven', () => {
	it('is gated on the general EULA box only; rights_confirmation does not block it', () => {
		expect(consentGiven({ eula_agreement: true })).toBe(true);
		expect(consentGiven({ eula_agreement: false })).toBe(false);
		expect(consentGiven({ rights_confirmation: true, eula_agreement: false })).toBe(false);
		expect(consentGiven({ rights_confirmation: false, eula_agreement: true })).toBe(true);
		expect(consentGiven({})).toBe(false);
	});
});
