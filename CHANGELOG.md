# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **A note on the entries below 0.7.0.** This project was built in a continuous run before its first commit, so the releases here are a retrospective grouping of that work rather than a record of tagged, published releases. `0.0.1` is the phase-0 scaffold and carries its real date; the dates through `0.6.0` are approximate placements within the same build window, not release days, and the versions from `0.4.0` through `0.6.0` are grouped by theme rather than by the exact order any individual line landed in. Nothing before `0.7.0` was ever deployed. `0.8.0` was tagged without a changelog entry at the time; the one below was written after the fact, from that release's own commits, for the same reason the entries below 0.7.0 exist.

## [0.9.0] - 2026-08-17

### Added

- Every generator template (`Late Signal`, `Panel Room`, `Marginalia`, `Cartridge`) embeds a real, working ring widget in its footer by default, centered, using the best-guess ring id the review step already shows a creator (`provisionalId`) — a no-site creator no longer has to come back and paste the snippet in by hand. The success screen's "paste this wherever you like" instructions now only appear for a creator who brought their own existing site; a generator creator instead sees a note that it is already there. `README.txt` in the exported zip explains how to correct the id by hand if the one assigned at approval ends up different.
- A one-shot dot-grid ripple across the field's arrange-mode snap-grid the moment it switches on, and a matching outward burst (radiating from the middle column) the moment it switches back off, both skipped under `prefers-reduced-motion`.
- "Join the Ring" in the slide-out menu glows.

### Changed

- The general EULA, not the type-specific rights warranty, is now the one consent that gates submission: `rights_confirmation`'s wording is necessarily written toward one kind of work (audio's "recording and composition") and reads oddly for the others, so it stays collected but no longer blocks Continue or Submit. The EULA itself is reworded off audio-only language and now renders as a short statement next to its checkbox with the full text a click away in a modal, rather than the whole paragraph always inline.
- `pro_membership_name` is asked only when "Other" is picked — every named option (ASCAP, BMI, SESAC, GMR) already names itself by being chosen, so asking again was pure redundancy.
- Arrange and Theme moved out of the desktop nav drawer into a floating bottom-right cluster, mirroring the mobile top-right one that already carried both; reachable without opening the drawer at all now. The drawer's own top gained a logo-and-title header, since the floating top-left brand mark sits under the drawer's own backdrop once it is open.
- The success screen's reference code is its own centered, bordered block instead of sitting inline mid-sentence, and "Submit another entry" is a centered primary button instead of a small text link.

### Fixed

- `/join`'s export button intermittently failed with "Outdated Optimize Dep" / "Failed to fetch dynamically imported module." `jszip` is only ever dynamic-imported, which is exactly the shape that trips up Vite dev's dependency optimizer: discovering it mid-session (the first time a route actually reaches the `import()`) forces a re-optimize and a new hash, orphaning any tab that already loaded the previous one. Listing it in `optimizeDeps.include` makes it part of the eager pre-bundle at server startup instead, so there is no mid-session rediscovery left to race against.
- The inline site-generator preview hijacked page scroll while hovered, since a wheel gesture over an iframe goes to its own document rather than bubbling to the page. A click-to-activate overlay (paired with `pointer-events: none` on the iframe itself, belt-and-suspenders once a merely-visual overlay was confirmed not to be enough on its own) now keeps scroll on the outer page until a visitor explicitly opts in to interacting with what's inside it.
- The generator's "Your page" step, and short steps generally, read longer than their content needed on a tall viewport. Two causes: the preview panel's own "View full size" button was sized like a primary action (padding/font-size meant for the step's own Back/Continue row) rather than a small toolbar control, and `.panel`/`.step-body` used `height: 100%` rather than `max-height: 100%`, forcing every step to stretch to the full fixed-height budget even when its content was much shorter, which left dead space below a short step's own buttons. `.join-layout` also gained `overflow: hidden`, since `max-height` alone did not fully guarantee content could never push the fixed-height screen taller.
- The site generator's "Name to show" field showed the entry step's creator name as its `placeholder`, which reads as already answered, but the underlying value stayed empty until someone actually typed into it — `isStepComplete('site')` required that value directly, so Continue stayed disabled behind a field that looked complete. Now mirrors the same `displayName || entry.creator` fallback the real export already used, so the field's own "Defaults to..." hint and what actually lets the step advance agree.
- Two places used the wrong logo: the nav drawer's new header and the floating top-left brand pill both drew `Logo.svelte`, an abstract four-square chrome mark meant only for the favicon and small chrome spots, instead of the real logo image `AboutModal` and the field's own loading state already use. `Logo.svelte`, left with no remaining callers once both were corrected, was deleted rather than kept as unused code.
- The arrange-mode dot-grid ripple: the real static grid was visible underneath the animated overlay instead of only the overlay showing, entering arrange mode also grew the grid's own real, draggable container instantly (a `min-height` meant to make the canvas read as full-viewport had been applied directly to the functional grid rather than a decorative layer), and columns jittered noticeably near the top of a tall viewport. That last one was scaling, not translating, a repeating background pattern across a very tall element, forcing the browser to resample it every frame — worse the farther a dot sat from the transform's own anchor point. The decorative canvas is now a layer fully independent of the real grid's own box (so nothing about arrange mode can pop its container taller), and the ripple uses a plain `translateY` with no scale at all. It also eased out too abruptly into its resting state; now uses `ease-out` instead of `ease-in-out`.

## [0.8.0] - 2026-08-16

### Added

- The submission form itself, replacing the pull-request/issue path for joining the ring: an in-app multi-step flow at `/join` with a horizontal progress bar (click-to-jump, gated to steps already reachable), token-verified ownership against a submitter-controlled URL, a mock backend for local development, and a real n8n webhook contract for production.
- A client-side site generator for a creator with no site of their own: up to three uploaded works, an icon, social links, a choice of hand-designed templates per creator type with a live preview, and a downloadable zip ready to upload anywhere. Runs entirely in the browser — IndexedDB holds the draft's `Blob`s, `jszip` (dynamic-imported, so it never lands in any other route's bundle) packages the final archive. Templates are real, directly-openable `shell.html`/`styles.css`/`decorative.js` files per creator type, loaded via Vite's `?raw` suffix and filled with a small token engine, so the live preview and the real export share the exact same render path by construction.
- `scripts/preview-generator-template.js`, rendering every generator template against fixture data and serving it for direct viewing and editing, watching `templates/` via Vite's own file watcher.
- A Docker image (`Dockerfile`) serving the static build with Caddy, and a GitHub Actions workflow publishing it to GHCR on push to `main` and on version tags.

