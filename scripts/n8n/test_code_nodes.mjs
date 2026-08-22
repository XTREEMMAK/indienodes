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
	const out = execFileSync('python3', ['-c', `
import json, importlib.util, pathlib
spec = importlib.util.spec_from_file_location("g", "scripts/n8n/build_workflows.py")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
wf = dict(m.BUILDERS)["${builder}"]({})
print(json.dumps([n["parameters"]["jsCode"] for n in wf["nodes"] if n["name"] == "${nodeName}"][0]))
`], { encoding: 'utf8' });
	return JSON.parse(out);
}

function run(js, json, helpers = {}) {
	const $input = { first: () => ({ json }), all: () => [{ json }] };
	const $ = (name) => ({ item: { json: helpers[name] ?? {} } });
	// Shadow the denied globals with throwing getters so any use is a hard error.
	const shadow = DENIED.map((g) => `const ${g} = new Proxy({}, { get(){ throw new ReferenceError("${g} is not defined"); }, apply(){ throw new ReferenceError("${g} is not defined"); } });`).join('\n');
	return new Function('$input', '$json', '$', `${shadow}\n${js}`)($input, json, $);
}

let pass = 0, fail = 0;
const check = (label, got, want) => {
	const ok = got === want;
	ok ? pass++ : fail++;
	if (!ok) console.log(`  FAIL ${label}\n       got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

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
	['https://metadata.google.internal/', 'unsafe_url'],
];
for (const [url, want] of cases) check(`validate ${JSON.stringify(url)}`, reason(url), want);
check('validate expired', reason('https://example.com/', PAST), 'expired');
check('validate missing expires_at', reason('https://example.com/', ''), 'expired');
check('validate garbage expires_at', reason('https://example.com/', 'nope'), 'expired');

// --- Re-verify: response classification ------------------------------------
const classify = extract('reverify-token', 'check meta tag');
const cl = (j) => run(classify, j, { 'validate url + expiry': { token: 'TOK1' } })[0].json;

check('classify passthrough', cl({ proceed: 'no', matched: 'no', reason: 'expired' }).reason, 'expired');
check('classify 302', cl({ statusCode: 302, body: '' }).reason, 'redirect');
check('classify 404', cl({ statusCode: 404, body: '' }).reason, 'unreachable');
check('classify 500', cl({ statusCode: 500, body: '' }).reason, 'unreachable');
check('classify match', cl({ statusCode: 200, body: '<meta name="indienode-verification" content="TOK1">' }).matched, 'yes');
check('classify attr order', cl({ statusCode: 200, body: '<meta  content="TOK1"  name="indienode-verification" >' }).matched, 'yes');
check('classify single quotes', cl({ statusCode: 200, body: "<meta name='indienode-verification' content='TOK1'>" }).matched, 'yes');
check('classify wrong token', cl({ statusCode: 200, body: '<meta name="indienode-verification" content="NOPE">' }).matched, 'no');
check('classify no tag', cl({ statusCode: 200, body: '<html>hi</html>' }).reason, 'token_not_found');
// responseFormat 'text' delivers the body as `data` -- the shape the live node
// actually produces. Regression: reading only `body` silently found no tag.
check('classify data-key body', cl({ statusCode: 200, data: '<meta name="indienode-verification" content="TOK1">' }).matched, 'yes');
check('classify data-key no tag', cl({ statusCode: 200, data: '<html>hi</html>' }).reason, 'token_not_found');
// DNS/TCP failure arrives on the error output with no statusCode.
check('classify transport error', cl({ error: 'getaddrinfo ENOTFOUND' }).reason, 'unreachable');
check('classify other meta only', cl({ statusCode: 200, body: '<meta name="description" content="TOK1">' }).reason, 'token_not_found');

// --- Signature helper -------------------------------------------------------
const build = extract('signature-helper', 'build canonical message');
const signed = run(build, { mode: 'sign', submission_id: 'sub1' });
check('sign emits 2 items', signed.length, 2);
check('sign approve message', signed[0].json.message.split('|').slice(0, 2).join('|'), 'sub1|approve');
const ver = run(build, { mode: 'verify', submission_id: 'sub1', decision: 'approve', exp: '1800000000', sig: 'a'.repeat(64) });
check('verify shape ok', ver[0].json.shape_ok, true);
check('verify rejects short sig', run(build, { mode: 'verify', submission_id: 'sub1', decision: 'approve', exp: '1800000000', sig: 'abc' })[0].json.shape_ok, false);
check('verify rejects bad decision', run(build, { mode: 'verify', submission_id: 'sub1', decision: 'delete', exp: '1800000000', sig: 'a'.repeat(64) })[0].json.shape_ok, false);

// --- Finalize Submission: notification channel gate -------------------------
const finValidate = extract('finalize-submission', 'validate + normalize');
const ROW = {
	submission_id: 's1', status: 'verified', node_id: '', type: 'audio',
	source_url: 'https://example.com/', verification_token: 't',
	expires_at: new Date(Date.now() + 3600e3).toISOString()
};
const BODY = {
	action: 'submit',
	entry: { creator: 'C', type: 'audio', why: 'w', tags: ['t'] },
	review: { email: 'a@b.co', rights_confirmation: true, eula_agreement: true }
};
const vrun = (cfg, row = ROW, body = BODY) => {
	const cfgItems = Object.entries(cfg).map(([key, value]) => ({ json: { key, value } }));
	const $ = (name) => ({
		first: () => ({ json: name === 'Trigger' ? { body } : {} }),
		all: () => (name === 'get config' ? cfgItems : [])
	});
	const shadow = DENIED.map((g) => `const ${g} = new Proxy({}, { get(){ throw new ReferenceError("${g}"); } });`).join('\n');
	return new Function('$input', '$json', '$', `${shadow}\n${finValidate}`)(
		{ first: () => ({ json: row }), all: () => [{ json: row }] }, row, $);
};
const vcode = (cfg) => { const r = vrun(cfg)[0].json; return r.ok === 'yes' ? 'ok' : r.error_code; };

const SALT = { rate_limit_salt: 'saltvalue' };
check('notify: no channel configured fails closed', vcode(SALT), 'service_misconfigured');
check('notify: gotify alone is enough', vcode({ ...SALT, gotify_url: 'https://g.example' }), 'ok');
check('notify: reviewer_email alone is enough', vcode({ ...SALT, reviewer_email: 'me@example.com' }), 'ok');
check('notify: both configured', vcode({ ...SALT, gotify_url: 'https://g.example', reviewer_email: 'me@example.com' }), 'ok');
check('notify: missing salt still fails closed', vcode({ gotify_url: 'https://g.example' }), 'service_misconfigured');

// --- delivery verdicts ------------------------------------------------------
const gv = extract('finalize-submission', 'gotify delivered?');
const grun = (status, cfg) => {
	const cfgItems = Object.entries(cfg).map(([key, value]) => ({ json: { key, value } }));
	const $ = () => ({ all: () => cfgItems, first: () => ({ json: {} }) });
	return new Function('$input', '$json', '$', gv)(
		{ first: () => ({ json: { statusCode: status } }) }, { statusCode: status }, $)[0].json.ok;
};
check('gotify 200 with url set', grun(200, { gotify_url: 'https://g.example' }), 'yes');
check('gotify 500 with url set', grun(500, { gotify_url: 'https://g.example' }), 'no');
check('gotify unset falls through to mail', grun(0, {}), 'no');

const ev = extract('finalize-submission', 'email delivered?');
const erun = (j) => new Function('$input', '$json', '$', ev)({ first: () => ({ json: j }) }, j, () => ({}))[0].json.ok;
check('email success item', erun({ accepted: ['a@b.co'] }), 'yes');
check('email error item', erun({ error: 'ECONNREFUSED' }), 'no');

const rv = extract('review-action', 'reject: delivered?');
const rrun = (j) => new Function('$input', '$json', '$', rv)({ first: () => ({ json: j }) }, j, () => ({}))[0].json.ok;
check('reject mail sent', rrun({ accepted: ['x@y.z'] }), 'yes');
check('reject mail failed -> row survives', rrun({ error: 'auth failed' }), 'no');

console.log(`\n  ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
