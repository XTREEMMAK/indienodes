<p align="center">
  <img src="static/images/IndieNodes_Logo.webp" alt="IndieNodes logo" width="220" />
</p>

<h1 align="center">IndieNodes</h1>

<p align="center">
  A creator-first webring for discovering independent audio, art, comics, writing, and games.
</p>

<p align="center">
  <a href="https://indienodes.us">Visit IndieNodes</a> ·
  <a href="#run-it-locally">Run locally</a> ·
  <a href="docs/README.md">Documentation</a> ·
  <a href="#embed-the-ring">Embed the ring</a>
</p>

## Overview

IndieNodes helps people stumble into work made by real independent creators. It is a
webring, not a publishing platform: each member keeps their work on infrastructure they
control, while IndieNodes supplies several ways to move through the ring.

There are no visitor accounts, no recommendation algorithm, and no paid placement.
Browsing preferences, likes, dismissals, and the discovery journal remain in the
visitor's browser and can be exported or cleared at any time. Submission data is handled
separately in a private review workflow and only approved public fields enter the ring.

A **Node** represents a creator, collective, or studio through a small sample of their
work. A track, page, excerpt, artwork, or game supports that creator's Node; it does not
replace them as the subject of the ring.

## What it includes

- **Five kinds of creative work:** audio, visual art, comics, writing, and games.
- **An ambient discovery field:** independently rotating, rearrangeable Nodes that can be
  tuned by medium and tags without choosing the next creator.
- **Media-native previews:** audio playback and queues, art and comic readers, game
  trailers, and browser-native text-to-speech where source data supports them.
- **A searchable member directory:** a deliberate companion to the low-choice discovery
  field, with direct links to creators' own sites.
- **Local-only personalization:** Like, Not for Me, content preferences, a discovery
  journal, rotation pacing, themes, skins, and data import/export.
- **A site builder for creators:** people without a site can build and download one in
  the browser from hand-designed templates for their medium.
- **Three ring links:** a Previous/Next/Random widget, an 88×31 badge, or a plain text
  link, all suitable for a member's own site.
- **One shared frontend:** the canonical static web app can also be packaged in thin
  Capacitor/Android and Wails desktop hosts.

## How it works

Approved creator records live as one JSON file per creator under `members/` (created when
the ring receives its first member). `npm run ring:build` turns those files into the
committed [`ring.json`](./ring.json), which is the public data
source for every IndieNodes client.

```text
members/*.json
      │
      └── validate + build ──> ring.json
                                  │
                 ┌────────────────┼─────────────────┐
                 ▼                ▼                 ▼
          discovery app     member widget     other clients
```

This boundary is intentional: **the data is the API**. The web experience, widget, and
future clients can change independently without turning the ring into a hosted social
network or making one interface the only way to participate.

Media is not rehosted. A Node links to the creator's source page and may include a small
number of creator-hosted preview URLs. The schema checks data shape and collection-wide
identity rules; human reviewers apply the project's
[creator-first curation policy](./docs/curation-policy.md).

## Run it locally

You need Node.js 22 or newer and npm.

```bash
npm install
npm run dev -- --open
```

The default development build reads the published `ring.json`, which is currently empty
while the project prepares for public submissions. For a populated 50-entry development
fixture, generate it once and then run the two servers in separate terminals:

```bash
npm run fixture:generate   # writes testing/fixtures/, which is not committed
npm run fixture:serve      # serves the fixture and its assets on :4174
npm run dev:fixture        # dev server, reading the fixture instead of ring.json
```

The fixture embeds real third-party content, so it is deliberately kept out of the
repository and rebuilt locally. See [`testing/README.md`](./testing/README.md) for its
contents, the hand-authored creator pages, local media, and testing from another device.

### Common commands

| Command                | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `npm run build`        | Build the static production site and verify its output |
| `npm run preview`      | Preview the most recent production build               |
| `npm run check`        | Run Svelte and JavaScript type checks                  |
| `npm run lint`         | Check formatting and ESLint rules                      |
| `npm run test`         | Run unit and Playwright end-to-end tests               |
| `npm run ring:build`   | Regenerate `ring.json` from `members/*.json`           |
| `npm run validate`     | Validate member files and the generated ring           |
| `npm run build:widget` | Rebuild the standalone custom-element widget           |

Template authors can start with the
[generator template guide](./docs/generator-template-authoring.md). Android and desktop
prerequisites and commands live in the [platform build guide](./docs/platform-builds.md).

## Build and deploy

IndieNodes uses SvelteKit with `adapter-static`. `npm run build` prerenders the application
to `build/` as plain HTML, CSS, and JavaScript, so it can be served by any static host and
does not need an application server.

The included [`Dockerfile`](./Dockerfile) builds that same static output and serves it
with [`Caddy`](./Caddyfile):

```bash
docker build -t indienodes .
docker run -p 8080:8080 indienodes
```

All `VITE_` configuration is compiled into the client at **build time**. Copy
[`.env.example`](./.env.example) to `.env` for local overrides, or pass the matching
`--build-arg` values to Docker. Unset submission and contact webhooks fail closed in a
production build; `VITE_RING_URL` is only a development fixture switch. The complete
configuration contract is documented in [`.env.example`](./.env.example).

Images are published to GHCR on pushes to `main` and on version tags. Pull requests that
change ring data run the stricter publish validator; see
[`.github/workflows/validate-ring.yml`](./.github/workflows/validate-ring.yml).

## Embed the ring

The full widget is a standalone custom element with an isolated shadow root. Add it to
any page with:

```html
<script type="module" src="https://indienodes.us/embed.v1.js"></script>
<indienode-widget></indienode-widget>
```

It provides Previous, Next, and Random navigation over the live ring with no tracking or
personalization. The running app's `/widget` page previews this version alongside the
88×31 badge and plain-link alternatives.

## Documentation

Start with the [documentation index](./docs/README.md), which groups the repository's
guides by task:

- project decisions, open questions, and roadmap;
- member data, curation, submissions, and review operations;
- site-generator and skin authoring;
- web, Android, desktop, audio, and deployment internals;
- maintenance runbooks and dated engineering audits.

Release-by-release history is in [`CHANGELOG.md`](./CHANGELOG.md).

## Contributing

Issues and pull requests are welcome. Before opening a code change, run the checks that
match its scope; for most application changes that means:

```bash
npm run check
npm run lint
npm run test
```

Changes to member data must also run `npm run ring:build` and `npm run validate`. New
entries enter through the `/join` review flow rather than by opening a hand-written member
pull request.

## Project status

IndieNodes is under active development and the published ring is not populated yet. The
static app, the five-medium data model and its validation, the member widget, local
personalization, the creator site builder, the submission and update flows, Docker
publishing, and the optional native hosts are implemented, and the complete member
lifecycle — join, update, and voluntary removal — has been verified against production.

Remaining public-release work is narrow: validating the widget contract on real host
pages, an explicit responsive pass, and publishing visitor Terms of Use and a Privacy
Notice. That order and everything deferred past it are tracked in the
[roadmap](./docs/roadmap.md) and [open questions](./docs/open-questions.md).

## License and support

IndieNodes is licensed under GPL-3.0-or-later. See [`LICENSE`](./LICENSE).

The project is designed to run without ads or paid placement. A deployment can expose a
Ko-fi link through `VITE_KOFI_URL`; when it is unset, the Support tab is omitted.
