# IndieNode v2 — n8n Workflow Runbook

**Version:** v1.0
**Status:** Build guide, pending production deployment
**Scope:** Node-by-node instructions for building the n8n workflow(s) that back `VITE_SUBMISSION_WEBHOOK_URL` and `VITE_CONTACT_WEBHOOK_URL`. This is a **build runbook, not an importable export** — there is no `.json` workflow file to import; you follow this manually in the n8n UI (self-hosted or cloud, either works). It exists as the companion to `docs/submission-form-spec.md` (what and why) and `docs/decisions.md` (locked decisions) — this document only covers how.

Two decisions from `decisions.md`'s "LOCKED: PR authentication is a fine-grained PAT scoped to this repo, and the merge click stays manual" are fixed constraints throughout this runbook, not options to reconsider while building it:

- The GitHub node authenticates with a **fine-grained Personal Access Token scoped to this repository only** (`Contents: Read & Write`, `Pull requests: Read & Write`), stored as an n8n credential.
- Opening the PR is n8n's job. **Merging it is not** — that stays a manual human click, gated by the `validate-ring.yml` CI check (`.github/workflows/validate-ring.yml`).

---

## 1. Prerequisites

Before building anything, have these ready:

- An n8n instance (self-hosted or n8n Cloud) reachable at a stable base URL — this URL is what `VITE_SUBMISSION_WEBHOOK_URL` and `VITE_CONTACT_WEBHOOK_URL` will point at once webhooks exist.
- A Discord webhook URL, **or** SMTP credentials — whichever you want the private-review notification (§7) and the update/reject notifications to use. Only one is required; both can coexist if you want redundancy, but the runbook below assumes one.
- A GitHub fine-grained PAT: Settings → Developer settings → Personal access tokens → Fine-grained tokens. Repository access: **only this repo**. Permissions: **Contents** (Read and write), **Pull requests** (Read and write). Nothing else. Save it as an n8n credential (Generic Credential Type → HTTP Header Auth, or n8n's native GitHub credential type if using the GitHub node — see §10).
- A Cloudflare Turnstile secret key, if you're using Turnstile on `/update` and `/contact` (`VITE_TURNSTILE_SITE_KEY` is already configured client-side; the matching `TURNSTILE_SECRET_KEY` has never had a home in this repo — it belongs here, inside n8n, per `.env.example`'s own note).
- A credential-bound secret for signing the one-time approve/reject links (§8). Generate a long random value and store it in the credential used by n8n's Crypto node HMAC operation. Do not store it in a workflow field, Data Table, environment variable read by a Code node, or this repository.

---

## 2. Contract reference — what the client actually sends

This is the ground truth the workflow must match exactly. It's pulled from the shipped client code (`src/lib/submissionApi.js`, `src/lib/contactApi.js`, `src/lib/webhookClient.js`), not restated from the spec, because the spec's own action table (`submission-form-spec.md` §7) predates the `/update` flow and only lists four of the six submission actions.

### 2.1 Response envelope (applies to every webhook below)

Every "Respond to Webhook" node, on every branch including failures, must return a body matching this shape (`webhookClient.js`):

- **Success:** any 2xx status, JSON body, not `{ ok: false }`. The specific success fields differ per action (below).
- **Failure:** either a non-2xx status, or a 2xx body containing `{ ok: false }`. Either way, include `{ error: { message, code, retryable } }`. `message` is shown to the user; `code` is a short machine string (e.g. `rate_limited`, `invalid_token`, `already_bound`); `retryable` is a boolean the client uses to decide whether to offer a retry button.
- A non-JSON body is treated as failure regardless of status code, so every branch must return JSON, never a bare 4xx/5xx with no body.
- The client times out at 15 seconds — nodes doing external HTTP calls (the reachability check, GitHub API calls) should fail fast rather than let the whole request hang.

### 2.2 Submission webhook — six actions, one URL, discriminated by `action`

