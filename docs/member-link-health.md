# Member link health

The checker lives in this repository; Semaphore only schedules it. This keeps
the knowledge of member fields beside the schema and makes the same command
usable locally, in pull requests, and from operations tooling.

## What it checks

For every non-placeholder file under members/, the checker probes:

- source_url
- thumb_url
- preview_url
- every tracks[].media_url
- every pages[].image_url

URLs shared by more than one field are fetched once and reported with every
reference. Requests use GET with Range: bytes=0-0 when the response body is not
needed, so an audio or video check does not download the whole asset. Redirects
are followed up to five hops, with every target checked against private,
loopback, link-local, and reserved addresses before it is requested.

The result classes are deliberately conservative:

- Healthy: a final 2xx response.
- Broken: a final 404 or 410 response.
- Warning: timeouts, DNS/TLS failures, 401/403, 429, 5xx, unsafe addresses,
  redirect problems, missing participation, and optional missing-token results.

Warnings are visible but do not fail the command. A broken URL must repeat on
three consecutive stateful runs before the command exits with an alert. Any
healthy or uncertain result resets that URL's definite-failure streak. Nothing
automatically removes a member or edits ring data.

Continuing participation is checked by default on source pages. The checker
recognizes a full `<indienode-widget>` whose `site-id` matches the member and the
canonical `/go/random` link used by the script-free badge and text-link tiers.
Absence is a warning for human review, never an automatic removal. Use
`--no-participation-check` only for a deliberately availability-only run.

## Commands

```bash
npm run members:health
npm run members:health -- --json
npm run members:health -- --check-tokens
npm run members:health -- --help
```

By default, consecutive results are stored in .member-health-state.json, which
is ignored by Git. For a one-run pull-request check:

```bash
npm run members:health -- --no-state --failure-threshold 1 members/audio-example.json
```

Exit codes:

- 0: no URL has reached the alert threshold; warnings may still be present.
- 1: at least one 404/410 has reached the configured threshold.
- 2: invalid arguments, member selection, state, or another checker failure.

Participation and token retention are separate. Participation is checked by
default. With `--check-tokens`, source pages are also read up to 2 MB and checked
for the same `indienode-verification` meta tag recognized by intake. A missing
token is a warning, not a dead link, because availability, current ring
participation, and continuing ownership are different questions.

## Semaphore schedule

Run the command weekly. The state path must be outside Semaphore's disposable
checkout so the three-run threshold survives between jobs:

```bash
npm run members:health -- \
  --state /var/lib/indienodes/member-health-state.json \
  --json
```

The Semaphore task should fail on a non-zero exit code and send its normal
maintainer notification. Ensure the task user can create the state file's
parent directory.

If Semaphore requires an Ansible playbook, keep it as a thin runner rather than
duplicating the checker in YAML:

```yaml
- name: Check IndieNodes member links
  ansible.builtin.command:
    argv:
      - npm
      - run
      - members:health
      - --
      - --state
      - /var/lib/indienodes/member-health-state.json
      - --json
  args:
    chdir: /path/to/indienodes_v2
  changed_when: false
```

The existing /update flow is how a creator replaces a dead resource after a
maintainer confirms the report.
