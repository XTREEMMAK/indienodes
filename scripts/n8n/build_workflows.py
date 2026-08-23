#!/usr/bin/env python3
"""
Generator for the IndieNodes n8n workflows.

The workflows are *generated*, never hand-edited. Editing this file and
re-pushing is the supported way to change them; editing the JSON in the n8n UI
means the next push silently reverts your change. See
`docs/n8n-intake-review-refactor-plan.md` for the design and
`docs/n8n-workflow-runbook.md` for the contract each workflow implements.

Usage:
    python3 scripts/n8n/build_workflows.py --list
    python3 scripts/n8n/build_workflows.py --dry-run [--only NAME]
    python3 scripts/n8n/build_workflows.py --push    [--only NAME]

The API key is read from ~/.n8n-api-key and is never written to disk or stdout
by this script. Nothing here contains a secret: the review-link HMAC secret
lives in the n8n `crypto` credential named below and is resolved inside the
Crypto node, so it never reaches workflow data or an export.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

# --- Environment-specific configuration -------------------------------------
# These are IDs on one n8n instance, not portable constants. Confirm them with
# --list before pushing to a different instance.

N8N_BASE = "https://n8n.kjnet.us"
API = f"{N8N_BASE}/api/v1"

TABLE_SUBMISSIONS = "S9cDTcuSPChwnAyW"
TABLE_RATE_LIMITS = "7vIXsDBxw66XRhFt"

# The HMAC secret lives here, not in this file and not in the workflow JSON.
CRYPTO_CREDENTIAL = {"id": "9VIejqScJ05LM6X7", "name": "IndieNodes - Review Link HMAC"}

GITHUB_CREDENTIAL = {"id": "1YWJOqz5zCx2hm2o", "name": "Github PAT - Indienodes"}
GITHUB_REPO = "XTREEMMAK/indienodes"

# Reviewer notification: Gotify push, falling back to SMTP so a notification is
# never lost to one channel being down.
#
# The submitter-facing rejection notice is SMTP only. Push channels reach the
# maintainer; the only address a submitter ever gives is an email address.
SMTP_CREDENTIAL = {"id": "aSWA8xI8ZVsnL6wB", "name": "IndieNodes - SMTP"}

# Gotify has a first-class node and credential (type `gotifyApi`, not `gotify` --
# a wrong guess at that name is why an earlier build hand-rolled an HTTP node).
# The credential carries the server URL *and* the app token, so neither is ever
# workflow data, and a missing credential blocks publish rather than surfacing at
# runtime. Seven other workflows on this instance already use this node.
GOTIFY_CREDENTIAL = {"id": "vnUHtzt9acSvlAxx", "name": "IndieNodes Notifications"}

# The rate-limit salt is an HMAC key, not a value to concatenate. It used to be
# read from the config table into `hash_input`, which put a secret into every
# execution record -- the same mistake v1 made with the review-link secret.
RATE_LIMIT_CREDENTIAL = {"id": "0h2rO7wsu6dmkcbS", "name": "IndieNodes - Rate Limit Salt"}

# Reviewer mail fallback, and the From address for both notifications. The SMTP
# credential has no from-address field, so these are node parameters; they are
# not secrets, so they live here with GITHUB_REPO and INTAKE_ALLOWED_ORIGINS
# rather than in a table nothing else in this file consults.
# `.invalid` is reserved and can never resolve, so an unfilled placeholder cannot
# quietly deliver somewhere wrong -- same reasoning as smtp.invalid on the SMTP
# credential. n8n rejects an empty fromEmail at publish time, so a placeholder is
# needed rather than a blank.
REVIEWER_EMAIL = "get@jamaale.live"
NOTIFY_FROM_EMAIL = "indienodes@j2it.us"

# Treated as "not configured" wherever that distinction matters, so the reject
# path holds a submission rather than deleting it and failing to notify.
EMAIL_CONFIGURED = not NOTIFY_FROM_EMAIL.endswith("@invalid")

# Turnstile is off: no VITE_TURNSTILE_SITE_KEY is set, so Turnstile.svelte renders
# nothing and no token is ever produced. With this False the whole branch is left
# out of the graph rather than sitting dormant.
#
# To enable: create an `httpCustomAuth` credential whose json is
#   {"body": {"secret": "<cloudflare turnstile secret>"}}
# -- verified 2026-08-22 to inject into the request body, which is where
# Cloudflare's siteverify expects it -- then set its id below and flip this True.
TURNSTILE_ENABLED = False
TURNSTILE_CREDENTIAL = {"id": "", "name": ""}

RATE_LIMIT_WINDOW_SECONDS = 60 * 60

# A claim marker older than this is treated as abandoned and may be reclaimed.
# Without it, a run that dies mid-claim -- a crash, a timeout, a Code node with a
# syntax error -- leaves the row permanently unactionable, because the marker is
# neither pending_review nor approval_failed. Comfortably longer than the approve
# branch's worst case (six GitHub calls at a 10s timeout each).
STALE_CLAIM_SECONDS = 5 * 60

# Token / submission lifetime.
TOKEN_TTL_SECONDS = 24 * 60 * 60

# Production path. Cut over 2026-08-23 after the full smoke test (issue, bind,
# verify, submit, Gotify delivery, approve -> real PR, reject -> SMTP -> delete)
# all passed against the -v2-test path.
REVIEW_WEBHOOK_PATH = "indienodes-review-action"

# Derived, never written twice. The base is baked into every signed approve and
# reject link; the path is what Review Action listens on. These were separate
# literals and had already drifted -- the base pointed at the production path
# while the workflow listened on the test one, so every link the system signed
# addressed the *old* workflow, which verifies with a different secret and a
# different construction and would answer "This link is invalid."
REVIEW_WEBHOOK_BASE = f"{N8N_BASE}/webhook/{REVIEW_WEBHOOK_PATH}"

# Rejecting a submission promises the submitter is told (submission-form-spec
# section 5 step 9). With no channel configured that promise cannot be kept, so
# the row is held rather than deleted silently -- which is what the original
# workflow did behind a page admitting it had not notified anyone.
INTAKE_WEBHOOK_PATH = "indienodes-submit"

# CORS. The browser deliberately sends preflighted JSON (see the Content-Type
# comment in src/lib/webhookClient.js), so OPTIONS must be answered. The
# Webhook node's allowedOrigins defaults to "*"; the production origin is
# known, so it is named. SITE_ORIGIN in src/lib/config.js is the source.
INTAKE_ALLOWED_ORIGINS = "https://indienodes.us,http://localhost:5173"

# Bot gate, unchanged from the original: a filled honeypot or an implausibly
# fast submission gets a fake success rather than an error, so a bot learns
# nothing from the response.
MIN_DWELL_MS = 1500

# Signed approve/reject links are valid for this long.
REVIEW_LINK_TTL_SECONDS = 7 * 24 * 60 * 60

# Set once the Error Workflow exists; every other workflow points at it.
ERROR_WORKFLOW_NAME = "Webring - Error Workflow"

# Workflows permitted to invoke the signature helper. Resolved to IDs at push
# time; names that do not exist yet are skipped rather than emitted as a
# blocking empty allowlist. Set N8N_EXTRA_CALLERS to a comma-separated list of
# workflow IDs to temporarily admit a test harness.
SIGNATURE_CALLER_NAMES = [
    "Webring - Action - Finalize Submission v2",
    "Webring - Review Action v2",
]

REVERIFY_CALLER_NAMES = [
    "Webring - Token Lifecycle v2",
    "Webring - Action - Finalize Submission v2",
]


# --- Node and workflow builders ---------------------------------------------

def node(name, type_, type_version, position, parameters=None, **extra):
    n = {
        "parameters": parameters or {},
        "name": name,
        "type": type_,
        "typeVersion": type_version,
        "position": list(position),
    }
    n.update(extra)
    return n


def code_node(name, position, js, **extra):
    return node(name, "n8n-nodes-base.code", 2, position, {"jsCode": js.strip() + "\n"}, **extra)


def chain(*names):
    """Linear main-output wiring for a straight-line graph."""
    out = {}
    for a, b in zip(names, names[1:]):
        out[a] = {"main": [[{"node": b, "type": "main", "index": 0}]]}
    return out


def settings(error_workflow_id=None, caller_ids=None, no_persist=False):
    s = {"executionOrder": "v1", "binaryMode": "separate"}
    if error_workflow_id:
        s["errorWorkflow"] = error_workflow_id
    # An empty allowlist blocks every caller, including the ones this refactor
    # is building. Until at least one caller exists, leave the policy unset so
    # the instance default applies -- which is what the existing helpers use.
    if caller_ids:
        s["callerPolicy"] = "workflowsFromAList"
        s["callerIds"] = ",".join(caller_ids)
    if no_persist:
        # The signature helper resolves a secret. Even though the credential
        # keeps the value out of the item stream, there is no reason to retain
        # this workflow's execution data at all.
        s["saveDataSuccessExecution"] = "none"
        s["saveDataErrorExecution"] = "none"
        s["saveManualExecutions"] = False
    return s


# --- Workflow: Error Workflow ------------------------------------------------

def wf_error_workflow(ctx):
    """Records operational metadata for an unexpected failure.

    Deliberately records *only* metadata. Submission payloads, verification
    tokens, email addresses, and credential data must never reach here; the
    shaping node below allowlists fields rather than passing the trigger
    payload through, so a future n8n version adding a field to the error
    payload cannot silently start leaking it.

    There is no notification step: `config.discord_webhook_url` is empty on
    this instance, and a node that pretends to notify when it cannot is the
    exact failure mode this refactor is removing. The record is the n8n
    execution entry. Adding an ops channel later is a one-node change.
    """
    js = """
// Allowlist. Never spread the trigger payload: it carries the failed run's
// data, which for this system means submitter PII and verification tokens.
const e = $json.execution || {};
const w = $json.workflow || {};
const err = e.error || {};

return [{ json: {
  workflow_name: w.name || '',
  workflow_id:   w.id || '',
  execution_id:  e.id || '',
  failed_node:   err.node?.name || e.lastNodeExecuted || '',
  error_class:   err.name || 'UnknownError',
  // `message` can embed a response body, so it is deliberately omitted.
  // n8n's own execution record holds the detail for a human to open.
  timestamp:     new Date().toISOString(),
  mode:          e.mode || ''
} }];
"""
    return {
        "name": ERROR_WORKFLOW_NAME,
        "settings": settings(),
        "nodes": [
            node("Error Trigger", "n8n-nodes-base.errorTrigger", 1, (0, 0)),
            code_node("shape safe metadata", (240, 0), js),
        ],
        "connections": chain("Error Trigger", "shape safe metadata"),
    }


# --- Workflow: Review Link Signature helper ----------------------------------

def wf_signature_helper(ctx):
    """HMAC-SHA256 sign and verify for the approve/reject links.

    One implementation, two callers. The previous design had the signer in
    `Webring - Helper - Build Signed Links` and the verifier inlined in
    `Webring - Review Action` -- two copies of one algorithm, which is how
    `compute signature` came to rely on a default `type` while the signer set
    SHA256 explicitly. Sharing the node makes that class of drift impossible.
    """
    build_js = f"""
const inp = $input.first().json;
const mode = (inp.mode || '').toString();
const subId = (inp.submission_id || '').toString();

if (!subId || subId.length > 128) {{
  throw new Error('signature helper: invalid submission_id');
}}

if (mode === 'sign') {{
  const exp = Math.floor(Date.now() / 1000) + {REVIEW_LINK_TTL_SECONDS};
  // One item per decision. The Crypto node runs per item, so all three
  // signatures come out of a single node rather than three parallel ones.
  // `view` is read-only -- it opens the review page rather than acting -- but
  // is signed the same way so an unsigned/tampered submission_id can't be
  // browsed either.
  return ['approve', 'reject', 'view'].map((d) => ({{
    json: {{ mode, submission_id: subId, decision: d, exp, message: `${{subId}}|${{d}}|${{exp}}` }}
  }}));
}}

if (mode === 'verify') {{
  const decision = (inp.decision || '').toString();
  const expRaw = (inp.exp === undefined || inp.exp === null) ? '' : inp.exp.toString();
  const sig = (inp.sig || '').toString().toLowerCase();

  // Shape-check everything before it reaches the comparison. An input that
  // fails here still flows on to the HMAC node and fails the compare, so
  // there is exactly one rejection path rather than two.
  const shape_ok =
    (decision === 'approve' || decision === 'reject' || decision === 'view') &&
    /^[0-9]{{1,12}}$/.test(expRaw) &&
    /^[0-9a-f]{{64}}$/.test(sig);

  const exp = shape_ok ? parseInt(expRaw, 10) : 0;
  return [{{ json: {{
    mode, submission_id: subId, decision, exp, sig, shape_ok,
    message: shape_ok ? `${{subId}}|${{decision}}|${{exp}}` : '\\u0000invalid'
  }} }}];
}}

throw new Error('signature helper: unknown mode ' + JSON.stringify(mode));
"""

    emit_js = f"""
const items = $input.all();
const mode = items[0].json.mode;

if (mode === 'sign') {{
  const out = {{ ok: true }};
  for (const it of items) {{
    const j = it.json;
    const sig = (j.data || '').toLowerCase();
    if (!/^[0-9a-f]{{64}}$/.test(sig)) {{
      throw new Error('signature helper: HMAC did not produce a sha256 hex digest');
    }}
    const qs = [
      'submission_id=' + encodeURIComponent(j.submission_id),
      'decision=' + encodeURIComponent(j.decision),
      'exp=' + encodeURIComponent(j.exp),
      'sig=' + encodeURIComponent(sig)
    ].join('&');
    out[j.decision + '_link'] = {json.dumps(REVIEW_WEBHOOK_BASE)} + '?' + qs;
    out.exp = j.exp;
  }}
  return [{{ json: out }}];
}}

// verify
const j = items[0].json;
const expected = (j.data || '').toLowerCase();
const got = (j.sig || '').toLowerCase();

// Constant-time compare. Length is checked first because a length-dependent
// early exit is the leak this is guarding against.
let ok = j.shape_ok === true && expected.length === 64 && got.length === 64;
if (ok) {{
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  ok = diff === 0;
}}

// Expiry is only meaningful once the signature is trusted; `exp` is signed, so
// classifying an unsigned link as "expired" would leak that its id was real.
const now = Math.floor(Date.now() / 1000);
const expired = ok && now > j.exp;