Points at `VITE_SUBMISSION_WEBHOOK_URL`. Every submission action also carries `website` (honeypot — a hidden field a real submitter never fills; non-empty means drop silently) and `elapsed_ms` (dwell time since the form was first rendered; too low means drop silently).

| Action                 | Sends                                                                             | Returns                                             |
| ---------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| `issue_token`          | `{ source_url: string \| null, type, website, elapsed_ms }`                       | `{ submission_id, verification_token, expires_at }` |
| `bind_source_url`      | `{ submission_id, source_url }`                                                   | `{ bound: boolean }`                                |
| `verify`               | `{ submission_id }` — **never a URL**                                             | `{ verified: boolean, reason?: string }`            |
| `submit`               | `{ submission_id, entry, review, website, elapsed_ms }`                           | `{ reference: string }`                             |
| `request_update_token` | `{ node_id, website, elapsed_ms }`                                                | `{ submission_id, verification_token, expires_at }` |
| `submit_update`        | `{ submission_id, node_id, entry, email, website, elapsed_ms, turnstile_token? }` | `{ reference: string }`                             |

Notes that change how you build this:

- `issue_token`'s `source_url` is nullable — the site-generator branch (a creator with no site yet) mints a token before any URL exists to embed it at. `bind_source_url` is that branch's second half, attaching a real URL to the same `submission_id` afterward. It must reject (not silently overwrite) a second bind attempt on an already-bound submission — see §4's `bind_source_url` branch.
- `verify` sends only `submission_id`. **The workflow must resolve `source_url` from its own stored state, never from the request.** If the workflow trusted a client-supplied URL here, a submitter could verify a page they control and then submit a different one — the whole check becomes decorative. This is the single most load-bearing rule in this entire document; every branch that touches a URL (`verify`, `submit`'s re-check, `request_update_token`) must resolve it server-side.
- `entry` (in `submit` and `submit_update`) is the full `ring.json`-shaped object per `schema/ring.schema.json` (§2.3 below) — `id`/`creator_id` excluded (the workflow assigns those at approval, §9). `review` (in `submit` only) is the Section 2.2 block: `email`, `rights_confirmation`, `pro_membership`, `pro_membership_name`, `eula_agreement`.
- `request_update_token`/`submit_update` are keyed by an existing `node_id`, not a new submission. The workflow must fetch the node's **current** `source_url` from the live `ring.json` itself (not from anything the client sends) to check the token against — same reasoning as `verify`.
- `turnstile_token` is optional and appears **only** on `submit_update` and the Contact webhook — `issue_token`/`verify`/`submit` on `/join` are not Turnstile-guarded at all. Don't add a Turnstile check to those three actions; the client never sends a token for them.

### 2.3 Contact webhook — one action, no envelope discriminator

Points at `VITE_CONTACT_WEBHOOK_URL`, a **separate URL** from the submission webhook (so it can be paused/rotated independently). No `action` field — this webhook does exactly one thing.

Sends `{ name, email, message, website, elapsed_ms, turnstile_token? }`. Returns `{ reference: string }` on success, same failure envelope as §2.1 otherwise.

### 2.4 `ring.json` entry shape (for `entry`, and for the PR content built in §10)

Required: `id`, `creator`, `type` (`audio|comic|text|game`), `why`, `source_url`, `tags` (min 1 item), `verification_token`. Conditionally required: `pages` (comic, min 1 item), `excerpts` (text, 1 to 3 items), `thumb_url` (game). Optional: `creator_id`, `tracks` (audio, max 3), `preview_url` (game), `explicit`. `additionalProperties: false` rejects anything not listed here, which is exactly what makes the allowlist approach in §9 safe: an accidental leak of a review-only field would fail `npm run validate:publish` in CI (`.github/workflows/validate-ring.yml`), not just violate a policy. Full schema: `schema/ring.schema.json`.

Media URLs (`media_url` inside `tracks`, `image_url` inside `pages`, `thumb_url`, `preview_url`) must be `https://` and must not resolve to the `indienodes.us` domain — the schema's `externalMediaUrl` `$def` enforces this. Nothing in the workflow needs to duplicate that check; it's the CI gate's job to catch a violation, not the workflow's.

---

## 3. Workflow inventory

Build **two n8n workflows** sharing one instance:

1. **Intake** — handles both submission-webhook actions and the Contact webhook (three logical webhook triggers, can live in one workflow or be split further if you prefer smaller graphs — this runbook describes them as one for simplicity). Everything through "submission lands in the private queue" and "PR gets opened."
2. **Review action** — a single webhook trigger that the signed one-time Approve/Reject links hit. Kept separate from Intake because it's triggered by a maintainer's browser, not the site, and mixing the two graphs makes the signed-link logic harder to audit in isolation.

Contact (§11) is trivial enough to build as a third small graph or a branch inside Intake — either works, since it has no queue/PR concerns at all.

---

## 4. Node-by-node: Intake workflow, submission actions

**Webhook node** (POST, `Respond to Webhook` set to a later node so the response shape can be controlled per branch) → **honeypot/dwell short-circuit** → **Switch on `action`** (six branches).

### Honeypot/dwell short-circuit

An IF node immediately after the webhook trigger, before the switch: if `website` is non-empty, or `elapsed_ms` is below a threshold (e.g. 1500ms — pick a value and document it in the credentials checklist, §12), respond `{ ok: true, submission_id: <fabricated-looking uuid>, ... }` matching whatever shape the specific action would have returned on success, then stop. The point is to look identical to a real success from outside, so a bot never learns its submission was dropped. No third-party anti-spam API here — the project runs zero third-party scripts by design (`decisions.md`, spam-defense entry), so this has to be pure n8n logic (a Code node comparing timestamps/string length is sufficient).

### `issue_token`

1. Generate `submission_id` — a UUID (n8n Code node, `crypto.randomUUID()`).
2. Generate `verification_token` — a cryptographically random string (Code node, `crypto.randomBytes(16).toString('hex')` or similar). **Do not use `Math.random()`** — a predictable token is not a proof of control (`decisions.md`'s "verification token" entry explains why this matters).
3. Compute `expires_at` = now + 24 hours (ISO string).
4. Write a row to the `submissions` table (§5) keyed by `submission_id`: `{ source_url: input.source_url (nullable), type: input.type, verification_token, expires_at, status: 'pending_verify', created_at: now }`.
5. Respond `{ submission_id, verification_token, expires_at }`.

### `bind_source_url`

1. Look up the row by `submission_id`. Not found → `{ ok: false, error: { message: 'Unknown submission.', code: 'not_found', retryable: false } }`.
2. If `source_url` is already set (non-null) on that row → reject: `{ ok: false, error: { message: 'This submission already has a source URL.', code: 'already_bound', retryable: false } }`. This enforces "accepted once" — see §2.2's note on why re-binding must be a hard rejection, not a silent overwrite.
3. Otherwise set `source_url` on the row. Respond `{ bound: true }`.

### `verify`

1. Look up the row by `submission_id`. Not found or `source_url` still null → `{ verified: false, reason: 'not_ready' }` (not an error — this is an expected state while the client is mid-flow).
2. Read the row's **stored** `source_url` — never the request body (there is none to read here anyway; `verify` sends only `submission_id`).
3. HTTP Request node: `GET` the stored `source_url`. Handle non-2xx/timeout as `{ verified: false, reason: 'unreachable' }`, not an error response — this is a normal, retryable outcome for the submitter (spec §5 step 3: "Verify" is meant to be pressed again).
4. Parse the response body (HTML) for `<meta name="indienode-verification" content="...">` matching the row's stored `verification_token`. Use an HTML-extract node or a Code node with a regex — either works, but match on the exact attribute name `indienode-verification`, confirmed against the test fixtures (`testing/sites/*/index.html`, `testing/README.md`).
5. On match: set row `status: 'verified'`, respond `{ verified: true }`. On no match: respond `{ verified: false, reason: 'token_not_found' }`.

### `submit`

1. Look up the row by `submission_id`. Confirm `status` is `verified` — if not, reject with `code: 'not_verified'`.
2. **Re-run the reachability + token check server-side** against the row's stored `source_url` (repeat step 3–4 of `verify`) rather than trusting the earlier `verify` call. Spec §6 requires this re-check happen "at submission time," which means at `submit`, not merely once earlier. If it fails now, reject with `code: 'verification_lapsed'`.
3. Rate-limit check: compute a salted hash of `source_url` (HMAC or SHA-256 with a server-side salt, Code node), look it up in the `rate_limits` table (§5). A recent match (e.g. within the last hour — pick and document a window) → reject `{ ok: false, error: { message: 'Please wait before submitting again.', code: 'rate_limited', retryable: true } }`.
4. Merge `entry` and `review` from the request body into the row. Set `status: 'pending_review'`.
5. Write the salted hash + current timestamp into `rate_limits` (this is _all_ that table ever holds — no `email`, no raw URL — per the retention constraint in §5).
6. Fire the private review notification (§7).
7. Respond `{ reference: submission_id }` (or a short human-readable code derived from it — either is fine, the client just displays it back to the submitter).

### `request_update_token` / `submit_update`

Same two-step shape as `issue_token`/`submit`, but keyed by an existing `node_id` instead of a new submission:

- `request_update_token`: fetch the **current, live** `ring.json` (HTTP Request node — either the deployed site's `/ring.json` or GitHub's raw content URL for the file on `main`; pick one and use it consistently) and find the entry matching `node_id`. Use _that_ entry's `source_url` as the URL to verify against — never one from the request. Generate `submission_id`/`verification_token`/`expires_at` as in `issue_token`, but store `node_id` and the resolved `source_url` on the row instead of accepting a submitted one. Respond the same shape as `issue_token`.
- `submit_update`: same verified-status check as `submit`, plus a Turnstile check (`turnstile_token` against Cloudflare's siteverify API via an HTTP Request node, using `TURNSTILE_SECRET_KEY`) since this is the one `/join`-adjacent action Turnstile actually guards. On pass, treat identically to `submit` from step 4 onward, except the notification (§7) should make clear to the maintainer this is an _update_ to `node_id`, not a new entry, and the eventual PR (§10) modifies the existing entry in place rather than appending.

**Rule that applies to every branch above:** never resolve `source_url` from the request body for `verify`, `submit`'s re-check, or either update action. Always read it from stored state (the row, or the live `ring.json` for updates). Getting this wrong anywhere silently breaks the entire ownership-verification model.

---

## 5. Storage

Recommended: n8n's built-in **Data Table** node (no external database to run). Two tables:

**`submissions`**

| Column               | Type             | Notes                                                                                   |
| -------------------- | ---------------- | --------------------------------------------------------------------------------------- |
| `submission_id`      | string (key)     |                                                                                         |
| `node_id`            | string, nullable | Set only for update flows                                                               |
| `source_url`         | string, nullable | Nullable until `bind_source_url` for the no-site branch                                 |
| `type`               | string           |                                                                                         |
| `verification_token` | string           |                                                                                         |
| `expires_at`         | datetime         | 24h from issue                                                                          |
| `status`             | string           | `pending_verify` → `verified` → `pending_review` → `approved`/`rejected`                |
| `entry`              | JSON, nullable   | Set at `submit`/`submit_update`                                                         |
| `review`             | JSON, nullable   | Set at `submit` only; deleted on approval (§8)                                          |
| `email`              | string, nullable | From `review`, or `submit_update`'s own `email` field; deleted on approval or rejection |
| `created_at`         | datetime         |                                                                                         |

**`rate_limits`**

| Column            | Type         | Notes                                |
| ----------------- | ------------ | ------------------------------------ |
| `source_url_hash` | string (key) | Salted hash only — never the raw URL |
| `created_at`      | datetime     |                                      |

This is deliberately the _only_ thing retained past a submission's resolution (spec §7: "nothing about a submission is retained past rejection, while rate limiting and duplicate detection need memory by definition... a salted hash of `source_url` plus a timestamp: enough to recognize a repeat, not enough to reconstruct who submitted what").

**Fallback** if your n8n instance predates the Data Table node: use n8n's native **Redis** node instead, keyed `submission:<id>` and `ratelimit:<hash>`, with a TTL set on the rate-limit keys so old entries expire automatically instead of needing a cleanup job.

---

## 6. (reserved — see §7 for the notification and §8 for the signed links, split out because the link mechanism has enough detail to need its own section)

---

## 7. Private review notification

On a successful `submit` (or `submit_update`), build and send a Discord embed (or email via an SMTP node) containing **every** field on the row: the full `entry`, and the full `review` block including `email`. This is the one point in the whole system where `email` is allowed to be visible outside client-submitter back-and-forth — the private queue is exactly what keeps it from ever landing anywhere public (spec §5 step 5–6).

Include in the message:

- Entry summary: `type`, `creator`, `why`, `source_url`, `tags`.
- Review block: `email`, `rights_confirmation`, `pro_membership` (+ `pro_membership_name` if `Other`), `eula_agreement`.
- For updates: which `node_id` this modifies, and ideally a diff against the current entry (nice-to-have, not required for a first build).
- Two links, built by this node (see §8 for how `sig` is computed):
  - `{n8n_base_url}/webhook/indienodes-review-action?submission_id=<id>&decision=approve&exp=<timestamp>&sig=<hmac>`
  - `{n8n_base_url}/webhook/indienodes-review-action?submission_id=<id>&decision=reject&exp=<timestamp>&sig=<hmac>`

Treat the Discord channel or inbox receiving this message as the trust boundary — anyone with access to it can see `email`. That's inherent to "notification instead of admin page" being the whole design (spec §7's "no database and no protected admin page" decision), not a gap to fix here.

---

## 8. Signed one-time approve/reject links — the Review action workflow

A separate n8n workflow, its own webhook trigger, e.g. `/webhook/indienodes-review-action`, taking query params: `submission_id`, `decision` (`approve`|`reject`), `exp` (unix timestamp), `sig`.

### Building the links (done inside Intake, §7)

Use n8n's Crypto node HMAC operation with SHA-256 and the credential-bound
secret from §1:

`sig = HMAC-SHA256(secret, "${submission_id}|${decision}|${exp}")`

Hex-encode the result. Set `exp` seven days in the future. A plain hash such
as `SHA256(secret + payload)` is not an acceptable substitute for HMAC on
this public webhook authentication boundary. If the Crypto node cannot publish
because its HMAC credential is missing, provision that credential rather than
falling back to a concatenated hash.

### Handling a click (Review action workflow)

1. **Recompute** `sig` with the same Crypto node operation, payload order, and credential. Compare the hex output against the incoming `sig`. Mismatch → respond a plain HTML page: "This link is invalid." Stop. If the installed n8n version offers a dedicated HMAC verification operation, prefer it to a general string comparison.
2. Check `exp` against now. Expired → respond "This link has expired." Stop.
3. Look up the row by `submission_id`. Check `status`. **If it is not `pending_review`, respond "This submission was already resolved." and stop** — this status check is what makes the link one-time: the first click flips status away from `pending_review`, so a second click on either the approve or reject link (a maintainer double-clicking, or someone re-opening an old notification) can't act twice. No separate "consumed tokens" list is needed.
4. Branch on `decision`:
   - **`approve`**: run id/creator_id generation (§9), field stripping (§9), and PR creation (§10) in sequence. On success, set row `status: 'approved'`, delete `email`/`rights_confirmation`/`pro_membership`/`pro_membership_name`/`eula_agreement` from the row (or delete the row entirely once the public fields have been copied into the PR-building step — either achieves the same retention guarantee). Respond an HTML page: "Approved — PR opened: `<link to the PR>`."
   - **`reject`**: send a notification to the row's stored `email` (Discord DM isn't an option here since you don't have the submitter's Discord identity — use SMTP, or whatever the project's actual submitter-facing channel is) saying the submission wasn't approved. Delete the row entirely (spec §5 step 9: "nothing about their submission is retained past rejection"). Respond an HTML page: "Rejected."

Both responses are plain HTML, not JSON — a maintainer is looking at a rendered page in their browser after clicking a link, not consuming an API.

---

## 9. id / creator_id generation, and field stripping

Both run **inside the `approve` branch**, not at `submit` time — uniqueness has to be checked against `ring.json` as it exists _right now_, and the file can gain entries between a submission arriving and a maintainer approving it (spec §2.1).

### id

1. Fetch the current `ring.json` from the repo (GitHub API "Get contents" call, or the GitHub node's equivalent — this also gives you the file's current SHA, needed for the commit in §10).
2. Slugify `type` + `creator` (lowercase, hyphens, strip anything outside `[a-z0-9-]` to match the schema's `id` pattern). Truncate to a fixed length — **40 characters** is a reasonable default; adjust if you want, but pick a number and keep it consistent, since the spec doesn't pin one.
3. If the resulting slug collides with an existing `id` in the fetched file, append `-2`, `-3`, etc. until it doesn't.

### creator_id

The spec leaves the exact matching signal for "these two submissions share a creator" genuinely undecided (`submission-form-spec.md` line 42: "matching on verified `source_url`, an explicit form question, or something else... not yet decided"). **This runbook does not silently resolve that** — it implements the simplest workable option (match on identical `source_url` domain against existing entries in the fetched `ring.json`; if found, reuse that entry's `creator_id`, else generate a new one) and flags it explicitly as a placeholder inherited from an open spec question, not a settled design. If you want a different matching rule (an explicit form question, fuzzy name matching, etc.), that's a form + spec change, not just a workflow change — revisit `submission-form-spec.md` line 42 first. Also enforce the two-per-creator moderation-checklist cap here if you want it mechanical rather than relying on the maintainer noticing during review (not required by the schema — it's a soft cap per the spec).

### Field stripping

Build the PR-bound object as an **explicit allowlist**, not a denylist: `id`, `creator`, `creator_id` (if set), `type`, `why`, `source_url`, `tags`, `tracks`, `pages`, `excerpts`, `thumb_url`, `preview_url`, `explicit`, `verification_token`. Anything not on this list, most importantly `email` and the rest of the `review` block, is left out by construction. This matches how the schema itself already treats the file (`additionalProperties: false`), and an allowlist is safer than a denylist against a future field being added to the review block and someone forgetting to add it to a "fields to strip" list.

---

## 10. GitHub PR creation

Use n8n's native GitHub node with the fine-grained PAT credential from §1, or the HTTP Request node against GitHub's REST API directly if the native node is missing a call you need (branch creation from a non-default branch reliably needs the Git Data API's "create ref" endpoint, which some versions of the native node don't expose — check what your n8n version's GitHub node supports before assuming you need the raw API).

1. **Get current `ring.json`** — already fetched in §9 step 1; reuse the content and SHA rather than fetching twice.
2. **Build the new file content**: for a new submission, append the allowlisted object (§9) to the array. For an update (`submit_update`), replace the existing entry matching `node_id` in place.
3. **Create a branch** off `main`: `submission/<id>` for new entries, `update/<node_id>-<timestamp>` for updates.
4. **Commit** the updated `ring.json` to that branch. Commit message: `Add ring entry: <id>` (new) or `Update ring entry: <node_id>` (update).
5. **Open the PR**: base `main`, head the new branch. Title matching the commit message. Body: the entry's `why`, `type`, `source_url`, and a line noting it passed automated verification and private maintainer review — **explicitly never** including any `review`-block field. Something like:

   > Adds a new `audio` entry: _"why text here"_
   >
   > - Source: `https://example.com`
   > - Passed automated ownership verification and private maintainer review.
   >
   > This PR was opened automatically. `npm run validate:publish` runs on it via CI — merging still requires a manual review of that check, per `docs/decisions.md`.

6. The PR-creation step itself does **not** need to run `validate:publish` — that's what `.github/workflows/validate-ring.yml` does automatically the moment the PR exists, catching a bug in the stripping/generation logic before a human clicks merge. Opening the PR is the last thing this workflow does for a given submission.

---

## 11. Contact workflow

Much simpler — no queue, no PR, no token contract. Webhook receives `{ name, email, message, website, elapsed_ms, turnstile_token? }`:

1. Honeypot/dwell short-circuit, same as §4.
2. If `TURNSTILE_SECRET_KEY` is configured, verify `turnstile_token` against Cloudflare's siteverify API (HTTP Request node). Reject on failure.
3. Send the message via Discord or SMTP (whichever you configured in §1) — this is a direct maintainer-facing message, not a queue entry.
4. Respond `{ reference: <a short id, e.g. a UUID> }`.

Nothing here needs storage, since there's nothing to review or approve later.

---

## 12. Credentials / config checklist

**Created inside n8n** (never touches this repo):

| Item                                                              | Used by                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| GitHub fine-grained PAT                                           | §10, PR creation                                                  |
| Discord webhook URL or SMTP credential                            | §7 (review notification), §8 (reject notification), §11 (contact) |
| Review-link HMAC credential                                       | §8, HMAC sign/verify                                              |
| Turnstile secret key                                              | §4 (`submit_update`), §11 (contact)                               |
| Honeypot/dwell thresholds (elapsed_ms minimum, rate-limit window) | §4, §11 — document whatever values you pick                       |

**Goes back into this repo** (see §13 — nothing new, already exists):

| Repo variable                 | Points at                                                                   |
| ----------------------------- | --------------------------------------------------------------------------- |
| `VITE_SUBMISSION_WEBHOOK_URL` | Intake workflow's submission webhook trigger URL                            |
| `VITE_CONTACT_WEBHOOK_URL`    | Contact webhook trigger URL (or Intake's contact branch, if built that way) |

---

## 13. This repo needs no new configuration

Confirmed by re-reading `.env.example` and `src/lib/config.js`: nothing above requires a new environment variable, repo secret, or repo variable in this repository.

- The GitHub PAT is an **n8n credential only**. It never touches this repo, this repo's GitHub Actions secrets, or `.env` — there is no server here, at build or runtime, that could use it (`adapter-static`). `.github/workflows/docker-publish.yml` already uses a completely different, unrelated credential (the auto-provided `GITHUB_TOKEN`, scoped only to pushing the Docker image to GHCR).
- `VITE_SUBMISSION_WEBHOOK_URL` and `VITE_CONTACT_WEBHOOK_URL` already exist and already cover everything the browser needs to know. The review-action webhook (§8) is hit only by a maintainer's browser clicking a Discord/email link — never by this app's client code — so it needs no `VITE_` variable and no repo variable at all.
- `VITE_TURNSTILE_SITE_KEY` already exists; `.env.example` already correctly notes the matching secret key "belongs" in the external n8n workflow. This runbook is what fulfills that note (§1, §4, §11) — it doesn't change anything about this repo's own configuration.
