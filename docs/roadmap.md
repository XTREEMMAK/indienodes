# Roadmap

Intended but unbuilt. Separate from `open-questions.md` on purpose: the things here have a direction agreed on, they just have not been built yet. Open questions are the ones where the direction itself is undecided.

Nothing here is a commitment to a date, and anything here can still be cut. What it does mean is that a design decision made today should try not to foreclose these.

## Per-node content channels (the semantic half)

The spatial half of the arrangeable field is **built**: nodes are persistent, placeable, resizable, type-pinned, and arranged with gridstack behind an explicit edit mode. See `decisions.md` for how it works.

What is still outstanding is the part that makes a node a _channel_ rather than just a typed slot:

- **Per-node tag filters.** A node currently pins a type. It should also narrow by tag, so "a hip-hop audio node beside a VGM audio node" becomes expressible. `layoutStore`'s node shape has a deliberate gap for `tags` waiting for this.
- **Removing the global tag filter.** `filtersStore` and the Settings > Content tab are already reduced to tags only (the global type filter came out when nodes gained their own type). Both disappear once tags move onto nodes; nothing new should be built on them.
- **A per-node tag picker** in the edit-mode config panel, alongside the existing type select in `NodeConfig.svelte`.

## Skins (the ornamental direction, packaged)

**Decided:** two independent axes, not one. A **UI Skin** is the app's own chrome — panels, buttons, backgrounds. A **Node Skin** is how a ring-entry card looks, animates, and sounds. They are chosen separately, so "a Retro theme with the Drifty Stars background" is a real, expressible combination rather than a single bundled toggle.

The extension seam is now built, with exactly one registered skin in each category:

- **UI Skin: Glassmorphic.** Registered under `src/skins/ui/glassmorphic/` and selected independently through Settings. The shared host still owns structural component CSS; the skin owns the panel tokens applied through `data-ui-skin`.
- **Node Skin: Basic Nodes.** Registered under `src/skins/node/basic/`, with a stage for every entry type. The app-owned `FieldNode.svelte` shell retains controls, accessibility, playback, and navigation while the selected skin supplies the visual stage.

**Retro Love** is the first skin that is both a UI skin and a Node skin, offered as a bundle: per-type ornamentation, animation, and sound-of-its-own-machinery for the node half, and its own chrome treatment for the UI half.

| Type  | Retro Love's node direction                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------ |
| Audio | A cassette animating into a player, spindles turning while it plays, a clicking sound before playback starts |
| Comic | A comic book that opens into the viewer (no page-flip; pages come up in the KeyJayOnline_v2-style viewer)    |
| Game  | A console, with a cartridge or disc loading in                                                               |
| Text  | A book                                                                                                       |
| Art   | An easel, or a drawing tablet (art is not a distinct schema type yet)                                        |

Choosing "Retro Love" as a bundle sets both axes at once, but they stay independently selectable afterward — Retro Love's UI with Basic Nodes, or Glassmorphic with Retro Love's nodes, are both legitimate combinations, not just the bundle's own two halves glued together.

### Structure, so a third party can add one

Skins live in their own folders so someone else can write one. The implemented shape is:

- `src/skins/<category>/<skin-id>/` per skin, where `category` is `ui` or `node`.
- One manifest per folder. `import.meta.glob` discovers manifests and generates Settings options without editing the Settings route.
- A versioned `skinStore` with independent `uiSkin` and `nodeSkin` values, defensive loading, and fallback when a stored skin is removed.
- Per-type fallback to Basic Nodes, so partial node skins are legitimate.
- A controlled services object for preloading, user-triggered sound, and host actions. Skins do not import application stores.
- `/dev/skins`, which exercises real cards across types, aspect ratios, missing artwork, paused content, and reduced motion.

See `skin-authoring.md` for the complete contract and workflow.

### Constraints carried forward from the brief

