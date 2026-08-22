# n8n workflow generator

The IndieNodes n8n workflows are generated from `build_workflows.py`, not
hand-edited. Editing a workflow in the n8n UI works until the next push, which
silently reverts it — change this script instead.

```bash
python3 scripts/n8n/build_workflows.py --list
python3 scripts/n8n/build_workflows.py --dry-run --only signature-helper
python3 scripts/n8n/build_workflows.py --push
```

## Credentials and secrets

Nothing here contains a secret. The review-link HMAC secret lives in the n8n
credential named in `CRYPTO_CREDENTIAL` and is resolved inside the Crypto node,
so it never reaches workflow data, an execution record, or an export. Rotate it
in the n8n UI (Credentials → the named credential → HMAC Secret); no workflow
change or restart is needed.

The API key is read from `~/.n8n-api-key` (mode 600, never committed). Write it
with `printf`, not `echo` — a trailing newline lands inside the auth header and
produces a 401 that looks like a wrong key.

## Instance-specific constants

`N8N_BASE`, the three Data Table IDs, and `CRYPTO_CREDENTIAL` are IDs on one
instance, not portable values. Confirm them before pushing anywhere else.

## Two constraints worth knowing

- **Sub-workflows must be published before their callers can activate.** n8n
  refuses to publish a workflow whose Execute Workflow node references an
  unpublished sub-workflow, so helpers activate first. This is safe: a helper
  has only an Execute Workflow trigger and no webhook, so activating it exposes
  nothing publicly.
- **`callerPolicy: workflowsFromAList` with an empty `callerIds` blocks every
  caller.** The script omits the policy entirely until at least one named
  caller exists. Set `N8N_EXTRA_CALLERS=<id>,<id>` to temporarily admit a test
  harness.

See `docs/n8n-intake-review-refactor-plan.md` for the design and
`docs/n8n-workflow-runbook.md` for the contract each workflow implements.
