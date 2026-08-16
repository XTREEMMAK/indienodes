# Roadmap

Intended but unbuilt. Separate from `open-questions.md` on purpose: the things here have a direction agreed on, they just have not been built yet. Open questions are the ones where the direction itself is undecided.

Nothing here is a commitment to a date, and anything here can still be cut. What it does mean is that a design decision made today should try not to foreclose these.

## Per-node content channels (the semantic half)

The spatial half of the arrangeable field is **built**: nodes are persistent, placeable, resizable, type-pinned, and arranged with gridstack behind an explicit edit mode. See `decisions.md` for how it works.

What is still outstanding is the part that makes a node a _channel_ rather than just a typed slot:

- **Per-node tag filters.** A node currently pins a type. It should also narrow by tag, so "a hip-hop audio node beside a VGM audio node" becomes expressible. `layoutStore`'s node shape has a deliberate gap for `tags` waiting for this.
- **Removing the global tag filter.** `filtersStore` and the Settings > Content tab are already reduced to tags only (the global type filter came out when nodes gained their own type). Both disappear once tags move onto nodes; nothing new should be built on them.
- **A per-node tag picker** in the edit-mode config panel, alongside the existing type select in `NodeConfig.svelte`.

## Node themes (the ornamental direction, packaged)

**Decided:** the ornamental treatments below are not a replacement for the current card, they are a **second theme** alongside it. "Basic Nodes" is the default and stays what it is today: a clean card, a color, a cover image, a crossfade, a progress bar. The ornamental work lands as its own theme with its own elements, animations, and sounds-of-its-own-machinery, and a visitor chooses between them.

That reframing matters because it changes what gets built. A skin swaps a graphic; a theme owns the whole presentation of a node, including motion and interaction:

| Type  | Direction in the ornamental theme                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------- |
| Audio | A cassette animating into a player, spindles turning while it plays                                       |
| Comic | A comic book that opens into the viewer (no page-flip; pages come up in the KeyJayOnline_v2-style viewer) |
| Game  | A console, with a cartridge or disc loading in                                                            |
| Text  | A book                                                                                                    |
| Art   | An easel, or a drawing tablet (art is not a distinct schema type yet)                                     |

### Structure, so a third party can add one

The request is that themes live in their own folders so someone else can write one. A workable shape, none of it built yet:

- `src/themes/<theme-id>/` per theme, each exporting the same contract: a node shell, a per-type stage set, and its own CSS. `basic/` is the current `FieldNode.svelte` + `stages/*` moved into that shape, which is most of the work and is mechanical.
- A `themes.json` (or a manifest per folder) listing id, display name, description, and which types it implements, so Settings' theme list is **generated from what exists** rather than hardcoded, the way `BACKGROUND_OPTIONS` in `src/routes/settings/+page.svelte` currently is. That list being a literal array is exactly the thing that stops a new theme from showing up without editing the settings page.
- A `themeStore`, mirroring `preferencesStore`'s existing shape (versioned localStorage key, `browser` guard, defensive load), defaulting to `basic` and falling back to it when a stored id names a theme that is no longer installed.
- A fallback rule per type: a theme that implements audio and nothing else should render Basic Nodes' card for the other three rather than failing, so a partial theme is a legitimate thing to publish.

### Constraints carried forward from the brief

- **Game must stay static by default** (section 7b). Whatever the console treatment becomes, the cartridge or disc loading is an explicit, user-initiated flourish, never idle motion, and `preview_url` stays untouched until there is a real tap-to-play interaction.
- **Nothing autoplays with sound** (section 11). A spinning cassette is motion, not audio; the spindles may turn before playback is requested, the tape may not make noise.
- Ornamental motion has to answer `prefers-reduced-motion` the same way everything else here does, which for looping mechanical animation probably means "stopped," not "shortened."

### Prior scaffolding

`src/components/FieldNode.svelte` is already the shell (frame, color, cover image, badge, like toggle, text, Visit button, progress) and `src/components/stages/*.svelte` already hold the per-type ornament layered over the background, with three of the four rendering nothing and existing purely as that seam. That split is the right one and survives into the theme structure; what changes is that a theme owns a whole set of stages rather than the app owning one set.

An "art" type does not exist in `schema/ring.schema.json` today; the brief's type table covers audio, comic, text, and game only. Adding one is a schema change, not just a theme.

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

**Entry point:** a floating pill beside the hamburger trigger, which is already `position: fixed` in `+layout.svelte` alongside the brand mark, so this adds a third floating control rather than reintroducing a header bar. On mobile it gates to the field route the way Arrange already does and swaps into the bottom bar rather than becoming a seventh item.

**Full screen** via `requestFullscreen()` on the mode's container, with a `fullscreenchange` listener to keep state honest and a fixed full-viewport overlay as the fallback, since iOS Safari will not fullscreen a non-video element. Nothing in the app uses the Fullscreen API today, so this is greenfield.

**The guardrail argument, which has to be made explicitly rather than assumed:**

- Brief section 11 says nothing autoplays with sound, and that only one thing has focus at a time "**unless the visitor explicitly starts a playlist/queue mode**." Ambient view is exactly that exception, and starting it deliberately is what earns it.
- Which means the launch control has to carry the meaning that audio will play. A bare icon someone taps to find out is not consent.
- Running an audio entry and a visual entry at once is the same exception, not a second one: the visitor asked for a mode whose whole premise is that music plays while you look at something else.