- **Game must stay static by default** (section 7b). Whatever a node skin's console treatment becomes, the cartridge or disc loading is an explicit, user-initiated flourish, never idle motion, and `preview_url` stays untouched until there is a real tap-to-play interaction.
- **Nothing autoplays with sound** (section 11). A spinning cassette is motion, not audio; the spindles may turn before playback is requested, the tape may not make noise on its own.
- Ornamental motion has to answer `prefers-reduced-motion` the same way everything else here does, which for looping mechanical animation probably means "stopped," not "shortened."

### Prior scaffolding

`src/components/FieldNode.svelte` remains the host shell. The original per-type stages now form the Basic Nodes package under `src/skins/node/basic/`. This keeps behavioral policy in one app-owned place while letting future skins replace the ornamental layer and request approved actions through the host contract.

An "art" type does not exist in `schema/ring.schema.json` today; the brief's type table covers audio, comic, text, and game only. Adding one is a schema change, not just a node skin.

## Kiosk mode

Effectively the PWA build of the app: installable, launches into the field view, stays there. Nothing exists for this yet: there is no manifest and no service worker in `static/`, so this is greenfield rather than a tweak.

Worth deciding early whether offline support is in scope, because that is what makes it a real service-worker project rather than a manifest and a display mode. Caching `ring.json` and cover images offline is plausible; caching creators' actual media is a much larger promise.

## Nodes as Android home screen widgets

The node concept maps neatly onto an Android home screen widget: a small, self-contained surface that rotates through ring content on its own timer. Appealing precisely because a node is already designed to be independent of its surroundings.

**This needs native code; a PWA cannot do it.** Android home screen widgets are built with `AppWidgetProvider` and `RemoteViews` (or Glance for Compose), and no web API exposes them. A plain PWA install or a Trusted Web Activity wrapper still cannot provide a widget from web code. The `widgets` manifest member that turns up in searches targets the **Windows 11** Widgets Board, not Android, which is an easy thing to be misled by.

So the shape would be a native wrapper (TWA or otherwise) for the app itself, plus a widget written natively that reads `ring.json` directly. The widget would not share rendering code with this project; it would share the data contract, which is the part that was always meant to be the product.

Two consequences worth weighing before starting:

- **The ornamental theme would need a second implementation** in native UI, or widgets accept Basic Nodes' plainer look.
- **It puts a native app in a project that is currently a static site with no build target beyond `build/`**, including store distribution and its review process. That is a materially different maintenance commitment, not just another client.

Re-verify the platform constraints when this is actually picked up; the above reflects the state of things as of this writing and Android's widget story has changed before.

## The discovery trail (the journal's mirror)

`journalStore` is **built** and recording (see `decisions.md`). What is missing is the only thing it exists for: showing a visitor their own history back to them.

**Decided:** a generative visualization, not a badge shelf. The framing that makes this compatible with the project rather than a smuggled-in achievement system is that it is **descriptive, not persuasive**. A badge shelf says "you have 7 of 12, go get the rest." A constellation of where you have been says nothing at all; there is no target state, so there is nothing to optimize toward, which is what sidesteps the engagement-optimization problem entirely.

- **Where:** a second tab on `/favorites`, not a new nav destination. That page is already the "your stuff" surface, and the mobile tab bar is at six items with seven measured as the point labels start truncating at 390px. Settings' own tabbed pattern is there to copy.
- **How:** 2D canvas or SVG, seeded deterministically from the journal's entry ids so the same history always draws the same picture, in the four locked type colors. Not Three.js; see `decisions.md` for why that is settled rather than open.
- **Type coverage as a quiet line, not a nudge.** "You have explored audio, comics, and text, but not games yet" belongs on this view as a passive sentence, visible only to someone who came looking. It never surfaces unprompted, never notifies, and never expires. Trivial to derive once the journal and the view both exist.
- **Nothing here reads back into selection.** That constraint belongs to the store, not to this view, but it is worth repeating at the surface that would be most tempted to violate it.

## Node maintenance and change requests

**Built.** The `/update` flow gives an existing member a creator-verified path to swap featured work, correct copy, or replace a dead link. Creator-hosted media means link rot is expected over time, so this is the repair path used after either a creator or the health checker finds a problem.

**LOCKED, from the addendum:**

