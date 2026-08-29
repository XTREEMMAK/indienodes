# Creator-First and Media-Native Architecture Audit

Date: 2026-08-28

Source brief: `tmp/IndieNodes — Creator-First Node Model, Art Nodes, and Media-Native Node Enhancements.md`

## Purpose

This audit maps the approved creator-first, Art, Text TTS, and Game trailer work onto
the current IndieNodes architecture before implementation begins. It is intended to
keep the change additive, backward-compatible, and consistent across the ring schema,
submission workflows, field renderer, Ambient view, generator, and documentation.

The canonical product definition for this work is:

> A Node is a representation of an independent creator, collective, or studio,
> expressed through a small selection of their work.

In short: **Node = creator. Hero = work.** IndieNodes remains creator-first rather
than becoming a catalog in which each work is a separate member.

## Current architecture

| Concern               | Current source of truth                           | Finding                                                                                                                                                         |
| --------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public data contract  | `schema/ring.schema.json`                         | Four types exist: audio, comic, text, and game. Art is not yet a valid type.                                                                                    |
| Runtime normalization | `src/lib/ring.js`                                 | Type-specific arrays are normalized and cover art falls back to the first comic page.                                                                           |
| Browser validation    | `src/lib/submissionValidation.js`                 | Type choices, field validation, and serialization are explicit and must be extended together.                                                                   |
| Join state            | `src/lib/submissionStore.svelte.js`               | Draft state and step completion use explicit type-specific media fields.                                                                                        |
| Update state          | `src/lib/updateStore.svelte.js`                   | Hydration and change detection explicitly understand tracks, pages, and excerpts.                                                                               |
| Production moderation | `scripts/n8n/build_workflows.py`                  | Type allowlists, accepted fields, validation, and review output are independently enforced here. Generated n8n backups must be rebuilt after changes.           |
| Field shell           | `src/components/FieldNode.svelte`                 | The app owns behavior and accessibility; the active Node skin supplies the visual stage. This is the correct boundary to retain.                                |
| Basic Node skin       | `src/skins/node/basic/`                           | A distinct stage exists for every current type. The manifest and type contracts are explicit.                                                                   |
| Image viewer          | `src/components/ComicViewer.svelte` and its store | The zoom, pan, swipe, grid, fullscreen, hide, and favorite mechanics are already suitable for image galleries, but labels and item metadata are comic-specific. |
| Ambient view          | `src/components/AmbientView.svelte`               | Non-audio entries already participate in the visual pool. Text TTS and explicit direct-video playback already exist here.                                       |
| Speech                | `src/lib/speech.js`                               | Browser-native speech synthesis, voice selection, chunking, cancellation, and SSR safety are already implemented and tested.                                    |
| Generated sites       | `src/lib/generator/`                              | Template registration, fixtures, uploaded work normalization, export paths, and ZIP processing all enumerate the four current types.                            |
| Layout and filtering  | layout/filter stores plus field route             | Type pools, counts, default nodes, labels, colors, and menus contain several four-type assumptions.                                                             |
| Branding              | logo and badge assets                             | The four-part official mark is brand geometry, not a promise that only four content types can exist. It should not be redesigned as part of Art support.        |

## What is already aligned

The creator-first correction is mostly a clarification, not a data migration. The
schema descriptions, join flow, member copy, node shell, and existing `creator_id`
relationship already treat a node as a creator-facing presence with a small showcase.
Implementation should correct stale type counts and work-first phrases where found,
without renaming member ids or splitting existing entries by work.

Text-to-speech also has an existing shared implementation. The remaining Text work is
to expose that capability on the ordinary Text node/reader surface, preserve explicit
user initiation, and keep the current stop and reduced-motion/accessibility behavior.

The production Create, Update, and voluntary Delete path was verified end to end with
a new entrant on 2026-08-28. That lifecycle is a tested baseline for the new Art fields;
automatic rot and malicious-member removal remain separate deferred work.

## Locked implementation decisions

### 1. Art is an additive first-class type

Add `art` to the existing type enum. Existing member files remain valid and require no
migration.

Art entries use a top-level `artworks` array with one to three objects. Each artwork
contains:

- `image_url` (required): the displayed image.
- `alt` (required): a meaningful text alternative supplied by the creator.
- `title` (optional): the work title.
- `year` (optional string): deliberately flexible for ranges, approximate dates, and
  undated work.
