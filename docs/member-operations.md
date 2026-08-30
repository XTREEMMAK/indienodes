# Member operations: where to add, change and remove entries

Every member exists twice: as one file under `members/`, and as one object inside the
generated `ring.json`. `members/*.json` is the source and `ring.json` is built from it by
`npm run ring:build`. The two must move together in the same commit — the app, the
widget and every other client read only `ring.json`, so a change that never reaches it is
a change that never happened.

That is the whole rule. Everything below is what enforces it, what does not, and what
breaks when it is worked around.

## Where each operation belongs

| Operation                     | Do it here                       | Not here                    |
| ----------------------------- | -------------------------------- | --------------------------- |
| A creator joins               | `/join`                          | Hand-written member file    |
| A creator changes their entry | `/update`                        | Editing their file for them |
| A creator leaves              | `/update`'s removal step         | Deleting the file directly  |
| Fixing a typo in copy         | Pull request against `members/`  | Direct push to `main`       |
| Correcting a broken URL       | Ask the creator to use `/update` | Editing it yourself         |
| Removing a member for cause   | `emergency-remove-member.yml`    | Direct push to `main`       |
| Trying something locally      | Any branch, never merged         | `main`                      |

`/join` and `/update` are the only paths that prove the person asking controls the site
the entry points at. Everything else is a maintainer acting on someone's behalf, which is
sometimes right and is never the same thing.

## What actually guards each path

| Path                          | `ring.json` rebuilt                        | Validated                              | Ownership proven                                       |
| ----------------------------- | ------------------------------------------ | -------------------------------------- | ------------------------------------------------------ |
| `/join`, `/update`            | Yes, by the approval workflow              | Yes, on the PR it opens                | **Yes** — token placed at the entry's own `source_url` |
| Pull request, same repo       | Yes, by `build-ring.yml`                   | Yes, by `validate-ring.yml`            | No                                                     |
| Pull request, from a fork     | **No** — run `npm run ring:build` yourself | Yes, and it fails on a stale aggregate | No                                                     |
| `emergency-remove-member.yml` | Yes                                        | Yes, on the PR it opens                | Not applicable                                         |
| **Direct push to `main`**     | **No**                                     | **No**                                 | No                                                     |

The last row is the one to remember. `build-ring.yml` and `validate-ring.yml` both trigger
on `pull_request` only, and `ci.yml` runs no ring validation at all. A commit pushed
straight to `main` that edits `members/` therefore gets no rebuild and no check: nothing
fails, nothing warns, and `ring.json` quietly keeps serving the old data until somebody
notices. **Use a pull request even when you have the rights not to.**

A fork's pull request is skipped by `build-ring.yml` deliberately — it cannot be handed
the credential that pushes back to a branch. That is why the fork row says to rebuild by
hand, and why `validate-ring.yml` failing on a stale aggregate is the safety net rather
than an inconvenience.

## What breaks when it goes wrong

| Mistake                              | What happens                                                              | How you find out                                                     |
| ------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Edited `members/` without rebuilding | `ring.json` still serves the old entry                                    | `npm run validate` — "ring.json is out of date with members/\*.json" |
| Edited `ring.json` by hand           | Next rebuild silently reverts it                                          | Same check, same message                                             |
| Deleted a member file, no rebuild    | They stay in the ring, still linked                                       | Same check                                                           |
| Pushed either straight to `main`     | Nothing is checked at all                                                 | Nobody tells you                                                     |
| Changed an existing `id`             | Their widget's `site-id` matches nothing, and `/update?node=` links break | `members:health` reports `ring_widget_site_id_unmatched`             |
| Invented a `verification_token`      | Their page does not carry it                                              | `members:health --check-tokens` warns until they place it            |
| Added a member by pull request       | Nobody proved they own the site                                           | Never, automatically — that is the trade                             |

## Fields a maintainer should not touch

`id` and `verification_token` are not editorial. Both are load-bearing outside this
repository:

- **`id`** is what a member's embedded widget carries as its `site-id`, and how `/update`
  finds their entry. Changing it after publication silently breaks the widget on a site
  you do not control. If an id truly must change, treat it as a removal and a rejoin.
- **`verification_token`** is the string that must appear in a `<meta
name="indienode-verification">` tag on the member's own page. It is public by design —
  it proves nothing on its own, because every check reads it _from the page at the entry's
  stored `source_url`_, never from anything a caller supplies. Rewriting it here does not
  change what is on their site; it only makes the health check disagree with reality.

Everything else — `creator`, `why`, `tags`, media URLs — is ordinary content, and the
creator can change all of it themselves through `/update`.

## Commands

```bash
npm run ring:build       # regenerate ring.json from members/*.json
npm run validate         # shape, filename/id agreement, and aggregate freshness
npm run validate:publish # the above, and refuses placeholder entries
npm run members:health   # probe live URLs and continuing ring participation
```

Run `ring:build` and `validate` together before opening any pull request that touches
`members/`. On a fork, that is not optional — nothing else will do it for you.

## Related

- `curation-policy.md` — whether an entry qualifies at all, and the continuing
  participation requirement.
- `submission-form-spec.md` — the `/join` contract, and how `id` and
  `verification_token` are assigned.
- `member-link-health.md` — what the health checker probes and how to read its warnings.
- `emergency-member-removal.md` — the narrow removal path and its required configuration.
