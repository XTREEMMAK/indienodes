# Codebase Audit

Date: 2026-08-21  
Scope: Application architecture, maintainability, duplication, readability, component size, persistence, generator infrastructure, testing, and documentation.

Claude's concurrent n8n changes were excluded from this audit. This document records a read-only snapshot and should be revisited after the n8n work is complete.

## Executive summary

The codebase is generally healthy and functional, but complexity is concentrated in a handful of very large Svelte components. The main maintainability risks are duplicated form logic, oversized interactive components, inconsistent local-storage handling, and weak test coverage around the most complex UI behavior.

The existing Svelte primitives are sufficient. A new form or state-management framework is not currently necessary. The largest gains will come from clearer responsibility boundaries and pure modules that can be tested without rendering an entire route.

## Validation snapshot

- Approximately 194 source, script, test, schema, and workflow files
- Approximately 34,000 lines
- `svelte-check`: 0 errors and 1 warning
- Unit tests: 134 passed across 9 test files
- Ring validation: passed with 5 member files
- Four placeholder ring entries correctly fail publish validation

The end-to-end suite and production build were not run during this snapshot because another agent was actively changing the repository.

## Highest-priority findings

### 1. The join flow is the largest maintenance problem

`src/routes/join/+page.svelte` is 2,996 lines. It currently owns:

- Existing-site submission
- Generated-site submission
- Entry editing for every media type
- Tag editing
- Verification
- Template loading and previewing
- ZIP export
- Asset selection
- Navigation
- Success handling
- Most of its styling

This makes unrelated changes capable of breaking the entire form, as happened with the template picker.

There is also substantial direct duplication with `src/routes/update/+page.svelte`. Both implement nearly identical tag, track, page, excerpt, focus, and step-navigation functions.

Recommended boundary:

- `EntryBasicsStep.svelte`
- `EntryMediaEditor.svelte`
- `GeneratorWorksStep.svelte`
- `GeneratorTemplateStep.svelte`
- `VerificationStep.svelte`
- `SubmissionSuccess.svelte`
- Shared entry draft factory and media manipulation helpers

The routes should retain flow orchestration because join and update have different verification behavior. They should not be replaced with a generic schema-driven form system.

### 2. AudioPlayer has too many independent responsibilities

`src/components/AudioPlayer.svelte` is 2,146 lines and manages:

- Media element lifecycle
- Volume and ducking
- Preview playback
- CORS behavior
- Web Audio analysis
- Background reactions
- Queue management
- Keep Going
- Curation and journaling
- Minimized mode
- Dragging and position persistence
- Full and minimized interfaces
- Extensive styling

This helps explain why reopening the player could restore play and pause while volume and background reactions remained disconnected. Several interacting state machines live in one component.

Recommended split:

- `audioController.js` for media lifecycle, volume, and CORS
- `audioAnalysis.js` for analyzer setup and cleanup
- `MiniPlayerDock.svelte` for drag and position behavior
- `PlayerQueue.svelte`
- `PlayerActions.svelte`
- `AudioPlayer.svelte` retained as the coordinator

The current AudioPlayer tests are useful, but they cover only part of this behavior.

### 3. Local-data export has drifted from actual persistence

`src/lib/localData.js` says it exports the app's stored data, but its registry omits:

- Skin selection from `src/skins/skinStore.svelte.js`
- Minimized player position from `src/components/AudioPlayer.svelte`

Submission and update drafts are also omitted. Excluding drafts might be intentional because they can be temporary or sensitive, but that policy is not documented.

Persistence implementation is repeated across several stores, and write failures are handled inconsistently. Some stores catch quota or private-mode failures, while favorites, hidden entries, filters, preferences, and skins can throw during normal interaction.

Recommended solution:

- A central storage-key catalog
- Metadata per key, including its label and whether it is exportable
- `safeReadJson()` and `safeWriteJson()` helpers
- Tests proving every portable preference survives export and import
- An explicit policy for excluding drafts

This is a small refactor with immediate correctness benefits.

### 4. Complex layout and gesture code lacks focused tests

`src/components/FieldGrid.svelte` is 1,098 lines. It mixes Gridstack lifecycle, responsive packing, geometry calculations, persistence, keyboard behavior, and decorative rendering.