### Changed

- A `ring.json` entry now represents a creator, not a single work: the `title` field is removed entirely (it tried to serve both a creator-level introduction and a work-level name at once), `why` absorbs the introduction role and is capped at 160 characters as a form-only product rule, and a new backend-assigned `creator_id` links a creator's own nodes together. Every reader-side surface that showed `title` (FieldNode's card, the audio player, the comic reader, Members, Favorites) shows `creator` as the heading with `why` as the subline instead.
- Shared form-control styles (`.option`, `.chip`, `.control`, `.btn`) moved from Settings' own stylesheet into `app.css`, so `/join` and Settings draw from one definition instead of two that could drift.

## [0.7.0] - 2026-08-16

### Changed

- The icon set (favicons, the PWA icons, the maskable icon, the Apple touch icon, the social preview image, and the widget's inlined mark) is regenerated from the master logo, twice this round as the source artwork itself was revised in between.
- The project brief and the original build-instructions prompt are no longer part of this repository. Both were internal-only from the start; they're kept outside the working tree now instead of just being treated as such by convention. Every doc that linked directly to either points at a real, public alternative instead where one covers the same ground (`ring.json`'s field notes, previously only in the brief, are now also in `docs/submission-form-spec.md`), or drops the link in favor of a plain mention.
- Local test fixtures (`testing/fixtures/`, `testing/sites/`) are no longer committed. The tooling that builds and serves them (`testing/scripts/`, `testing/README.md`) still is, so the capability is documented and reproducible; the generated and hand-authored data itself is local-only, since the fixture embedded real, identifying third-party content (including the project owner's own site, used as one of its "real-source" stand-ins) that had no reason to sit in a public repo. `README.md`'s Test data section documents how to regenerate what's regeneratable.

## [0.6.0] - 2026-08-15

### Added

- `VITE_SITE_ORIGIN` sets the deployed origin at build time, with `.env.example` documenting the Docker consequence: the app is a static build with no server process, so this belongs to `docker build --build-arg` and setting it on `docker run` does nothing.
- Removing a like from Favorites now asks first, using the app's own dialog rather than the browser's. On that page the card is the only thing showing that entry, so it vanishes with no route back; everywhere else un-liking stays immediate, because the card is still in front of you.
- Export and import of all local data (`src/lib/localData.js`, Settings > Content). One versioned JSON file carrying likes, the discovery journal, the field arrangement, preferences, filters, and volume, so moving devices actually works. The panel lists exactly what is in the file before you download it, since the journal is a fuller record of browsing than a like list is. Import validates the envelope and skips keys it does not recognise rather than writing them.
- `npm run validate:publish`, a publish-readiness check that hard-rejects `_placeholder: true` entries. The default `npm run validate` still accepts them (seed data is what gives the field content today) and now reports how many there are.
- The widget builds to `/embed.v1.js` as well as `/embed.js`, and the versioned URL is what the join page and README hand out. Identical files today; the point is that a member who pastes the snippet is pinned to a contract, so a future breaking change can ship as v2 without editing anyone else's site.
- `/join`'s steps are a two-column layout: a numbered sidebar on the left, one panel of content on the right, rather than one long scrolling page. Collapses to a single column with the steps as a horizontal strip below 60rem.
- The Members list is paginated, 12 per page, with a "Showing X to Y of Z" readout and page numbers that collapse to an ellipsis past 7 pages. Turning the explicit-content filter off or on mid-browse clamps your current page instead of resetting it to page 1, so a change made elsewhere doesn't lose your place.

### Changed

- The production domain is `https://indienodes.us`, replacing the `indienode.example` placeholder in the widget's ring URL, the Open Graph and Twitter tags, the schema's `$id`, and the embed snippet in `README.md`.
- The About modal's principles are a list with icons rather than disc bullets, and the Ko-fi button is centered in its panel.
- Headings are set in Space Grotesk instead of Newsreader. The serif read editorial, closer to a magazine than to a webring; a geometric sans carries the register this is actually going for. Karla still sets body text, and the change is a dependency swap rather than an addition.
- The nav drawer is translucent glass with a blur instead of a solid panel, so an enabled ambient background stays visible behind the menu. Deliberately more opaque than the app's other glass surfaces: contrast has to hold against a drifting particle field at its worst moment, not its average one (measured at roughly 16:1 in both themes).
- Theme and Arrange moved off the mobile bottom bar into a floating cluster at the top right, mirroring where the hamburger sits on desktop. Neither is a destination, and having them in the bar made its item count depend on the route, so every navigation shifted the remaining icons sideways under the thumb that had just tapped one.
- The right-click field menu has icons on every row.
- `/join` leads with reference tables (every field, and where audio has to be hosted to be playable) instead of the same information as prose.
- The embeddable widget shows the real IndieNodes mark. It was drawing a different one: four type-colored nodes, three large and one small, which is not the brand logo. Inlined as a data URI so it still carries no image request onto a host page, and generated from the master by `scripts/generate-icons.js`.
- Settings > Content is two columns (filtering on the left, behavior and data on the right), not one long stack. It had grown to six panels as explicit content, rotation pace, and data export landed; the page also widened slightly to give both columns room. Collapses to one column below 56rem. Appearance is unaffected, since two panels never needed it.
- `/join` now opens with a notice that the submission form is not built yet and that the page will be rewritten around it once it exists, rather than presenting the pull-request and issue instructions as the settled design. The "Send it in" panel is worded the same way ("For now, everything above goes in one pull request...").

### Fixed

- `/members` showed the ring as of the last deploy rather than the ring the rest of the app had loaded. Its server load fetched `/ring.json` directly while every other surface reads the shared client-side store, so the two could disagree: against the 50-entry test fixture the field showed 50 and this page showed 5.
- `RING_JSON_URL` was left pointing at `http://localhost:4174/ring.test.json` from a local testing session. The widget bakes that in at build time, so an embed built from it would have asked every visitor's own machine for the ring.

## [0.5.0] - 2026-08-15

### Added

- A local discovery journal (`indienode:journal:v1`): a record of the entries you have opened, liked, and listened through, kept in this browser and nowhere else. It is capped at 500 events, clearable from Settings, and deliberately **write-only with respect to what you are shown**. Nothing in the selection path reads it, which is the line between keeping a record and inferring from behavior. There is no score, no total, and nothing surfaces unprompted.
- A full-screen comic reader, opened from a Read control on a comic card (Visit is unchanged and still goes to the creator's own site). Zoom by click, wheel, double-tap, or pinch; drag to pan with momentum; swipe or arrow keys to page; a grid of every page; full screen; and chrome that gets out of the way while reading on a phone. Adapted from KeyJayOnline_v2's own viewer, which resolves a question open since phase 0: the interaction model carried over, none of its five dependencies did.
- Comic cards cycle through the entry's pages on their own timer instead of showing page one forever, pausing while hovered or focused and stopping entirely under `prefers-reduced-motion`. A comic that submitted three pages previously had two of them invisible.
- An explicit-content filter, on by default. Creators self-declare with a new optional `explicit` field; entries marked so are hidden from the field, Members, and Favorites until a visitor turns the filter off in Settings.
- A "No AI artists" line in the About modal's principles.

### Fixed

- The comic reader entered a loading state that never finished when zooming back out. Resetting zoom cleared the "image loaded" flag, but resetting zoom does not change the image source, so no load event ever followed and the spinner sat over a perfectly good page. Reachable from the reset button, the `0` key, and Escape while zoomed.

## [0.4.0] - 2026-08-15

### Added

- Preview playback. With a queue already running, a node's play control auditions the entry instead of replacing what you are listening to: the music ducks out over a quarter second, the preview plays, and the queue is left exactly as it was. Reaching the end (or pressing Stop) fades the music back and resumes it from where it was. The duck is deliberately not reflected in the volume slider, which continues to show the level you chose. "+ Queue" is how a preview becomes a real queue member; until then it is not in the queue at all.
- "Fit to view", a right-click option on the field. Renders the whole arrangement scaled to the viewport with every node's size and position relative to the others held exactly, rather than letting the responsive column ladder repack it into new rows. Implemented by changing the grid's cell pitch, so nothing is written to the saved layout and returning the window to its original size reproduces the original field precisely. It works while arranging too, since there is no transform to throw off dragging.
- `src/lib/audioRamp.js`, a requestAnimationFrame volume ramp. It moves `HTMLMediaElement.volume` rather than a Web Audio gain node, because gain requires the audio's host to allow cross-origin reads and a fade must work for every source unconditionally.
- A like control in the player itself. Rotation keeps running while audio plays and navigating away drops the card entirely, so the node that started a track is often gone by the time you decide you like it.
- Per-type rotation pace, with a slider for each content type in Settings. Audio holds for 10s, game and mixed nodes 14s, text 16s, comic 22s, adjustable from 5s to 60s. One interval could never serve both a track you decide about in seconds and a comic page you have to read. This is pacing only: every entry still appears and you still never choose what comes next.

### Changed

- The Queue button on a node is a solid chip matching the play control beside it, instead of a transparent outline. As an outline it borrowed `--bg-elevated` for both its border and its icon, which is near-black in dark mode, so on a card with cover art it was a dark ring on a dark scrim and could not be seen. An outline is only ever as legible as whatever is behind it, and behind it here is an arbitrary photograph; a solid chip brings its own ground, which is what every other control on a node already did.
- Adding a previewed entry to the queue now queues all of its tracks, not just the one that happened to be sounding. Auditioning stays per-track; adding is per-entry everywhere else in the app, and a three-track EP added by way of a preview should not quietly give you a third of it.

### Fixed

- A volume ramp could overshoot for a single frame, ending up fractionally louder than the level the visitor had set (measured at 0.604 against a chosen 0.6). A requestAnimationFrame callback's timestamp can precede the moment the frame was requested, which made the easing run with a negative progress value.

## [0.3.0] - 2026-08-14

### Changed

- Audio nodes can now be played. A queue-based player mounts at the layout (so it keeps playing across Field, Favorites, and Members), with play/pause, previous/next, seek, a reorderable queue, and per-node controls: Play replaces the queue, "+ Queue" appends without interrupting what is already playing. Reaching the end of a queue stops and offers one tag-matched suggestion behind an explicit prompt rather than continuing on its own.
- The player gained a volume slider and mute (persisted per browser), a gradient ground behind the now-playing metadata, and a queue panel that slides open and closed rather than appearing instantly.
- The metadata gradient moved from the audio player, where it was added by mistake, onto the node cards it was meant for. It matters most on cards with no cover art, which previously had nothing behind their text at all.
- Audio is playable only from a direct file the artist hosts at a host allowing cross-origin requests; platform players were evaluated and dropped. YouTube's terms prohibit audio-only playback outright, and its permitted visible embed carries ads and trackers this project promises not to serve. Self-hosting was rejected on strict liability, the narrow scope of DMCA safe harbor, and composition/PRO/MLC licensing that an artist often cannot grant. See `docs/decisions.md`.
- `tracks` is now optional for audio entries. An audio entry with no playable file is a supported shape: a link-only member, listed with its cover art and a link out but with no play control. The XENO entry is now one, so nothing in the repo expires any more.
- The ambient background's drifting particles now react to what is playing, speeding up with sustained loudness and kicking on transients. Only active where the audio's host allows CORS: attaching an analyser to audio that has not opted in silences playback outright, so the player leaves the audio path untouched wherever that is the case (which includes Bandcamp).
- The reactive background now reacts to the beat rather than to overall loudness, which is why it previously looked inert. Measured on real music, full-spectrum energy sits near 0.47 and barely moves, so it drove particle speed at a flat 1.9x. Beats are now found in the bass relative to its own recent average, and the analyser's own smoothing was lowered from 0.7 to 0.2 because it was flattening the very transients being looked for. Particles now rest at 1x and surge past 5x on a hit.
- Entry selection is now random per visitor (a shuffled deck per type) instead of a cursor walking `ring.json` in order. Previously every visitor with the default layout opened on the same entries in the same slots, and members near the top of the file were shown far more than those near the bottom.
- The rotation hot path no longer re-filters the whole ring per node: pools are bucketed once per change and `canRotate` compares counts. Per-rotation cost is now independent of ring size.
- The ring is fetched once client-side and shared, instead of being serialized into eight places across the build. `index.html` dropped from 18,142 to 10,747 bytes with zero inlined ring data, and a new member now appears without a rebuild. `/members` keeps server rendering so it stays crawlable.
- `package.json` is no longer bundled whole into the client. It was imported as a default for one version string, which shipped every script name and dependency version to visitors; a named import tree-shakes it to the string.
- `CHANGELOG.md` is no longer bundled into the client. Parsing it for the About modal's release list moved to a server load, so the full 22 KB of changelog text (9.4 KB gzipped, growing every release) stopped shipping to visitors to render ~45 bytes of version numbers. The layout chunk dropped from 59 KB to 37 KB.
- `npm run dev:fixture` runs the app against the 50-entry test fixture (`VITE_RING_URL`), alongside `fixture:serve`, `fixture:generate`, and `fixture:audio`. Normal `npm run dev` and production builds are unaffected.
- `npm run dev:fixture -- --host` now works, and the fixture adapts to the network automatically: the ring URL is port-only and resolves against the page's own host, and the fixture server rewrites its 99 embedded asset URLs to match the `Host` each request arrives on. Testing from a phone needs no reconfiguration and no regenerating.
- The Queue control is an icon rather than the word, in the player (with its count) and on nodes, where it is now a circular button matching the play control beside it. Every icon-only control on a node and in the player also carries a hover tooltip, since an icon alone does not say what it does.
- The field's loading state is now the logo materialising from oversized and transparent into place, rather than a line of text, and a ring that fails to load says so instead of claiming to be empty.
- Cards with cover art no longer sit on a flat near-black plate; it is tinted to the node's own type color and the backdrop over it is more opaque.
- The rotation progress bar is a lit, drifting gradient in the node's type color instead of a flat block, and a rotation now crossfades the card's _contents_ with a slide-fade while the card itself stays put.
- `ring.json` now carries a fifth entry, AshZone's real _XENO_ EP (audio), alongside the four placeholders, so the audio node's pool has real content to rotate in rather than only a placeholder. Not marked `_placeholder`, since it is real, but not genuinely verified either (no ownership-verification flow exists yet to check it against), so its `verification_token` says `unverified-seed-entry` rather than either the placeholder token or a fabricated real one.

### Fixed

- The play button flapped between play and pause on local audio (measured at over 10,000 play/pause pairs in six seconds). Two causes: the playback effect issued a command on every run while its own media events wrote back to the state it read, and the analyser reloaded the element mid-playback to apply `crossOrigin`. The effect is now idempotent, and analysis never interrupts a track that is already playing.
- The reactive background never engaged. Setting `crossOrigin` after a resource had loaded could not enable analysis for the track already playing, and invalidated it besides. CORS mode is now chosen before `src` is assigned, learned per origin by trying: hosts that refuse are reloaded once without it and simply do not drive the background. This also removed the `HEAD` probe, which delayed the first track from every host and logged a console error for any host that had not opted in.
- Dragging the playhead restarted the track instead of seeking, and cover art was re-downloaded every time it reappeared. Both were the test fixture server: it answered Range requests with the whole file (so the browser could not seek) and sent no cache headers at all. It now supports Range/206, `ETag` with 304 revalidation, and streams rather than buffering whole files.
- Nav-drawer links caused full page reloads. The panel called `stopPropagation`, so clicks never reached the document where SvelteKit's router listens, and every drawer link fell back to a native navigation. That tore down the app on each one, restarting the ring fetch and, most visibly, stopping any audio that was playing. The backdrop now closes on self-clicks instead. `Modal` had the same pattern and got the same fix.

## [0.2.0] - 2026-08-14

### Changed

- The field view is now an arrangeable grid of persistent nodes rather than a fixed two-column layout of interchangeable positions. Nodes are placed, resized, and pinned to a content type, and the arrangement persists in local storage (`indienode:layout:v1`). Powered by gridstack (MIT, no runtime dependencies), lazy-loaded so only the field view pays for it.
- Edit mode ("Arrange"), off by default so the resting field stays an idle surface. It reveals drag handles, resize grips, a per-node type picker, add and remove controls, a reset, and a dot grid showing the snap targets. Rotation pauses while it is open.
- Per-type aspect ratios: audio and game lock to square, comic and text may also be wide. Resizing snaps to the nearest shape the type allows, and changing a node's type re-snaps it.
- Keyboard placement: arrow keys move a focused node, shift and arrow keys resize it, through the same snapping and persistence as dragging.
- Nodes with nothing to show render a placeholder instead of vanishing, so a node is always selectable and removable.
- The field is now full-bleed rather than capped to a centred column, since node size comes from cell spans.
- Node cards are layered: a blurred backdrop made from the card's own cover image, the type's own presentation over it, then a legibility scrim. Audio contains its album art over that blur, comics show their page uncropped and unedited, text fills with its header image, and games play a muted preview when one exists.
- All four entry type colors are now locked. Comic (`#a855f7`) and text (`#f59e0b`) carried PENDING placeholder values since phase 0 and are confirmed unchanged, having held up as full-card backgrounds in both themes. This closes one of the brief's own section 12 open questions.
- Cover art (`thumb_url`) is now an explicit submission expectation for every entry type, not just games, documented in `README.md`.
- The narrow-viewport "flow mode" (a plain CSS column below 640px, with gridstack torn down entirely) is gone. gridstack now runs continuously from the authored 24 columns down to 4, and dragging is offered at every width rather than only at the authored one.
- Add-node, reset, and exit controls moved out of a bar that sat permanently above the grid while arranging, into `ArrangeMenu`, a popup summoned on demand: right-click anywhere on the field on desktop, or a new `+` button in place of most of the mobile bottom bar while arranging. The resting field now carries no arrange-mode chrome of its own at all, matching the header's own toggle.
- Right-clicking the field opens the arrange menu in either mode: the full add/reset/done set while arranging, and a single "Arrange field" entry outside it, so the mode is one click away in both directions. Right-clicking a link still gets the browser's own menu.
- "Move up" / "Move down" node-menu buttons are gone, replaced by dragging, which now works at every column count including on a phone.
- The main nav collapsed into a right-side slide-out drawer on desktop (a floating logo mark and hamburger trigger replace the old full-width header bar), so the field view's node canvas now gets the full viewport height instead of "viewport minus the nav." Mobile keeps its bottom tab bar as the only nav there, now also carrying Arrange and the theme control.
- The nav drawer now slides back out on close instead of disappearing instantly, and the header's hamburger trigger morphs into an X (and back) instead of swapping between two unrelated icons; it also gives a brief press response on tap.
- The top-left brand mark now glows on hover and keyboard focus, a soft pulsing halo rather than a static hover state.
- The field's first-visit arrangement (before anything is saved locally) is now a centered column with deliberately varied node sizes, replacing an arrangement that spread edge to edge across the full 24-column canvas. A returning visitor's own saved arrangement is unaffected either way.
- The field's default arrangement is smaller and genuinely masonry now: every node starts at the smallest width its shape rules allow, comic and text default to a portrait shape instead of a wide one, and two nodes stack in each of two columns, landing at different heights the way a Pinterest-style layout does.
- A PWA icon set (192, 512, a separate maskable 512, an Apple touch icon, and small PNG favicons), a social preview image, and `static/manifest.webmanifest` are now generated from the real logo (`static/images/IndieNodes_Logo.png`) via a new `scripts/generate-icons.js` (uses `sharp`, a new devDependency). `app.html` gained a description, Open Graph, and Twitter Card meta tags, plus per-theme `theme-color` and the manifest/icon links; the existing hand-built `favicon.svg` stays the primary favicon.
- Renamed from IndieNode to IndieNodes everywhere a visitor reads it: page titles, the header brand mark, the About modal, `README.md`, the manifest, and the Open Graph/Twitter tags. Technical identifiers (the `<indienode-widget>` custom element, `indienode:*` localStorage keys) are unchanged.
- The About modal now opens with the real logo and current version above its tabs, lists release history (parsed from `CHANGELOG.md`, each entry linking to its GitHub anchor) under Source & License, and uses Ko-fi's actual logo on the Support tab's donate button instead of a generic cup icon. Modeled on GG Requestz's own About modal.
- The About modal's header is now centered (logo, "IndieNodes," and the version number stacked, the logo doubled in size) with no separate repeated title text, and the dialog is a fixed size instead of resizing itself on every tab switch. `Modal.svelte` gained a `showTitle` prop for this (default on, so every other modal is unaffected).
- `/members` lists every entry in the ring, and `/join` documents how to get into it (the `ring.json` entry shape, the `<meta name="indienode-verification">` ownership check, and the widget snippet). Both are in the desktop drawer; the mobile bar gains Members, with Join reachable from that page.
- The embeddable widget is now a two-line badge (the mark and wordmark above Previous / Random / Next) instead of a card previewing the current entry, and its buttons travel to a member's site rather than cycling a preview in place. A new optional `site-id` attribute makes Previous and Next resolve to that member's real neighbours. The mark is inline SVG with a slow idle animation.

### Fixed

- Nodes could not be dragged at all after toggling arrange mode, on any device: an effect gating drag/resize only read its own `editMode` prop on runs that got past its `grid`/`ready` guard, and the run that first cleared that guard happened to run before `editMode` was ever read, so it never became a tracked dependency and later toggles of arrange mode were silently ignored. Fixed by reading `editMode` unconditionally instead of after the guard. This is the fix for the reported "can't tap and drag nodes on mobile" bug; it affected mouse dragging identically, not only touch.
- Nodes leaned toward one side of the viewport between roughly 640px and 1400px wide, with no consistent direction: gridstack's own response to a column-count change produced inconsistent gaps row to row. That reflow is now replaced with a deterministic packer that centers each row, corrected to the pixel rather than the nearest grid cell.
- Nodes were too small between roughly 640px and 1200px wide, sitting at a fixed 32% of the viewport at every size. The grid's column count now steps down on smaller screens so nodes keep a usable size across the range.
- Node positions were scrambled by a responsive resize and never restored on the way back to a desktop width. Both position and size are now re-applied from the saved layout in a single batch when the grid returns to its authored column count.
- Resizing a window down past a breakpoint and back up permanently shrank wide nodes, because a clamped width was being saved. Geometry is now only persisted at the column count the layout was authored against.
- Every node became enormously tall below 640px wide. gridstack's one-column mode rescales width but never height, and its square-cell sizing made each cell the full container width, so a 9-cell-tall node rendered over 5000px high on a phone.
- The header nav was squeezed between roughly 640px and 1024px, where it carried a brand, four links, and two toggles. The mobile tab bar now takes over at 1024px rather than 640px.
- Comic and text nodes could not be made tall. The shape ladder ran from square to wide with nothing above 1:1, so dragging one taller snapped it back to a square. Portrait ratios (9:16, 2:3, 3:4) are now available to the two types most often portrait.
- Resizing comic and text nodes snapped back instead of committing. Shapes were a menu of six fixed sizes whose gaps were larger than a normal drag, so most resize gestures landed back where they started. Shapes are now ratio families with continuous width, and every drag produces a change.
- The like toggle sat on top of a node's Remove control while arranging and took its clicks. A node's badge and like toggle are now hidden during arrange, and its configuration moved behind a three-dot menu so the mode stops covering cards in form controls.

## [0.1.0] - 2026-08-13

### Added

- Embeddable webring widget (Previous / Next / Random), built as a standalone `<indienode-widget>` custom element with its own shadow root, so it carries no chrome, theme, or tracking onto a host page. Built separately from the main app via `vite.widget.config.js` into `static/embed.js`. `/widget` is a demo page and embed-snippet reference, not the widget itself.
- Field view (home page): a grid of up to 6 ring entries loaded from `ring.json`, with per-type touches (a pulsing bar visualization for audio, a slow image zoom for comic), a heart toggle per node, and a "Visit" link out (the reader doesn't exist yet, so this stands in for the brief's tap-to-open-reader behavior). A first pass, not the full ambient field: see `docs/open-questions.md`.
- Favorites: a `/favorites` page listing liked nodes, backed by a new `favoritesStore` (local storage only, mirrors how theme/background preferences already work).
- A fixed bottom tab bar (Field / Favorites / About / Settings) below a 40rem viewport width, replacing the top nav there; the top nav's text links remain above that width.
- Content cycling, with a sequential stagger-in for incoming nodes. Pauses, without losing progress, while the pointer is over a node, while keyboard focus is inside the field, or while the tab is hidden, so it never carries a node away from someone actually looking at it.
- Filters: a new `filtersStore` (local storage) narrows the field view's pool by entry type and by tag, controlled from a new "Content" tab in Settings, not from the field view itself (kept out of that view on purpose, per the brief's "no filter control in the ambient field" rule).
- Per-type stage components (`src/components/stages/`), splitting `FieldNode` into a shell plus a per-type ornament, so future node treatments are one new file each rather than a rewrite.
- `src/lib/imagePreloader.js`: warms a slot's next cover image (fetch plus decode) while the current one is still on screen, deduped by URL and capped at three concurrent loads.
- `docs/roadmap.md`: intended-but-unbuilt work, kept separate from `docs/open-questions.md` (which stays for genuinely undecided things).

### Changed

- Rotation is per-node on independent, jittered timers instead of one global timer swapping every visible node at once. This is what the brief described (section 7c), it reads as calmer, and it removes a network burst where every card requested its cover image in the same instant. Pausing is per-node too: hovering or focusing one card holds only that card while the rest keep going. The shared bottom progress bar was replaced by a thin per-card fill, since one bar cannot represent several independent countdowns.
- The field view is two columns of up to 6 nodes (was four columns of up to 16). Card size is set by the grid's container width, which dropped from 120rem to 52rem so cards stay near 400px rather than inflating to fill the wider container.
- FieldNode cards are square (was a wider rectangle), colored by the entry's own type across the whole card (not just the badge), with a cover image (comic page, game thumbnail) in place of the color wash when the entry has one, and a real Visit button instead of a bare link.
- About is now a modal (`AboutModal`, opened from the nav or the home page), not its own route. `/about` no longer exists. It has four tabs (Overview, Principles, Source & License, Support) with icons.
- Support is no longer a standalone route; its content is the About modal's fourth tab. `/support` no longer exists.
- Settings is now a tabbed page (Appearance, Content), reusing the same tab-pop fix as the About modal.

### Fixed

- Cover art supplied by ring entries was being discarded for every type except games. `thumb_url` is declared at the schema's top level and its rules only make it _required_ for games, never forbidden elsewhere, but the field view read it only for game entries, so an audio entry's album art or a text entry's header image rendered as a flat color wash instead. Cover images now come from `coverImageUrl()` in `src/lib/ring.js` for all types, falling back to a comic's first page. The schema's `thumb_url` description, which had said "Game only." and was what the original code was written against, was corrected to match what the schema actually enforces.
- FieldNode content (title, creator, why text, Visit button) could overflow the card's square boundary and get clipped whenever a title wrapped to its full 2 lines. Fixed with tighter, fixed-size (not page-scale) text sizing tuned to the smallest card width the grid actually produces.
- Switching tabs in the About modal popped the old panel's content before the new one appeared, the same layout-jump bug class as an earlier page-transition fix; fixed the same way (the outgoing panel goes `position: absolute` during its own exit).

## [0.0.1] - 2026-08-13

### Added

- Project scaffold: SvelteKit with Svelte 5 runes, Tailwind CSS, `@sveltejs/adapter-static`, Vitest, Playwright, ESLint, and Prettier.
- Design tokens and a Light / Dark / System theme system, stored in versioned local storage, with a no-flash inline script in `app.html`.
- Ambient background (`Drifty Stars`), ported from GG Requestz's `AmbientBackground.svelte`, repaletted for both themes and off by default.
- Settings, About, and Support pages.
- `ring.json` data model: `schema/ring.schema.json` (JSON Schema), `scripts/validate-ring.js`, and four fictional placeholder entries covering all four entry types.
- `LICENSE` (GPL-3.0-or-later) and this changelog.
- Route transitions: a short fade-and-slide between pages, off under `prefers-reduced-motion`.
- A generic `Modal` component (backdrop, Escape to close, click-outside to close, scroll lock).
- `testing/`: a separate `ring.test.json` fixture with one extra entry per type over the production seed data, three pulled from real live sources (a real Bandcamp release, the project owner's real site, a real demo game-directory listing) and four served from locally-hosted fictional creator pages with working ownership-verification tokens. Not read by the app; see `testing/README.md`.
- A type scale (`--text-xs` through `--text-2xl`) and consistent spacing values across every page, replacing ad-hoc font sizes.
- A small logo (`Logo.svelte`), four rounded nodes in the four entry-type colors, used in the header and as the favicon.

### Changed

- Dark mode palette reworked from a warm brown/amber base to a cooler blue-slate one: background, borders, muted text, the accent color, and the ambient background's gradient, blobs, and particles all shifted. Light mode is unchanged.
- Ambient background (`Drifty Stars`) sped up: faster particle drift and shorter blob rotation periods, so the effect reads as clearly moving rather than needing several seconds of staring to notice.
- Scrollbars (the document, any modal's scrollable body) are themed instead of left at the browser default.

### Fixed

- The `--type-games` CSS token (plural, matching the brief's "Games" label) didn't match the schema's singular `"game"` type value, so any `--type-${entry.type}` lookup for a game entry silently resolved to nothing. Renamed to `--type-game`.
- A narrow-viewport layout bug: the header's nav didn't fit below about 560px wide and forced the whole page to overflow horizontally.
