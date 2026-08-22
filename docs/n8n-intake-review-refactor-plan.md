# n8n Intake and Review Refactor Plan

Date: 2026-08-21 (revised 2026-08-22 after a node-by-node verification pass)  
Audience: Claude operating against the n8n API  
Source snapshot: `tmp/n8n-workflows-export/*.json`

## Read this first: the current state of the system

The exported workflows are not a working system being tuned. Two independent faults
mean the submission pipeline cannot complete a single end-to-end submission today:

1. **`indienodes-submit` has no active owner.** Both `Webring - Intake`
   (`VdndGTIVGzytESkn`) and the 91-node flat fallback (`KIAQxUghXndjXeEz`) are
   `active: false`. A POST from the live form gets n8n's unregistered-webhook 404, which
   `src/lib/webhookClient.js` surfaces as `http_404`.
2. **No reviewer is ever notified.** `config.discord_webhook_url` is empty, and the
   "has notify webhook?" branch treats that as success.

So a submission accepted today would be stored at `pending_review` and notify nobody. Its
approve/reject links would be valid — signature verification does work (see §1.1) — but
nobody would ever receive them.

The decision taken is **fix forward**: leave Intake inactive and build the replacement
rather than restoring a pipeline whose review half is broken. Nothing is lost by the
wait.

## Objective

Refactor the IndieNodes Intake and Review workflows to reduce duplicated nodes and
workflow count while preserving visible security boundaries, useful execution traces, and
stable client responses.

The refactor must also correct the security and contract defects identified in the
exported workflows. **Node-count reduction is secondary to correctness.** Several Phase 1
corrections — server-side validation, atomic status claims, reject notification, approval
failure recovery — add nodes that do not exist today. The net reduction below is smaller
than a pure consolidation exercise would produce, and that is the intended trade.

Expected outcome:

- Reduce the intended production system from 11 workflows to 6 (plus one Error Workflow).
- Reduce the intended graph from 129 nodes to approximately 100 after security corrections.
- Keep each workflow at roughly 30 nodes or fewer.
- Keep the Review Action isolated from the public Intake router.
- Keep SSRF egress isolated in one reusable helper.
- Keep review-link signing and verification in **one** shared implementation, so the two
  sides cannot drift apart again.
- Preserve the client contract in `src/lib/submissionApi.js` and
  `src/lib/webhookClient.js`.

## Non-negotiable execution rules

1. Do not edit workflows in place without first exporting a fresh backup through the n8n
   API.
2. Do not delete old workflows during the refactor. Deactivate and archive them only after
   the replacement passes the complete test matrix.
3. Build replacements under temporary `v2` names and test webhook paths before switching
   production traffic.
4. Never place a real secret, credential value, webhook token, or Personal Access Token in
   this repository, an API transcript, a Code node, a sticky note, or a workflow export.
5. Do not silently substitute an empty string when a required secret or configuration
   value is missing.
6. Do not activate two workflows with the same production webhook path.
7. Do not expose raw GitHub, Discord, SMTP, Turnstile, or internal n8n error bodies in
   browser responses.
8. Keep a rollback path until production smoke tests pass.
9. If the installed n8n version does not support a required secure operation, stop and
   report the limitation instead of approximating the security requirement.
10. Preserve credential references by credential ID where possible. Never recreate secrets
    from exported JSON.
11. **Set every cryptographic algorithm explicitly.** Never rely on an n8n node's default
    `type`. It happens to be SHA256 on this instance (verified 2026-08-22), but a default
    is not a guarantee across upgrades, and `compute signature` currently depends on one.

## Current workflow inventory

| Workflow                                | ID                 |        Active | Nodes | Planned disposition                   |
| --------------------------------------- | ------------------ | ------------: | ----: | ------------------------------------- |
| Webring - Intake router                 | `VdndGTIVGzytESkn` |            No |    11 | Replace with Intake v2                |
| Webring - Intake flat fallback          | `KIAQxUghXndjXeEz` | No (archived) |    91 | Already archived; leave alone         |
| Webring - Action - Issue Token          | `b6VtjxfnG4DGpkkO` |           Yes |     6 | Merge into Token Lifecycle v2         |
| Webring - Action - Request Update Token | `1MHpokleoH2zJacp` |           Yes |    10 | Merge into Token Lifecycle v2         |
| Webring - Action - Bind Source URL      | `IxlDDPZ4lByRhz6z` |           Yes |     8 | Merge into Token Lifecycle v2         |
| Webring - Action - Verify               | `FJrNDbU5FSETe7WV` |           Yes |     9 | Merge into Token Lifecycle v2         |
| Webring - Action - Submit               | `4vmvgcbRYDDKH1QZ` |           Yes |    17 | Merge into Finalize Submission v2     |
| Webring - Action - Submit Update        | `mffRcWJRouz3tUyT` |           Yes |    23 | Merge into Finalize Submission v2     |
| Webring - Helper - Re-verify Token      | `SXGAxDAXG99Sj8SG` |           Yes |     3 | Keep and harden                       |
| Webring - Helper - Rate Limit Check     | `9QqF74TKtTYrBKN5` |           Yes |     6 | Inline into Finalize Submission v2    |
| Webring - Helper - Build Signed Links   | `V4xHyw1Ijczd55Aj` |           Yes |     6 | Replace with Review Link Signature v2 |
| Webring - Review Action                 | `Slp86o7ChA3gqO3u` |           Yes |    30 | Keep separate and harden              |

129 nodes across the 11 non-fallback workflows.

Current Data Tables referenced by the exports:

| Table         | ID                 | Purpose                                     |
| ------------- | ------------------ | ------------------------------------------- |
| `submissions` | `S9cDTcuSPChwnAyW` | Token, submission, review, and status state |
| `rate_limits` | `7vIXsDBxw66XRhFt` | Hashed source URL and timestamp             |
| `config`      | `7O6Wxa7D1HVPwTN6` | Current operational configuration           |

Treat these IDs as environment-specific. Confirm them through the n8n API before applying
changes. After §1.1 and §1.7, `config` should hold no secrets — only genuinely
non-sensitive operational settings, if any remain.

## Target workflow inventory

|   # | Workflow                                 | Actions owned                                                      | Target nodes |
| --: | ---------------------------------------- | ------------------------------------------------------------------ | -----------: |
|   1 | Webring - Intake                         | HTTP boundary, honeypot, validation, routing, response             |          ~11 |
|   2 | Webring - Token Lifecycle                | `issue_token`, `request_update_token`, `bind_source_url`, `verify` |          ~22 |
|   3 | Webring - Finalize Submission            | `submit`, `submit_update`                                          |          ~26 |
|   4 | Webring - Helper - Re-verify Token       | Submitter-controlled URL fetch (SSRF boundary)                     |           ~5 |
|   5 | Webring - Helper - Review Link Signature | HMAC sign and verify                                               |           ~4 |
|   6 | Webring - Review Action                  | Signed approve/reject links, GitHub PR                             |          ~29 |
|   — | Webring - Error Workflow                 | Failure metadata capture                                           |           ~3 |

≈ 100 nodes (103 with the Error Workflow), from 129.

### Why the four token actions merge into one workflow

`issue_token`, `request_update_token`, `bind_source_url`, and `verify` are all
unauthenticated public actions that read and write a single `submissions` row while it is
in `pending_verify`. They share one precondition table, one expiry rule, one error
vocabulary, and one response envelope. Splitting them across four workflows duplicates
four triggers, four get-row nodes, four sets of error shapers, and four Execute Workflow
hops, and it is why the `pending_verify`-only precondition (§1.3) is missing from
`verify` — there was no single place that stated it.