return [{{ json: {{
  valid: ok ? 'yes' : 'no',
  expired: expired ? 'yes' : 'no',
  decision: ok ? j.decision : ''
}} }}];
"""

    return {
        "name": "Webring - Helper - Review Link Signature v2",
        "settings": settings(
            error_workflow_id=ctx.get("error_workflow_id"),
            caller_ids=ctx.get("signature_callers", []),
            no_persist=True,
        ),
        "nodes": [
            node("Trigger", "n8n-nodes-base.executeWorkflowTrigger", 1.2, (0, 0), {
                "workflowInputs": {"values": [
                    {"name": "mode", "type": "string"},
                    {"name": "submission_id", "type": "string"},
                    {"name": "decision", "type": "string"},
                    {"name": "exp", "type": "string"},
                    {"name": "sig", "type": "string"},
                ]}
            }),
            code_node("build canonical message", (240, 0), build_js),
            node("hmac sha256", "n8n-nodes-base.crypto", 2, (480, 0),
                 {"action": "hmac", "type": "SHA256",
                  "value": "={{ $json.message }}", "encoding": "hex"},
                 credentials={"crypto": CRYPTO_CREDENTIAL}),
            code_node("emit links or verdict", (720, 0), emit_js),
        ],
        "connections": chain("Trigger", "build canonical message", "hmac sha256",
                             "emit links or verdict"),
    }


# --- Workflow: Re-verify Token helper ----------------------------------------
#
# Sandbox note, measured on this instance 2026-08-22: n8n Code nodes expose
# Buffer, TextEncoder, RegExp, JSON, Date and Intl -- but NOT URL,
# URLSearchParams, crypto, fetch or process. Anything here parses URLs by hand.
# A `new URL()` inside a try/catch does not fail loudly, it silently takes the
# catch branch, which is how the existing Review Action has been dropping
# creator_id on every approval without anyone noticing.

def wf_reverify_token(ctx):
    """Fetches a submitter-controlled URL and looks for the ownership token.

    This is the SSRF boundary: the only workflow that makes a request to an
    address a stranger chose. It is kept separate from its callers for exactly
    that reason -- one place to audit, one place to restrict.

    Redirects are NOT followed. That is the single most important line here:
    following them would let an attacker bypass every host check below by
    serving a 302 to 169.254.169.254 from a domain that validates cleanly. The
    cost is that a creator must supply the canonical URL rather than one that
    redirects -- which is what belongs in ring.json anyway.
    """
    validate_js = """
const inp = $input.first().json;
const token = (inp.verification_token || '').toString();
const raw = (inp.source_url || '').toString().trim();

const fail = (reason) => [{ json: { proceed: 'no', matched: 'no', reason } }];

// Expiry first: an expired row must never cause an outbound request at all.
const expRaw = (inp.expires_at || '').toString();
const expMs = Date.parse(expRaw);
if (!expRaw || Number.isNaN(expMs) || Date.now() > expMs) return fail('expired');

if (!token || !raw || raw.length > 2048) return fail('unsafe_url');

// Control characters, whitespace and backslashes are how parser-confusion
// tricks are built (https://evil.com\\@good.com and friends). Nothing
// legitimate needs them.
if (/[\\s\\\\]/.test(raw) || /[\\u0000-\\u001f\\u007f]/.test(raw)) return fail('unsafe_url');