- Update requests are creator-initiated, through a form keyed to the creator's existing node id, not a new submission. Covers: swapping which works are featured (within the existing 3-work cap), correcting tags/`why`/`source_url`, replacing a dead `media_url`/`image_url`/`preview_url`.
- An update request must pass the same ownership verification used at initial submission, re-checked against the current `source_url` or profile page. No new secret or credential.
- Review is narrower than a first submission: confirm the schema still validates, not a fresh quality or fit judgment, since ownership is already proven by the re-verification above.

**Resolved:** link-rot detection lives in `scripts/check-member-links.js`, with pull-request checks in GitHub Actions and recurring execution to be scheduled by Semaphore. It alerts maintainers only; the project does not retain a member email after approval, and the existing creator-initiated `/update` flow handles corrections.

**Implemented surface:** `/join` and the desktop navigation link to `/update`; both the form and its n8n actions are built.

**Visitor reports are built as a maintenance signal.** Every node carries a quiet Report action that opens the private `/contact` workflow with the node id, creator, and approved destination prefilled. It is aimed at post-approval drift — a creator-hosted page or media URL changing into something unsafe or materially different — and deliberately does not remove content automatically. A maintainer still compares the report with the versioned member record and decides what to do.

## Game entries: trailers and the viewer

**Decided, unbuilt.** Games reuse the comic reader for screenshots, and get a trailer control alongside it.

**What "the game itself" links out to needed no special answer: it is `source_url`, same as every other type.** A game entry does not get a distinct destination field; wherever the developer says their game lives (Steam page, itch.io, their own site) is what Visit already points at. This was raised as an open question and closed by noticing nothing game-specific was actually being asked for.

**The YouTube question is settled and it required changing a published promise, so it is recorded here rather than assumed.** `decisions.md` rejected YouTube outright, not on capability but because the About modal states "IndieNodes has no ads and no third-party trackers" and Developer Policy III.I.5 forbids blocking either. Trailers are being allowed anyway, on these terms:

- **Click to load.** Nothing from Google is requested until the visitor presses play. A poster frame stands in until then, so a game node costs no third-party request unless someone asks for one.
- **`youtube-nocookie.com`**, and a visible player with its own controls. This is the permitted embed, unlike the audio-only extraction III.I.7 prohibits.
- **The About and Join wording has to change** to something true: no ads or trackers on this site, and a trailer you choose to play loads from YouTube, which has its own. Shipping the embed without that edit would make the app's own text false, which is the actual reason this was blocked in the first place.

**A trailer can never be the silent node background.** III.I.9 forbids a player not displayed in the page the user is viewing and III.I.6 forbids modifying player functionality; a chromeless muted background player is squarely both. The opt-in background video is therefore built against `preview_url`, a direct file the developer hosts, which is what `GameStage` already plays today.

**The background autoplay becomes an opt-in preference**, off by default. That is a tightening of the current behaviour, which autoplays `preview_url` muted for everyone (a departure from brief section 7b already recorded in `decisions.md`). Making it opt-in moves back toward the brief rather than further from it, and the three existing guarantees stay: muted always, never under `prefers-reduced-motion`, and only while on screen and the tab is visible.

## Ambient view

A way to actually enter the brief's surface (c) as a mode rather than as the home page, closest in spirit to its "idle, screensaver-like" framing. Overlaps heavily with **Screen saver mode** below; these two should probably merge when either is picked up.