No security boundary is lost. The boundaries that matter stay isolated:

- **SSRF egress** stays in the Re-verify helper, which is the only workflow allowed to
  fetch a submitter-controlled URL.
- **Secret handling** stays in the Review Link Signature helper.
- **The Review Action** stays entirely off the public Intake router.

## Repeated node patterns to collapse

These four collapses apply across every phase below. They are stated once here; the phases
reference them rather than restating them.

### P1. One error shaper per workflow

The exports contain about twelve static "shape X" Code nodes, each returning one hardcoded
envelope — `shape not_found` twice, `shape not_verified` twice, `shape rate_limited`
twice, `shape verification_lapsed` twice, plus `already_bound`, `turnstile_failed`,
`not_ready`, `token_not_found`.

Replace with: each gate sets an `error_code` on its item, every failure path routes to a
single Code node that maps code → `{ ok: false, error: { message, code, retryable } }`.
One shaper per workflow. Roughly twelve nodes become three.

The error codes and their client-visible messages must not change — they are the contract
`src/lib/submissionError.js` and the form's retry affordances read.

### P2. One HMAC implementation, shared by signer and verifier

Today `Webring - Helper - Build Signed Links` signs and `Webring - Review Action` verifies,
each with its own nodes. That is two copies of one algorithm in two workflows, and it is
exactly how the defect in §1.1 arose. Replace both with a single
`Webring - Helper - Review Link Signature` taking `mode: sign | verify`. Four nodes, two
callers, structurally unable to drift.

Use the **Crypto node** for the HMAC rather than `crypto.createHmac` in a Code node: the
Code sandbox's `crypto` availability varies by n8n version, while the Crypto node's HMAC
action is always present. The constant-time comparison is pure JS (XOR-accumulate over two
equal-length hex strings) and needs no sandbox assumptions.

### P-1. Data Table filters OR their conditions — measured, not assumed

Measured on a scratch table 2026-08-22. The n8n Data Table node combines
multiple filter conditions with **OR**, in either order, and
`matchType: "allFilters"` does not change it:

| Filter                        | Rows matched  |
| ----------------------------- | ------------- |
| `sid=AAA` + `status=verified` | AAA, BBB, CCC |
| `status=verified` + `sid=AAA` | AAA, BBB, CCC |
| `sid=BBB` alone               | BBB           |

**A conditional claim of the form "submission_id = X AND status = verified" is
therefore not expressible in one node.** Writing it that way updates every row
matching _either_ term — a table-wide write wearing the costume of a
conditional one. This was not theoretical: an earlier build of Finalize
Submission v2 did exactly that and overwrote seven rows, two of them
pre-existing, before the pattern was caught.

Every Data Table filter in this system must use exactly one condition. The
atomic claim uses an optimistic marker instead (Phase 3), and any destructive
Data Table pattern must be proven against a scratch table before it is pointed
at `submissions`.

### P0. Code-sandbox globals — measured, not assumed

Measured on this instance 2026-08-22. n8n Code nodes expose `Buffer`,
`TextEncoder`, `RegExp`, `JSON`, `Date`, `Intl`. They do **not** expose `URL`,
`URLSearchParams`, `crypto`, `fetch`, or `process`.

**This is already causing a silent production bug.** `approve: generate id +
creator_id` in `Webring - Review Action` calls `new URL(row.source_url)` inside
a `try { ... } catch { /* leave undefined */ }`. The call throws
`ReferenceError` every time and the catch swallows it, so **`creator_id` has
never been assigned to any approved node**. Nothing in the response or the
execution log indicates a failure. Any workflow doing URL work must parse by
hand; `scripts/n8n/test_code_nodes.mjs` runs every generated Code node with
these globals denied so the class of bug fails locally instead of silently.

### P3. ~~Fold token generation into the row-building Code node~~ — RULED OUT

Four Crypto `generate` nodes exist only to produce a UUID and a hex string that an adjacent
Code node immediately reads via `$('Gen submission_id').item.json.data`. Folding them into
the Code node would have removed four nodes.

**Ruled out by measurement, 2026-08-22.** A probe on this instance returned
`typeof crypto === "undefined"` inside a Code node: no `randomUUID`, no `getRandomValues`,
no `subtle`. (`Buffer` _is_ available, which is why the approve branch's `Buffer.from`
calls work.) The four Crypto `generate` nodes stay. A weaker token is not an acceptable
price for a smaller graph.

This also settles Phase 5: the HMAC must run in a **Crypto node**, not `crypto.createHmac`
or `crypto.subtle` in a Code node, which would fail outright on this instance.

### P4. Collapse the per-key config reads

Six Data Table `get` nodes each fetch exactly one `config` key: `rate_limit_salt`,
`review_link_secret` (twice), `discord_webhook_url` (twice), `turnstile_secret_key`.

Two collapses apply:

- The two `review_link_secret` reads **disappear entirely** — the secret moves into the
  `crypto` credential (§1.1), which the node resolves internally rather than reading as
  data.
- The remaining three keys (`rate_limit_salt`, `discord_webhook_url`,
  `turnstile_secret_key`) are all consumed by **one** workflow after the Submit /
  Submit Update merge. Replace three filtered `get` nodes with a single unfiltered `get`
  over the small `config` table, and index the rows by key where they are used.

Six nodes become one. Note this is a smaller win than an earlier revision of this plan
claimed: it assumed all six vanished into environment variables, which is no longer the
mechanism.

## Phase 0: Snapshot, verification, and deployment safety

### 0.1 Fetch current state

Before mutation:

1. Fetch every workflow above through the n8n API.
2. Record its workflow ID, active state, version ID, update timestamp, tags, settings, and
   node count.
3. Export the three referenced Data Table schemas without exporting sensitive row values.
4. Confirm that `indienodes-submit` still has no active owner, and that
   `indienodes-review-action` has exactly one (`Slp86o7ChA3gqO3u`).
5. Confirm whether CORS is configured in the Webhook node, the reverse proxy, or both.
6. Confirm whether an n8n Error Workflow is configured globally or per workflow.

If the live workflow version differs from the supplied export, use the live version as the
source and report the differences before continuing.

### 0.2 Instance facts the plan depends on

**Both checks were run on 2026-08-22 against `n8n.kjnet.us`. Results recorded below.**
Re-run them if the instance is upgraded.

**0.2.1 — The `compute signature` algorithm. ANSWERED: SHA256.** A probe workflow with a
Crypto node configured exactly like `compute signature` (only `value` set) hashed a known
string and returned a 64-character digest matching SHA256 exactly. The Crypto node's
defaults are `action: hash, type: SHA256`, so the verifier and the signer already agree and
review links validate correctly today. §1.1 still replaces this node — to move from a
secret-prefix hash to a real HMAC, and to stop depending on a default.

**0.2.2 — Code sandbox capabilities. ANSWERED: no `crypto`.** The same probe returned
`typeof crypto === "undefined"`, with `has_randomUUID`, `has_getRandomValues`, and
`has_subtle` all false; `typeof Buffer === "function"`. This rules out P3 and forces the
Crypto node for HMAC work. Probe workflow was deleted (404 confirmed).

**0.2.3 — Crypto credential. ANSWERED: available.** The `crypto` credential type exists
with an `hmacSecret` field, is creatable through the API without touching the container,
and is not returned by the API on read. An HMAC node using it produced a digest matching an
independently computed HMAC-SHA256 vector exactly. No environment-variable access is
required, and none is used.

### 0.3 Create API backups

Save timestamped workflow exports outside the live workflow collection. Do not include
decrypted credential values.

Suggested backup naming:

```text
Webring - Backup - 2026-08-22 - <original workflow name>
```

