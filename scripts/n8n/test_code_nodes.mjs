/**
 * Runs the generated Code-node JS in a sandbox that mimics n8n's.
 *
 * n8n's Code sandbox is narrower than Node: URL, URLSearchParams, crypto,
 * fetch and process are all absent (measured 2026-08-22). A `new URL()` buried
 * in a try/catch therefore fails silently rather than loudly, which is exactly
 * how the live Review Action has been dropping creator_id on every approval.
 * These tests deny those globals so that class of bug fails here, in a second,
 * rather than after a push and a round-trip through a webhook.
 *
 *   node scripts/n8n/test_code_nodes.mjs
 */
import { execFileSync } from 'node:child_process';

const DENIED = ['URL', 'URLSearchParams', 'crypto', 'fetch', 'process', 'require', 'globalThis'];

function extract(builder, nodeName) {
	const out = execFileSync(
		'python3',
		[
			'-c',
			`
import json, importlib.util, pathlib
spec = importlib.util.spec_from_file_location("g", "scripts/n8n/build_workflows.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
wf = dict(m.BUILDERS)["${builder}"]({})
print(json.dumps([n["parameters"]["jsCode"] for n in wf["nodes"] if n["name"] == "${nodeName}"][0]))
`
		],
		{ encoding: 'utf8' }
	);
	return JSON.parse(out);
}

function run(js, json, helpers = {}) {
	const $input = { first: () => ({ json }), all: () => [{ json }] };
	const $ = (name) => ({ item: { json: helpers[name] ?? {} } });
	// Shadow the denied globals with throwing getters so any use is a hard error.
	const shadow = DENIED.map(
		(g) =>
			`const ${g} = new Proxy({}, { get(){ throw new ReferenceError("${g} is not defined"); }, apply(){ throw new ReferenceError("${g} is not defined"); } });`
	).join('\n');
	return new Function('$input', '$json', '$', `${shadow}\n${js}`)($input, json, $);
}

let pass = 0,
	fail = 0;