**First usable pass built and mobile treatment revised.** The field route exposes the documented desktop pill and mobile bottom-bar action, the one-time audio-capability confirmation, and an element-fullscreen attempt with a fixed-overlay fallback. Ambient view gives the visual entry the full canvas and keeps the selected audio in a compact bottom dock with real play/pause and playlist controls. Entry selects audio but leaves it paused. A separate square discovery card rotates audio candidates or alternate tracks on the right, keeps the cover visually dominant, shows its time until rotation, slides between choices, and can be hidden. Preview plays its choice once while preserving the selected track's position; Play this explicitly replaces the selected ambient audio. A single visual tap flashes and dims the canvas, pauses visual rotation, and slides two larger full-width creator rows into the center: audio has Like, Not for Me, and Visit; visual adds Next and Report. Tapping the dimmed area dismisses them. Double-tapping the visual or the non-button area of the player remains a shortcut for the corresponding like. Audio advances only from the selected media element's real `ended` event, so every track receives its full runtime rather than sharing the visual rotation timer. Entering ambient mode preserves the visitor's ordinary queue and exiting restores that prior context; if a queue is already playing, the dock speaks for that queue directly rather than dealing over it. An unobstructed toggle hides every ambient control so only the rotating visual remains, with a single tap to bring them back, and a brief "Now playing" announcement covers the track changes that mode would otherwise hide. The tap menu can hand a paged visual to the full-screen reader, releasing element fullscreen so the shared reader mount is reachable. Output volume moved to `audioSettingsStore` so the discovery card's one-off preview honours the same level as the player. The general audio-focus arbiter and `pairs_with` data remain outstanding.

**Entry point:** a floating pill beside the hamburger trigger, which is already `position: fixed` in `+layout.svelte` alongside the brand mark, so this adds a third floating control rather than reintroducing a header bar. On mobile it gates to the field route the way Arrange already does and swaps into the bottom bar rather than becoming a seventh item.

**Full screen** via `requestFullscreen()` on the mode's container, with a `fullscreenchange` listener to keep state honest and a fixed full-viewport overlay as the fallback, since iOS Safari will not fullscreen a non-video element. Nothing in the app uses the Fullscreen API today, so this is greenfield.

**The guardrail argument, which has to be made explicitly rather than assumed:**

- Brief section 11 says nothing autoplays with sound. Ambient entry now obeys that literally: it selects a preview but playback begins only from the visible Play button.
- The launch confirmation remains useful expectation-setting because the mode can play audio, but it is no longer what authorizes immediate playback.
- Running an audio entry and a visual entry at once is the same exception, not a second one: the visitor asked for a mode whose whole premise is that music plays while you look at something else.

**Decided: a one-time confirmation on first use, not a permanent label change.** The first press explains that ambient view can play audio and that playback starts only from Play; accepting opens the silent mode and is remembered locally (`indienode:ambient-consent:v1`) so every later launch is immediate.

It is a deliberate, narrow exception to "no confirmation dialogs for first-party actions" elsewhere in this app (Favorites' un-like prompt is not a precedent for this; that one guards against losing data, not against a guardrail promise). Worth remembering if this is revisited: it is the second dialog in the whole app, and the bar for a third should stay high.

**Persistent reactions**, one rounded pod per medium, expose both Like and Not for Me without opening the options sheet. Audio's like mark combines a heart with a music note; visual's combines a heart with an artboard. Their full creator-specific meaning is carried in accessible labels, and double-tap gestures are redundant shortcuts rather than the only path.

**An audio focus arbiter** in `audioPlayerStore` (`requestAudioFocus(owner)` / `releaseAudioFocus(owner)`), so exactly one source is ever audible and a game trailer with sound pauses the music rather than playing over it. This is not speculative plumbing: the preview lane's duck-and-restore already does precisely this for one case, and `src/lib/audioRamp.js` exists to be its shared mechanism. `GameStage` autoplays muted today, so nothing collides yet; the arbiter is what makes it safe when something does.

**Pairing** (which audio with which visual) is `pairs_with` from brief section 12 and is still undecided. Dealing from two independent decks is a usable first pass and should be understood as a placeholder.

## The submission form

**Built.** This was the largest single item on this list for most of this project's life. `docs/submission-form-spec.md` (v0.4) has the fields, validation, and copy fully specified, and `/join` is the real multi-step form described below, not a placeholder for it. What changed three times along the way was where its steps actually run, what order they run in, and finally what the backend actually _is_, since this project's architecture is a static build with no required backend for the reader or widget, and since the form collects an email address that changes what can safely be public and when.

**What "built" covers, precisely: the form's own half.** The multi-step UI (`src/routes/join/+page.svelte`), its state (`src/lib/submissionStore.svelte.js`), client-side validation cross-checked against the JSON schema (`src/lib/submissionValidation.js` and its test suite), and the webhook client (`src/lib/submissionApi.js`, with a mock backend for dev at `src/lib/submissionApi.mock.js`) are all in the repo and exercised end to end against the mock. **What is not in this repo, and cannot be:** the actual n8n workflow the form talks to. That is configuration inside a separate service, stood up and pointed at via `VITE_SUBMISSION_WEBHOOK_URL`; the contract it must implement is spelled out in `submission-form-spec.md` section 7. Without that variable set, a production build says submissions are closed rather than silently accepting them (`src/lib/submissionApi.js`'s `useMock`/`hasBackend` split) — this was verified directly, not just asserted, by building the site both ways.