Backups must remain inactive.

### 0.4 Create isolated v2 workflows

Create replacement workflows with test-only names and paths:

```text
Webring - Intake v2
Webring - Token Lifecycle v2
Webring - Finalize Submission v2
Webring - Helper - Re-verify Token v2
Webring - Helper - Review Link Signature v2
Webring - Review Action v2
Webring - Error Workflow
```

Suggested test webhook paths:

```text
indienodes-submit-v2-test
indienodes-review-action-v2-test
```

Do not point the production client or existing review messages at these paths until the
test matrix passes.

### 0.5 Normalize workflow settings

All nine sub-workflows currently export with `settings: {}`. Intake and Review Action set
`{"executionOrder": "v1", "binaryMode": "separate"}`; the sub-workflows do not, so they run
under legacy v0 branch ordering. Every v2 workflow must set:

```json
{
	"executionOrder": "v1",
	"binaryMode": "separate",
	"errorWorkflow": "<Error Workflow id>",
	"callerPolicy": "workflowsFromAList",
	"callerIds": "<ids permitted to invoke this sub-workflow>"
}
```

`callerPolicy` is currently unset on every helper, so any workflow on the instance can
invoke the SSRF fetcher and the signature helper. Restrict each to its actual callers.

## Phase 1: Security and contract corrections

These corrections must be completed before workflow consolidation is considered successful.

### 1.1 Fix the review-link signature — construction and storage

Two defects sit on top of each other here.

**Not a defect, verified 2026-08-22:** `Webring - Review Action` node `compute signature`
sets only `{"value": "={{ $json.hash_input }}"}` — no `action`, no `type` — while both
signer nodes set `{"action": "hash", "type": "SHA256"}` explicitly. An earlier revision of
this plan claimed the verifier therefore fell back to MD5 and that no link could ever
validate. **That was wrong.** A probe workflow on this instance, using a Crypto node
configured identically to `compute signature`, returned a 64-character digest matching
SHA256 exactly. The Crypto node defaults to `action: hash, type: SHA256`. Signature
verification works today. Rule 11 still applies: make it explicit rather than leaving a
security check resting on a default that could change across an n8n upgrade.

**Defect A — the construction is not an HMAC.** Both sides compute
`SHA256(secret + '|' + message)`, a secret-prefix hash, which is length-extension
vulnerable and is not what `docs/n8n-workflow-runbook.md` §8 specifies.

**Defect B — the secret is ordinary workflow data.** It lives in a `config` Data Table row,
readable by any n8n editor user, and both call sites fall back to `''` when it is missing.

Required message format:

```text
submission_id|decision|exp
```

Required signature:

```text
HMAC-SHA256(secret, message)
```

Implementation requirements:

1. Set `action` and `type` explicitly on the Crypto node — `hmac` and `SHA256` — and
   `encoding: hex`. Never rely on a default, even a currently-correct one.
2. Use the same UTF-8 input encoding and lowercase hexadecimal output in both signing and
   verification. Because both live in the same helper (P2), this is enforced by
   construction rather than by discipline.
3. Validate `decision` as exactly `approve` or `reject` before routing.
4. Validate `submission_id` as a non-empty string with a conservative maximum length.
5. Validate `exp` as a base-10 integer before using it. The current
   `parseInt(q.exp, 10) || 0` maps a malformed value to `0`, which reads as expired — the
   safe direction, but it should be an explicit classification rather than a coincidence.
6. Reject missing, malformed, empty, or incorrectly sized signatures.
7. Compare with a constant-time comparison: reject unequal lengths first, then
   XOR-accumulate over the two hex strings and require a zero result.
8. Fail closed if the secret is unavailable.
9. Do not include the secret itself in `hash_input`, returned JSON, execution custom data,
   or browser responses. Note that the current `build sig message` node emits
   `{ hash_input: secret + '|' + message }` into ordinary workflow data, so the secret is
   visible in every execution record. The HMAC node takes the secret as a separate
   parameter, which removes it from the item stream.

**Secret storage: an n8n `crypto` credential.** Verified on this instance 2026-08-22.
The Crypto node's `hmac` action requires a credential of type `crypto`, whose schema
carries an `hmacSecret` field. Activating an HMAC node without one fails with
`Missing required credential: crypto`.

This is what `docs/n8n-workflow-runbook.md` line 22 and §8 specified all along. An earlier
revision of this plan asserted no such credential existed and routed the secret to an
environment variable instead. **That was wrong** — the runbook needs no correction on this
point, and Phase 10 should not "fix" it.

Properties confirmed by probe:

- Created and updated through `POST/PATCH /api/v1/credentials` — **no container change and
  no restart**, so this works under a no-infrastructure-change constraint.
- `GET /api/v1/credentials/{id}` returns id, name, type, and timestamps only. The secret is
  never returned by the API and never appears in a workflow export.
- The secret never enters the item stream: it is resolved inside the node, not passed as
  data. This is the property the `config` Data Table cannot provide, because a Data Table
  `get` necessarily emits the value as an item.
- n8n encrypts credential data at rest.

`rate_limit_salt` has no corresponding credential type and stays in the `config` Data
Table. That is acceptable — it is a salt rather than a signing key, and it is only useful
to an attacker who already has the `rate_limits` table. It must still fail closed (§1.7)
rather than defaulting to `''`.

Defence in depth for the signature helper, all settable through the API and all verified to
persist:

```json
{
	"saveDataSuccessExecution": "none",
	"saveDataErrorExecution": "none",
	"saveManualExecutions": false,
	"callerPolicy": "workflowsFromAList",
	"callerIds": "<Finalize Submission v2 id>,<Review Action v2 id>"
}
```

### 1.2 Fix Turnstile fail-open behavior

Current defect in `submit_update: skip turnstile?`:

```text
skip Turnstile when secret is empty OR token is empty
```

A submitter who simply omits `turnstile_token` skips the check entirely.

Required behavior:

| Secret configured | Token supplied | Result                                         |
| ----------------: | -------------: | ---------------------------------------------- |
|                No |      No or yes | Skip intentionally                             |
|               Yes |             No | Return `turnstile_failed`                      |
|               Yes |            Yes | Call Cloudflare and require `success === true` |

Additional requirements:

- Treat timeouts, non-JSON responses, and HTTP errors as failure. The current node sets
  `neverError: true` and `normalize turnstile result` reads `$json.success === true`, so a
  Cloudflare 5xx currently yields `passed: 'no'` — correct by accident; make it explicit.
- Never return the secret or the full Cloudflare response to the browser.
- Preserve the existing client response envelope.

`submit` (new submissions) deliberately has no Turnstile check — see the `submitUpdate`
doc comment in `src/lib/submissionApi.js`, which records that `submit_update` is the one
action Turnstile guards. Do not "fix" that by adding one; state it in the merged workflow
so the asymmetry is visible rather than looking like an oversight.

This correction changes branch conditions. It should not add nodes.

### 1.3 Enforce the status precondition and token expiration

**Defect A — `verify` has no status precondition, so a submission can be replayed.**
`verify: mark verified` writes `status: 'verified'` unconditionally. Its only gate,
`verify: not ready?`, checks that `submission_id` and `source_url` are non-empty — nothing
about the current status. A row at `pending_review`, or even `approved`, can be flipped
back to `verified` by calling `verify` again, and then re-submitted:

```text
verify -> submit -> (reviewer notified) -> verify -> submit -> reviewer notified again
```

For an already-approved node the second submit produces a second PR against the same
`members/<id>.json`. The token needed is still on the submitter's own page, and after
approval it is published in `ring.json` besides.