- `medium` (optional): creator-supplied material or format.
- `external_url` (optional): a work-specific destination when one exists.

The existing top-level `source_url` remains the creator, collective, or studio home.
`thumb_url` remains optional for Art; when absent, the first artwork image is the Node
cover. Images are displayed with containment rather than destructive cropping.

Art receives its own type color and default no-cover icon. The Basic Nodes direction is
a restrained framed-art/palette treatment with subtle motion that stops under
`prefers-reduced-motion`. The existing Audio waveform is not changed.

### 2. Reuse the image-viewer engine without duplicating it

The existing comic viewer contains the expensive interaction behavior Art needs. It
will be generalized through a small mode/configuration seam so both comics and Art can
use the same gesture, zoom, grid, fullscreen, hiding, and favorite implementation.

Comic mode retains sequential page language and captions. Art mode uses gallery/work
language, required alt text, and optional title/year/medium/link presentation. Thin
wrappers or store adapters may preserve existing imports while the shared engine is
introduced; this is not a broad viewer rewrite.

### 3. Five Art generator templates share one data shape, not one composition

All five Art templates consume the same normalized artwork data and export contract,
but must remain genuinely different compositions. The planned set is:

1. gallery wall;
2. editorial portfolio;
3. studio desk;
4. contact sheet;
5. quiet exhibition.

Fixtures must contain mixed portrait, landscape, and square work so screenshots catch
cropping, overflow, and weak responsive layouts. Generator export adds stable local
paths for artwork assets and maps them back into the Art ring entry.

### 4. Text reuses the existing browser-native speech service

The ordinary Text experience gains a clear Read aloud/Stop control. It uses
`src/lib/speech.js`; no second speech layer or server dependency is introduced. Speech
must begin only after a user action and stop when the surface closes or changes entry.

### 5. Game trailers are additive and explicit

Keep the existing `preview_url` contract for backward compatibility with direct video
files. Add an optional `trailer_url` for supported YouTube URLs and normalize those URLs
through one tested helper to a privacy-enhanced embed.

The default Game surface remains static. Loading or playing a trailer requires an
explicit action; the external player is not created during idle rendering. Ambient
view also remains static until the visitor asks to play. Existing screenshots, cover
art, and direct-preview entries continue to work.

### 6. Official branding remains official branding

Art support adds an Art type-coded badge variant and Art UI tokens where needed. It
does not redraw the official IndieNodes logo or reinterpret its four shapes as a
schema enum.

## Cross-cutting implementation map

### Data and validation

- Extend `schema/ring.schema.json` with `art`, `artworks`, and later `trailer_url`.
- Update normalization, cover fallback, TypeScript/JSDoc shapes, and schema fixtures.
- Extend browser submission validation and serialization.
- Extend join/update draft state, hydration, completion rules, changed-work detection,
  and local persistence safely.
- Extend member-health and other scripts only where they enumerate media URLs or types.
- Add invalid and valid fixtures for required Art alt text, one-to-three limits, mixed
  metadata, and supported trailer URLs.

### Production submission pipeline

- Add Art and its fields to n8n type checks, field allowlists, generated review output,
  and final validation.
- Regenerate the checked-in n8n workflow backups from the builder.
- Verify Create and Update payloads against the same schema used by repository CI.
- Preserve removal behavior, which is type-independent.

### Application surfaces

- Add Art to type contracts, skin manifests, colors, labels, pools, counts, menus,
  filters, settings, member listings, and dev fixtures.
- Add an Art Basic stage and no-cover fallback.
- Generalize the image viewer and route comic and Art entries through their appropriate
  mode.
- Add slow, non-destructive Art transitions in Ambient view with a static reduced-motion
  fallback.
- Decide the default new-user field composition when the Art stage is integrated;
  existing persisted layouts must not be rewritten.

### Generator

- Register five Art templates while retaining the current counts for existing types.
- Add Art fixtures and mixed-ratio source assets.
- Extend generator data derivation, asset paths, image processing, ZIP export, preview,
  and exported ring snippet generation.
- Update visual tests so template-count assertions are per type instead of globally
  assuming four.

### Documentation and policy