const check = (label, got, want) => {
	const ok = got === want;
	ok ? pass++ : fail++;
	if (!ok)
		console.log(`  FAIL ${label}\n       got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

// --- Every Code node must at least parse ------------------------------------
// A generated node with a JS syntax error is accepted by the n8n API, saved,
// activated, and only fails when someone triggers it -- and because a Code node
// has no error output wired, the run aborts before any Respond node, so the
// caller gets a blank page with no clue. That is exactly how a literal newline
// inside a string literal reached production here: Python expanded \n in a
// non-raw builder string, and the node was never in this file's test list.
// Checking all of them costs milliseconds and catches the whole class.
function allCodeNodes() {
	const out = execFileSync(
		'python3',
		[
			'-c',
			`
import json, importlib.util
spec = importlib.util.spec_from_file_location("g", "scripts/n8n/build_workflows.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
rows = []
for name, b in m.BUILDERS:
    wf = b({})
    for n in wf["nodes"]:
        if n["type"] == "n8n-nodes-base.code":
            rows.append([name, n["name"], n["parameters"]["jsCode"]])
print(json.dumps(rows))
`
		],
		{ encoding: 'utf8', maxBuffer: 1 << 24 }
	);
	return JSON.parse(out);
}

for (const [wfName, nodeName, js] of allCodeNodes()) {
	let err = null;
	try {
		new Function(js);
	} catch (e) {
		err = e.message;
	}
	check(`parses: ${wfName} / ${nodeName}`, err, null);
}

// --- Re-verify: URL validation ---------------------------------------------
const validate = extract('reverify-token', 'validate url + expiry');
const FUT = new Date(Date.now() + 12 * 3600e3).toISOString();
const PAST = new Date(Date.now() - 3600e3).toISOString();

const reason = (url, exp = FUT) => {
	const r = run(validate, { source_url: url, verification_token: 'tok', expires_at: exp });
	return r[0].json.proceed === 'yes' ? 'ok' : r[0].json.reason;
};

const cases = [
	['https://example.com/', 'ok'],
	['http://example.com/x?y=1', 'ok'],
	['https://sub.example.co.uk:8443/p', 'ok'],
	['https://n8n.kjnet.us/webhook/abc?tok=x', 'ok'],
	['https://localhost/', 'unsafe_url'],
	['https://foo.localhost/', 'unsafe_url'],
	['https://x.internal/', 'unsafe_url'],
	['http://127.0.0.1/', 'unsafe_url'],
	['http://127.1.2.3/', 'unsafe_url'],
	['http://10.0.0.1/', 'unsafe_url'],
	['http://172.20.1.1/', 'unsafe_url'],
	['http://172.15.1.1/', 'ok'],
	['http://192.168.0.1/', 'unsafe_url'],
	['http://169.254.169.254/latest/', 'unsafe_url'],
	['http://100.64.0.1/', 'unsafe_url'],
	['http://0.0.0.0/', 'unsafe_url'],
	['http://224.0.0.1/', 'unsafe_url'],
	['http://[::1]/', 'unsafe_url'],
	['http://[fe80::1]/', 'unsafe_url'],
	['http://[fc00::1]/', 'unsafe_url'],
	['http://[::ffff:127.0.0.1]/', 'unsafe_url'],
	['http://2130706433/', 'unsafe_url'],
	['http://0x7f000001/', 'unsafe_url'],
	['http://0177.0.0.1/', 'unsafe_url'],
	['file:///etc/passwd', 'unsafe_url'],
	['gopher://evil/', 'unsafe_url'],
	['javascript:alert(1)', 'unsafe_url'],
	['https://user:pw@example.com/', 'unsafe_url'],
	['https://evil.com\\@good.com/', 'unsafe_url'],
	['https://exa mple.com/', 'unsafe_url'],
	['https://éxample.com/', 'unsafe_url'],
	['', 'unsafe_url'],
	['not-a-url', 'unsafe_url'],
	['https://metadata.google.internal/', 'unsafe_url']
];
for (const [url, want] of cases) check(`validate ${JSON.stringify(url)}`, reason(url), want);
check('validate expired', reason('https://example.com/', PAST), 'expired');
check('validate missing expires_at', reason('https://example.com/', ''), 'expired');
check('validate garbage expires_at', reason('https://example.com/', 'nope'), 'expired');

// --- Re-verify: response classification ------------------------------------
const classify = extract('reverify-token', 'check meta tag');
// statusCode now comes from the fetch node by reference, because the html node
// replaces the item with its extraction.
const cl = (j, status = j.statusCode) =>
	run(classify, j, {
		'validate url + expiry': { token: 'TOK1' },
		'fetch source_url': status === undefined ? {} : { statusCode: status }
	})[0].json;

check(
	'classify passthrough',
	cl({ proceed: 'no', matched: 'no', reason: 'expired' }).reason,
	'expired'
);
check('classify 302', cl({ statusCode: 302, body: '' }).reason, 'redirect');
check('classify 404', cl({ statusCode: 404, body: '' }).reason, 'unreachable');
check('classify 500', cl({ statusCode: 500, body: '' }).reason, 'unreachable');
// The html node extracts upstream now, so the classifier sees token_values.
check('classify match', cl({ statusCode: 200, token_values: ['TOK1'] }).matched, 'yes');
check(
	'classify match among several meta tags',
	cl({ statusCode: 200, token_values: ['NOPE', 'TOK1'] }).matched,
	'yes'
);
check('classify wrong token', cl({ statusCode: 200, token_values: ['NOPE'] }).matched, 'no');
check('classify no tag', cl({ statusCode: 200, token_values: [] }).reason, 'token_not_found');
check('classify extraction absent', cl({ statusCode: 200 }).reason, 'token_not_found');
check('classify scalar extraction', cl({ statusCode: 200, token_values: 'TOK1' }).matched, 'yes');
// DNS/TCP failure arrives on the error output with no statusCode.
check('classify transport error', cl({ error: 'getaddrinfo ENOTFOUND' }).reason, 'unreachable');

// --- Signature helper -------------------------------------------------------
const build = extract('signature-helper', 'build canonical message');
const signed = run(build, { mode: 'sign', submission_id: 'sub1' });
check('sign emits 3 items (approve, reject, view)', signed.length, 3);
check(
	'sign approve message',
	signed[0].json.message.split('|').slice(0, 2).join('|'),
	'sub1|approve'
);
check('sign view message', signed[2].json.message.split('|').slice(0, 2).join('|'), 'sub1|view');
check('all three share one exp', new Set(signed.map((i) => i.json.exp)).size, 1);
const ver = run(build, {
	mode: 'verify',
	submission_id: 'sub1',
	decision: 'approve',
	exp: '1800000000',
	sig: 'a'.repeat(64)
});
check('verify shape ok', ver[0].json.shape_ok, true);
check(
	'verify rejects short sig',
	run(build, {
		mode: 'verify',
		submission_id: 'sub1',
		decision: 'approve',
		exp: '1800000000',
		sig: 'abc'
	})[0].json.shape_ok,
	false
);
check(
	'verify rejects bad decision',
	run(build, {
		mode: 'verify',
		submission_id: 'sub1',
		decision: 'delete',
		exp: '1800000000',
		sig: 'a'.repeat(64)
	})[0].json.shape_ok,
	false
);
check(
	'verify accepts view as a decision',
	run(build, {
		mode: 'verify',
		submission_id: 'sub1',
		decision: 'view',
		exp: '1800000000',
		sig: 'a'.repeat(64)
	})[0].json.shape_ok,
	true
);

// The link base and the webhook path are one fact. They were two literals once,
// and drifted: links addressed the production path while the workflow listened
// on the test one, so nothing the system signed could ever validate. Nothing
// about that failure is visible until someone clicks a link, which is why it is
// asserted here rather than left to the smoke test.
const paths = JSON.parse(
	execFileSync(
		'python3',
		[
			'-c',
			`
import importlib.util, json
spec = importlib.util.spec_from_file_location("g", "scripts/n8n/build_workflows.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(json.dumps({"review": m.REVIEW_WEBHOOK_PATH, "base": m.REVIEW_WEBHOOK_BASE,
                  "intake": m.INTAKE_WEBHOOK_PATH}))
`
		],
		{ encoding: 'utf8' }
	)
);
const emit = extract('signature-helper', 'emit links or verdict');
const links = new Function('$input', `${emit}`)({
	all: () =>
		['approve', 'reject', 'view'].map((d) => ({
			json: {
				mode: 'sign',
				submission_id: 'sub1',
				decision: d,
				exp: 1800000000,
				data: 'a'.repeat(64)
			}
		}))
})[0].json;
check(
	'signed link targets the listening path',
	new URL(links.approve_link).pathname.endsWith(paths.review),
	true
);
check('link base derives from the path', paths.base.endsWith(paths.review), true);
check('intake and review paths differ', paths.intake !== paths.review, true);
check(
	'sign mode also emits a distinct view_link',
	Boolean(links.view_link) && links.view_link !== links.approve_link,
	true
);

// --- Finalize Submission: validation, now with no config reads ------------
const finValidate = extract('finalize-submission', 'validate + normalize');
const ROW = {
	submission_id: 's1',
	status: 'verified',
	node_id: '',
	type: 'audio',
	source_url: 'https://example.com/',
	verification_token: 't',
	expires_at: new Date(Date.now() + 3600e3).toISOString()
};
const BODY = {
	action: 'submit',
	entry: { creator: 'C', type: 'audio', why: 'w', tags: ['t'] },
	review: { email: 'a@b.co', rights_confirmation: true, eula_agreement: true }
};
const vrun = (row = ROW, body = BODY) => {
	const $ = (name) => ({
		first: () => ({ json: name === 'Trigger' ? { body } : {} }),
		all: () => []
	});
	const shadow = DENIED.map(
		(g) => `const ${g} = new Proxy({}, { get(){ throw new ReferenceError("${g}"); } });`
	).join('\n');
	return new Function('$input', '$json', '$', `${shadow}\n${finValidate}`)(
		{ first: () => ({ json: row }), all: () => [{ json: row }] },
		row,
		$
	);
};
const v = vrun()[0].json;
check('validate passes with no config at all', v.ok, 'yes');
// The whole point of this change: the salt used to be concatenated into
// hash_input here, putting a secret into every execution record.
check('emits rate_key, not a salted hash_input', v.rate_key, 'https://example.com');
check('no hash_input field survives', 'hash_input' in v, false);
check(
	'no item field carries a salt',
	Object.values(v).some((x) => typeof x === 'string' && /salt/i.test(x)),
	false
);
check('turnstile off by default', v.needsTurnstile, 'no');

// --- Finalize Submission: withdrawal ---------------------------------------
// A removal reaches this node through the same token-and-verify path a change
// does, so what is worth pinning is only where it legitimately differs: no
// entry, no email, and a mode the review side can branch on.
const NODE_ROW = { ...ROW, node_id: 'audio-someone-thing' };
const REMOVE_BODY = { action: 'request_removal', node_id: 'audio-someone-thing' };

const rem = vrun(NODE_ROW, REMOVE_BODY)[0].json;
check('removal validates with no entry and no email', rem.ok, 'yes');
check('removal is flagged for the review side', rem.is_removal, 'yes');
check('removal is not mistaken for an update', rem.is_update, 'no');
check('removal carries the stored node id', rem.node_id, 'audio-someone-thing');
check('review mode says remove', rem.review.mode, 'remove');
check('removal stores no address', rem.review.email, '');

// The reason is optional in both directions.
check('absent reason is still a complete request', rem.review.reason, '');
const withReason = vrun(NODE_ROW, { ...REMOVE_BODY, reason: 'The project ended.' })[0].json;
check('a given reason is carried through', withReason.review.reason, 'The project ended.');
check(
	'an overlong reason is truncated, not rejected',
	vrun(NODE_ROW, { ...REMOVE_BODY, reason: 'x'.repeat(5000) })[0].json.review.reason.length,
	2000
);

// Guards. A removal must have been issued against an existing node, and must
// not be able to act on a different one than the token was minted for.
check(
	'removal on a row with no node id is rejected',
	vrun(ROW, REMOVE_BODY)[0].json.error_code,
	'invalid_state'
);
check(
	'removal naming a different node than the row is rejected',
	vrun(NODE_ROW, { ...REMOVE_BODY, node_id: 'audio-someone-else' })[0].json.error_code,
	'invalid_state'
);
// And the reverse: a plain submission must not reach a node-bound row.
check(
	'submit against a node-bound row is still rejected',
	vrun(NODE_ROW, BODY)[0].json.error_code,
	'invalid_state'
);

// --- delivery verdicts ------------------------------------------------------
const gv = extract('finalize-submission', 'gotify delivered?');
const grun = (j) =>
	new Function('$input', '$json', '$', gv)({ first: () => ({ json: j }) }, j, () => ({}))[0].json
		.ok;
check('gotify delivered', grun({ id: 12, appid: 3 }), 'yes');
check('gotify error output falls through to mail', grun({ error: 'ECONNREFUSED' }), 'no');

const ev = extract('finalize-submission', 'email delivered?');
const erun = (j) =>
	new Function('$input', '$json', '$', ev)({ first: () => ({ json: j }) }, j, () => ({}))[0].json
		.ok;
check('email success item', erun({ accepted: ['a@b.co'] }), 'yes');
check('email error item', erun({ error: 'ECONNREFUSED' }), 'no');

const rv = extract('review-action', 'reject: delivered?');
const rrun = (j) =>
	new Function('$input', '$json', '$', rv)({ first: () => ({ json: j }) }, j, () => ({}))[0].json
		.ok;
check('reject mail sent', rrun({ accepted: ['x@y.z'] }), 'yes');
check('reject mail failed -> row survives', rrun({ error: 'auth failed' }), 'no');

// --- notify_js: notification is short, everything else moved to the page ---
const notify = extract('finalize-submission', 'build reviewer notification');
const nrun = (row, body) => {
	const $ = (name) => ({
		first: () =>
			name === 'validate + normalize'
				? {
						json: {
							entry: body.entry,
							review: body.review,
							node_id: row.node_id,
							submission_id: row.submission_id,
							source_url: row.source_url
						}
					}
				: {
						json: {
							approve_link: 'https://x/a',
							reject_link: 'https://x/r',
							view_link: 'https://x/v?submission_id=1'
						}
					}
	});
	const shadow = DENIED.map(
		(g) => `const ${g} = new Proxy({}, { get(){ throw new ReferenceError("${g}"); } });`
	).join('\n');
	return new Function('$input', '$json', '$', `${shadow}\n${notify}`)({}, {}, $)[0].json;
};
const NROW = { node_id: '', submission_id: 's1', source_url: 'https://example.com/' };
const NBODY = {
	entry: { type: 'audio', creator: 'C', why: 'w', tags: ['t'] },
	review: { mode: 'new', email: 'a@b.co', rights_confirmation: true, eula_agreement: true }
};
const nbody = nrun(NROW, NBODY).body;
check('notification carries the view link', nbody.includes('https://x/v?submission_id=1'), true);
for (const gone of ['tags:', 'email:', 'Approve:', 'Reject:', 'rights confirmed', 'EULA'])
	check(`notification no longer contains "${gone}"`, nbody.includes(gone), false);

// --- view: gate --------------------------------------------------------------
const gate = extract('review-action', 'view: gate');
const gr = (row) =>
	new Function('$input', '$json', '$', gate)({ first: () => ({ json: row }) }, row, () => ({}))[0]
		.json;
check(
	'view: pending_review is actionable',
	gr({ submission_id: 's1', status: 'pending_review' }).ok,
	'yes'
);
check(
	'view: approval_failed is actionable',
	gr({ submission_id: 's1', status: 'approval_failed' }).ok,
	'yes'
);
check('view: approved is not actionable', gr({ submission_id: 's1', status: 'approved' }).ok, 'no');
check(
	'view: an active claim is not actionable',
	gr({ submission_id: 's1', status: 'reviewing-1-999999999999' }).ok,
	'no'
);
check('view: missing row is not actionable', gr({}).ok, 'no');

// --- view: build page — XSS -------------------------------------------------
// The page renders submitter-controlled strings in a browser. Every one of
// these must come back escaped, never as live markup.
const page = extract('review-action', 'view: build page');
const prun = (row) => {
	const $ = (name) =>
		name === 'get submission row'
			? { first: () => ({ json: row }) }
			: { first: () => ({ json: { approve_link: 'https://x/a', reject_link: 'https://x/r' } }) };
	const shadow = DENIED.map(
		(g) => `const ${g} = new Proxy({}, { get(){ throw new ReferenceError("${g}"); } });`
	).join('\n');
	return new Function('$input', '$json', '$', `${shadow}\n${page}`)({}, {}, $)[0].json.html;
};
const evil = {
	submission_id: 's1',
	node_id: '',
	source_url: 'https://example.com/',
	entry: JSON.stringify({
		type: 'audio',
		creator: '<script>alert(1)</script>',
		why: 'w',
		tags: ['"><img src=x onerror=alert(2)>'],
		thumb_url: '"><script>alert(3)</script>',
		tracks: [{ label: '<b>x</b>', media_url: 'https://example.invalid/a.mp3' }]
	}),
	review: JSON.stringify({ email: 'a@b.co', rights_confirmation: true, eula_agreement: true })
};
const html = prun(evil);
check(
	'XSS: raw <script> from creator does not appear',
	html.includes('<script>alert(1)</script>'),
	false
);
check('XSS: creator is present in escaped form', html.includes('&lt;script&gt;'), true);
check(
	'XSS: raw onerror payload from tag does not appear',
	html.includes('onerror=alert(2)>'),
	false
);
check(
	'XSS: raw payload from thumb_url does not appear',
	html.includes('"><script>alert(3)</script>'),
	false
);
check('XSS: track label is escaped, not live markup', html.includes('<b>x</b>'), false);
check(
	'view page includes working approve/reject links',
	html.includes('https://x/a') && html.includes('https://x/r'),
	true
);

console.log(`\n  ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