**Defect B — `expires_at` is generated and stored but never read anywhere.**

Required behavior — the status transition model:

```text
pending_verify -> verified -> pending_review -> approved
                                            -> (row deleted on reject)
                           -> notification_failed  (recoverable)
                              processing_approval  (transient claim)
                              approval_failed      (recoverable)
```

Preconditions, enforced in one place at the top of Token Lifecycle v2:

| Action                     | Required current status                        |
| -------------------------- | ---------------------------------------------- |
| `bind_source_url`          | `pending_verify`, and `source_url` still empty |
| `verify`                   | `pending_verify` only                          |
| `submit` / `submit_update` | `verified` only                                |
| Review approve/reject      | `pending_review` only                          |

Expiration rules:

1. Check expiration before any verification URL request.
2. Check expiration before marking a row `verified`.
3. Check expiration again during final submission.
4. Treat invalid or missing `expires_at` as expired.
5. Never revive an expired row by binding a new source URL.

Recommended responses.

For Verify:

```json
{
	"ok": true,
	"verified": false,
	"reason": "expired"
}
```

For a non-`pending_verify` row, Verify returns `reason: "already_verified"` when the row is
at or past `verified`, so the form does not silently loop.

For Submit and Submit Update:

```json
{
	"ok": false,
	"error": {
		"message": "This verification token has expired.",
		"code": "verification_expired",
		"retryable": false
	}
}
```

Add a documented cleanup policy for expired `pending_verify` rows. A scheduled cleanup
workflow can be a later operational task, but expiration enforcement cannot wait for
cleanup.

### 1.4 Fix the rate limiter

**Defect — it stops blocking after one hour, permanently.**
`submit: record rate_limit hash` uses the Data Table insert operation and always appends a
new row for the same hash. `check window` in the Rate Limit helper reads only `$json` —
the _first_ row returned, which is the oldest. Once that oldest row ages past the one-hour
window, every subsequent check computes `blocked: 'no'` regardless of how many recent rows
sit behind it.

Combined with §1.3's replay hole, a submitter can re-verify and re-submit indefinitely
after the first hour.

Required behavior:

- Fail closed if `RATE_LIMIT_SALT` is missing. The current `const salt = $json.value || ''`
  hashes the raw URL unsalted, which makes every stored hash a reversible lookup against a
  list of candidate URLs.
- Hash a canonicalized URL value (lowercase host, strip default port, strip fragment,
  strip trailing slash) so trivial variants do not evade the window.
- Evaluate the **newest** matching row, not the first — either sort in the decision Code
  node over `$input.all()`, or upsert a single row per hash.
- Prefer upserting one row per hash: update `created_at` on an existing row, insert only
  when none exists. This bounds table growth and removes the ordering question entirely.
- Handle concurrent finalization attempts predictably.

Inline the helper into Finalize Submission v2 (P4 removes `get salt`; the remainder is
hash Code → Data Table get → decision Code). After testing confirms no remaining callers,
deactivate `9QqF74TKtTYrBKN5`.

### 1.5 Harden submitter-controlled URL fetching

The Re-verify helper performs a server-side request to a submitter-controlled URL with no
validation of any kind — `url: "={{ $json.source_url }}"` goes straight to the HTTP node.
Treat it as an SSRF boundary.

Workflow-level validation must reject:

- Any protocol other than `http:` or `https:`
- URLs containing username or password information
- Loopback hosts such as `localhost`, `127.0.0.0/8`, and `::1`
- Private IPv4 ranges
- Link-local addresses, including `169.254.0.0/16`
- Private, link-local, mapped, and reserved IPv6 destinations
- Cloud metadata destinations
- Obfuscated numeric IP forms
- Redirects to any blocked destination

Operational requirements:

- Keep the existing 8-second timeout.
- Add a response-size limit at the HTTP or proxy layer. The current node reads an unbounded
  body into a Code node's `.toString()`.
- Restrict redirect count and revalidate every redirect destination.
- Apply network-level egress controls, because workflow-only hostname validation cannot
  prevent DNS rebinding.
- Return `matched: no` plus a stable reason such as `unsafe_url` or `unreachable` instead
  of leaking internal connection details.

Apply the same URL validation at `bind_source_url` time (§1.6), so an unusable URL is
rejected when it is supplied rather than one step later.

If the n8n API cannot configure network-level SSRF protection, implement the workflow-level
checks that are possible and explicitly report the remaining infrastructure requirement.

### 1.6 Validate input at the trust boundary

**Defect A — a malformed body hangs the webhook instead of returning JSON.**
`Honeypot + dwell gate` compares `{{ $json.body.elapsed_ms }}` with a numeric `gte` under
`typeValidation: "strict"`; `Route by action` does the same on `$json.body.action`. A
missing or wrong-typed field throws. Because **no node in any of the twelve workflows sets
`onError`**, the throw aborts the run before any Respond node executes. The browser waits
out `postWebhook`'s 15-second `AbortSignal.timeout` in `src/lib/webhookClient.js` and
reports `code: 'timeout'` — a retryable error for a permanently malformed request.

**Defect B — no Switch default.** An unrecognized `action` matches no Switch output, the
run ends with nothing sent, and the webhook hangs the same way.

**Defect C — `bind_source_url` validates nothing.** No scheme check, no length bound, no
SSRF screen, no expiry check; `$('Trigger').item.json.body.source_url` is written to the
row verbatim.

Required:

1. Do all boundary validation in **one Code node** in Intake v2, before the honeypot gate
   and before routing. It emits either a controlled error item or a validated, normalized
   body with a `route` field. This replaces the strict-typed IF and Switch expressions with
   ordinary JavaScript that cannot throw on a missing field, and it satisfies the
   validation requirements below without adding a node per check.
2. Add a Switch default path returning:

```json
{
	"ok": false,
	"error": {
		"message": "Unsupported submission action.",
		"code": "unsupported_action",
		"retryable": false
	}
}
```

3. Set `onError: "continueErrorOutput"` on every Execute Workflow node in Intake and on
   every HTTP and Data Table node in the sub-workflows, wiring error outputs to the shared
   error responder (P1). A sub-workflow failure must produce a JSON envelope, not a
   client-side timeout.
4. Remove `neverError: true` from HTTP nodes where a non-2xx genuinely is a failure
   (`fetch live ring.json`, the GitHub calls, the Discord call), so those failures route to
   the error output rather than flowing downstream as a success-shaped body.

Validate before executing action workflows:

- `action` is one of the six supported values.
- `elapsed_ms` is a finite non-negative number.
- `website` is a string.
- `submission_id`, `node_id`, and URLs have conservative maximum lengths.
- `type` matches the supported creator types (`audio`, `comic`, `text`, `game` — see
  `schema/ring.schema.json`).
- `entry` and `review` are objects when required. Today
  `$('Trigger').item.json.body.review.email` throws outright if `review` is absent.
- Required strings are present and bounded.

For `entry` specifically, validate against the same shape the repository enforces:
`schema/ring.schema.json` defines the target, and `toRingEntry` in
`src/lib/submissionValidation.js` defines exactly which fields a legitimate client sends.
Validating server-side against that shape means a reviewer never sees a submission that
cannot pass `npm run validate:publish` after approval.

Do not trust browser validation as the server trust boundary.

### 1.7 Fail closed on required operational configuration

Current workflows substitute empty strings for missing configuration values, then treat the
empty case as success.

Required behavior:

- Missing or unset `crypto` credential: fail submission finalization and alert
  operations. Never build a link that cannot be verified.
- Missing `rate_limit_salt` config row: fail the rate-limit operation rather than hashing
  the raw URL unsalted.