**Section 5's token generation and reachability check run in an n8n workflow, reached over a single webhook and kept separate from the Docker/Semaphore/Ansible publishing pipeline.** It accepts the submission, generates the token, and checks it synchronously while the submitter is still on the page; it writes nothing to `ring.json` directly. This was chosen over extending the publishing webserver itself specifically to keep that server load-bearing for deploys only, not for intake too. Naming n8n also closed the review-queue question below, which is the main reason it won: one service covers intake, the check, the queue, and the PR, instead of a function plus a datastore plus an admin page.

The site's side is one build-time variable, `VITE_SUBMISSION_WEBHOOK_URL`, deliberately named for the shape rather than the vendor, and one `fetch` from the browser. There is no server in this repo to proxy through and adding one would break the static build, so the URL is public in the client bundle by design and every abuse control lives on the n8n side.

**A submission does not become a pull request until a human has already approved it.** Passing the automated check lands the submission in a private review queue instead, where a maintainer sees every field, including the visitor's email, and decides. Only approval opens a PR, and that PR carries just the public `ring.json`-shaped fields; email and every other review-only field are stripped before it exists. This replaced the earlier design, where a passing check opened the PR immediately and the PR itself was the review surface, for one reason: a PR is public the instant it opens, and email can never be. The PR did not go away. It moved to being the last step instead of the first one, which is still the right shape for what it does, a human looking over one JSON object before it joins a public file; it just no longer needs to be where the private parts of a submission sit while that happens. See `submission-form-spec.md` section 7 for the full reasoning.

**The form replaced the pull request and issue paths on `/join` outright, rather than joining them as a third option.** One documented way in. The interim notice and the PR/issue instructions this section used to describe are gone from `/join`; the page now shows the form's own steps, or, if `VITE_SUBMISSION_WEBHOOK_URL` is unset in a production build, a notice that submissions are closed. (This is the submitter-facing PR path that was retired, not the internal maintainer-facing PR described above, which survives in a different role.)

**The review queue lives inside n8n, and the maintainer's surface is a notification rather than a page.** Approval and rejection arrive as signed one-time links in a Discord message or email; there is no database and no admin page to build. This was the "real second surface" flagged in the previous version, and naming n8n is what collapsed it back into the intake decision instead of leaving it as a separate project.

Two things remain, and both are configuration in the n8n workflow rather than code in this repo: the bot identity that opens the final PR, and whether that PR still needs its own separate merge click given a human already approved the submission a step earlier. The working answer on the second is yes, since the merge is where `validate:publish` runs against the composed file. One thing became blocking that was not before: `GITHUB_URL` in `src/lib/config.js` is still a literal `TODO`, and the bot needs a real repository to write to.

## Production packaging and publishing

**Built.** Alongside the submission form, because the form was the first thing here that needed a real deploy target rather than a build directory someone copies by hand. `Dockerfile`, `Caddyfile`, `.dockerignore`, and `.github/workflows/docker-publish.yml` are all in the repo; a full build-run-request-teardown cycle was exercised directly (not just written and assumed), including confirming the container runs as a non-root user, both `VITE_` build args land correctly in the compiled client bundle, `/404.html` serves with a real 404 status through Caddy's `handle_errors`, and gzip encoding is active.

