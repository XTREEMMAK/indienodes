# n8n workflow backups

Raw `GET /api/v1/workflows/{id}` exports of the live production workflows, written byte-for-byte
as the API returned them — not reformatted, not reparsed. That's deliberate: a diff against a
later export is a diff against what n8n actually stored, not against this script's opinion of it.

**Not the source of truth.** `scripts/n8n/build_workflows.py` is — it regenerates every workflow
from scratch on `--push`, and always will. This directory exists for what regenerating can't
help with: n8n itself losing a workflow (as it lost the `submissions` Data Table on 2026-08-23),
or a generator bug shipping and not being caught before a push reaches production.

**Generator output does not belong here.** These are reads of what n8n stored, which is why
every file carries an `id` and why the restore steps below start by reading it. To get
importable JSON for a workflow that has never been pushed — where there is no live workflow to
export and so nothing that could go in this directory — use `--emit`, which writes to stdout
precisely so the result is not left lying around to go stale:

```bash
python3 scripts/n8n/build_workflows.py --emit --only rating > rating.json
```

## Regenerating

```bash
python3 scripts/n8n/build_workflows.py --export
```

**Re-run this after every production `--push`.** A file here that predates the last real change
is stale the moment that change ships — same caveat `scripts/n8n/data-tables-schema.json` carries
for table IDs: these snapshots drift from reality the instant something changes and isn't
re-exported.

## Restoring from one of these

1. Read the file's `id` field — that's the workflow this snapshot came from.
2. If the workflow still exists but is wrong: `PUT /api/v1/workflows/{id}` with the file's body
   (trim to `name`, `nodes`, `connections`, `settings` — matches what `push()` in the generator
   already sends).
3. If the workflow is gone entirely: `POST /api/v1/workflows` with the same trimmed body creates
   a **new** workflow with a **new** ID. Any other workflow that referenced the old ID by name
   through `existing_by_name()` will pick up the new one on the next `--push`; anything that
   referenced it by a hardcoded ID (a `TABLE_*`/`*_CREDENTIAL` constant, or another workflow's
   `workflowId.value`) needs that constant updated by hand, the same way `TABLE_SUBMISSIONS` did
   after the incident these backups exist to make less painful next time.
4. Prefer editing `build_workflows.py` and re-pushing over hand-editing one of these files and
   importing it through the UI — that's the same rule the generator's own docstring states for
   the live workflows, and it applies here too.

## What's safe here

Every credential a node references appears only as `{id, name}` — never as `data`, which is
where a decrypted secret would live. Verified for all seven files before this directory was first
committed: no `data` key anywhere in any export, no string matching a plausible secret shape. The
actual secrets (HMAC key, GitHub PAT, SMTP password, Gotify token) live only in n8n's own
encrypted credential store and are never returned by this endpoint.