- Missing reviewer channel: do not pretend that notification succeeded. v1's
  `submit: has notify webhook?` routed an empty URL straight to `shape response`, returning
  `ok: true` with a reference the maintainer would never see. **Implemented:** reviewer
  notification is Gotify with an SMTP fallback, and both being unconfigured fails the
  submission with a retryable `service_misconfigured`. Discord is not used.
- Missing sender address: rejection sends SMTP mail to the submitter, the only channel they
  give. Without `notify_from_email` and a working SMTP credential, a reject click holds the row
  rather than deleting it.
- Missing Turnstile secret: skip Turnstile only if Turnstile is intentionally disabled for
  that environment (§1.2).
- Missing GitHub credential: stop approval before changing status.

Distinguish intentionally disabled optional features from missing required configuration.
An intentionally disabled feature is a recorded decision; a missing required value is an
error.

### 1.8 Verify CORS behavior

Both Webhook nodes carry `options: {}`. n8n's Webhook v2 `allowedOrigins` option defaults
to `*`, so the endpoint currently accepts and answers cross-origin requests from anywhere.

Set `allowedOrigins` on the Intake webhook to the production site origin, plus any
development origins actually needed. The browser deliberately sends preflighted JSON
requests — see the `Content-Type` comment in `src/lib/webhookClient.js` — so test a real
`OPTIONS` request from the production site origin and confirm the webhook (with
`responseMode: responseNode`, n8n answers OPTIONS itself) or the reverse proxy returns the
necessary headers.

Do not default to a wildcard origin now that the production origin is known.

### 1.9 Use one source of truth for `ring.json`

`request_update_token: fetch live ring.json` reads
`raw.githubusercontent.com/XTREEMMAK/indienodes/main/ring.json`, which is CDN-cached for
minutes. `Webring - Review Action` reads the authenticated
`api.github.com/repos/XTREEMMAK/indienodes/contents/ring.json`. A node merged within the
cache window is invisible to the first and visible to the second, so a creator whose entry
just landed gets `not_found` when requesting an update token.

Use the authenticated Contents API in both, with the existing
`Github PAT - Indienodes` credential (`1YWJOqz5zCx2hm2o`), and check the response before
parsing (§1.10). Move the repository owner and name into workflow-level configuration
rather than repeating the literal path in five URLs.

### 1.10 Check every HTTP response before using it

Eleven HTTP nodes set `neverError: true`, and only two of the resulting bodies are ever
checked — `approve: PR actually created?` and `submit_update: normalize turnstile result`. Consequences visible in the exports:

- `request_update_token: find node` — a 404 or 5xx body parses to `ring = []`, the node is
  not found, and the caller receives `not_found` for what is actually an outage. The
  existing plan already calls this out; it is the same class of bug as the rest.
- `approve: parse ring + decode` — a failed fetch is swallowed by
  `catch (e) { ring = [] }`, which silently disables both the id-collision check and
  `creator_id` matching, so an approval can mint a duplicate id.
- `approve: check for existing member file` — the **only** GitHub call with no
  `credentials` block. On a public repo it works but shares the 60-requests-per-hour
  unauthenticated pool; when that is exhausted, `existing.sha` is `null`, the commit omits
  `sha`, and updating an existing member file fails with a 409.
- `submit: notify reviewer` — the Discord response is never inspected, so a 4xx is reported
  to the submitter as success.

Every HTTP node must classify its response before the next node consumes it.

### 1.11 Add error-workflow coverage

Create a shared Error Workflow and set it in every v2 workflow's `settings.errorWorkflow`
(§0.5).

It should record only operational metadata:

- Workflow name and ID
- Execution ID
- Failed node name
- Timestamp
- Safe error category

It must not send full submission payloads, verification tokens, email addresses, secrets,
or credential data to a public channel.

## Phase 2: Token Lifecycle v2

Merges `b6VtjxfnG4DGpkkO`, `1MHpokleoH2zJacp`, `IxlDDPZ4lByRhz6z`, and `FJrNDbU5FSETe7WV`
(33 nodes across four workflows) into `Webring - Token Lifecycle v2`.

State the precondition table from §1.3 once at the top of this workflow. It is the reason
these four actions belong together.

### Target graph

```text
Execute Workflow Trigger
  -> classify action + validate input
  -> Switch: issue | request_update | bind | verify

  issue_token
    -> validate supplied source_url, or accept null for the generator flow
    -> (falls through to shared row construction)

  request_update_token
    -> fetch live ring.json (authenticated Contents API, checked)
    -> find stored node
    -> found?
       -> no: error_code = not_found
       -> yes: (falls through to shared row construction)

  shared row construction
    -> build row (submission_id, verification_token, expires_at, mode, source_url, type)
    -> insert row
    -> shape success

  bind_source_url
    -> get row
    -> gate: exists? pending_verify? unexpired? source_url still empty? URL safe?
    -> update row
    -> shape success

  verify
    -> get row
    -> gate: exists? pending_verify? unexpired?
    -> call Re-verify Token v2 (source_url, verification_token, expires_at)
    -> map helper reason -> client reason
    -> matched? -> mark verified -> shape success
                -> error_code from helper reason

  -> shape error (single node, P1)
```

Normalized row context:

```text
mode              new | update | generated
node_id           or null
source_url        or empty string (generated flow only)
type              or empty string
status            pending_verify
created_at
expires_at
```

Rules:

- Update source URL must always come from the live ring, never the request body. This is
  the server-side half of the reasoning in `src/lib/submissionApi.js`'s top comment: if the
  client could name the URL to check, verification would be decorative.
- New-submission source URL may be empty only for the generated-site flow.
- Token generation must remain cryptographically random. It stays in Crypto `generate`
  nodes: the Code sandbox has no `crypto` (P3, ruled out). The merge still halves them from
  four to two, since both issuance paths share one pair.
- All four actions must return the existing client response shapes.
- A live-ring fetch failure is not the same as `node_id` not found. Return an operational
  error for fetch failure (§1.10).
- `request_update_token` must reject a ring entry whose `source_url` is empty rather than
  issuing a token against an unfetchable URL.

### Router change

Intake routes all four actions to this one workflow, passing the original `action` in the
body. Two Switch outputs may feed one Execute Sub-workflow node.

### Acceptance target

- Approximately 24 nodes.
- One workflow replaces four (33 nodes).
- No duplicated token-generation, row-construction, get-row, or error-shaping nodes.

Do not deactivate the old workflows until all token tests pass.

## Phase 3: Finalize Submission v2

Merges `4vmvgcbRYDDKH1QZ` (17) and `mffRcWJRouz3tUyT` (23) plus the inlined Rate Limit
helper (6) — 46 nodes — into `Webring - Action - Finalize Submission v2`.

The two source workflows are structurally identical apart from the Turnstile branch and the
review-block shape. Every node in Submit has a same-named counterpart in Submit Update.

### Target graph

```text
Execute Workflow Trigger
  -> get submission row
  -> normalize and validate request against stored row
  -> eligible?
     -> no: error_code
     -> yes: call Re-verify Token v2 (with expires_at)
  -> token still matches and is not expired?
     -> no: error_code from helper reason
     -> yes: update request?
        -> yes: enforce Turnstile policy (§1.2)
        -> no: continue
  -> rate-limit hash, lookup, and decision (§1.4, inlined)
  -> atomically claim submission (verified -> pending_review)
  -> persist normalized entry and private review data
  -> upsert rate-limit row
  -> call Review Link Signature v2 (mode: sign)
  -> build reviewer notification from stored normalized data
  -> send notification and verify delivery
  -> delivered?
     -> no: mark notification_failed, invoke Error Workflow, retryable error
     -> yes: shape success
  -> shape error (single node, P1)
```

