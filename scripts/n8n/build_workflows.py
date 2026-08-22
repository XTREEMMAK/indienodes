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
TABLE_CONFIG = "7O6Wxa7D1HVPwTN6"

# The HMAC secret lives here, not in this file and not in the workflow JSON.
CRYPTO_CREDENTIAL = {"id": "9VIejqScJ05LM6X7", "name": "IndieNodes - Review Link HMAC"}

# Controlled configuration rather than a literal buried in a Code node.
REVIEW_WEBHOOK_BASE = f"{N8N_BASE}/webhook/indienodes-review-action"

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
  // One item per decision. The Crypto node runs per item, so both signatures
  // come out of a single node rather than two parallel ones.
  return ['approve', 'reject'].map((d) => ({{
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
    (decision === 'approve' || decision === 'reject') &&
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


BUILDERS = [
    ("error-workflow", wf_error_workflow),
    ("signature-helper", wf_signature_helper),
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
    ctx = {"error_workflow_id": existing.get(ERROR_WORKFLOW_NAME),
           "signature_callers": callers}

    for name, builder in BUILDERS:
        if args.only and args.only != name:
            continue
        wf = builder(ctx)
        if args.dry_run:
            print(f"--- {name}: {wf['name']} ({len(wf['nodes'])} nodes)")
            print(json.dumps(wf, indent=2)[:400] + " ...")
            continue
        wid, action = push(wf, key, existing)
        existing[wf["name"]] = wid
        if name == "error-workflow":
            ctx["error_workflow_id"] = wid
        print(f"  {action:<8} {wid}  {wf['name']}  ({len(wf['nodes'])} nodes)")


if __name__ == "__main__":
    main()