**Decided: a one-time confirmation on first use, not a permanent label change.** The first press of the entry control shows a brief "This plays audio, continue?" prompt; accepting starts the mode and is remembered locally (a new key, `indienode:ambient-consent:v1`, boolean) so every later launch is immediate. This was picked over folding the meaning into the control's own label (e.g. "Ambient View (plays audio)", always visible, no dialog ever) because a confirmation is unambiguous the first time it matters and then gets out of the way permanently, where a label only works if it is actually read.

It is a deliberate, narrow exception to "no confirmation dialogs for first-party actions" elsewhere in this app (Favorites' un-like prompt is not a precedent for this; that one guards against losing data, not against a guardrail promise). Worth remembering if this is revisited: it is the second dialog in the whole app, and the bar for a third should stay high.

**Two like buttons**, one per lane, each labeled with its own entry rather than two bare hearts (otherwise it is genuinely ambiguous which one you are about to like). Both call `favoritesStore.toggle(id)`; nothing new is needed underneath.

**An audio focus arbiter** in `audioPlayerStore` (`requestAudioFocus(owner)` / `releaseAudioFocus(owner)`), so exactly one source is ever audible and a game trailer with sound pauses the music rather than playing over it. This is not speculative plumbing: the preview lane's duck-and-restore already does precisely this for one case, and `src/lib/audioRamp.js` exists to be its shared mechanism. `GameStage` autoplays muted today, so nothing collides yet; the arbiter is what makes it safe when something does.

**Pairing** (which audio with which visual) is `pairs_with` from brief section 12 and is still undecided. Dealing from two independent decks is a usable first pass and should be understood as a placeholder.

## The submission form

**Decided, unbuilt, and the largest single thing on this list.** `docs/submission-form-spec.md` (v0.3) has the fields, validation, and copy fully specified. What has changed twice now is where its steps actually run and, more recently, what order they run in, since this project's architecture is a static build with no required backend for the reader or widget, and since the form now collects an email address that changes what can safely be public and when.

**Section 5's token generation and reachability check run in a small serverless function, kept separate from the Docker/Semaphore/Ansible publishing pipeline.** The function accepts the submission, generates the token, and checks it, synchronously, while the submitter is still on the page; it writes nothing to `ring.json` directly. This was chosen over extending the publishing webserver itself specifically to keep that server load-bearing for deploys only, not for intake too.

**A submission does not become a pull request until a human has already approved it.** Passing the automated check lands the submission in a private review queue instead, where a maintainer sees every field, including the visitor's email, and decides. Only approval opens a PR, and that PR carries just the public `ring.json`-shaped fields; email and every other review-only field are stripped before it exists. This replaced the earlier design, where a passing check opened the PR immediately and the PR itself was the review surface, for one reason: a PR is public the instant it opens, and email can never be. The PR did not go away. It moved to being the last step instead of the first one, which is still the right shape for what it does, a human looking over one JSON object before it joins a public file; it just no longer needs to be where the private parts of a submission sit while that happens. See `submission-form-spec.md` section 7 for the full reasoning.

**The form replaces the pull request and issue paths on `/join`, rather than joining them as a third option.** One documented way in, once it exists. `/join` currently carries an explicit interim notice saying the form is not built yet and that this page will be rewritten around it when it is; that notice, not the PR/issue instructions themselves, is the part that should be read as the actual current state. (This is the submitter-facing PR path being retired, not the internal maintainer-facing PR described above, which survives in a different role.)

Not yet decided, and each a real question rather than an implementation detail: the serverless platform, the bot identity that opens the final PR, **where the private review queue itself is stored and what a maintainer actually looks at to act on one** (a real second surface this version introduces, not a detail of the intake function), and whether the resulting PR still needs its own separate merge click given a human already approved the submission a step earlier.

## The EULA and visitor-facing terms

Not now, and correctly so, but the sequencing is worth having written down because it is easy to get backwards.

`docs/submission-form-spec.md` section 4 already contains the required consent clause. It is a **submitter** clause and only that. Publishing plausibly also wants Terms of Use for visitors and a privacy notice, and the privacy notice is the easiest and strongest document this project will ever write: no accounts, no server-side data, everything in the visitor's own browser. The discovery journal makes that notice more necessary rather than less, even though nothing leaves the browser, which is precisely the kind of thing a privacy notice exists to state plainly.

**There is nowhere to render any of it yet.** There is no submission form; `/join` documents pull requests and issues in the meantime. So the order is form, then EULA, not the reverse. See `open-questions.md` for the parts that are genuinely undecided.

## Screen saver mode

A visualizer that transitions through node types and whatever content the ring has, closest in spirit to the brief's original "idle, screensaver-like surface" framing of the field view.

The unresolved part is sound, and it is unresolved on purpose:

- **Audio entries:** the idea is playing a short section of a track before fading out and moving to the next node. That collides directly with the brief's "nothing autoplays with sound" guardrail unless the whole mode is something the visitor explicitly starts, which is probably the answer.
- **Text entries:** a possible TTS pass, which raises its own questions (which voice, whose synthesis, whether it is local-only like everything else here).

Both of those are why this is a roadmap entry with a caveat rather than a spec.