### Shared validation

Require:

- Stored row exists.
- Stored status is `verified` before finalization.
- Stored token is unexpired.
- Ownership token still appears at the stored source URL.
- Request mode matches stored row mode.
- For updates, request `node_id` equals stored `node_id`. Prefer ignoring the request value
  after validation and using only the stored value.
- For new submissions, submitted `entry.type` matches the type committed during token
  issuance. Note that `request_update_token: insert row` does not currently store `type`,
  so Token Lifecycle v2 must start storing it for updates too.
- Entry payload is structurally valid against `schema/ring.schema.json` before storing it
  (§1.6).

### Normalize private review data

For new submissions, preserve the complete review block required by the form.

For updates, normalize the email into the same internal review shape while retaining an
explicit `mode: update` marker and stored `node_id`. Today `submit_update: merge entry`
writes `review: JSON.stringify({ email: body.email })` while `submit: merge entry+review`
writes the whole review block, so the Review Action's reject branch reads two different
shapes depending on which action created the row.

Never build reviewer notifications directly from unvalidated request fields.

### Atomic submission claim

Before notification, perform a conditional row update that requires the current status to
still be `verified` and changes it to `pending_review` while writing the normalized data.

If the conditional update affects no row, return an `already_submitted` or `invalid_state`
response. Do not send a second notification.

Data Table updates **cannot** provide an atomic conditional claim: filters OR their
conditions (see P-1), so the status precondition cannot be expressed in the update at all.
The implemented alternative is an optimistic marker claim, filtered on the unique key only:

1. Stamp `status = claiming-<execution id>` filtered on `submission_id` alone.
2. Read the row back.
3. Proceed only if the marker still reads as this execution's.

Last write wins, so exactly one concurrent run sees its own marker; the others fall through
to `already_submitted`. A previous read is not a lock, and neither is a multi-condition
filter. Note also that nothing enforces uniqueness of
`submission_id` in the `submissions` table, and every `get` reads `$json` — the first
matching row only.

### Reviewer notification

The current Discord message carries five fields. The form collects far more, and the
maintainer needs all of it to make a decision. Include:

- Submission mode: new or update
- Stored node ID for updates
- Type
- Creator
- Why text
- Stored source URL
- Tags
- Media summary
- Email
- Rights confirmation
- EULA agreement
- Professional-membership selection and name
- Submission ID
- Signed Approve and Reject links

Set `allowed_mentions: { parse: [] }` on the Discord payload. Every user-controlled string
in that message — creator name, why text, tags — currently interpolates unescaped, so a
submission can trigger `@everyone`.

Check the Discord HTTP result. A non-success response must not be treated as notification
success (§1.10).

### Failure after persistence

If the row has reached `pending_review` but notification fails:

- Preserve the row.
- Mark a safe operational state such as `notification_failed`, or retain `pending_review`
  with a separate failure marker if the schema supports it.
- Invoke the Error Workflow.
- Return a retryable operational error without creating duplicate rows on retry. Note that
  `src/lib/submissionApi.js` documents `submit` as never retried automatically — the retry
  is a button the submitter presses — so the response must be honest about what happened.

### Acceptance target

- Approximately 27 nodes.
- One workflow replaces two action workflows and one single-use helper (46 nodes).
- New and update branches remain visibly distinct only where policy differs: Turnstile, and
  the review-block shape.

## Phase 4: Re-verify Token v2

Create `Webring - Helper - Re-verify Token v2` from `SXGAxDAXG99Sj8SG`. This is the only
workflow permitted to fetch a submitter-controlled URL; restrict `callerPolicy` to Token
Lifecycle v2 and Finalize Submission v2.

Inputs:

```text
source_url
verification_token
expires_at
```

Output:

```json
{
	"matched": "yes|no",
	"reason": "matched|expired|unsafe_url|unreachable|token_not_found"
}
```

Required sequence:

1. Validate expiration — before any network call.
2. Validate URL syntax and immediately identifiable unsafe destinations (§1.5).
3. Fetch with bounded timeout, redirect policy, and response-size control.
4. Distinguish network or HTTP reachability failure from a reachable page without the
   token. Today `neverError: true` means a 404 page's body is scanned for the meta tag and
   reported as `token_not_found`, which tells the submitter to check their tag when the
   real problem is that their site is down.
5. Parse meta elements without assuming attribute order. The current regex already handles
   this correctly — `<meta\b[^>]*>` then separate `name=` and `content=` matches — so keep
   the approach and add tests rather than rewriting it.
6. Compare the exact token value.

Both callers pass `expires_at` and map helper reasons to their correct client responses.

Do not merge this helper into Token Lifecycle, because final submission must reuse the same
implementation, and because keeping the egress in one workflow is what makes the SSRF
boundary auditable.

### Acceptance target

- Approximately 5 nodes: Trigger, validate Code, HTTP, classify Code, plus a gate to skip
  the fetch entirely on an expired or unsafe URL.

## Phase 5: Review Link Signature v2

Create `Webring - Helper - Review Link Signature v2`, replacing
`Webring - Helper - Build Signed Links` (6 nodes) and the Review Action's six-node
authentication preamble. See P2 for the rationale: one implementation, two callers, no
possibility of the §1.1 drift recurring.

Inputs:

```text
mode              sign | verify
submission_id
decision          verify mode only
exp               verify mode only
sig               verify mode only
```

Outputs, sign mode:

```text
approve_link
reject_link
exp
```

Outputs, verify mode:

```text
valid             yes | no
expired           yes | no
decision          normalized, or empty when invalid
```

Requirements:

- HMAC-SHA256 over the canonical message `submission_id|decision|exp`, with `action`,
  `type`, and `encoding` all set explicitly on the Crypto node (§1.1).
- Sign mode emits two items — one per decision — through the single HMAC node, so approve
  and reject are signed independently without a second Crypto node.
- Seven-day expiration unless project policy changes.
- URL-encode every query parameter. The current `build review links` encodes
  `submission_id` but interpolates `decision`, `exp`, and `sig` raw.
- Obtain the review webhook base URL from workflow configuration. It is currently
  hard-coded as `https://n8n.kjnet.us/webhook/indienodes-review-action` inside a Code node.
- Constant-time comparison in verify mode (§1.1 item 7).
- Fail closed if the secret or base URL is unavailable.
- Never return or log the secret, and never place it in an item.

### Acceptance target

- Approximately 4 nodes: Trigger, build-message Code, Crypto HMAC, emit Code.
- Replaces 12 nodes across two workflows.

## Phase 6: Review Action v2

Create `Webring - Review Action v2` from `Slp86o7ChA3gqO3u` and keep it separate from
Intake. It is the only workflow holding the GitHub PAT.

### Authentication preamble

```text
Webhook
  -> validate query (submission_id, decision, exp, sig present and well-formed)
  -> call Review Link Signature v2 (mode: verify)
  -> Switch: invalid | expired | valid
```

Invalid-signature and expired-link responses remain visibly distinct. Four nodes replace
six, and the algorithm now lives in one place shared with the signer.

### One-time atomic claim

Current read-then-act behavior is not sufficient for concurrent clicks: `still pending_review?`
reads the row, then the branch acts on it, with no re-check.

Required sequence after authentication:

1. Fetch the row.
2. Require `status === 'pending_review'`.
3. Validate `decision` exactly. Today `decision is approve?` sends **every** non-`approve`
   value down the reject branch, which deletes the row. Signature coverage of `decision`
   limits the practical exposure, but make it an explicit three-way route with an
   `invalid decision` response.
