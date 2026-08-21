# Skin authoring

IndieNodes has two independent skin categories:

- A **UI skin** styles application chrome such as panels and navigation.
- A **Node skin** supplies the visual stage for each ring-entry type.

Both are trusted, build-time packages under `src/skins/`. They are not remote
plugins and the application never executes a skin downloaded at runtime.

Visual exploration can happen in a separate design project. Production
implementation belongs in this repository so it uses the real Svelte version,
entry contract, accessibility controls, playback policy, and validation suite.

## Development loop

1. Create the skin folder and manifest described below.
2. Run `npm run dev`.
3. Open `/dev/skins`.
4. Exercise every supported type with and without artwork.
5. Test square, landscape, and portrait cards.
6. Test paused and simulated reduced-motion states.
7. Run `npm run check`, `npm run lint`, `npm run test:unit -- --run`, and
   `npm run build` before submitting the skin.

The laboratory renders the real `FieldNode` host. It is intentionally more
useful than a detached HTML mock because it includes the actual controls,
card sizing, playback integration, and persisted Settings selection.
It is served by Vite only during `npm run dev`; it is not a SvelteKit route and
is not present in production output.

## Node skin structure

```text
src/skins/node/my-skin/
  manifest.js
  index.js
  assets/
  stages/
    AudioStage.svelte
    ComicStage.svelte
```

Manifests are discovered automatically by `src/skins/registry.js`:

```js
/** @type {import('../../contracts.js').NodeSkinManifest} */
const manifest = {
	id: 'my-skin',
	label: 'My Skin',
	description: 'A short visitor-facing description.',
	category: 'node',
	types: ['audio', 'comic'],
	load: () => import('./index.js')
};

export default manifest;
```

`index.js` exports the implemented stages:

```js
import AudioStage from './stages/AudioStage.svelte';
import ComicStage from './stages/ComicStage.svelte';

export const stages = {
	audio: AudioStage,
	comic: ComicStage
};
```

A partial skin is valid. Types absent from `stages` fall back to Basic Nodes.
This lets an audio-only skin ship without empty or broken comic, text, or game
cards.

## Stage contract

Every stage may receive:

- `entry`: the normalized public ring entry
- `cover`: the resolved representative image URL, or `null`
- `hasImage`: whether the current image remains usable
- `paused`: whether timed content should stop
- `motionReduced`: the effective reduced-motion state
- `onImageError()`: tells the host to use its no-image fallback
- `services`: controlled host operations

The services object exposes:

- `preloadImage(url)`
- `playSound(url, { volume })`
- `play()`
- `read()`
- `visit()`

A skin must not import application stores. Stores are implementation details
and would couple an independently authored skin to unrelated state changes.
Request behavior through services instead.

The card host retains creator text, Visit, Like, Not for Me, reader, playback,
progress, accessibility labels, and journal behavior. A skin owns the visual
stage layered inside that host. This is deliberate: a decorative package
cannot silently replace product or safety behavior.

## Sound and interaction

Import sound files as build assets:

```js
import clickUrl from './assets/cassette-click.wav?url';
```

Call `services.playSound(clickUrl)` directly inside a click, pointer, or
keyboard handler. Never call it from mount code, a timer, an observer, or a
reactive effect. Nothing may autoplay with sound.

Keep effects short and stop any visual loop when `paused` or `motionReduced`
is true. Game previews and mechanical loading sequences must remain static
until the visitor explicitly activates them.

## UI skin structure

```text
src/skins/ui/my-ui/
  manifest.js
  styles.css
```

The manifest uses `category: 'ui'` and loads its stylesheet. Scope overrides
to the root skin attribute:

```css
:root[data-ui-skin='my-ui'] {
	--ui-panel-bg: #fff;
	--ui-panel-border: #222;
	--ui-panel-shadow: 0.25rem 0.25rem 0 #222;
	--ui-panel-filter: none;
}
```

UI skins should prefer tokens over component selectors. A selector that
reaches into one component's private markup is likely to break when that
component changes.

## External contributors

An external repository can hold sketches, source art, animation studies, and
sound production. The integration handoff should be the completed skin folder,
not a second application. If independent skin teams become common, the same
contract can later move into workspace packages without changing the manifests
or stage props.