`src/components/ComicViewer.svelte` is 1,250 lines. It contains mouse panning, momentum, pinch zoom, swipe detection, fullscreen, keyboard handling, auto-hide behavior, curation, and UI rendering.

Neither has dedicated tests.

Recommended approach:

- Extract FieldGrid geometry into pure functions and unit-test them
- Extract ComicViewer gesture transitions into a controller or Svelte action
- Test pointer, pinch, swipe, cancellation, and boundary cases without rendering the entire component
- Split visual controls only after the behavior is protected

This is a higher-risk area than its current test coverage suggests.

## Significant consolidation opportunities

### Shared entry actions

`FieldNode.svelte` and `ComicViewer.svelte` separately implement liking, hiding, mutual exclusion, and journal recording.

That behavior should live in one entry-curation service. Otherwise, future rules can change in one view but not the other.

### Generator adapters

The 16 generator `index.js` adapters repeatedly assemble the same values:

- Verification metadata
- Creator name and biography
- Color overrides
- Works markup
- Social links
- Widget markup
- Final HTML and CSS result

The visual templates should remain independent, but the adapter boilerplate should become a shared `renderTemplateShell()` helper. Template-specific work rendering and decorative scripts can remain local.

This would also simplify `scripts/scaffold-generator-template.js`, which currently embeds much of the adapter contract in its generated source.

### StepProgress mixes UI with an animation engine

`src/components/StepProgress.svelte` is 540 lines because the progress control includes a canvas particle system and extensive historical explanations.

Move the ember effect into a Svelte action or animation module. Keep StepProgress responsible for progress semantics, navigation, and accessibility.

### Settings can be divided along existing boundaries

`src/routes/settings/+page.svelte` is 1,003 lines, but it already has clear conceptual sections:

- Appearance
- Content filtering
- Rotation
- Local data
- Journal

This is lower risk than the player or join form. Extracting section components would mainly improve readability and reviewability.

## Readability and documentation

The code contains many valuable comments explaining why difficult decisions were made. Some files, however, contain long incident histories that obscure the current invariant.

Examples include:

- `src/components/StepProgress.svelte`
- `scripts/preview-generator-template.js`
- `vite.widget.config.js`
- `src/widget/Widget.svelte`

Recommended convention:

- Keep a short invariant or rationale beside the code
- Put detailed incident history in `docs/decisions.md`
- Encode prior bugs as regression tests

There is also stale documentation in `docs/roadmap.md`, which says `GITHUB_URL` is still a literal TODO. It has already been corrected elsewhere.

`KOFI_URL` in `src/lib/config.js` remains a real placeholder and should be resolved before launch.

## Tooling and dependency notes

Tailwind is not clearly dead weight. It is intentionally loaded through `src/app.css` and the Vite plugin. Removing it would require deciding whether its reset and any utilities are still desired.

`src/lib/index.js` is an unused boilerplate barrel. It is harmless, but either removing it or defining it as the intentional public `$lib` API would eliminate ambiguity.

The one `svelte-check` warning is caused by `src/widget/Widget.svelte`. The widget is correctly compiled as a custom element by `vite.widget.config.js`, but the main checker does not see that separate compiler configuration. A targeted warning suppression or separate widget check configuration would keep the baseline clean.

## Recommended execution sequence

1. Review and stabilize Claude's n8n changes before beginning this work.
2. Centralize storage keys and safe persistence, then add local-data import and export tests.
3. Extract the shared join and update entry editor and entry draft factory.
4. Break AudioPlayer into lifecycle, analysis, queue, and minimized-player modules.
5. Extract and test FieldGrid layout calculations.
6. Extract and test ComicViewer gesture behavior.
7. Consolidate FieldNode and ComicViewer curation actions.
8. Add the shared generator rendering helper and simplify scaffolding.
9. Split lower-risk presentation components such as Settings and StepProgress.
10. Clean stale documentation, placeholder configuration, and the widget warning.

## Implementation guidance

Each major extraction should be handled as a separate commit and should preserve behavior before adding new features. Pure behavior should be extracted and tested before large markup moves. This keeps reviews focused and makes regressions easier to trace.

After the n8n run is complete, first review its changed files and rerun the full validation baseline. Then update this audit if those changes introduce new boundaries, duplication, or integration concerns.