4. Conditionally change status to `processing_approval` or `processing_rejection` only if
   the current status is still `pending_review`.
5. Confirm that exactly one row was claimed.
6. Only then perform email or GitHub side effects.

If the claim fails, return the already-resolved response.

### Reject branch

**Rejection requires a configured submitter channel.** `docs/submission-form-spec.md` §5
step 9 promises the submitter is told before anything is deleted. The original workflow
deleted the row and served a page admitting nobody had been notified — the promise was
simply not kept. v2 adds a `submitter_notify_webhook_url` config key; with it unset, a
reject click leaves the row untouched and tells the maintainer why. Configure it before
cutover, or rejection is unavailable.

The current branch deletes the row and responds with a page that says, in production HTML,
that SMTP is not configured and the submitter was not notified. That is a placeholder, not
a behavior.

Required sequence:

1. Read the stored email before deletion.
2. Send the rejection notification through the configured submitter-facing channel.
3. Verify delivery success.
4. Delete the submission row completely — `docs/submission-form-spec.md` §5 step 9 requires
   that nothing about a rejected submission is retained.
5. Return a plain HTML confirmation.

If notification fails, do not delete the row. Set an operational failure state and allow a
controlled retry. Deleting first and failing to notify loses the address permanently.

If no submitter-facing channel is configured, this is a missing required configuration
(§1.7), not an optional feature — the reject path cannot meet its own contract without one.

### Approve branch

Preserve separate nodes for these auditable operations:

1. Fetch current ring data and SHA.
2. Parse ring data.
3. Generate or preserve ID and creator ID.
4. Build an explicit public allowlist.
5. Resolve the existing member-file SHA for updates.
6. Fetch the current main ref.
7. Create the branch.
8. Commit the member file.
9. Open the PR.
10. Verify the PR response.
11. Mark approved and scrub private data.

Do not combine all GitHub operations into one opaque Code node. Their separate execution
records are useful when a partial approval fails.

Only one of the six GitHub calls is checked today (`approve: PR actually created?`).
Rather than adding an IF node after each of the remaining five, drop `neverError: true` and
set `onError: "continueErrorOutput"` on all six, wiring every error output to one shared
"approval failed" path (mark `approval_failed` → generic retry-safe response). Six checks
collapse to two nodes without hiding any step.

Corrections:

- Authenticate `approve: check for existing member file` with the same
  `Github PAT - Indienodes` credential as the other calls (§1.10).
- Check every GitHub response before using it as input to the next step.
- Do not expose raw GitHub response JSON on the browser failure page. The current
  `respond PR creation failed` page interpolates `JSON.stringify($json)` directly.
- Use a collision-resistant branch suffix for both new submissions and updates. Updates
  already use `update/${node_id}-${Date.now()}`; new submissions use a bare
  `submission/${id}`, which collides on any retry.
- Guard id generation: `slugify(type-creator)` returns `''` for an all-punctuation creator
  name, producing `id: ""` or `"-2"`, both of which fail
  `schema/ring.schema.json`'s `^[a-z0-9]+(-[a-z0-9]+)*$`. Fall back to a generated suffix.
- **Preserve the existing public-field allowlist exactly.** `approve: strip fields
(allowlist)` currently allows `creator, type, why, tags, tracks, pages, excerpts,
thumb_url, preview_url, explicit`, then adds `id`, `source_url`, `verification_token`,
  and optional `creator_id`. That matches `toRingEntry` in
  `src/lib/submissionValidation.js` field for field, and `verification_token` is a
  **required** public field per `schema/ring.schema.json` — it is the token that must stay
  in the member's meta tag, not a leak. Do not remove it.
- Continue writing only `members/<id>.json`. The repository's own workflow regenerates
  `ring.json` from `members/*.json` (commit `2c8ce07`).
- Update `docs/n8n-workflow-runbook.md` so it matches that current repository behavior.

### Approval failure recovery

Status transitions for partial failures:

```text
pending_review
processing_approval
approval_failed
approved
```

On a retry from `approval_failed`, detect whether the branch, commit, or PR already exists
before creating another one.

The browser should receive a generic retry-safe message. Detailed failure information
belongs in n8n execution logs and the Error Workflow.

`approve: mark approved + scrub PII` clears `email` and `review` but leaves `entry` and
`verification_token` on the row. Decide and document whether the approved row is retained
for audit or deleted once the PR carries the public fields — `docs/n8n-workflow-runbook.md`
§8 already says either is acceptable.

### Acceptance target

- Approximately 29 nodes, from 30, while gaining atomic claims, real reject notification,
  a validated decision route, per-call GitHub failure handling, and approval recovery.

## Phase 7: Intake v2

Create `Webring - Intake v2` only after all replacement sub-workflows pass direct tests.

### Target graph

```text
Webhook (allowedOrigins set, §1.8)
  -> validate + classify (single Code node, §1.6)
  -> honeypot / dwell gate
     -> dropped: shape fake success
  -> Switch: token_lifecycle | finalize | unsupported
     -> call Token Lifecycle v2      (issue_token, request_update_token,
                                      bind_source_url, verify)
     -> call Finalize Submission v2  (submit, submit_update)
     -> default: unsupported_action
  -> Respond (shared)
```

Every Execute Workflow node sets `onError: "continueErrorOutput"` into a shared operational
error responder, so a sub-workflow crash returns JSON instead of hanging the request
(§1.6).

Target routes:

| Action                 | Target                                   |
| ---------------------- | ---------------------------------------- |
| `issue_token`          | Token Lifecycle v2                       |
| `request_update_token` | Token Lifecycle v2                       |
| `bind_source_url`      | Token Lifecycle v2                       |
| `verify`               | Token Lifecycle v2                       |
| `submit`               | Finalize Submission v2                   |
| `submit_update`        | Finalize Submission v2                   |
| Anything else          | Controlled `unsupported_action` response |

Keep one shared Respond node — every action returns the complete client envelope.

Honeypot and dwell behavior must remain before action routing. Fake-success responses must
match the expected shape for the requested action without allocating a real row. The
existing `Shape fake-success (dropped)` node already does this correctly for all six
actions; carry it over.

### Acceptance target

- Approximately 11 nodes, from 11, while gaining full input validation, a Switch default,
  CORS scoping, and error-output handling — because P1 and the two-target routing pay for
  them.

## Phase 8: Test matrix

Run these tests against inactive or test-path v2 workflows before production activation.

### Router and HTTP contract

- Valid JSON POST for each supported action reaches the correct workflow.
- Unknown action returns `unsupported_action` JSON.
- Missing action returns controlled JSON.
- Malformed body returns controlled JSON **within the client's 15-second timeout**, not a
  hung request.
- `elapsed_ms` as a string, `elapsed_ms` absent, `body` absent, and `review` absent each
  return controlled JSON rather than aborting the run.
- A deliberately failing sub-workflow returns a JSON operational error, not a timeout.
- Honeypot input receives fake success and creates no row.
- Too-fast input receives fake success and creates no row.
- `OPTIONS` preflight succeeds from the intended site origin and is refused from an
  unlisted one.
- Every response is valid JSON for Intake actions.
- No branch leaves the webhook waiting without a response.

### Token issuance

- New submission with source URL creates one `pending_verify` row.
- Generated-site submission allows an initially empty source URL.
- Update token resolves source URL from live ring data.
- Update token request for a node merged within the last minute succeeds (§1.9 — this fails
  today against the CDN-cached raw URL).
- Unknown update node returns `not_found`.
- Live-ring fetch failure returns an operational error, not `not_found`.
- Token and submission ID are cryptographically random.
- `expires_at` is approximately 24 hours in the future.
- `type` is stored for update-token rows as well as new ones.