**The image is a static file server and nothing more.** `adapter-static` emits plain `.html` files, so production is Caddy serving `build/` — no Node process, no PM2, no database. That is the whole difference between this project's container and a conventional SvelteKit one, and it is worth stating because the reference implementation being copied from (GGRequestz) is `adapter-node` and carries a great deal of machinery that does not apply here.

**Every `VITE_` variable is baked at image build time, not read at run time.** This follows from `adapter-static` and was already true of `VITE_SITE_ORIGIN`; the webhook URLs and the Turnstile key simply joined it as each was added (the Dockerfile's own `ARG` list is the definitive current set — it drifted behind the app's actual `VITE_` surface for a while after Contact and Turnstile shipped in `0.11.0`, since only the original two variables had been wired through; fixed as part of v1.0 prep). `docker run -e` does nothing, `--build-arg` is the mechanism, and the practical consequence is that an image is specific to the values it was built with. Worth knowing before publishing one to a registry and assuming it is portable.

The webhook URLs belong in repository **variables**, not secrets. They are compiled into public JavaScript either way, and filing them as secrets would create a false impression that leaking them matters.

**This project takes no position on what runs the image.** The founding brief names Docker, Semaphore, and Ansible as candidate deployment tooling; nothing here assumes any one of them, or that the image is deployed via Docker at all rather than `npm run build`'s plain static output served some other way. The `--build-arg` list is the entire contract the image offers — which values to set, which registry, which orchestrator, how secrets for the n8n side get provisioned, is infra's decision to make, not something this repo should encode an opinion about.

## Visitor-facing terms (Terms of Use, privacy notice)

**The submitter half is built.** `docs/legal/EULA.md` is the real EULA a creator consents to on `/join`'s consent step, rendered server-side into `src/components/legal/EulaContent.svelte`. It is a **submitter** clause and, by its own preamble, nothing else — it does not cover a visitor who only browses the ring.

Still unbuilt: Terms of Use for visitors, and a privacy notice. The privacy notice is the easiest and strongest document this project will ever write: no accounts, no server-side data, everything in the visitor's own browser. The discovery journal makes that notice more necessary rather than less, even though nothing leaves the browser, which is precisely the kind of thing a privacy notice exists to state plainly. There is nowhere to render either yet; the natural home is probably beside the EULA, off the same About-modal or footer surface.

## Screen saver mode

A visualizer that transitions through node types and whatever content the ring has, closest in spirit to the brief's original "idle, screensaver-like surface" framing of the field view.

The unresolved part is sound, and it is unresolved on purpose:

- **Audio entries:** the idea is playing a short section of a track before fading out and moving to the next node. That collides directly with the brief's "nothing autoplays with sound" guardrail unless the whole mode is something the visitor explicitly starts, which is probably the answer.
- **Text entries:** a possible TTS pass, which raises its own questions (which voice, whose synthesis, whether it is local-only like everything else here).

Both of those are why this is a roadmap entry with a caveat rather than a spec.

## Generated templates: refinement pass

Sixteen generator templates across audio, comic, text, and game are built and exportable, but intended to keep improving rather than being treated as finished. The authoring workflow, local fixtures, long-content coverage, and visual reference suite are documented in `generator-template-authoring.md`.

- More color-variation passes per template, so two creators using the same one do not end up looking as similar as they can today.
- Testing the live embedded ring link once a generated site is actually deployed, not only in the local preview (see `previewWidgetEmbed`'s own doc comment in `/join` for why the preview and the real export already point at different origins on purpose).
- Shipping each template with extra sections present in the HTML but commented out, so a creator who wants more can uncomment rather than needing to hand-build. The audio template's own candidates: a tour-date table, an album/release table, and possibly an additional main-nav entry.

## Text reader: optional TTS

An optional "listen" control on a text entry's reader surface, using [tiny-tts](https://github.com/tronghieuit/tiny-tts). Narrower and more concrete than "Screen saver mode" above's own text-TTS question — this is one button on one entry, not a whole ambient mode — but it raises the identical unresolved questions (which voice, whose synthesis, whether it stays local-only), and those should be answered once and reused by both, not decided twice.
