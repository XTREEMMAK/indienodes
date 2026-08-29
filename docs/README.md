# Documentation

This folder holds build and design documentation for anyone (human or otherwise) working on this codebase. Product decisions live in an internal project brief, kept outside this repository; this folder is about how the code is built, not what the product is.

- [`decisions.md`](./decisions.md): choices made while building that were not fully specified upstream (fonts, palette, file layout), using the brief's LOCKED / PENDING convention.
- [`open-questions.md`](./open-questions.md): everything still undecided, carried forward from the brief and from build-time discoveries. Do not close these silently; they get surfaced and resolved with the project owner.
- [`roadmap.md`](./roadmap.md): intended-but-unbuilt work, where the direction is already agreed and only the building is left.
- [`submission-form-spec.md`](./submission-form-spec.md): fields, validation, consent copy, and backend contract for the submission form.
- [`audio-reactivity.md`](./audio-reactivity.md): how the ambient background reacts to playing audio, the detector/reaction tuning split, and how to use the `?debug=audio` live-tuning panel and its `?debug=audio-graph` response-curve/threshold view.
- [`generator-template-authoring.md`](./generator-template-authoring.md): how to scaffold, preview, refine, test, and visually review generated-site templates.
- [`member-link-health.md`](./member-link-health.md): live URL checking, failure policy, and the Semaphore/Ansible runner contract.
- [`platform-builds.md`](./platform-builds.md): the shared web build and its thin Capacitor/Android and Wails desktop hosts.
- [`security-audit-2026-08-27.md`](./security-audit-2026-08-27.md): dated application/webhook security findings, fixes completed in-repo, and infrastructure work that remains open.
- [`skin-authoring.md`](./skin-authoring.md): the UI and Node Skin contracts, laboratory workflow, fallback behavior, and interaction rules.