### Bind source URL

- Existing generator row can bind once.
- Second bind returns `already_bound`.
- Unknown submission returns `not_found`.
- Expired submission cannot bind.
- Unsafe or malformed URL is rejected at bind time.
- A row not in `pending_verify` cannot bind.

### Verification

- Correct meta token verifies.
- Missing token returns `token_not_found`.
- Unreachable URL returns `unreachable`, distinctly from `token_not_found`.
- A 404 page whose body happens to contain the token does not verify.
- Expired token returns `expired` without making an HTTP request.
- **A row already at `verified`, `pending_review`, or `approved` cannot be re-verified**
  (§1.3 defect A).
- Internal and link-local destinations are blocked.
- Redirect to an unsafe destination is blocked.
- Large response is bounded.
- Attribute order and harmless HTML formatting do not break token detection.

### Finalize submission

- New submission succeeds with a verified, unexpired row.
- Update succeeds with matching stored node ID and valid Turnstile when configured.
- Missing Turnstile token fails when a secret is configured.
- Missing Turnstile secret follows the documented disabled policy.
- Submitted update node ID cannot disagree with stored node ID.
- New entry type cannot disagree with the committed token type.
- An entry that would fail `schema/ring.schema.json` is rejected at submit time.
- Rate-limited source receives the expected retryable error.
- **Two submissions from the same source URL 90 minutes apart are both blocked** (§1.4 —
  the second succeeds today).
- URL variants (trailing slash, uppercase host, default port) hash to the same bucket.
- Missing rate-limit salt fails closed.
- Duplicate concurrent finalization produces one review record and one notification.
- Discord rejection or timeout does not return false success.
- Missing Discord webhook does not return false success.
- Reviewer message contains every required review field.
- User-controlled Discord mentions are disabled — submit an entry whose `creator` is
  `@everyone` and confirm no mention fires.

### Signed review links

- Valid Approve link succeeds authentication.
- Valid Reject link succeeds authentication.
- **Signatures match a separately computed HMAC-SHA256 test vector, and do NOT match
  `SHA256(secret + "|" + message)`** — the secret-prefix construction being replaced
  (§1.1 defect A). A test that only checks "64 hex characters" passes both, so it must
  compare against a real HMAC vector.
- Modified submission ID fails.
- Modified decision fails.
- Modified expiration fails.
- Missing signature fails.
- Malformed signature fails.
- Signature of the wrong length fails before comparison.
- Expired link returns the expired page.
- Empty or missing secret prevents link creation and validation.
- The secret does not appear in any execution item, custom data, or response.

### Review action

- Invalid decision does not fall through to Reject.
- First click claims the row.
- Second click returns already resolved.
- Simultaneous clicks create no duplicate side effects.
- Reject sends notification before deletion.
- Reject notification failure preserves the row.
- Approve creates one branch, one member-file commit, and one PR.
- GitHub branch failure does not mark approved.
- GitHub commit failure does not mark approved.
- GitHub PR failure does not mark approved.
- A failed ring.json fetch aborts approval rather than proceeding with an empty ring.
- Updating an existing member file resolves its SHA using the authenticated request.
- Retry detects prior partial GitHub artifacts.
- A creator name of only punctuation does not produce a schema-invalid id.
- Public member JSON contains no email or review-only fields, and does contain
  `verification_token`.
- Browser error pages contain no raw internal API responses.

### Repository integration

- Created PR passes `validate:publish`.
- The repository workflow regenerates `ring.json` from `members/*.json`.
- New submission creates the expected member file.
- Update modifies the existing member file rather than creating a second identity.
- No private review field appears in the branch, commit message, or PR body.

## Phase 9: Cutover

Only after every applicable test passes:

1. Export the tested v2 workflows again.
2. Record their IDs, versions, node counts, and test results.
3. Ensure the old Intake router remains inactive.
4. Activate the v2 Intake router on the production webhook path.
5. Deactivate `Webring - Review Action` (`Slp86o7ChA3gqO3u`) and activate the v2 Review
   Action on the production review path — the old one currently owns
   `indienodes-review-action`, so both cannot be active at once (rule 6).
6. Submit one controlled production smoke-test entry.
7. Verify token issuance, verification, review notification, signed link, PR creation, CI
   regeneration, and private-field stripping.
8. Confirm CORS from the deployed site, not only from an API client.
9. Monitor executions and the Error Workflow through the smoke test.

Do not delete old workflows immediately after cutover.

Note that existing approve/reject links in any already-sent Discord messages will not
validate against the new HMAC secret. They do not validate today either (§1.1), so nothing
is lost — but any submission sitting at `pending_review` from before cutover needs its links
reissued or must be resolved manually.

## Phase 10: Cleanup and documentation

After a stable observation period:

1. Deactivate the superseded action workflows: `b6VtjxfnG4DGpkkO`, `1MHpokleoH2zJacp`,
   `IxlDDPZ4lByRhz6z`, `FJrNDbU5FSETe7WV`, `4vmvgcbRYDDKH1QZ`, `mffRcWJRouz3tUyT`,
   `9QqF74TKtTYrBKN5`, `V4xHyw1Ijczd55Aj`, and the old `SXGAxDAXG99Sj8SG`.
2. Confirm no active workflow references their IDs.
3. Remove the `review_link_secret` row from the `config` Data Table once the credential is
   proven in production. `rate_limit_salt` stays.
4. Retain one timestamped rollback export.
5. Export the final production workflows to `tmp/n8n-workflows-export/` and update that
   directory's `README.md` — its inventory table still lists eleven workflows.
6. Correct `docs/n8n-workflow-runbook.md`:
   - **Line 22 and §8**: correct as written — the `crypto` credential exists and is what
     the build uses. Add the credential id and the `saveData*` / `callerPolicy` hardening
     settings; no correction to the secret-storage instruction is needed.
   - §3 inventory: six workflows, not eleven.
   - §4: the merged Token Lifecycle and Finalize Submission workflows.
   - §5: the full status-transition table from §1.3, including the `pending_verify`-only
     precondition on `verify` and the transient/failure states.
   - §7: the complete reviewer notification field list and the `allowed_mentions` policy.
   - §8: actual HMAC implementation, canonical message, and constant-time comparison.
   - New: SSRF protections and the infrastructure requirements that workflow-level checks
     cannot cover.
   - §8/§10: the rejection notification requirement, and the repository's automatic
     `ring.json` regeneration.
7. Add a short workflow inventory and status-transition table to the runbook.
8. Run the n8n security audit and record findings without including secrets.

The 91-node flat fallback (`KIAQxUghXndjXeEz`) is already `isArchived: true` and inactive.
No action needed.

## Final report required from Claude

After completing the work, return:

- Every created, updated, activated, deactivated, or archived workflow ID
- Before and after node counts, per workflow and in total
- Before and after workflow counts
- Exact status-transition model as implemented
- Secret-storage mechanism used (crypto credential id), and confirmation that no secret
  reaches an execution item or a workflow export
- HMAC algorithm and canonical message format, with the explicit `action`/`type` values set
  on every Crypto node
- The answer to step 0.2.1: what the old `compute signature` node actually computed
- SSRF protections implemented in workflow and infrastructure
- CORS configuration location and the origins allowed
- Error Workflow ID
- Test matrix results, including failures and skipped tests
- Any remaining manual configuration
- Any remaining security or reliability limitation
- Fresh JSON exports of the final workflows
- Confirmation that the production webhook paths have exactly one active owner each

Do not describe the work as complete if any critical test is skipped, any required secret
is still allowed to fall back to an empty value, or any cryptographic node is left on a
default algorithm.
