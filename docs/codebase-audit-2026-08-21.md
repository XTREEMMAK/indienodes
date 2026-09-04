# Codebase Audit

Date: 2026-08-21  
Scope: Application architecture, maintainability, duplication, readability, component size, persistence, generator infrastructure, testing, and documentation.

Claude's concurrent n8n changes were excluded from this audit. This document records a read-only snapshot and should be revisited after the n8n work is complete.

**Status: historical. Read the appended `## Addressed` / `## Not addressed` sections first
— the body below them was never corrected in place.** Several findings have since been
acted on and their original text still reads as open: the `src/lib/index.js` barrel it
recommends removing was removed and no longer exists, and `VerificationStep.svelte` is
gone. The `## Validation snapshot` numbers are a dated measurement, deliberately left as
taken.

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

---

# Revisited: 2026-08-23

The audit asked to be revisited once the concurrent n8n work landed. It has, along
with ambient view, the mobile nav consolidation, and a round of ambient adjustments.
Every claim above was re-measured rather than carried forward.

## The audit was right, and the interim proved it

Between the audit and this revisit, `AmbientView.svelte` was written — and it
independently re-implemented curation, deck-shuffle rotation, fullscreen handling, and
an audio element lifecycle. It became the third-largest component in the project without
appearing in the audit at all.

That reframed the findings. They are not ten independent cleanups: **there was no shared
vocabulary for "act on an entry", so every new surface reinvented one.** The duplication
was the symptom. Measured drift over those two days:

| Claim                     | At audit | At revisit   |
| ------------------------- | -------- | ------------ |
| Curation duplicated       | 2 copies | 3 copies     |
| `localData` registry gaps | 2 known  | 5 of 12 keys |
| Oversized components      | 4 named  | 5            |

The curation rule had already drifted: two of the three copies dropped a dismissed
node's queued tracks and the third did not, safe only by coincidence of two unrelated
type gates.

## Addressed

- **Shared entry actions** (audit: "Shared entry actions"). `entryCuration.js` — one home
  for like/hide/mutual-exclusion/journal/queue-drop, with the drift resolved rather than
  inherited.
- **Storage keys and safe persistence** (audit finding 3). `storageKeys.js` catalogs all
  twelve keys with an explicit `exportable` decision and a stated reason for each
  exclusion; `localData` derives from it. Five stores were writing unguarded — a private
  window or full quota threw out of the click handler, so liking _failed_ rather than
  merely not persisting. All ten now share `safeReadJson`/`safeWriteJson`.
- **FieldGrid layout calculations** (audit finding 4, first half). `fieldLayout.js`, 15
  tests. FieldGrid 1,098 → 1,007.
- **ComicViewer gesture behaviour** (audit finding 4, second half). `viewerGestures.js`
  holds the decisions — tap vs drag, swipe vs wobble, zoom stepping — with 25 tests, plus
  the reader's first end-to-end coverage. The state machine and timers deliberately
  stayed put; moving them is a large refactor of code that had no coverage, which is the
  combination worth being careful with rather than bold about.
- **Rotation duplication** (not in the audit). `entryDeck.js` replaces two independent
  copies in the field route and ambient view; −58 lines.
- **Stale docs and the widget warning** (audit: "Tooling and dependency notes"). The
  `GITHUB_URL` TODO line was corrected, `KOFI_URL` resolved earlier, the unused `$lib`
  barrel removed, and the `options_missing_custom_element` warning silenced by name.
  `npm run check` is now **0 errors, 0 warnings** across 671 files.

Unit tests went 134 → 239; end-to-end 2 files → 8.

## Not addressed, and why

The join/update form — the audit's "largest maintenance problem" — is partly addressed.
`/join` is 2,997 → 2,073: its entry and media steps are now `JoinEntryStep.svelte` and
`JoinMediaStep.svelte`, and `formRowFocus.svelte.js` states the row-focus machinery once
instead of byte-identically in both routes.

The work started by testing the submission draft rather than by moving markup, since
losing a half-finished submission is the worst failure this flow has, and it had no tests
at all. That found a real bug: `rekeyed` was a no-op, because `row()` spreads its argument
after setting a fresh uid, so a stored uid overwrote it — for exactly the rows the
function exists to re-key.

Still open there: the `site` step, which carries the template picker, preview and ZIP
export. It is self-contained enough to extract, but the export path writes IndexedDB and
produces the file a creator leaves with, and has no coverage yet. Covering export comes
before moving it. That is deliberate ordering, not an oversight: the cheap
seams above are the ones that compound, because they are what new surfaces copy. The
splits are real work on existing pain, and each deserves its own review rather than being
folded into a consolidation pass.

**AmbientView has since been split** into `AmbientDiscoveryCard`, `AmbientActionPanel`
and `AmbientOptionsSheet`, leaving the parent as the coordinator it should have been:
2,298 → 1,402, with markup halved and CSS down 59%. Done in three steps with the ambient
end-to-end suite run between each, since the component had no unit tests to fall back on.

**AudioPlayer has since been partly addressed** (audit finding 2), 2,245 → 1,903:
`audioBeatDetector.js` takes the reactive background's arithmetic, `miniPlayerPosition.js`
the clamp, and `MiniPlayerDock.svelte` the minimized dock along with everything about
where it sits. The audit's suggested `audioController`/`audioAnalysis` split was
deliberately not taken all the way: the Web Audio graph's ordering constraints are about
the browser API rather than about any algorithm, and have no meaningful test without a
real pipeline, so extracting them would be motion without benefit. What moved is what
could be tested — 26 new unit tests over arithmetic that previously needed a live
AudioContext and a playing cross-origin track to exercise at all.

Current sizes: `join/+page.svelte` 2,073 · `AudioPlayer.svelte` 1,903 ·
`AmbientView.svelte` 1,402 · `ComicViewer.svelte` 1,224 · `FieldNode.svelte` 1,102 ·
`FieldGrid.svelte` 1,007.

Two smaller items also remain open: the generator adapter boilerplate (16 adapters) and
StepProgress's embedded particle system. Both were deprioritised as low-compounding —
generators are stable and additive, and StepProgress is isolated and cosmetic.