- Use the canonical creator-first definition in the README and current product docs.
- Replace present-tense claims that IndieNodes has exactly four types once Art ships.
- Update the submission specification, n8n runbook, generator authoring guide, skin
  authoring guide, roadmap, and relevant legal descriptions.
- Keep historical decision records intact where they accurately describe the state at
  the time; add a new decision rather than rewriting history.

## Delivery sequence and gates

1. **Architecture and terminology:** land this audit and the canonical definition.
2. **Art contract:** schema, normalization, validation, state, fixtures, and production
   workflow support. Gate: schema/validation/unit tests pass and generated backups are
   reproducible.
3. **Art application surface:** Basic stage, default fallback, generalized gallery,
   field integration, and Ambient behavior. Gate: keyboard, pointer, reduced-motion,
   mixed-ratio, and responsive checks pass.
4. **Art generator:** five distinct templates and export support. Gate: every preview
   builds, exports, and validates an Art ring entry without cropping source work.
5. **Text TTS:** expose the existing speech service in ordinary view. Gate: start,
   stop, cleanup, unavailable-browser, and navigation behavior pass.
6. **Game trailers:** additive schema/helper/UI support. Gate: supported URLs normalize,
   malformed URLs fail clearly, embeds load only after user action, and direct previews
   remain compatible.
7. **Full release check:** build, unit tests, schema validation, n8n regeneration check,
   generator visual tests, ordinary/Ambient responsive pass, and documentation sweep.

Each phase should be independently reviewable and committed separately. No phase may
leave `ring.json` or generated n8n backups inconsistent with their source files.

## Implementation status — 2026-08-28

Phases 1–6 are implemented locally. The automated portions of phase 7—application
checks and build, unit tests, schema/ring validation, n8n source regeneration checks,
and focused browser interaction coverage—are complete.

Phase 7 closed out as follows.

**Responsive review: passed.** The field, the Text reader, and the Art gallery were
checked against the production build at 390, 768, 1280, and 1920px. No horizontal
overflow at any width, no element exceeding the viewport, and no application console
errors. Text samples in both the legacy string and the new object form were exercised
in the same pass.

**Excerpt compatibility: corrected during this pass.** An intermediate version of the
schema accepted only the new object form, which would have retroactively invalidated
every text entry published before samples could carry audio and forced exactly the
migration this audit rules out. Both shapes are now valid; see the decisions entry
"Text samples carry optional creator narration, and both excerpt shapes stay valid."
Four regression tests cover it, including a file holding one of each shape.

**Art in the first-visit field: corrected during this pass.** `defaultLayout()` shipped
comic, text, audio, and game only, so a first-time visitor never saw an Art member
without opening Arrange first. Art now has a slot on the same terms as every other
type. Stored visitor layouts are untouched, per the persisted-layout control below.

**Generator visual baselines: unchanged, deliberately.** Eleven audio/comic/text/game
snapshots differ from their 2026-08-21 baselines. All eleven templates and their inputs
are byte-identical to the pre-release commit—the only shared changes are an additive
`art` fixture and a JSDoc-only typedef—so the drift is environmental (font rendering and
a two-pixel reflow), not a content regression, and it predates this work. CI already
excludes these tests (`playwright test --grep-invert "reference image"`) for that
reason. Regenerating them here would bake one machine's text rendering into the
baselines and add eleven unrelated binary diffs to a feature release. The five new Art
baselines pass and were generated alongside the work they cover.

The production n8n workflows and their exported backups have not been changed by this
local implementation; `scripts/n8n/build_workflows.py` is the source of truth and its
Code-node tests pass (252/252), but `--export` snapshots live workflows over the API,
so the workflows and their backups must be deployed and regenerated together when this
work is released.

## Main risks and controls

- **Schema/workflow drift:** the browser, JSON Schema, repository automation, and n8n
  all validate independently. Change and test them in the same Art-contract phase.
- **Viewer regression:** reuse the existing interaction engine through modes and retain
  comic-specific tests before adding Art cases.
- **Image cropping:** use contained rendering and mixed-ratio fixtures at every surface.
- **Autoplay/privacy regression:** lazy-create third-party Game embeds only after an
  explicit user action; never autoplay with sound.
- **Persisted-layout regression:** add new type support without rewriting stored visitor
  layouts or preferences.
- **Scope creep:** this work does not redesign the logo, replace the skin system, add a
  server speech service, or turn works into independently discoverable members.
