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

- [`curation-policy.md`](./curation-policy.md) — the human review standard for deciding
  whether a creator has substantive work a visitor can experience.
- [`submission-form-spec.md`](./submission-form-spec.md) — public fields, validation,
  consent language, ownership verification, and the webhook contract for `/join`.
- [`n8n-workflow-runbook.md`](./n8n-workflow-runbook.md) — current intake, verification,
  private review, approval, rejection, contact, and error-workflow operations.
- [`n8n-intake-review-refactor-plan.md`](./n8n-intake-review-refactor-plan.md) — detailed
  migration plan and acceptance gates for the v2 n8n workflow set.
- [`member-link-health.md`](./member-link-health.md) — live source/media URL checks,
  failure policy, and scheduled runner contract.
- [`emergency-member-removal.md`](./emergency-member-removal.md) — narrowly scoped
  emergency removal procedure and required GitHub configuration.
- [`legal/EULA.md`](./legal/EULA.md) — end-user and contributor terms shown by the app.

## Authoring and interface extension

- [`generator-template-authoring.md`](./generator-template-authoring.md) — scaffold,
  preview, validate, and visually review downloadable creator-site templates.
- [`skin-authoring.md`](./skin-authoring.md) — UI and Node Skin contracts, registry
  behavior, fallbacks, accessibility, and interaction boundaries.

## Build and runtime guides

- [`platform-builds.md`](./platform-builds.md) — the canonical static web build and its
  optional Capacitor/Android and Wails desktop hosts.
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

| If you want to…                        | Read first                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Run or package the application         | [`../README.md`](../README.md), then [`platform-builds.md`](./platform-builds.md)                       |
| Change `members/*.json` or `ring.json` | [`submission-form-spec.md`](./submission-form-spec.md) and [`curation-policy.md`](./curation-policy.md) |
| Operate the submission backend         | [`n8n-workflow-runbook.md`](./n8n-workflow-runbook.md)                                                  |
| Add a generated-site template          | [`generator-template-authoring.md`](./generator-template-authoring.md)                                  |
| Add or change a visual skin            | [`skin-authoring.md`](./skin-authoring.md)                                                              |
| Tune the reactive background           | [`audio-reactivity.md`](./audio-reactivity.md)                                                          |
| Understand why the code works this way | [`decisions.md`](./decisions.md)                                                                        |
| Pick up future work                    | [`roadmap.md`](./roadmap.md) and [`open-questions.md`](./open-questions.md)                             |
