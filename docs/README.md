# Documentation

This directory holds the public build, design, policy, and operations documentation for
IndieNodes. The repository README is the product overview and quickest path to a running
development build; use this index when changing or operating a specific part of the
system.

Product direction also exists in an internal project brief outside this repository.
Where that brief does not answer an implementation question, the decision record and
open-question log below are the repository's source of truth.

## Product direction and architecture

- [`decisions.md`](./decisions.md) — accepted implementation and interaction decisions,
  including the reasoning and superseded approaches that still matter to the code.
- [`open-questions.md`](./open-questions.md) — unresolved product or implementation
  questions; do not silently close these while making adjacent changes.
- [`roadmap.md`](./roadmap.md) — agreed, intended work that has not been completed.
- [`creator-first-art-architecture-audit-2026-08-28.md`](./creator-first-art-architecture-audit-2026-08-28.md)
  — implementation map and delivery record for the creator-first, five-medium model.

## Membership, curation, and submissions

Member records, curation policy, and their operational docs (adding/changing/removing a
member, link health, emergency removal) all live in
[`indienodes-ring`](https://github.com/XTREEMMAK/indienodes-ring) now, not here — this
repo consumes the ring it publishes rather than authoring it. See that repo's own `docs/`.

- [`submission-form-spec.md`](./submission-form-spec.md) — public fields, validation,
  consent language, ownership verification, and the webhook contract for `/join`.
- [`n8n-workflow-runbook.md`](./n8n-workflow-runbook.md) — current intake, verification,
  private review, approval, rejection, contact, and error-workflow operations.
- [`n8n-intake-review-refactor-plan.md`](./n8n-intake-review-refactor-plan.md) — detailed
  migration plan and acceptance gates for the v2 n8n workflow set.
- [`legal/TERMS-AND-PRIVACY.md`](./legal/TERMS-AND-PRIVACY.md) — effective Terms of Use and Privacy Notice rendered at `/terms`.
- [`legal/EULA.md`](./legal/EULA.md) — creator submission agreement shown and accepted on `/join`.

## Authoring and interface extension

- [`generator-template-authoring.md`](./generator-template-authoring.md) — scaffold,
  preview, validate, and visually review downloadable creator-site templates.
- [`skin-authoring.md`](./skin-authoring.md) — UI and Node Skin contracts, registry
  behavior, fallbacks, accessibility, and interaction boundaries.

## Build and runtime guides

- [`platform-builds.md`](./platform-builds.md) — the canonical static web build and its
  optional Capacitor/Android and Wails desktop hosts.
- [`pre-launch-gate.md`](./pre-launch-gate.md) — the temporary credential gate that keeps
  the deployed app private while the public widget is tested. Removed at launch.
- [`audio-reactivity.md`](./audio-reactivity.md) — Web Audio signal path, detector tuning,
  reaction behavior, CORS limitations, and development debug panels.
- [`../testing/README.md`](../testing/README.md) — local fixtures, generated assets,
  media setup, end-to-end data, and testing from another device.
- [`../scripts/n8n/README.md`](../scripts/n8n/README.md) — repository tooling for n8n
  workflow files and backups.

## Audits and historical records

These are dated snapshots, not evergreen setup guides. Confirm findings against current
code before acting on them.

- [`codebase-audit-2026-08-21.md`](./codebase-audit-2026-08-21.md) — maintainability,
  testing, and consolidation findings with a later implementation revisit.
- [`security-audit-2026-08-27.md`](./security-audit-2026-08-27.md) — application and
  webhook security findings, completed fixes, and remaining infrastructure work.

## Where to start

| If you want to…                        | Read first                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Run or package the application         | [`../README.md`](../README.md), then [`platform-builds.md`](./platform-builds.md)                    |
| Deploy before launch, privately        | [`pre-launch-gate.md`](./pre-launch-gate.md)                                                         |
| Add or change a member                 | [indienodes-ring's docs](https://github.com/XTREEMMAK/indienodes-ring/tree/main/docs), not this repo |
| Operate the submission backend         | [`n8n-workflow-runbook.md`](./n8n-workflow-runbook.md)                                               |
| Add a generated-site template          | [`generator-template-authoring.md`](./generator-template-authoring.md)                               |
| Add or change a visual skin            | [`skin-authoring.md`](./skin-authoring.md)                                                           |
| Tune the reactive background           | [`audio-reactivity.md`](./audio-reactivity.md)                                                       |
| Understand why the code works this way | [`decisions.md`](./decisions.md)                                                                     |
| Pick up future work                    | [`roadmap.md`](./roadmap.md) and [`open-questions.md`](./open-questions.md)                          |