// Hand-rolled because URL is not available in this sandbox.
const m = raw.match(/^([A-Za-z][A-Za-z0-9+.-]*):\\/\\/([^\\/?#]*)([\\/?#][\\s\\S]*)?$/);
if (!m) return fail('unsafe_url');

const scheme = m[1].toLowerCase();
if (scheme !== 'http' && scheme !== 'https') return fail('unsafe_url');

let authority = m[2];
if (authority.indexOf('@') !== -1) return fail('unsafe_url');  // userinfo

let host = authority;
let port = '';
if (host.charAt(0) === '[') {                                   // bracketed IPv6
  const close = host.indexOf(']');
  if (close < 0) return fail('unsafe_url');
  port = host.slice(close + 1);
  host = host.slice(1, close);
} else {
  const colon = host.indexOf(':');
  if (colon >= 0) { port = host.slice(colon); host = host.slice(0, colon); }
}
if (port && !/^:[0-9]{1,5}$/.test(port)) return fail('unsafe_url');

host = host.toLowerCase();
if (!host || host.length > 253) return fail('unsafe_url');
// Non-ASCII must arrive already punycoded; deciding homograph equivalence is
// not something to attempt at a security boundary.
if (/[^\\x21-\\x7e]/.test(host)) return fail('unsafe_url');

const isIPv4 = /^[0-9]{1,3}(\\.[0-9]{1,3}){3}$/.test(host);
const isIPv6 = host.indexOf(':') !== -1;
const isName = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host);
if (!isIPv4 && !isIPv6 && !isName) return fail('unsafe_url');

// Rejects the obfuscated numeric forms (2130706433, 0x7f000001, 0177.0.0.1):
// anything all-digits or 0x-prefixed that is not a well-formed dotted quad.
if (!isIPv4 && !isIPv6) {
  if (/^[0-9]+$/.test(host.replace(/\\./g, ''))) return fail('unsafe_url');
  if (/^0x/i.test(host)) return fail('unsafe_url');
}

const blockedNames = ['localhost', 'metadata.google.internal', 'instance-data'];
if (blockedNames.indexOf(host) !== -1) return fail('unsafe_url');
for (const suffix of ['.localhost', '.local', '.internal', '.home.arpa']) {
  if (host.slice(-suffix.length) === suffix) return fail('unsafe_url');
}

if (isIPv4) {
  const o = host.split('.').map(Number);
  if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return fail('unsafe_url');
  const a = o[0], b = o[1];
  if (a === 0 || a === 10 || a === 127) return fail('unsafe_url');
  if (a === 169 && b === 254) return fail('unsafe_url');           // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return fail('unsafe_url');
  if (a === 192 && b === 168) return fail('unsafe_url');
  if (a === 192 && b === 0) return fail('unsafe_url');
  if (a === 100 && b >= 64 && b <= 127) return fail('unsafe_url'); // CGNAT
  if (a >= 224) return fail('unsafe_url');                         // multicast + reserved
}

if (isIPv6) {
  if (host === '::1' || host === '::') return fail('unsafe_url');
  if (/^f[cd]/.test(host)) return fail('unsafe_url');              // unique-local fc00::/7
  if (/^fe[89ab]/.test(host)) return fail('unsafe_url');           // link-local fe80::/10
  if (host.slice(0, 2) === '::') return fail('unsafe_url');        // mapped / compat
}

return [{ json: { proceed: 'yes', url: raw, token } }];
"""

    classify_js = """
// Both branches of the IF land here: the skip path already carries its verdict,
// so it passes straight through rather than needing a second shaping node.
if ($json.proceed === 'no') {
  return [{ json: { matched: $json.matched, reason: $json.reason } }];
}

const token = $('validate url + expiry').item.json.token;
// The html node REPLACES the item with its extraction, so statusCode is no
// longer on $json by the time this runs -- read it from the fetch directly.
const fetched = $('fetch source_url').item.json;
const status = Number(fetched.statusCode || 0);

// 3xx is not followed (see this workflow's docstring). Reported distinctly so
// the creator is told to use the final URL, not that their tag is missing.
if (status >= 300 && status < 400) return [{ json: { matched: 'no', reason: 'redirect' } }];
if (status < 200 || status >= 400) return [{ json: { matched: 'no', reason: 'unreachable' } }];

// Token values extracted upstream by the html node, which parses rather than
// pattern-matches. The regex this replaces required quoted attribute values, so
// a generator emitting HTML5-legal `content=abc` failed verification and the
// creator was told their tag was missing.
const found = $json.token_values;
const values = Array.isArray(found) ? found : (found === undefined || found === null ? [] : [found]);
for (const v of values) {
  if (v !== null && v !== undefined && v.toString() === token) {
    return [{ json: { matched: 'yes', reason: 'matched' } }];
  }
}
return [{ json: { matched: 'no', reason: 'token_not_found' } }];
"""

    return {
        "name": "Webring - Helper - Re-verify Token v2",
        "settings": settings(
            error_workflow_id=ctx.get("error_workflow_id"),
            caller_ids=ctx.get("reverify_callers", []),
        ),
        "nodes": [
            node("Trigger", "n8n-nodes-base.executeWorkflowTrigger", 1.2, (0, 0), {
                "workflowInputs": {"values": [
                    {"name": "source_url", "type": "string"},
                    {"name": "verification_token", "type": "string"},
                    {"name": "expires_at", "type": "string"},
                ]}
            }),
            code_node("validate url + expiry", (240, 0), validate_js),
            node("safe to fetch?", "n8n-nodes-base.if", 2.3, (480, 0), {
                "conditions": {
                    "options": {"caseSensitive": True, "leftValue": "",
                                "typeValidation": "loose", "version": 3},
                    "conditions": [{
                        "id": "b1a1e2c3-0000-4000-8000-000000000001",
                        "leftValue": "={{ $json.proceed }}", "rightValue": "yes",
                        "operator": {"type": "string", "operation": "equals"},
                    }],
                    "combinator": "and",
                },
                "options": {},
            }),
            node("fetch source_url", "n8n-nodes-base.httpRequest", 4.5, (720, -80), {
                "method": "GET",
                "url": "={{ $json.url }}",
                "options": {
                    "timeout": 8000,
                    "redirect": {"redirect": {"followRedirects": False}},
                    "response": {"response": {"neverError": True, "fullResponse": True,
                                              "responseFormat": "text"}},
                },
            },
                 # `neverError` only suppresses HTTP status errors. DNS and TCP
                 # failures still throw, which would abort the run and return
                 # nothing to the caller -- the hang this refactor exists to
                 # remove. Route them to the classifier as `unreachable`.
                 onError="continueErrorOutput"),
            # A parser, not a regex. Your instance already uses this node 19 times;
            # extractHtmlContent with returnValue "attribute" is exactly the shape
            # `<meta name=... content=...>` needs, and it handles unquoted values,
            # odd whitespace and attribute order without any of them being special
            # cases here.
            node("extract meta tag", "n8n-nodes-base.html", 1.2, (960, -80), {
                "operation": "extractHtmlContent",
                "dataPropertyName": "data",
                "extractionValues": {"values": [{
                    "key": "token_values",
                    "cssSelector": 'meta[name="indienode-verification"]',
                    "returnValue": "attribute",
                    "attribute": "content",
                    "returnArray": True}]},
                "options": {}},
                 onError="continueRegularOutput"),
            code_node("check meta tag", (1180, 0), classify_js),
        ],
        "connections": {
            "Trigger": {"main": [[{"node": "validate url + expiry", "type": "main", "index": 0}]]},
            "validate url + expiry": {"main": [[{"node": "safe to fetch?", "type": "main", "index": 0}]]},
            # Both IF outputs converge on the classifier so neither branch can
            # dead-end and return nothing to the caller.
            "safe to fetch?": {"main": [
                [{"node": "fetch source_url", "type": "main", "index": 0}],
                [{"node": "check meta tag", "type": "main", "index": 0}],
            ]},
            "fetch source_url": {"main": [
                [{"node": "extract meta tag", "type": "main", "index": 0}],
                [{"node": "extract meta tag", "type": "main", "index": 0}],
            ]},
            "extract meta tag": {"main": [[{"node": "check meta tag", "type": "main", "index": 0}]]},
        },
    }



# --- Workflow: Token Lifecycle -----------------------------------------------

def wf_token_lifecycle(ctx):
    """issue_token, request_update_token, bind_source_url and verify.

    These four are one workflow because they are one state machine. All four are
    unauthenticated public actions operating on a single `submissions` row while
    it sits in `pending_verify`, and they share an expiry rule, an error
    vocabulary and a response envelope. Split across four workflows, the
    `pending_verify`-only precondition existed in none of them -- which is how
    `verify` came to re-mark an already-approved row as `verified`, letting a
    submission be replayed into a second PR.

    Precondition table, enforced once in the gate nodes below:

        bind_source_url  pending_verify, and source_url still empty
        verify           pending_verify only
        (submit)         verified only        -- enforced in Finalize Submission
    """
    classify_js = """
const b = $('Trigger').first().json.body || {};
const action = (b.action || '').toString();

const S = (v, max) => {
  const s = (v === undefined || v === null) ? '' : v.toString();
  return s.length > max ? null : s;
};

const err = (code) => [{ json: { route: 'error', error_code: code } }];

const sid = S(b.submission_id, 128);
const nodeId = S(b.node_id, 128);
const srcUrl = S(b.source_url, 2048);
const type = S(b.type, 32);

if (sid === null || nodeId === null || srcUrl === null || type === null) return err('invalid_request');

if (action === 'issue_token') {
  const TYPES = ['audio', 'comic', 'text', 'game'];
  if (!TYPES.includes(type)) return err('invalid_request');
  // A null/empty source_url is legitimate here and only here: the site
  // generator bakes the token into an export before the site exists anywhere.
  // bind_source_url is the second half of that flow.
  return [{ json: { route: 'issue', mode: srcUrl ? 'new' : 'generated',
                    node_id: '', source_url: srcUrl, type } }];
}

if (action === 'request_update_token') {
  if (!nodeId) return err('invalid_request');
  return [{ json: { route: 'update', mode: 'update', node_id: nodeId } }];
}

if (action === 'bind_source_url') {
  if (!sid || !srcUrl) return err('invalid_request');
  return [{ json: { route: 'bind', submission_id: sid, source_url: srcUrl } }];
}

if (action === 'verify') {
  if (!sid) return err('invalid_request');
  return [{ json: { route: 'verify', submission_id: sid } }];
}

return err('unsupported_action');
"""

    find_node_js = """
const res = $json;
const status = Number(res.statusCode || 0);
// A fetch failure is NOT "node not found". Reporting it as not_found tells a
// creator their node does not exist when in fact GitHub was unreachable.
if (status < 200 || status >= 300) {
  return [{ json: { route: 'error', error_code: 'ring_unavailable' } }];
}

let ring = [];
try {
  const payload = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  const decoded = Buffer.from(payload.content || '', 'base64').toString('utf-8');
  ring = JSON.parse(decoded);
} catch (e) {
  return [{ json: { route: 'error', error_code: 'ring_unavailable' } }];
}
if (!Array.isArray(ring)) return [{ json: { route: 'error', error_code: 'ring_unavailable' } }];

const nodeId = $('classify + validate').first().json.node_id;
const entry = ring.find((e) => e && e.id === nodeId);
if (!entry) return [{ json: { route: 'error', error_code: 'not_found' } }];

// The URL to re-verify against always comes from the live ring, never the
// request body. If a caller could name it, ownership verification would be
// decorative -- see the header comment in src/lib/submissionApi.js.
const srcUrl = (entry.source_url || '').toString();
if (!srcUrl) return [{ json: { route: 'error', error_code: 'not_found' } }];

return [{ json: { route: 'update', mode: 'update', node_id: nodeId,
                  source_url: srcUrl, type: (entry.type || '').toString() } }];
"""

    build_row_js = """
const c = $json;
const now = new Date();
return [{ json: {
  submission_id: c.sid,
  verification_token: c.vtok,
  node_id: c.node_id || '',
  source_url: c.source_url || '',
  // Stored for updates too, so Finalize Submission can check the submitted
  // entry.type against the type committed at issuance.
  type: c.type || '',
  status: 'pending_verify',
  created_at: now.toISOString(),
  expires_at: new Date(now.getTime() + %(ttl)d * 1000).toISOString()
} }];
""" % {"ttl": TOKEN_TTL_SECONDS}

    bind_gate_js = """
const row = $json;
const req = $('classify + validate').first().json;
const bad = (code) => [{ json: { ok: 'no', error_code: code } }];

if (!row || !row.submission_id) return bad('not_found');
if (row.status !== 'pending_verify') return bad('invalid_state');

const expMs = Date.parse(row.expires_at || '');
if (Number.isNaN(expMs) || Date.now() > expMs) return bad('verification_expired');

// Bind is once-only. Allowing a rebind would let a submitter verify a page they
// control and then point the row at a different one.
if ((row.source_url || '').toString()) return bad('already_bound');

// Same scheme/host screening the SSRF helper applies, done here so an unusable
// URL fails at the point it is supplied rather than one step later.
const u = (req.source_url || '').toString();
if (!/^https?:\\/\\//i.test(u) || /[\\s\\\\]/.test(u) || u.length > 2048) return bad('invalid_request');
const host = (u.split('/')[2] || '').split('@').pop().split(':')[0].toLowerCase();
if (!host || host === 'localhost' || /^(127|10|0)\\./.test(host) ||
    /^169\\.254\\./.test(host) || /^192\\.168\\./.test(host) ||
    /^172\\.(1[6-9]|2[0-9]|3[01])\\./.test(host) ||
    host.endsWith('.local') || host.endsWith('.internal')) return bad('invalid_request');

return [{ json: { ok: 'yes', submission_id: row.submission_id, source_url: u } }];
"""

    verify_gate_js = """
const row = $json;
const bad = (code) => [{ json: { ok: 'no', error_code: code } }];

if (!row || !row.submission_id) return bad('not_found');

// The precondition that did not exist before. Without it, `verify` re-marks a
// pending_review or approved row as `verified`, and the submission can be
// finalised again -- a second reviewer notification, and for an approved node a
// second PR against the same member file.
if (row.status !== 'pending_verify') {
  return bad(row.status === 'verified' || row.status === 'pending_review' ||
             row.status === 'approved' ? 'already_verified' : 'invalid_state');
}
if (!(row.source_url || '').toString()) return bad('not_ready');

return [{ json: { ok: 'yes', submission_id: row.submission_id,
                  source_url: row.source_url, verification_token: row.verification_token,
                  expires_at: row.expires_at } }];
"""

    verify_map_js = """
// Helper reasons -> client reasons. `expired` and `unreachable` must stay
// distinct from `token_not_found`: telling someone to check their meta tag when
// their site is down sends them looking in the wrong place.
const r = ($json.reason || '').toString();
const matched = $json.matched === 'yes';
const MAP = {
  matched: 'matched', expired: 'expired', unsafe_url: 'unsafe_url',
  unreachable: 'unreachable', redirect: 'redirect', token_not_found: 'token_not_found'
};
return [{ json: { matched: matched ? 'yes' : 'no', reason: MAP[r] || 'token_not_found' } }];
"""

    shape_ok_js = """
const r = $json.route || $json.kind;
if (r === 'token') {
  const row = $('build row').first().json;
  return [{ json: { ok: true, submission_id: row.submission_id,
                    verification_token: row.verification_token,
                    expires_at: row.expires_at } }];
}
return [{ json: $json.payload }];
"""

    shape_err_js = """
// One shaper for every failure path in this workflow. The codes are contract:
// src/lib/submissionError.js and the form's retry affordances read them.
const code = ($json.error_code || 'invalid_request').toString();
const M = {
  invalid_request:      ['That submission was not valid.', false],
  unsupported_action:   ['Unsupported submission action.', false],
  not_found:            ['Unknown node.', false],
  ring_unavailable:     ['Could not reach the ring right now - please try again.', true],
  already_bound:        ['This submission already has a source URL.', false],
  invalid_state:        ['This submission is not in a state that allows that.', false],
  verification_expired: ['This verification token has expired.', false]
};
const [message, retryable] = M[code] || M.invalid_request;
return [{ json: { ok: false, error: { message, code, retryable } } }];
"""

    def sw(val, out):
        return {"conditions": {"options": {"caseSensitive": True, "leftValue": "",
                                           "typeValidation": "loose", "version": 3},
                               "conditions": [{"id": "c0000000-0000-4000-8000-%012d" % out,
                                               "leftValue": "={{ $json.route }}", "rightValue": val,
                                               "operator": {"type": "string", "operation": "equals"}}],
                               "combinator": "and"}}

    def ifnode(name, pos, left, right, idx):
        return node(name, "n8n-nodes-base.if", 2.3, pos, {
            "conditions": {"options": {"caseSensitive": True, "leftValue": "",
                                       "typeValidation": "loose", "version": 3},
                           "conditions": [{"id": "i0000000-0000-4000-8000-%012d" % idx,
                                           "leftValue": left, "rightValue": right,
                                           "operator": {"type": "string", "operation": "equals"}}],
                           "combinator": "and"},
            "options": {}})

    SUB_COLS = ["submission_id", "node_id", "source_url", "type", "verification_token",
                "expires_at", "status", "entry", "review", "email", "created_at"]

    def dt_schema():
        return [{"id": c, "displayName": c, "required": False, "defaultMatch": False,
                 "display": True, "type": "dateTime" if c in ("expires_at", "created_at") else "string",
                 "readOnly": False, "removed": False} for c in SUB_COLS]

    return {
        "name": "Webring - Token Lifecycle v2",
        "settings": settings(error_workflow_id=ctx.get("error_workflow_id"),
                             caller_ids=ctx.get("lifecycle_callers", [])),
        "nodes": [
            node("Trigger", "n8n-nodes-base.executeWorkflowTrigger", 1.2, (-880, 0),
                 {"workflowInputs": {"values": [{"name": "body", "type": "object"}]}}),
            code_node("classify + validate", (-660, 0), classify_js),
            node("route", "n8n-nodes-base.switch", 3.4, (-440, 0), {
                "rules": {"values": [sw("issue", 0), sw("update", 1), sw("bind", 2), sw("verify", 3)]},
                # "extra" adds the fallback as an additional output; a bare index
                # that exceeds the rule count silently routes nowhere, which is
                # how every error path was returning an empty body.
                "options": {"fallbackOutput": "extra"}}),

            # issue + update converge here
            node("gen submission_id", "n8n-nodes-base.crypto", 2, (0, -260),
                 {"action": "generate", "dataPropertyName": "sid"}),
            node("gen verification_token", "n8n-nodes-base.crypto", 2, (220, -260),
                 {"action": "generate", "encodingType": "hex", "dataPropertyName": "vtok"}),
            code_node("build row", (440, -260), build_row_js),
            node("insert row", "n8n-nodes-base.dataTable", 1.1, (660, -260), {
                "dataTableId": {"__rl": True, "value": TABLE_SUBMISSIONS, "mode": "list",
                                "cachedResultName": "submissions"},
                "columns": {"mappingMode": "defineBelow",
                            "value": {c: "={{ $json.%s }}" % c for c in
                                      ["submission_id", "node_id", "source_url", "type",
                                       "verification_token", "expires_at", "status", "created_at"]},
                            "matchingColumns": [], "schema": dt_schema(),
                            "attemptToConvertTypes": False, "convertFieldsToString": False},
                "options": {}}),
            code_node("shape token response", (880, -260),
                      "const row = $('build row').first().json;\n"
                      "return [{ json: { ok: true, submission_id: row.submission_id,\n"
                      "  verification_token: row.verification_token, expires_at: row.expires_at } }];"),

            # update lookup
            node("fetch ring.json", "n8n-nodes-base.httpRequest", 4.5, (-220, -120), {
                "url": "https://api.github.com/repos/%s/contents/ring.json" % GITHUB_REPO,
                "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                "options": {"timeout": 10000,
                            "response": {"response": {"neverError": True, "fullResponse": True,
                                                      "responseFormat": "text"}}}},
                 credentials={"httpHeaderAuth": GITHUB_CREDENTIAL},
                 onError="continueErrorOutput"),
            code_node("find node in ring", (0, -120), find_node_js),
            ifnode("node found?", (220, -120), "={{ $json.route }}", "update", 1),

            # bind
            node("bind: get row", "n8n-nodes-base.dataTable", 1.1, (-220, 60), {
                "operation": "get",
                "dataTableId": {"__rl": True, "value": TABLE_SUBMISSIONS, "mode": "list",
                                "cachedResultName": "submissions"},
                "filters": {"conditions": [{"keyName": "submission_id",
                                            "keyValue": "={{ $json.submission_id }}"}]}},
                 alwaysOutputData=True),
            code_node("bind: gate", (0, 60), bind_gate_js),
            ifnode("bind: ok?", (220, 60), "={{ $json.ok }}", "yes", 2),
            node("bind: update row", "n8n-nodes-base.dataTable", 1.1, (440, 20), {
                "operation": "update",
                "dataTableId": {"__rl": True, "value": TABLE_SUBMISSIONS, "mode": "list",
                                "cachedResultName": "submissions"},
                "filters": {"conditions": [{"keyName": "submission_id",
                                            "keyValue": "={{ $json.submission_id }}"}]},
                "columns": {"mappingMode": "defineBelow",
                            "value": {"source_url": "={{ $json.source_url }}"},
                            "matchingColumns": [], "schema": dt_schema(),
                            "attemptToConvertTypes": False, "convertFieldsToString": False},
                "options": {}}),
            code_node("bind: shape ok", (660, 20), "return [{ json: { ok: true, bound: true } }];"),

            # verify
            node("verify: get row", "n8n-nodes-base.dataTable", 1.1, (-220, 260), {
                "operation": "get",
                "dataTableId": {"__rl": True, "value": TABLE_SUBMISSIONS, "mode": "list",
                                "cachedResultName": "submissions"},
                "filters": {"conditions": [{"keyName": "submission_id",
                                            "keyValue": "={{ $json.submission_id }}"}]}},
                 alwaysOutputData=True),
            code_node("verify: gate", (0, 260), verify_gate_js),
            ifnode("verify: ok?", (220, 260), "={{ $json.ok }}", "yes", 3),
            node("verify: call Re-verify Token v2", "n8n-nodes-base.executeWorkflow", 1.3, (440, 220), {
                "workflowId": {"__rl": True, "value": ctx.get("reverify_id", ""), "mode": "list",
                               "cachedResultName": "Webring - Helper - Re-verify Token v2"},
                "workflowInputs": {"mappingMode": "defineBelow",
                                   "value": {"source_url": "={{ $json.source_url }}",
                                             "verification_token": "={{ $json.verification_token }}",
                                             "expires_at": "={{ $json.expires_at }}"},
                                   "matchingColumns": [""], "schema": [],
                                   "attemptToConvertTypes": False, "convertFieldsToString": True},
                "options": {}}),
            code_node("verify: map reason", (660, 220), verify_map_js),
            ifnode("verify: matched?", (880, 220), "={{ $json.matched }}", "yes", 4),
            node("verify: mark verified", "n8n-nodes-base.dataTable", 1.1, (1100, 180), {
                "operation": "update",
                "dataTableId": {"__rl": True, "value": TABLE_SUBMISSIONS, "mode": "list",
                                "cachedResultName": "submissions"},
                "filters": {"conditions": [{"keyName": "submission_id",
                                            "keyValue": "={{ $('verify: gate').first().json.submission_id }}"}]},
                "columns": {"mappingMode": "defineBelow", "value": {"status": "verified"},
                            "matchingColumns": [], "schema": dt_schema(),
                            "attemptToConvertTypes": False, "convertFieldsToString": False},
                "options": {}}),
            code_node("verify: shape verified", (1320, 180),
                      "return [{ json: { ok: true, verified: true } }];"),
            code_node("verify: shape unverified", (1100, 300),
                      "const r = $('verify: map reason').first().json.reason;\n"
                      "return [{ json: { ok: true, verified: false, reason: r } }];"),
            code_node("verify: shape state", (440, 380),
                      "const c = $json.error_code;\n"
                      "if (c === 'already_verified') return [{ json: { ok: true, verified: true } }];\n"
                      "if (c === 'not_ready') return [{ json: { ok: true, verified: false, reason: 'not_ready' } }];\n"
                      "if (c === 'verification_expired') return [{ json: { ok: true, verified: false, reason: 'expired' } }];\n"
                      "return [{ json: { ok: false, error: { message: 'Unknown submission.', code: c || 'not_found', retryable: false } } }];"),

            code_node("shape error", (440, 520), shape_err_js),
        ],
        "connections": {
            "Trigger": {"main": [[{"node": "classify + validate", "type": "main", "index": 0}]]},
            "classify + validate": {"main": [[{"node": "route", "type": "main", "index": 0}]]},
            "route": {"main": [
                [{"node": "gen submission_id", "type": "main", "index": 0}],
                [{"node": "fetch ring.json", "type": "main", "index": 0}],
                [{"node": "bind: get row", "type": "main", "index": 0}],
                [{"node": "verify: get row", "type": "main", "index": 0}],
                [{"node": "shape error", "type": "main", "index": 0}],
            ]},
            "gen submission_id": {"main": [[{"node": "gen verification_token", "type": "main", "index": 0}]]},
            "gen verification_token": {"main": [[{"node": "build row", "type": "main", "index": 0}]]},
            "build row": {"main": [[{"node": "insert row", "type": "main", "index": 0}]]},
            "insert row": {"main": [[{"node": "shape token response", "type": "main", "index": 0}]]},
            "fetch ring.json": {"main": [
                [{"node": "find node in ring", "type": "main", "index": 0}],
                [{"node": "find node in ring", "type": "main", "index": 0}],
            ]},
            "find node in ring": {"main": [[{"node": "node found?", "type": "main", "index": 0}]]},
            "node found?": {"main": [
                [{"node": "gen submission_id", "type": "main", "index": 0}],
                [{"node": "shape error", "type": "main", "index": 0}],
            ]},
            "bind: get row": {"main": [[{"node": "bind: gate", "type": "main", "index": 0}]]},
            "bind: gate": {"main": [[{"node": "bind: ok?", "type": "main", "index": 0}]]},
            "bind: ok?": {"main": [
                [{"node": "bind: update row", "type": "main", "index": 0}],
                [{"node": "shape error", "type": "main", "index": 0}],
            ]},
            "bind: update row": {"main": [[{"node": "bind: shape ok", "type": "main", "index": 0}]]},
            "verify: get row": {"main": [[{"node": "verify: gate", "type": "main", "index": 0}]]},
            "verify: gate": {"main": [[{"node": "verify: ok?", "type": "main", "index": 0}]]},
            "verify: ok?": {"main": [
                [{"node": "verify: call Re-verify Token v2", "type": "main", "index": 0}],
                [{"node": "verify: shape state", "type": "main", "index": 0}],
            ]},
            "verify: call Re-verify Token v2": {"main": [[{"node": "verify: map reason", "type": "main", "index": 0}]]},
            "verify: map reason": {"main": [[{"node": "verify: matched?", "type": "main", "index": 0}]]},
            "verify: matched?": {"main": [
                [{"node": "verify: mark verified", "type": "main", "index": 0}],
                [{"node": "verify: shape unverified", "type": "main", "index": 0}],
            ]},
            "verify: mark verified": {"main": [[{"node": "verify: shape verified", "type": "main", "index": 0}]]},
        },
    }




# --- Workflow: Finalize Submission -------------------------------------------

def wf_finalize_submission(ctx):
    """submit and submit_update.

    The two source workflows were structurally identical apart from the
    Turnstile branch and the shape of the review block, so every node existed
    twice. Here the branches diverge only where policy actually differs.

    The rate-limit helper is inlined: after the merge it had exactly one caller.
    """
    validate_js = """
const row = $json;
const b = $('Trigger').first().json.body || {};
const bad = (code) => [{ json: { ok: 'no', error_code: code } }];

if (!row || !row.submission_id) return bad('not_found');

// Finalisation is legal from `verified`, and from `notification_failed` --
// the row is already persisted there and the only thing outstanding is the
// reviewer notification, so a retry must resume rather than be rejected.
// Anything else is a replay, a double-submit, or an out-of-order client.
const resume = row.status === 'notification_failed';
if (row.status !== 'verified' && !resume) {
  // A stale claiming- marker means the run that stamped it died; the row would
  // otherwise be stranded, finalisable by nobody. See STALE_CLAIM_SECONDS.
  const st = String(row.status || '');
  if (st.indexOf('claiming-') === 0) {
    const stamped = Number(st.split('-').pop());
    if (Number.isFinite(stamped) && (Date.now() - stamped) > %(stale)d) {
      // fall through and let this run reclaim it
    } else {
      return bad('already_submitted');
    }
  } else {
    const inflight = st === 'pending_review' || st === 'approved';
    return bad(inflight ? 'already_submitted' : 'not_verified');
  }
}

const expMs = Date.parse(row.expires_at || '');
if (Number.isNaN(expMs) || Date.now() > expMs) return bad('verification_expired');

const action = (b.action || '').toString();
const isUpdate = action === 'submit_update';
const storedNode = (row.node_id || '').toString();

// Mode must match what the row was issued for.
if (isUpdate !== Boolean(storedNode)) return bad('invalid_state');

const entry = b.entry;
if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return bad('invalid_request');

// Structural check against schema/ring.schema.json, so a reviewer never sees a
// submission that cannot pass validate:publish after approval.
const TYPES = ['audio', 'comic', 'text', 'game'];
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
if (!str(entry.creator, 200)) return bad('invalid_request');
if (!TYPES.includes(entry.type)) return bad('invalid_request');
if (!str(entry.why, 400)) return bad('invalid_request');
if (!Array.isArray(entry.tags) || entry.tags.length < 1 ||
    !entry.tags.every((t) => str(t, 60))) return bad('invalid_request');

// The type was committed when the token was issued; it cannot change now.
if (row.type && entry.type !== row.type) return bad('invalid_request');

// For updates the request's node_id is validated then discarded -- only the
// stored value is ever used downstream.
if (isUpdate) {
  const reqNode = (b.node_id || '').toString();
  if (reqNode && reqNode !== storedNode) return bad('invalid_state');
}

// Turnstile policy. submit (new) is deliberately unguarded -- see the
// submitUpdate doc comment in src/lib/submissionApi.js; submit_update is the
// one action Turnstile covers. Whether it runs at all is a deploy-time
// decision (TURNSTILE_ENABLED), not a value read at runtime.
const tsToken = (b.turnstile_token || '').toString();
let needsTurnstile = 'no';
if (%(ts_enabled)s && isUpdate) {
  if (!tsToken) return bad('turnstile_failed');   // required but not supplied
  needsTurnstile = 'yes';
}

// Review block: new submissions carry the full block, updates carry only an
// email. Both normalise to one internal shape so the reviewer notification and
// the reject path do not have to care which action created the row.
const rv = isUpdate ? {} : (b.review && typeof b.review === 'object' ? b.review : null);
if (!isUpdate && !rv) return bad('invalid_request');
const email = (isUpdate ? (b.email || '') : (rv.email || '')).toString();
if (!email || email.length > 320 || email.indexOf('@') < 1) return bad('invalid_request');

const review = {
  mode: isUpdate ? 'update' : 'new',
  node_id: storedNode || null,
  email,
  rights_confirmation: isUpdate ? null : rv.rights_confirmation === true,
  eula_agreement: isUpdate ? null : rv.eula_agreement === true,
  pro_membership: isUpdate ? null : (rv.pro_membership || null),
  pro_membership_name: isUpdate ? null : (rv.pro_membership_name || null)
};
if (!isUpdate && (review.rights_confirmation !== true || review.eula_agreement !== true)) {
  return bad('invalid_request');
}

// The salt is an HMAC credential and the Gotify server is a credential, so
// neither can be "missing" at runtime -- n8n refuses to publish a node whose
// required credential is absent. That check moved from here to deploy time.

return [{ json: {
  ok: 'yes', needsTurnstile, resume: resume ? 'yes' : 'no',
  submission_id: row.submission_id, source_url: row.source_url,
  verification_token: row.verification_token, expires_at: row.expires_at,
  node_id: storedNode, is_update: isUpdate ? 'yes' : 'no',
  entry, review, email,
  turnstile_token: tsToken,
  // Just the canonicalised URL. The salt is applied by the HMAC node from a
  // credential and never becomes an item field.
  rate_key: canonical(row.source_url)
} }];

function canonical(u) {
  // Cheap canonicalisation so trivial variants share a rate-limit bucket.
  let s = (u || '').toString().trim().toLowerCase();
  s = s.replace(/#.*$/, '').replace(/\\/+$/, '');
  s = s.replace(/^(https?:\\/\\/[^\\/]+):(80|443)/, '$1');
  return s;
}
""" % {"ts_enabled": "true" if TURNSTILE_ENABLED else "false",
       "stale": STALE_CLAIM_SECONDS * 1000}

    rate_js = """
const rows = $input.all().map((i) => i.json).filter((r) => r && r.created_at);
const WINDOW = %(win)d * 1000;
// The old helper read only the first row returned, which is the OLDEST. Once
// that aged past the window every later check passed, so the limiter silently
// stopped working an hour after the first submission. Take the newest.
let newest = 0;
for (const r of rows) {
  const t = Date.parse(r.created_at);
  if (!Number.isNaN(t) && t > newest) newest = t;
}
// A resume is retrying a notification for a submission that already passed the
// limiter. Charging it again would lock the submitter out of a failure that was
// ours, not theirs.
const resume = $('validate + normalize').first().json.resume === 'yes';
const blocked = !resume && newest > 0 && (Date.now() - newest) < WINDOW;
return [{ json: { blocked: blocked ? 'yes' : 'no',
                  existing_row_id: rows.length ? ($input.all()[0].json.id ?? null) : null } }];
""" % {"win": RATE_LIMIT_WINDOW_SECONDS}

    notify_js = r"""
const c = $('validate + normalize').first().json;
const links = $('sign review links').first().json;
const e = c.entry, r = c.review;

// Short by design: every submitted field, the source link, and the
// approve/reject actions now live on the review page (view_link). Cramming
// them into a push notification was the thing this replaces.
const lines = [
  r.mode === 'update' ? `UPDATE to node ${c.node_id}` : 'NEW SUBMISSION',
  `type: ${e.type}`,
  `creator: ${e.creator}`,
  `Review: ${links.view_link}`
];

// Channel-neutral. Each delivery branch shapes its own payload from these two
// fields, so adding a channel later does not touch this node. Nothing here is
// interpolated into markup or a mention-parsing context, which is why the
// Discord-era allowed_mentions guard is no longer needed.
return [{ json: {
  title: (r.mode === 'update' ? 'Node update: ' : 'New submission: ') + e.type + ' by ' + e.creator,
  body: lines.join('\n').slice(0, 4000)
} }];
"""

    SUB_COLS = ["submission_id", "node_id", "source_url", "type", "verification_token",
                "expires_at", "status", "entry", "review", "email", "created_at"]
    def dt_schema():
        return [{"id": c, "displayName": c, "required": False, "defaultMatch": False,
                 "display": True, "type": "dateTime" if c in ("expires_at", "created_at") else "string",
                 "readOnly": False, "removed": False} for c in SUB_COLS]

    def ifn(name, pos, left, right, idx):
        return node(name, "n8n-nodes-base.if", 2.3, pos, {
            "conditions": {"options": {"caseSensitive": True, "leftValue": "",
                                       "typeValidation": "loose", "version": 3},
                           "conditions": [{"id": "f0000000-0000-4000-8000-%012d" % idx,
                                           "leftValue": left, "rightValue": right,
                                           "operator": {"type": "string", "operation": "equals"}}],
                           "combinator": "and"}, "options": {}})

    def subtable():
        return {"__rl": True, "value": TABLE_SUBMISSIONS, "mode": "list",
                "cachedResultName": "submissions"}

    return {
        "name": "Webring - Action - Finalize Submission v2",
        "settings": settings(error_workflow_id=ctx.get("error_workflow_id"),
                             caller_ids=ctx.get("finalize_callers", [])),
        "nodes": [
            node("Trigger", "n8n-nodes-base.executeWorkflowTrigger", 1.2, (-1100, 0),
                 {"workflowInputs": {"values": [{"name": "body", "type": "object"}]}}),
            # One unfiltered read replaces the three filtered per-key config
            # nodes the old workflows used.
            node("get submission row", "n8n-nodes-base.dataTable", 1.1, (-660, 0), {
                "operation": "get", "dataTableId": subtable(),
                "filters": {"conditions": [{"keyName": "submission_id",
                                            "keyValue": "={{ $('Trigger').first().json.body.submission_id }}"}]}},
                 alwaysOutputData=True),
            code_node("validate + normalize", (-440, 0), validate_js),
            ifn("eligible?", (-220, 0), "={{ $json.ok }}", "yes", 1),

            node("call Re-verify Token v2", "n8n-nodes-base.executeWorkflow", 1.3, (0, -60), {
                "workflowId": {"__rl": True, "value": ctx.get("reverify_id", ""), "mode": "list",
                               "cachedResultName": "Webring - Helper - Re-verify Token v2"},
                "workflowInputs": {"mappingMode": "defineBelow",
                                   "value": {"source_url": "={{ $json.source_url }}",
                                             "verification_token": "={{ $json.verification_token }}",
                                             "expires_at": "={{ $json.expires_at }}"},
                                   "matchingColumns": [""], "schema": [],
                                   "attemptToConvertTypes": False, "convertFieldsToString": True},
                "options": {}}),
            ifn("ownership still proven?", (220, -60), "={{ $json.matched }}", "yes", 2),
            # Turnstile nodes exist only when the feature is on. Leaving them in
            # the graph while disabled is not free: the siteverify node requires
            # an httpCustomAuth credential, and n8n refuses to publish a node
            # whose required credential is absent.
            *([
                ifn("needs turnstile?", (440, -60), "={{ $('validate + normalize').first().json.needsTurnstile }}", "yes", 3),
            node("verify turnstile", "n8n-nodes-base.httpRequest", 4.5, (660, -140), {
                "method": "POST", "url": "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                "sendBody": True, "specifyBody": "json",
                "authentication": "genericCredentialType", "genericAuthType": "httpCustomAuth",
                # `secret` is injected into the body by the credential -- verified
                # 2026-08-22 -- so it is never in the workflow JSON or an item.
                "jsonBody": "={{ JSON.stringify({ response: $('validate + normalize').first().json.turnstile_token }) }}",
                "options": {"timeout": 8000,
                            "response": {"response": {"neverError": True, "fullResponse": True,
                                                      "responseFormat": "json"}}}},
                 credentials={"httpCustomAuth": TURNSTILE_CREDENTIAL},
                 onError="continueErrorOutput"),
            code_node("turnstile verdict", (880, -140),
                      "const s = Number($json.statusCode || 0);\n"
                      "const b = $json.body || {};\n"
                      "// Timeouts, non-JSON and HTTP errors are all failures.\n"
                      "const passed = s >= 200 && s < 300 && b && b.success === true;\n"
                      "return [{ json: { ok: passed ? 'yes' : 'no', error_code: 'turnstile_failed' } }];"),
            ifn("turnstile passed?", (1100, -140), "={{ $json.ok }}", "yes", 4),
            ] if TURNSTILE_ENABLED else []),

            # HMAC, not hash-of-salt-plus-value: the key lives in a credential and
            # is resolved inside the node, so the salt never enters the item stream.
            node("rate: hash", "n8n-nodes-base.crypto", 2, (880, 60),
                 {"action": "hmac", "type": "SHA256",
                  "value": "={{ $('validate + normalize').first().json.rate_key }}",
                  "encoding": "hex", "dataPropertyName": "hash"},
                 credentials={"crypto": RATE_LIMIT_CREDENTIAL}),
            node("rate: get rows", "n8n-nodes-base.dataTable", 1.1, (1100, 60), {
                "operation": "get",
                "dataTableId": {"__rl": True, "value": TABLE_RATE_LIMITS, "mode": "list",
                                "cachedResultName": "rate_limits"},
                "filters": {"conditions": [{"keyName": "source_url_hash",
                                            "keyValue": "={{ $json.hash }}"}]}},
                 alwaysOutputData=True),
            code_node("rate: decide", (1320, 60), rate_js),
            ifn("rate limited?", (1540, 60), "={{ $json.blocked }}", "yes", 5),

            # Optimistic claim. n8n Data Table filters OR their conditions
            # (measured 2026-08-22), so "submission_id = X AND status =
            # verified" cannot be expressed -- attempting it updates every row
            # matching EITHER term. Instead: stamp a marker unique to this
            # execution filtered on the unique key alone, read it back, and
            # proceed only if the marker still says it is ours. Last write wins,
            # so exactly one concurrent run sees its own marker.
            node("claim: stamp marker", "n8n-nodes-base.dataTable", 1.1, (1760, 120), {
                "operation": "update", "dataTableId": subtable(),
                "filters": {"conditions": [
                    {"keyName": "submission_id",
                     "keyValue": "={{ $('validate + normalize').first().json.submission_id }}"}]},
                "columns": {"mappingMode": "defineBelow", "value": {
                    "status": "=claiming-{{ $execution.id }}-{{ Date.now() }}",
                    "entry": "={{ JSON.stringify($('validate + normalize').first().json.entry) }}",
                    "review": "={{ JSON.stringify($('validate + normalize').first().json.review) }}",
                    "email": "={{ $('validate + normalize').first().json.email }}"},
                    "matchingColumns": [], "schema": dt_schema(),
                    "attemptToConvertTypes": False, "convertFieldsToString": False},
                "options": {}}, alwaysOutputData=True),
            node("claim: read back", "n8n-nodes-base.dataTable", 1.1, (1980, 120), {
                "operation": "get", "dataTableId": subtable(),
                "filters": {"conditions": [
                    {"keyName": "submission_id",
                     "keyValue": "={{ $('validate + normalize').first().json.submission_id }}"}]}},
                 alwaysOutputData=True),
            code_node("claim: won?", (2200, 120),
                      "const mine = 'claiming-' + $execution.id + '-';\n"
                      "const status = ($json && $json.status) ? String($json.status) : '';\n"
                      "// A previous read is not a lock. Only the run whose marker survived\n"
                      "// the read-back may send a notification.\n"
                      "return [{ json: { ok: status.indexOf(mine) === 0 ? 'yes' : 'no',\n"
                      "                  error_code: 'already_submitted' } }];"),
            ifn("claimed?", (2420, 120), "={{ $json.ok }}", "yes", 6),
            node("claim: set pending_review", "n8n-nodes-base.dataTable", 1.1, (2420, 20), {
                "operation": "update", "dataTableId": subtable(),
                "filters": {"conditions": [
                    {"keyName": "submission_id",
                     "keyValue": "={{ $('validate + normalize').first().json.submission_id }}"}]},
                "columns": {"mappingMode": "defineBelow", "value": {"status": "pending_review"},
                            "matchingColumns": [], "schema": dt_schema(),
                            "attemptToConvertTypes": False, "convertFieldsToString": False},
                "options": {}}),
            node("rate: record", "n8n-nodes-base.dataTable", 1.1, (2420, 60), {
                "dataTableId": {"__rl": True, "value": TABLE_RATE_LIMITS, "mode": "list",
                                "cachedResultName": "rate_limits"},
                "columns": {"mappingMode": "defineBelow",
                            "value": {"source_url_hash": "={{ $('rate: hash').first().json.hash }}",
                                      "created_at": "={{ new Date().toISOString() }}"},
                            "matchingColumns": [], "schema": [],
                            "attemptToConvertTypes": False, "convertFieldsToString": False},
                "options": {}}),
            node("sign review links", "n8n-nodes-base.executeWorkflow", 1.3, (2640, 60), {
                "workflowId": {"__rl": True, "value": ctx.get("signature_id", ""), "mode": "list",
                               "cachedResultName": "Webring - Helper - Review Link Signature v2"},
                "workflowInputs": {"mappingMode": "defineBelow",
                                   "value": {"mode": "sign",
                                             "submission_id": "={{ $('validate + normalize').first().json.submission_id }}",
                                             "decision": "", "exp": "", "sig": ""},
                                   "matchingColumns": [""], "schema": [],
                                   "attemptToConvertTypes": False, "convertFieldsToString": True},
                "options": {}}),
            code_node("build reviewer notification", (2860, 60), notify_js),
            # Native Gotify node. The server URL and app token both live in the
            # credential, so neither is workflow data and neither can be absent at
            # runtime -- n8n refuses to publish a node missing a required
            # credential, which is a stronger guarantee than the runtime string
            # check this replaces.
            node("notify: gotify", "n8n-nodes-base.gotify", 1, (3080, 20), {
                "message": "={{ $json.body }}",
                # Plain text. The node has no markdown support: both `contentType`
                # and `extras` persist in n8n's own schema but Gotify receives
                # `extras: null`, verified against the message it returns. Markdown
                # would mean going back to a raw HTTP node and giving up the
                # credential handling, which is not worth bold text.
                "additionalFields": {"title": "={{ $json.title }}", "priority": 7}},
                 credentials={"gotifyApi": GOTIFY_CREDENTIAL},
                 onError="continueErrorOutput"),
            code_node("gotify delivered?", (3300, 20),
                      "// The node throws on transport or API failure and that lands on the\n"
                      "// error output, so an item arriving here having kept its id is a\n"
                      "// delivered message. Anything else falls through to mail.\n"
                      "const failed = Boolean($json.error) || $json.__error === true;\n"
                      "return [{ json: { ok: failed ? 'no' : 'yes' } }];"),
            ifn("gotify ok?", (3520, 20), "={{ $json.ok }}", "yes", 7),

            # Fallback. Reached when Gotify is unset, down, or rejects.
            node("notify: email fallback", "n8n-nodes-base.emailSend", 2.1, (3520, 180), {
                "fromEmail": NOTIFY_FROM_EMAIL,
                "toEmail": REVIEWER_EMAIL,
                "subject": "={{ $('build reviewer notification').first().json.title }}",
                "emailFormat": "text",
                "text": "={{ $('build reviewer notification').first().json.body }}",
                "options": {}},
                 credentials={"smtp": SMTP_CREDENTIAL},
                 onError="continueErrorOutput"),
            code_node("email delivered?", (3740, 180),
                      "// The Send Email node throws on failure rather than returning a\n"
                      "// status, so an item arriving on the success output is the signal.\n"
                      "const failed = Boolean($json.error) || $json.__error === true;\n"
                      "return [{ json: { ok: failed ? 'no' : 'yes' } }];"),
            ifn("notification delivered?", (3960, 180), "={{ $json.ok }}", "yes", 8),
            node("mark notification_failed", "n8n-nodes-base.dataTable", 1.1, (3740, 140), {
                "operation": "update", "dataTableId": subtable(),
                "filters": {"conditions": [{"keyName": "submission_id",
                                            "keyValue": "={{ $('validate + normalize').first().json.submission_id }}"}]},
                "columns": {"mappingMode": "defineBelow",
                            "value": {"status": "notification_failed"},
                            "matchingColumns": [], "schema": dt_schema(),
                            "attemptToConvertTypes": False, "convertFieldsToString": False},
                "options": {}}),
            code_node("shape notify_failed", (3960, 140),
                      "// The row is preserved at notification_failed so a retry resumes\n"
                      "// rather than creating a second submission.\n"
                      "return [{ json: { ok: false, error: { message: 'Saved, but the reviewer could not be notified. Please retry.', code: 'notification_failed', retryable: true } } }];"),
            code_node("shape success", (3740, -20),
                      "return [{ json: { ok: true, reference: $('validate + normalize').first().json.submission_id } }];"),
            code_node("shape error", (0, 320),
                      "const code = ($json.error_code || 'invalid_request').toString();\n"
                      "const M = {\n"
                      "  invalid_request:      ['That submission was not valid.', false],\n"
                      "  not_found:            ['Unknown submission.', false],\n"
                      "  not_verified:         ['Submission is not verified.', false],\n"
                      "  already_submitted:    ['This submission was already sent for review.', false],\n"
                      "  invalid_state:        ['This submission is not in a state that allows that.', false],\n"
                      "  verification_expired: ['This verification token has expired.', false],\n"
                      "  verification_lapsed:  ['Verification lapsed - please verify again.', true],\n"
                      "  turnstile_failed:     ['Spam check failed - please try again.', true],\n"
                      "  rate_limited:         ['Please wait before submitting again.', true],\n"
                      "  service_misconfigured:['Submissions are temporarily unavailable.', true]\n"
                      "};\n"
                      "const [message, retryable] = M[code] || M.invalid_request;\n"
                      "return [{ json: { ok: false, error: { message, code, retryable } } }];"),
            code_node("lapsed", (220, 200),
                      "const r = ($json.reason || '').toString();\n"
                      "return [{ json: { error_code: r === 'expired' ? 'verification_expired' : 'verification_lapsed' } }];"),
            code_node("rate limited", (1540, 240),
                      "return [{ json: { error_code: 'rate_limited' } }];"),
        ],
        "connections": {
            "Trigger": {"main": [[{"node": "get submission row", "type": "main", "index": 0}]]},
            "get submission row": {"main": [[{"node": "validate + normalize", "type": "main", "index": 0}]]},
            "validate + normalize": {"main": [[{"node": "eligible?", "type": "main", "index": 0}]]},
            "eligible?": {"main": [
                [{"node": "call Re-verify Token v2", "type": "main", "index": 0}],
                [{"node": "shape error", "type": "main", "index": 0}]]},
            "call Re-verify Token v2": {"main": [[{"node": "ownership still proven?", "type": "main", "index": 0}]]},
            "ownership still proven?": {"main": [
                [{"node": "needs turnstile?" if TURNSTILE_ENABLED else "rate: hash",
                  "type": "main", "index": 0}],
                [{"node": "lapsed", "type": "main", "index": 0}]]},
            "lapsed": {"main": [[{"node": "shape error", "type": "main", "index": 0}]]},
            **({
                "needs turnstile?": {"main": [
                    [{"node": "verify turnstile", "type": "main", "index": 0}],
                    [{"node": "rate: hash", "type": "main", "index": 0}]]},
                "verify turnstile": {"main": [
                    [{"node": "turnstile verdict", "type": "main", "index": 0}],
                    [{"node": "turnstile verdict", "type": "main", "index": 0}]]},
                "turnstile verdict": {"main": [[{"node": "turnstile passed?", "type": "main", "index": 0}]]},
                "turnstile passed?": {"main": [
                    [{"node": "rate: hash", "type": "main", "index": 0}],
                    [{"node": "shape error", "type": "main", "index": 0}]]},
            } if TURNSTILE_ENABLED else {}),
            "rate: hash": {"main": [[{"node": "rate: get rows", "type": "main", "index": 0}]]},
            "rate: get rows": {"main": [[{"node": "rate: decide", "type": "main", "index": 0}]]},
            "rate: decide": {"main": [[{"node": "rate limited?", "type": "main", "index": 0}]]},
            "rate limited?": {"main": [
                [{"node": "rate limited", "type": "main", "index": 0}],
                [{"node": "claim: stamp marker", "type": "main", "index": 0}]]},
            "rate limited": {"main": [[{"node": "shape error", "type": "main", "index": 0}]]},
            "claim: stamp marker": {"main": [[{"node": "claim: read back", "type": "main", "index": 0}]]},
            "claim: read back": {"main": [[{"node": "claim: won?", "type": "main", "index": 0}]]},
            "claim: won?": {"main": [[{"node": "claimed?", "type": "main", "index": 0}]]},
            "claimed?": {"main": [
                [{"node": "claim: set pending_review", "type": "main", "index": 0}],
                [{"node": "shape error", "type": "main", "index": 0}]]},
            "claim: set pending_review": {"main": [[{"node": "rate: record", "type": "main", "index": 0}]]},
            "rate: record": {"main": [[{"node": "sign review links", "type": "main", "index": 0}]]},
            "sign review links": {"main": [[{"node": "build reviewer notification", "type": "main", "index": 0}]]},
            "build reviewer notification": {"main": [[{"node": "notify: gotify", "type": "main", "index": 0}]]},
            "notify: gotify": {"main": [
                [{"node": "gotify delivered?", "type": "main", "index": 0}],
                [{"node": "gotify delivered?", "type": "main", "index": 0}]]},
            "gotify delivered?": {"main": [[{"node": "gotify ok?", "type": "main", "index": 0}]]},
            "gotify ok?": {"main": [
                [{"node": "shape success", "type": "main", "index": 0}],
                [{"node": "notify: email fallback", "type": "main", "index": 0}]]},
            "notify: email fallback": {"main": [
                [{"node": "email delivered?", "type": "main", "index": 0}],
                [{"node": "email delivered?", "type": "main", "index": 0}]]},
            "email delivered?": {"main": [[{"node": "notification delivered?", "type": "main", "index": 0}]]},
            "notification delivered?": {"main": [
                [{"node": "shape success", "type": "main", "index": 0}],
                [{"node": "mark notification_failed", "type": "main", "index": 0}]]},
            "mark notification_failed": {"main": [[{"node": "shape notify_failed", "type": "main", "index": 0}]]},
        },
    }




# --- Workflow: Review Action -------------------------------------------------

def wf_review_action(ctx):
    """Signed approve/reject links -> GitHub PR against members/<id>.json.

    Kept entirely off the public Intake router: this is the only workflow
    holding the GitHub PAT, and the only one whose side effects are visible
    outside the system.
    """
    validate_q = """
const q = $('Webhook').first().json.query || {};
const S = (v, max) => {
  const s = (v === undefined || v === null) ? '' : v.toString();
  return s.length > max ? '' : s;
};
return [{ json: {
  submission_id: S(q.submission_id, 128),
  decision: S(q.decision, 16),
  exp: S(q.exp, 12),
  sig: S(q.sig, 128)
} }];
"""

    auth_verdict = """
const v = $json;
// Expiry is only classified once the signature is trusted; doing it the other
// way round would let an unsigned link learn whether an id was real.
if (v.valid !== 'yes') return [{ json: { route: 'invalid' } }];
if (v.expired === 'yes') return [{ json: { route: 'expired' } }];
return [{ json: { route: 'valid', decision: v.decision } }];
"""

    precheck = """
const row = $json;
const decision = $('auth verdict').first().json.decision;
const bad = (msg) => [{ json: { ok: 'no', message: msg } }];

if (!row || !row.submission_id) return bad('This submission no longer exists.');

// approval_failed is resumable: the run died partway and nothing was published,
// so the maintainer must be able to click the same link again. Being stuck
// forever is a worse outcome than the narrow duplicate-PR window noted below.
//
// A reviewing- marker means a run is mid-flight. If it is recent, another click
// must not race it. If it is older than STALE_CLAIM_SECONDS the run that stamped
// it is gone -- crashed, timed out -- and the row would otherwise be stranded
// permanently, actionable by nobody.
const st = String(row.status || '');
let reclaimable = st === 'pending_review' || st === 'approval_failed';
if (!reclaimable && st.indexOf('reviewing-') === 0) {
  const stamped = Number(st.split('-').pop());
  reclaimable = Number.isFinite(stamped) && (Date.now() - stamped) > %(stale)d;
  if (!reclaimable) {
    return bad('This submission is being processed right now. Try again shortly.');
  }
}
if (!reclaimable) return bad('This submission was already resolved.');

// The signature covers `decision`, so a forged value cannot get here -- but an
// explicit check keeps a non-approve value from falling through to the reject
// branch and deleting the row, which is how the original was wired.
if (decision !== 'approve' && decision !== 'reject') return bad('This link is invalid.');

if (decision === 'reject' && !%(email_ok)s) {
  return bad('Cannot reject yet: no sender address is configured, and rejecting ' +
             'deletes the submission permanently. Set NOTIFY_FROM_EMAIL in ' +
             'scripts/n8n/build_workflows.py and fill in the IndieNodes - SMTP ' +
             'credential first. The submission has been left untouched.');
}

return [{ json: { ok: 'yes', submission_id: row.submission_id, decision,
                  email: (row.email || '').toString() } }];
""" % {"email_ok": "true" if EMAIL_CONFIGURED else "false",
       "stale": STALE_CLAIM_SECONDS * 1000}

    # `view` never claims anything -- it is read-only and safe to load any
    # number of times, so it deliberately does not run through `precheck`'s
    # claim-marker logic at all (see the connections below: this is a separate
    # branch off `get submission row`).
    view_gate = """
const row = $json;
const bad = (message) => [{ json: { ok: 'no', message } }];

if (!row || !row.submission_id) return bad('This submission no longer exists.');

// Same actionable set as precheck's reclaimable set, minus the stale-claim
// check -- nothing is being claimed here, so there is no marker age to weigh.
const st = String(row.status || '');
if (st === 'pending_review' || st === 'approval_failed') {
  return [{ json: { ok: 'yes' } }];
}
if (st.indexOf('reviewing-') === 0 || st.indexOf('claiming-') === 0) {
  return bad('This submission is currently being processed.');
}
if (st === 'approved') return bad('This submission has already been approved.');
return bad('This submission is not currently awaiting review.');
"""

    view_page = r"""
const row = $('get submission row').first().json;
const links = $('view: sign fresh links').first().json;
let entry = {}, review = {};
try { entry = JSON.parse(row.entry || '{}'); } catch (e) { entry = {}; }
try { review = JSON.parse(row.review || '{}'); } catch (e) { review = {}; }

// The one thing every interpolated value goes through. This page renders
// submitter-controlled strings in a browser, unlike the Gotify/email
// notification, which never executes markup -- skipping this anywhere is an
// XSS hole into the reviewer's own session on this n8n instance.
const esc = (v) => (v === undefined || v === null ? '' : v.toString())
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const isUpdate = Boolean(row.node_id);
const tags = (entry.tags || []).map(esc);

let mediaHtml = '';
if (entry.type === 'audio' && Array.isArray(entry.tracks)) {
  mediaHtml = '<ul>' + entry.tracks.map((t) =>
    '<li>' + esc(t.label) + ' -- <a href="' + esc(t.media_url) + '" target="_blank" rel="noopener">link</a></li>'
  ).join('') + '</ul>';
} else if (entry.type === 'comic' && Array.isArray(entry.pages)) {
  mediaHtml = entry.pages.map((pg) =>
    '<figure><img src="' + esc(pg.image_url) + '" alt="" style="max-width:320px">' +
    (pg.caption ? '<figcaption>' + esc(pg.caption) + '</figcaption>' : '') + '</figure>'
  ).join('');
} else if (entry.type === 'text' && Array.isArray(entry.excerpts)) {
  mediaHtml = entry.excerpts.map((x) => '<blockquote>' + esc(x) + '</blockquote>').join('');
} else if (entry.type === 'game' && entry.preview_url) {
  mediaHtml = '<a href="' + esc(entry.preview_url) + '" target="_blank" rel="noopener">preview</a>';
}

const thumb = entry.thumb_url
  ? '<img src="' + esc(entry.thumb_url) + '" alt="" style="max-width:200px;display:block;margin:8px 0">'
  : '';

const membership = review.pro_membership
  ? esc(review.pro_membership) + (review.pro_membership_name ? ' (' + esc(review.pro_membership_name) + ')' : '')
  : 'none';

const yn = (v) => v === null || v === undefined ? 'n/a (update)' : (v === true ? 'yes' : 'no');

const body = `
<div class="card">
  <h1>${isUpdate ? 'Update to node <code>' + esc(row.node_id) + '</code>' : 'New submission'}</h1>
  <p class="meta">type: <b>${esc(entry.type)}</b> &middot; submission_id: <code>${esc(row.submission_id)}</code></p>
  <h2>${esc(entry.creator)}</h2>
  <p>${esc(entry.why)}</p>
  ${thumb}
  <p><a href="${esc(row.source_url)}" target="_blank" rel="noopener">${esc(row.source_url)}</a></p>
  <p>tags: ${tags.join(', ') || '(none)'}</p>
  ${mediaHtml}
  <hr>
  <table>
    <tr><td>email</td><td>${esc(review.email)}</td></tr>
    <tr><td>rights confirmed</td><td>${yn(review.rights_confirmation)}</td></tr>
    <tr><td>EULA agreed</td><td>${yn(review.eula_agreement)}</td></tr>
    <tr><td>pro membership</td><td>${membership}</td></tr>
  </table>
  <div class="actions">
    <a class="btn approve" href="${esc(links.approve_link)}">Approve</a>
    <a class="btn reject" href="${esc(links.reject_link)}"
       onclick="return confirm('Reject and permanently delete this submission?')">Reject</a>
  </div>
</div>
`;

const style = `
body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#222}
.card{border:1px solid #ddd;border-radius:8px;padding:1.5rem}
h1{font-size:1.1rem;color:#555;font-weight:normal}
h2{margin-top:0}
table{border-collapse:collapse;margin:1rem 0}
td{padding:2px 12px 2px 0;vertical-align:top}
td:first-child{color:#666}
blockquote{border-left:3px solid #ddd;margin:0.5rem 0;padding-left:1rem;color:#444}
.actions{margin-top:1.5rem}
.btn{display:inline-block;padding:0.6rem 1.4rem;border-radius:6px;text-decoration:none;
     font-weight:bold;margin-right:0.75rem}
.approve{background:#1a7f37;color:#fff}
.reject{background:#cf222e;color:#fff}
`;

return [{ json: {
  html: '<!doctype html><html><head><meta charset="utf-8"><title>IndieNodes review</title>' +
        '<style>' + style + '</style></head><body>' + body + '</body></html>'
} }];
"""

    parse_ring = """
const res = $json;
const status = Number(res.statusCode || 0);
if (status < 200 || status >= 300) return [{ json: { ok: 'no' } }];
try {
  const payload = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
  const ring = JSON.parse(Buffer.from(payload.content || '', 'base64').toString('utf-8'));
  if (!Array.isArray(ring)) return [{ json: { ok: 'no' } }];
  return [{ json: { ok: 'yes', ring, sha: payload.sha } }];
} catch (e) {
  // A swallowed failure here silently disables both the id-collision check and
  // creator_id matching, so it is reported rather than defaulted to [].
  return [{ json: { ok: 'no' } }];
}
"""

    gen_id = r"""
const row = $('get submission row').first().json;
const ring = $json.ring;
let entry = {};
try { entry = JSON.parse(row.entry || '{}'); } catch (e) { entry = {}; }

const slugify = (s) => (s || '').toString().toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

let id;
if (row.node_id) {
  id = row.node_id;
} else {
  let base = slugify(entry.type + '-' + entry.creator).slice(0, 40).replace(/-+$/g, '');
  // A creator name of only punctuation slugifies to '' and would produce an id
  // of '' or '-2', both of which fail schema/ring.schema.json's
  // ^[a-z0-9]+(-[a-z0-9]+)*$ and would be rejected by validate:publish.
  if (!/^[a-z0-9]/.test(base)) base = 'node-' + Date.now().toString(36);
  const taken = new Set(ring.map((e) => e && e.id));
  id = base;
  let n = 2;
  while (taken.has(id)) { id = base + '-' + n; n++; }
}

// Host comparison, done by hand: `URL` is not defined in the n8n Code sandbox.
// The original used `new URL()` inside a try/catch, so it threw ReferenceError
// on every run and the catch swallowed it -- creator_id was never once
// assigned. A silent failure, invisible in the response and the execution log.
const hostOf = (u) => {
  const m = (u || '').toString().match(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^\/?#]*)/);
  if (!m) return '';
  let h = m[1];
  if (h.indexOf('@') !== -1) h = h.split('@').pop();
  if (h.charAt(0) === '[') return h.slice(1, h.indexOf(']')).toLowerCase();
  return h.split(':')[0].toLowerCase();
};

let creator_id = null;
const host = hostOf(row.source_url);
if (host) {
  const match = ring.find((e) => e && hostOf(e.source_url) === host && e.creator_id);
  if (match) creator_id = match.creator_id;
}

return [{ json: { id, creator_id, ring: $json.ring, sha: $json.sha } }];
"""

    strip_fields = r"""
const row = $('get submission row').first().json;
let entry = {};
try { entry = JSON.parse(row.entry || '{}'); } catch (e) { entry = {}; }
const gen = $json;

// Explicit allowlist, matching toRingEntry in src/lib/submissionValidation.js
// field for field. Never a denylist: a field added to the form later must be
// deliberately published, not published by default.
const allowed = ['creator', 'type', 'why', 'tags', 'tracks', 'pages', 'excerpts',
                 'thumb_url', 'preview_url', 'explicit'];
const out = { id: gen.id };
for (const k of allowed) if (entry[k] !== undefined) out[k] = entry[k];

// Backend-assigned. verification_token is a REQUIRED public field per
// schema/ring.schema.json -- it is the token that must stay in the member's
// meta tag, not a leak.
out.source_url = row.source_url;
out.verification_token = row.verification_token;
if (gen.creator_id) out.creator_id = gen.creator_id;

const isUpdate = Boolean(row.node_id);
// Collision-resistant on both paths. The original used a bare
// `submission/<id>`, which collides on any retry.
const suffix = Date.now().toString(36) + '-' + $execution.id;
return [{ json: {
  newEntry: out, id: gen.id, node_id: row.node_id || null,
  branchName: (isUpdate ? 'update/' : 'submission/') + gen.id + '-' + suffix,
  commitMsg: (isUpdate ? 'Update ring entry: ' : 'Add ring entry: ') + gen.id,
  memberContentB64: Buffer.from(JSON.stringify(out, null, '\t') + '\n', 'utf-8').toString('base64'),
  type: out.type, why: out.why, source_url: out.source_url
} }];
"""

    build_member = """
const strip = $('approve: strip fields (allowlist)').first().json;
const existing = $json;
const status = Number(existing.statusCode || 0);
let existingSha = null;
if (status >= 200 && status < 300) {
  try {
    const payload = typeof existing.data === 'string' ? JSON.parse(existing.data) : existing.data;
    existingSha = payload.sha || null;
  } catch (e) { existingSha = null; }
} else if (status !== 404) {
  // Anything other than "found" or "definitely absent" is unknown. Committing
  // without a sha when the file does exist fails with a 409, so stop instead.
  return [{ json: { ok: 'no' } }];
}
return [{ json: Object.assign({ ok: 'yes', existingSha }, strip) }];
"""

    pr_verdict = """
const status = Number($json.statusCode || 0);
let url = '';
try {
  const payload = typeof $json.data === 'string' ? JSON.parse($json.data) : $json.data;
  url = (payload && payload.html_url) || '';
} catch (e) { url = ''; }
return [{ json: { ok: (status >= 200 && status < 300 && url) ? 'yes' : 'no', pr_url: url } }];
"""

    def html(body):
        return ("=<!doctype html><html><head><meta charset=\"utf-8\">"
                "<title>IndieNodes review</title></head><body>" + body + "</body></html>")

    def respond(name, pos, body):
        return node(name, "n8n-nodes-base.respondToWebhook", 1.5, pos, {
            "respondWith": "text", "responseBody": body,
            "options": {"responseHeaders": {"entries": [
                {"name": "Content-Type", "value": "text/html; charset=utf-8"}]}}})

    def gh(name, pos, url, method="GET", body=None):
        params = {"method": method, "url": url,
                  "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                  "options": {"timeout": 10000,
                              "response": {"response": {"neverError": True, "fullResponse": True,
                                                        "responseFormat": "text"}}}}
        if body:
            params.update({"sendBody": True, "specifyBody": "json", "jsonBody": body})
        return node(name, "n8n-nodes-base.httpRequest", 4.5, pos, params,
                    credentials={"httpHeaderAuth": GITHUB_CREDENTIAL},
                    onError="continueErrorOutput")

    def ifn(name, pos, left, right, idx):
        return node(name, "n8n-nodes-base.if", 2.3, pos, {
            "conditions": {"options": {"caseSensitive": True, "leftValue": "",
                                       "typeValidation": "loose", "version": 3},
                           "conditions": [{"id": "r0000000-0000-4000-8000-%012d" % idx,
                                           "leftValue": left, "rightValue": right,
                                           "operator": {"type": "string", "operation": "equals"}}],
                           "combinator": "and"}, "options": {}})

    SUB_COLS = ["submission_id", "node_id", "source_url", "type", "verification_token",
                "expires_at", "status", "entry", "review", "email", "created_at"]
    dt_schema = [{"id": c, "displayName": c, "required": False, "defaultMatch": False,
                  "display": True, "type": "dateTime" if c in ("expires_at", "created_at") else "string",
                  "readOnly": False, "removed": False} for c in SUB_COLS]
    subtable = {"__rl": True, "value": TABLE_SUBMISSIONS, "mode": "list",
                "cachedResultName": "submissions"}
    # Every filter uses exactly ONE condition: n8n ORs multiple conditions.
    sid_filter = {"conditions": [{"keyName": "submission_id",
                                  "keyValue": "={{ $('validate query').first().json.submission_id }}"}]}
    REPO = "https://api.github.com/repos/" + GITHUB_REPO

    return {
        "name": "Webring - Review Action v2",
        "settings": settings(error_workflow_id=ctx.get("error_workflow_id")),
        "nodes": [
            node("Webhook", "n8n-nodes-base.webhook", 2.1, (-1300, 0),
                 {"path": REVIEW_WEBHOOK_PATH, "responseMode": "responseNode", "options": {}}),
            code_node("validate query", (-1080, 0), validate_q),
            node("verify signature", "n8n-nodes-base.executeWorkflow", 1.3, (-860, 0), {
                "workflowId": {"__rl": True, "value": ctx.get("signature_id", ""), "mode": "list",
                               "cachedResultName": "Webring - Helper - Review Link Signature v2"},
                "workflowInputs": {"mappingMode": "defineBelow",
                                   "value": {"mode": "verify",
                                             "submission_id": "={{ $json.submission_id }}",
                                             "decision": "={{ $json.decision }}",
                                             "exp": "={{ $json.exp }}", "sig": "={{ $json.sig }}"},
                                   "matchingColumns": [""], "schema": [],
                                   "attemptToConvertTypes": False, "convertFieldsToString": True},
                "options": {}}),
            code_node("auth verdict", (-640, 0), auth_verdict),
            node("auth route", "n8n-nodes-base.switch", 3.4, (-420, 0), {
                "rules": {"values": [
                    {"conditions": {"options": {"caseSensitive": True, "leftValue": "",
                                                "typeValidation": "loose", "version": 3},
                                    "conditions": [{"id": "a1", "leftValue": "={{ $json.route }}",
                                                    "rightValue": "valid",
                                                    "operator": {"type": "string", "operation": "equals"}}],
                                    "combinator": "and"}},
                    {"conditions": {"options": {"caseSensitive": True, "leftValue": "",
                                                "typeValidation": "loose", "version": 3},
                                    "conditions": [{"id": "a2", "leftValue": "={{ $json.route }}",
                                                    "rightValue": "expired",
                                                    "operator": {"type": "string", "operation": "equals"}}],
                                    "combinator": "and"}}]},
                "options": {"fallbackOutput": "extra"}}),
            respond("respond invalid", (-200, 180), html("<h1>This link is invalid.</h1>")),
            respond("respond expired", (-200, 60), html("<h1>This link has expired.</h1>"
                                                        "<p>Ask for a fresh review link.</p>")),

            node("get submission row", "n8n-nodes-base.dataTable", 1.1, (20, -140), {
                "operation": "get", "dataTableId": subtable, "filters": sid_filter},
                 alwaysOutputData=True),
            # `view` branches off here, before precheck, because precheck's job
            # is claiming a row for approve/reject -- view must never claim.
            ifn("view route", (240, -320), "={{ $('auth verdict').first().json.decision }}", "view", 20),
            code_node("view: gate", (460, -420), view_gate),
            ifn("view: pending?", (680, -420), "={{ $json.ok }}", "yes", 21),
            node("view: sign fresh links", "n8n-nodes-base.executeWorkflow", 1.3, (900, -480), {
                "workflowId": {"__rl": True, "value": ctx.get("signature_id", ""), "mode": "list",
                               "cachedResultName": "Webring - Helper - Review Link Signature v2"},
                "workflowInputs": {"mappingMode": "defineBelow",
                                   "value": {"mode": "sign",
                                             "submission_id": "={{ $('validate query').first().json.submission_id }}",
                                             "decision": "", "exp": "", "sig": ""},
                                   "matchingColumns": [""], "schema": [],
                                   "attemptToConvertTypes": False, "convertFieldsToString": True},
                "options": {}}),
            code_node("view: build page", (1120, -480), view_page),
            respond("respond view", (1340, -480), "={{ $json.html }}"),
            respond("respond view unavailable", (900, -360),
                    "={{ '<!doctype html><html><head><meta charset=\"utf-8\"><title>IndieNodes review</title></head><body><h1>' + $json.message + '</h1></body></html>' }}"),

            code_node("precheck", (240, -140), precheck),
            ifn("may proceed?", (460, -140), "={{ $json.ok }}", "yes", 1),
            respond("respond not actionable", (680, 40),
                    "={{ '<!doctype html><html><head><meta charset=\"utf-8\"><title>IndieNodes review</title></head><body><h1>' + $json.message + '</h1></body></html>' }}"),

            # Optimistic marker claim -- single-condition filters only (see P-1).
            node("claim: stamp marker", "n8n-nodes-base.dataTable", 1.1, (680, -220), {
                "operation": "update", "dataTableId": subtable, "filters": sid_filter,
                "columns": {"mappingMode": "defineBelow",
                            # Timestamped so an abandoned claim can be told from a
                            # live one -- see STALE_CLAIM_SECONDS.
                            "value": {"status": "=reviewing-{{ $execution.id }}-{{ Date.now() }}"},
                            "matchingColumns": [], "schema": dt_schema,
                            "attemptToConvertTypes": False, "convertFieldsToString": False},
                "options": {}}, alwaysOutputData=True),
            node("claim: read back", "n8n-nodes-base.dataTable", 1.1, (900, -220), {
                "operation": "get", "dataTableId": subtable, "filters": sid_filter},
                 alwaysOutputData=True),
            code_node("claim: won?", (1120, -220),
                      "const mine = 'reviewing-' + $execution.id + '-';\n"
                      "// Two simultaneous clicks both pass the status check above; only the\n"
                      "// run whose marker survives the read-back may cause side effects.\n"
                      "const status = ($json && $json.status) ? String($json.status) : '';\n"
                      "return [{ json: { ok: status.indexOf(mine) === 0 ? 'yes' : 'no',\n"
                      "                  message: 'This submission was already resolved.' } }];"),
            ifn("claimed?", (1340, -220), "={{ $json.ok }}", "yes", 2),
            node("decision route", "n8n-nodes-base.switch", 3.4, (1560, -220), {
                "rules": {"values": [
                    {"conditions": {"options": {"caseSensitive": True, "leftValue": "",
                                                "typeValidation": "loose", "version": 3},
                                    "conditions": [{"id": "d1",
                                                    "leftValue": "={{ $('precheck').first().json.decision }}",
                                                    "rightValue": "approve",
                                                    "operator": {"type": "string", "operation": "equals"}}],
                                    "combinator": "and"}}]},
                "options": {"fallbackOutput": "extra"}}),

            # --- reject ---
            node("reject: notify submitter", "n8n-nodes-base.emailSend", 2.1, (1780, 40), {
                "fromEmail": NOTIFY_FROM_EMAIL,
                "toEmail": "={{ $('precheck').first().json.email }}",
                "subject": "About your IndieNodes submission",
                "emailFormat": "text",
                # No reason is given and none is stored: the row is deleted
                # immediately after, and a rejection rationale would be exactly
                # the kind of record spec section 5 step 9 says is not retained.
                "text": "=Thanks for submitting to IndieNodes.\n\nAfter review, your submission was not added to the ring this time. Nothing about it has been kept.\n\nYou're welcome to submit again.\n\n-- IndieNodes",
                "options": {}},
                 credentials={"smtp": SMTP_CREDENTIAL},
                 onError="continueErrorOutput"),
            code_node("reject: delivered?", (2000, 40),
                      "// Send Email throws rather than returning a status, so reaching the\n"
                      "// success output is the signal. Nothing is deleted unless it does.\n"
                      "const failed = Boolean($json.error) || $json.__error === true;\n"
                      "return [{ json: { ok: failed ? 'no' : 'yes' } }];"),
            ifn("reject: notified?", (2220, 40), "={{ $json.ok }}", "yes", 3),
            node("reject: delete row", "n8n-nodes-base.dataTable", 1.1, (2440, -20), {
                "operation": "deleteRows", "dataTableId": subtable, "filters": sid_filter,
                "options": {}}),
            respond("respond rejected", (2660, -20),
                    html("<h1>Rejected.</h1><p>The submitter has been notified and the "
                         "submission has been deleted.</p>")),
            node("reject: restore status", "n8n-nodes-base.dataTable", 1.1, (2440, 140), {
                "operation": "update", "dataTableId": subtable, "filters": sid_filter,
                "columns": {"mappingMode": "defineBelow", "value": {"status": "pending_review"},
                            "matchingColumns": [], "schema": dt_schema,
                            "attemptToConvertTypes": False, "convertFieldsToString": False},
                "options": {}}),
            respond("respond reject failed", (2660, 140),
                    html("<h1>Could not reject.</h1><p>The submitter could not be notified, so "
                         "nothing was deleted. The submission is still pending and this link "
                         "still works.</p>")),

            # --- approve ---
            gh("approve: fetch ring.json", (1780, -320), REPO + "/contents/ring.json"),
            code_node("approve: parse ring", (2000, -320), parse_ring),
            ifn("approve: ring ok?", (2220, -320), "={{ $json.ok }}", "yes", 4),
            code_node("approve: generate id + creator_id", (2440, -320), gen_id),
            code_node("approve: strip fields (allowlist)", (2660, -320), strip_fields),
            # Authenticated, unlike the original: an unauthenticated call shares
            # the 60/hour anonymous pool, and exhausting it yields a null sha,
            # which makes updating an existing member file fail with a 409.
            gh("approve: check existing member file", (2880, -320),
               "={{ '%s/contents/members/' + $json.id + '.json' }}" % REPO),
            code_node("approve: build member file", (3100, -320), build_member),
            ifn("approve: member sha known?", (3320, -320), "={{ $json.ok }}", "yes", 5),
            gh("approve: get main ref", (3540, -320), REPO + "/git/ref/heads/main"),
            gh("approve: create branch", (3760, -320), REPO + "/git/refs", "POST",
               "={{ JSON.stringify({ ref: 'refs/heads/' + $('approve: build member file').first().json.branchName, sha: JSON.parse($json.data).object.sha }) }}"),
            gh("approve: commit member file", (3980, -320),
               "={{ '%s/contents/members/' + $('approve: build member file').first().json.id + '.json' }}" % REPO,
               "PUT",
               "={{ JSON.stringify(Object.assign({ message: $('approve: build member file').first().json.commitMsg, content: $('approve: build member file').first().json.memberContentB64, branch: $('approve: build member file').first().json.branchName }, $('approve: build member file').first().json.existingSha ? { sha: $('approve: build member file').first().json.existingSha } : {})) }}"),
            gh("approve: open PR", (4200, -320), REPO + "/pulls", "POST",
               "={{ JSON.stringify({ title: $('approve: build member file').first().json.commitMsg, head: $('approve: build member file').first().json.branchName, base: 'main', body: 'Adds/updates a `' + $('approve: build member file').first().json.type + '` entry.\\n\\n- Source: ' + $('approve: build member file').first().json.source_url + '\\n- Passed automated ownership verification and private maintainer review.\\n\\nOpened automatically. `npm run validate:publish` runs on it via CI; ring.json is regenerated from members/*.json by a separate auto-build workflow. Merging still requires a manual review of that check.' }) }}"),
            code_node("approve: PR verdict", (4420, -320), pr_verdict),
            ifn("approve: PR created?", (4640, -320), "={{ $json.ok }}", "yes", 6),
            node("approve: mark approved + scrub", "n8n-nodes-base.dataTable", 1.1, (4860, -400), {
                "operation": "update", "dataTableId": subtable, "filters": sid_filter,
                "columns": {"mappingMode": "defineBelow",
                            "value": {"status": "approved", "email": "", "review": ""},
                            "matchingColumns": [], "schema": dt_schema,
                            "attemptToConvertTypes": False, "convertFieldsToString": False},
                "options": {}}),
            respond("respond approved", (5080, -400),
                    "={{ '<!doctype html><html><head><meta charset=\"utf-8\"><title>IndieNodes review</title></head><body><h1>Approved</h1><p>PR opened: <a href=\"' + $('approve: PR verdict').first().json.pr_url + '\">' + $('approve: PR verdict').first().json.pr_url + '</a></p></body></html>' }}"),
            node("approve: mark approval_failed", "n8n-nodes-base.dataTable", 1.1, (4860, -180), {
                "operation": "update", "dataTableId": subtable, "filters": sid_filter,
                "columns": {"mappingMode": "defineBelow", "value": {"status": "approval_failed"},
                            "matchingColumns": [], "schema": dt_schema,
                            "attemptToConvertTypes": False, "convertFieldsToString": False},
                "options": {}}),
            # Deliberately generic: the original interpolated the raw GitHub
            # response into this page.
            respond("respond approval failed", (5080, -180),
                    html("<h1>Something went wrong.</h1><p>The submission was NOT marked "
                         "approved and nothing was published. Details are in the n8n "
                         "execution log. This link is safe to retry.</p>")),
        ],
        "connections": {
            "Webhook": {"main": [[{"node": "validate query", "type": "main", "index": 0}]]},
            "validate query": {"main": [[{"node": "verify signature", "type": "main", "index": 0}]]},
            "verify signature": {"main": [[{"node": "auth verdict", "type": "main", "index": 0}]]},
            "auth verdict": {"main": [[{"node": "auth route", "type": "main", "index": 0}]]},
            "auth route": {"main": [
                [{"node": "get submission row", "type": "main", "index": 0}],
                [{"node": "respond expired", "type": "main", "index": 0}],
                [{"node": "respond invalid", "type": "main", "index": 0}]]},
            "get submission row": {"main": [[{"node": "view route", "type": "main", "index": 0}]]},
            "view route": {"main": [
                [{"node": "view: gate", "type": "main", "index": 0}],
                [{"node": "precheck", "type": "main", "index": 0}]]},
            "view: gate": {"main": [[{"node": "view: pending?", "type": "main", "index": 0}]]},
            "view: pending?": {"main": [
                [{"node": "view: sign fresh links", "type": "main", "index": 0}],
                [{"node": "respond view unavailable", "type": "main", "index": 0}]]},
            "view: sign fresh links": {"main": [[{"node": "view: build page", "type": "main", "index": 0}]]},
            "view: build page": {"main": [[{"node": "respond view", "type": "main", "index": 0}]]},
            "precheck": {"main": [[{"node": "may proceed?", "type": "main", "index": 0}]]},
            "may proceed?": {"main": [
                [{"node": "claim: stamp marker", "type": "main", "index": 0}],
                [{"node": "respond not actionable", "type": "main", "index": 0}]]},
            "claim: stamp marker": {"main": [[{"node": "claim: read back", "type": "main", "index": 0}]]},
            "claim: read back": {"main": [[{"node": "claim: won?", "type": "main", "index": 0}]]},
            "claim: won?": {"main": [[{"node": "claimed?", "type": "main", "index": 0}]]},
            "claimed?": {"main": [
                [{"node": "decision route", "type": "main", "index": 0}],
                [{"node": "respond not actionable", "type": "main", "index": 0}]]},
            "decision route": {"main": [
                [{"node": "approve: fetch ring.json", "type": "main", "index": 0}],
                [{"node": "reject: notify submitter", "type": "main", "index": 0}]]},

            "reject: notify submitter": {"main": [
                [{"node": "reject: delivered?", "type": "main", "index": 0}],
                [{"node": "reject: delivered?", "type": "main", "index": 0}]]},
            "reject: delivered?": {"main": [[{"node": "reject: notified?", "type": "main", "index": 0}]]},
            "reject: notified?": {"main": [
                [{"node": "reject: delete row", "type": "main", "index": 0}],
                [{"node": "reject: restore status", "type": "main", "index": 0}]]},
            "reject: delete row": {"main": [[{"node": "respond rejected", "type": "main", "index": 0}]]},
            "reject: restore status": {"main": [[{"node": "respond reject failed", "type": "main", "index": 0}]]},

            "approve: fetch ring.json": {"main": [
                [{"node": "approve: parse ring", "type": "main", "index": 0}],
                [{"node": "approve: parse ring", "type": "main", "index": 0}]]},
            "approve: parse ring": {"main": [[{"node": "approve: ring ok?", "type": "main", "index": 0}]]},
            "approve: ring ok?": {"main": [
                [{"node": "approve: generate id + creator_id", "type": "main", "index": 0}],
                [{"node": "approve: mark approval_failed", "type": "main", "index": 0}]]},
            "approve: generate id + creator_id": {"main": [[{"node": "approve: strip fields (allowlist)", "type": "main", "index": 0}]]},
            "approve: strip fields (allowlist)": {"main": [[{"node": "approve: check existing member file", "type": "main", "index": 0}]]},
            "approve: check existing member file": {"main": [
                [{"node": "approve: build member file", "type": "main", "index": 0}],
                [{"node": "approve: build member file", "type": "main", "index": 0}]]},
            "approve: build member file": {"main": [[{"node": "approve: member sha known?", "type": "main", "index": 0}]]},
            "approve: member sha known?": {"main": [
                [{"node": "approve: get main ref", "type": "main", "index": 0}],
                [{"node": "approve: mark approval_failed", "type": "main", "index": 0}]]},
            "approve: get main ref": {"main": [
                [{"node": "approve: create branch", "type": "main", "index": 0}],
                [{"node": "approve: mark approval_failed", "type": "main", "index": 0}]]},
            "approve: create branch": {"main": [
                [{"node": "approve: commit member file", "type": "main", "index": 0}],
                [{"node": "approve: mark approval_failed", "type": "main", "index": 0}]]},
            "approve: commit member file": {"main": [
                [{"node": "approve: open PR", "type": "main", "index": 0}],
                [{"node": "approve: mark approval_failed", "type": "main", "index": 0}]]},
            "approve: open PR": {"main": [
                [{"node": "approve: PR verdict", "type": "main", "index": 0}],
                [{"node": "approve: PR verdict", "type": "main", "index": 0}]]},
            "approve: PR verdict": {"main": [[{"node": "approve: PR created?", "type": "main", "index": 0}]]},
            "approve: PR created?": {"main": [
                [{"node": "approve: mark approved + scrub", "type": "main", "index": 0}],
                [{"node": "approve: mark approval_failed", "type": "main", "index": 0}]]},
            "approve: mark approved + scrub": {"main": [[{"node": "respond approved", "type": "main", "index": 0}]]},
            "approve: mark approval_failed": {"main": [[{"node": "respond approval failed", "type": "main", "index": 0}]]},
        },
    }



# --- Workflow: Intake --------------------------------------------------------

def wf_intake(ctx):
    """The public HTTP boundary. One webhook, six actions, one response shape.

    Every failure path returns JSON. The original could hang instead: its
    honeypot IF compared body.elapsed_ms numerically under strict type
    validation, so a missing or wrong-typed field threw; no node anywhere set
    onError, so the throw aborted the run before any Respond node executed and
    the browser sat until webhookClient.js's 15s timeout. All validation now
    happens in one Code node that cannot throw on a missing field, and every
    Execute Workflow node routes its errors to a responder.
    """
    classify = """
const body = $json.body;
const err = (code, message, retryable) =>
  [{ json: { route: 'error', payload: { ok: false, error: { message, code, retryable } } } }];

// A non-object body (malformed JSON, form encoding, empty POST) is a client
// error, not a reason to stop responding.
if (!body || typeof body !== 'object' || Array.isArray(body)) {
  return err('invalid_request', 'That request was not valid.', false);
}

const action = typeof body.action === 'string' ? body.action : '';
const TOKEN_ACTIONS = ['issue_token', 'request_update_token', 'bind_source_url', 'verify'];
const FINAL_ACTIONS = ['submit', 'submit_update'];
if (!TOKEN_ACTIONS.includes(action) && !FINAL_ACTIONS.includes(action)) {
  return err('unsupported_action', 'Unsupported submission action.', false);
}

// Bot gate, before anything is allocated. Compared as strings/numbers here
// rather than in a strict-typed IF, so a missing field is "suspicious", never
// an exception.
const website = typeof body.website === 'string' ? body.website : '';
const elapsed = Number(body.elapsed_ms);
const tooFast = !Number.isFinite(elapsed) || elapsed < %(dwell)d;
if (website !== '' || tooFast) {
  return [{ json: { route: 'dropped', action } }];
}

return [{ json: {
  route: TOKEN_ACTIONS.includes(action) ? 'token' : 'final',
  action, body
} }];
""" % {"dwell": MIN_DWELL_MS}

    fake = """
// Shapes match the real success envelope for the requested action, so a bot
// cannot tell it was dropped. Nothing is allocated and no row is written.
const a = $json.action;
const fakeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const exp = new Date(Date.now() + 86400000).toISOString();
const shapes = {
  issue_token:          { submission_id: fakeId(), verification_token: fakeId(), expires_at: exp },
  request_update_token: { submission_id: fakeId(), verification_token: fakeId(), expires_at: exp },
  bind_source_url:      { bound: true },
  verify:               { verified: false, reason: 'not_ready' },
  submit:               { reference: fakeId() },
  submit_update:        { reference: fakeId() }
};
return [{ json: Object.assign({ ok: true }, shapes[a] || {}) }];
"""

    def call(name, pos, wid, cached):
        return node(name, "n8n-nodes-base.executeWorkflow", 1.3, pos, {
            "workflowId": {"__rl": True, "value": wid, "mode": "list", "cachedResultName": cached},
            "workflowInputs": {"mappingMode": "defineBelow", "value": {"body": "={{ $json.body }}"},
                               "matchingColumns": [""],
                               "schema": [{"id": "body", "displayName": "body", "required": False,
                                           "defaultMatch": False, "display": True,
                                           "canBeUsedToMatch": True, "type": "object",
                                           "removed": False}],
                               "attemptToConvertTypes": False, "convertFieldsToString": False},
            "options": {}}, onError="continueErrorOutput")

    def rule(val, i):
        return {"conditions": {"options": {"caseSensitive": True, "leftValue": "",
                                           "typeValidation": "loose", "version": 3},
                               "conditions": [{"id": "n%d" % i, "leftValue": "={{ $json.route }}",
                                               "rightValue": val,
                                               "operator": {"type": "string", "operation": "equals"}}],
                               "combinator": "and"}}

    return {
        "name": "Webring - Intake v2",
        "settings": settings(error_workflow_id=ctx.get("error_workflow_id")),
        "nodes": [
            node("Webhook", "n8n-nodes-base.webhook", 2.1, (-880, 0), {
                "httpMethod": "POST", "path": INTAKE_WEBHOOK_PATH,
                "responseMode": "responseNode",
                "options": {"allowedOrigins": INTAKE_ALLOWED_ORIGINS}}),
            code_node("validate + classify", (-660, 0), classify),
            node("route", "n8n-nodes-base.switch", 3.4, (-440, 0), {
                "rules": {"values": [rule("token", 1), rule("final", 2), rule("dropped", 3)]},
                "options": {"fallbackOutput": "extra"}}),
            call("call Token Lifecycle v2", (-200, -180), ctx.get("lifecycle_id", ""),
                 "Webring - Token Lifecycle v2"),
            call("call Finalize Submission v2", (-200, -20), ctx.get("finalize_id", ""),
                 "Webring - Action - Finalize Submission v2"),
            code_node("shape fake success", (-200, 140), fake),
            code_node("shape client error", (-200, 300), "return [{ json: $json.payload }];"),
            # A sub-workflow that throws must still produce JSON. Without this
            # the run aborts, Respond never fires, and the browser waits out its
            # own 15s timeout on what is really a server fault.
            code_node("shape operational error", (60, 420),
                      "return [{ json: { ok: false, error: {\n"
                      "  message: 'Something went wrong on our side. Please try again.',\n"
                      "  code: 'internal_error', retryable: true } } }];"),
            node("Respond", "n8n-nodes-base.respondToWebhook", 1.5, (320, 0),
                 {"respondWith": "json", "responseBody": "={{ $json }}", "options": {}}),
        ],
        "connections": {
            "Webhook": {"main": [[{"node": "validate + classify", "type": "main", "index": 0}]]},
            "validate + classify": {"main": [[{"node": "route", "type": "main", "index": 0}]]},
            "route": {"main": [
                [{"node": "call Token Lifecycle v2", "type": "main", "index": 0}],
                [{"node": "call Finalize Submission v2", "type": "main", "index": 0}],
                [{"node": "shape fake success", "type": "main", "index": 0}],
                [{"node": "shape client error", "type": "main", "index": 0}]]},
            "call Token Lifecycle v2": {"main": [
                [{"node": "Respond", "type": "main", "index": 0}],
                [{"node": "shape operational error", "type": "main", "index": 0}]]},
            "call Finalize Submission v2": {"main": [
                [{"node": "Respond", "type": "main", "index": 0}],
                [{"node": "shape operational error", "type": "main", "index": 0}]]},
            "shape fake success": {"main": [[{"node": "Respond", "type": "main", "index": 0}]]},
            "shape client error": {"main": [[{"node": "Respond", "type": "main", "index": 0}]]},
            "shape operational error": {"main": [[{"node": "Respond", "type": "main", "index": 0}]]},
        },
    }


BUILDERS = [
    ("error-workflow", wf_error_workflow),
    ("signature-helper", wf_signature_helper),
    ("reverify-token", wf_reverify_token),
    ("token-lifecycle", wf_token_lifecycle),
    ("finalize-submission", wf_finalize_submission),
    ("review-action", wf_review_action),
    ("intake", wf_intake),
]


# --- n8n API ----------------------------------------------------------------

def api_key():
    path = os.path.expanduser("~/.n8n-api-key")
    if not os.path.exists(path):
        sys.exit(f"missing {path} -- see docs/n8n-intake-review-refactor-plan.md Phase 0")
    return open(path).read().strip()


def request(method, path, key, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method,
                                 headers={"X-N8N-API-KEY": key,
                                          "Content-Type": "application/json",
                                          # Cloudflare fronts this host and 403s
                                          # (error 1010) on the default
                                          # Python-urllib agent.
                                          "User-Agent": "indienodes-workflow-generator/1"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or "{}")
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} -> HTTP {e.code}: {e.read().decode()[:400]}")


def existing_by_name(key):
    out = {}
    for w in request("GET", "/workflows?limit=250", key).get("data", []):
        out.setdefault(w["name"], w["id"])
    return out


def push(payload, key, existing):
    # An Execute Workflow node with an empty workflowId is accepted by the API
    # and only fails later, at activation, with a message that does not name the
    # cause. Catch it at the source.
    for n in payload["nodes"]:
        if n["type"] == "n8n-nodes-base.executeWorkflow":
            wid = (n["parameters"].get("workflowId") or {}).get("value")
            if not wid:
                sys.exit(f"{payload['name']}: node {n['name']!r} has no workflowId -- "
                         f"its target workflow does not exist yet")
    body = {k: payload[k] for k in ("name", "nodes", "connections", "settings")}
    wid = existing.get(payload["name"])
    if wid:
        request("PUT", f"/workflows/{wid}", key, body)
        return wid, "updated"
    return request("POST", "/workflows", key, body)["id"], "created"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--push", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--only")
    args = ap.parse_args()

    if args.list:
        for name, _ in BUILDERS:
            print(" ", name)
        return

    if not (args.dry_run or args.push):
        ap.error("pass --dry-run or --push")

    key = api_key() if args.push else None
    existing = existing_by_name(key) if args.push else {}
    callers = [existing[n] for n in SIGNATURE_CALLER_NAMES if n in existing]
    callers += [c for c in os.environ.get("N8N_EXTRA_CALLERS", "").split(",") if c]
    extra = [c for c in os.environ.get("N8N_EXTRA_CALLERS", "").split(",") if c]
    ctx = {"error_workflow_id": existing.get(ERROR_WORKFLOW_NAME),
           "signature_callers": callers,
           "reverify_callers": [existing[n] for n in REVERIFY_CALLER_NAMES
                                if n in existing] + extra,
           "reverify_id": existing.get("Webring - Helper - Re-verify Token v2", ""),
           "lifecycle_callers": [existing[n] for n in ["Webring - Intake v2"]
                                 if n in existing] + extra,
           "signature_id": existing.get("Webring - Helper - Review Link Signature v2", ""),
           "finalize_callers": [existing[n] for n in ["Webring - Intake v2"]
                                if n in existing] + extra}

    def rebuild_ctx():
        callers = [existing[n] for n in SIGNATURE_CALLER_NAMES if n in existing] + extra
        ctx.update({
            "error_workflow_id": existing.get(ERROR_WORKFLOW_NAME),
            "signature_callers": callers,
            "signature_id": existing.get("Webring - Helper - Review Link Signature v2", ""),
            "reverify_id": existing.get("Webring - Helper - Re-verify Token v2", ""),
            "reverify_callers": [existing[n] for n in REVERIFY_CALLER_NAMES if n in existing] + extra,
            "lifecycle_callers": [existing[n] for n in ["Webring - Intake v2"] if n in existing] + extra,
            "finalize_callers": [existing[n] for n in ["Webring - Intake v2"] if n in existing] + extra,
            "lifecycle_id": existing.get("Webring - Token Lifecycle v2", ""),
            "finalize_id": existing.get("Webring - Action - Finalize Submission v2", ""),
        })

    targets = [(n, b) for n, b in BUILDERS if not args.only or args.only == n]

    if args.dry_run:
        for name, builder in targets:
            wf = builder(ctx)
            print(f"--- {name}: {wf['name']} ({len(wf['nodes'])} nodes)")
            print(json.dumps(wf, indent=2)[:400] + " ...")
        return

    # Two passes. A caller allowlist can only name workflows that already
    # exist, so a helper pushed before its caller is built ends up refusing it
    # ("cannot be called by this workflow"). The second pass re-resolves every
    # allowlist now that all the IDs are known.
    passes = 2 if len(targets) > 1 else 1
    for p in range(passes):
        rebuild_ctx()
        for name, builder in targets:
            wf = builder(ctx)
            wid, action = push(wf, key, existing)
            existing[wf["name"]] = wid
            if p == passes - 1:
                print(f"  {action:<8} {wid}  {wf['name']}  ({len(wf['nodes'])} nodes)")


if __name__ == "__main__":
    main()
