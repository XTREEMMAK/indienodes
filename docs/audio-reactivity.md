# Audio reactivity: signal path, tuning, and the debug panel

How the ambient background reacts to whatever is playing, split into two
layers that are easy to conflate but tune independently: **detection**
(is this a beat? is it a _big_ beat?) and **reaction** (what does the
background actually do about it?).

## The signal path

```
AudioPlayer.svelte                    audioLevelStore.svelte.js         AmbientBackground.svelte
──────────────────                    ──────────────────────────         ────────────────────────
<audio> element (volume pinned at 1 once wired — see below)
  │
  ▼
MediaElementAudioSourceNode
  │
  ├─▶ full-spectrum AnalyserNode ──▶ smoothed (sustained loudness) ──▶ level ──┐
  │                                                                            │
  ├─▶ BiquadFilterNode (lowpass)                                              ├─▶ driftBoost()
  │     │                                                                     │
  │     ▼                                                                     │
  │   bassAnalyser (time-domain RMS) ──▶ bass / bassAvg ──▶ beat? ──▶ pulse ──┘
  │                                                           │
  │                                                           └─▶ big hit? ──▶ bigHitId (edge-triggered) ──▶ hitScale + burstParticles
  │
  └─▶ GainNode (volume × mute × duck) ──▶ audioCtx.destination (audible output only)
```

Only cross-origin audio served with an `Access-Control-Allow-Origin` header
can be analysed at all (see `audioLevelStore.svelte.js`'s own doc comment on
why the player probes for this before wiring anything up) — most third-party
audio hosts don't send it, so most tracks simply won't react. That's
expected, not a bug.

**Audible volume is a `GainNode`, deliberately placed after both analysis
taps, not on the `<audio>` element itself.** A `MediaElementAudioSourceNode`
still applies its source element's `volume`/`muted` attributes to what it
outputs even once Web Audio has taken over routing, so leaving volume control
on `el.volume` would attenuate the analyser and the bass branch right along
with the audible signal — the reactive background would visibly calm down as
a visitor turned the slider down, for a reason that has nothing to do with
what's actually in the track. `AudioPlayer.svelte` pins `el.volume` at 1 the
moment the element is wired into the graph and moves all of volume/mute/duck
onto the `GainNode` instead, so `level`/`pulse`/`bass` always reflect the
track's own mix, never the listener's chosen level.

## Two tuning layers, two places they live

| Layer        | What it decides                                                     | Lives in                                                                            | Tuned via                                                              |
| ------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Detector** | What counts as a beat or a big hit, in the raw audio signal         | `AudioPlayer.svelte` (the graph/RMS math) + `audioTuning.svelte.js` (the numbers)   | `?debug=audio` panel                                                   |
| **Reaction** | What the background actually _does_ once a beat/big-hit is reported | `audioReaction.js` (shared math + defaults), consumed by `AmbientBackground.svelte` | Editing `audioReaction.js` directly — no live panel for this layer yet |

These are deliberately separate modules so a background variant that only
cares about the reaction (see "Reusing the reaction for a new background"
below) never needs to know anything about `BiquadFilterNode`s or RMS.

## The detector: `audioTuning.svelte.js`

Six numbers, all read fresh every animation frame by `AudioPlayer.svelte`'s
`readFrame()`, so changing any of them takes effect on the very next frame:

| Field              | Meaning                                                                                             | Default |
| ------------------ | --------------------------------------------------------------------------------------------------- | ------- |
| `lowpassFrequency` | Cutoff (Hz) of the `BiquadFilterNode` isolating kick/bass-fundamental energy before RMS is measured | 125     |
| `lowpassQ`         | Resonance of that same filter, **in decibels** — see the note below                                 | 2.5     |
| `beatRatio`        | How far above its own recent rolling average (`bassAvg`) the bass has to jump to count as a beat    | 1.95    |
| `beatFloor`        | Absolute floor below which nothing counts, so near-silence can't manufacture beats out of noise     | 0.23    |
| `beatGapMs`        | Minimum time between counted beats, so one kick isn't counted three times                           | 110     |
| `bigHitRatio`      | A second bar on top of `beatRatio` — beats that also clear _this_ get reported as a big hit         | 1.35    |

**`bigHitRatio` (1.35) is currently lower than `beatRatio` (1.95)**, the reverse of how the two started (1.6 above 1.12). In practice that means most counted beats also clear the big-hit bar — tuned this way by ear against real tracks, not a leftover default. If a future pass wants big hits to be a rarer subset of beats again, raise `bigHitRatio` back above `beatRatio`.

**`lowpassQ` is decibels, not a linear Q.** Web Audio states it that way for
the `lowpass` and `highpass` types specifically, unlike every other biquad
type it offers, and the difference is not cosmetic: the default 2.5 is a
2.5 dB resonant bump, where the linear reading would be an 8 dB one. Anything
that redraws or re-derives this filter has to use
`10^(Q/20)` as the cookbook alpha — `src/lib/audioFilterResponse.js` is the
one place that math lives, and `audioFilterResponse.test.js` pins it.

`bassAvg` is a rolling average over `BASS_WINDOW` (90 frames, roughly 1.5s at
60fps) — a beat is "louder than the recent past," not "loud" in any absolute
sense, which is what survives a track being generally quiet or generally
dense.

## The `?debug=audio` tuning panel

Append `?debug=audio` to any URL while a track is playing
(`http://localhost:5173/?debug=audio`, or the same on a deployed instance —
it's gated on `import.meta.env.DEV`, so it does not exist in a production
build at all). A panel appears bottom-left, with **two views over the same
six values**, switched by the Sliders/Graph buttons in its header or picked
directly by URL:

| URL                  | Opens on | Component                |
| -------------------- | -------- | ------------------------ |
| `?debug=audio`       | Sliders  | `AudioDebugPanel.svelte` |
| `?debug=audio-graph` | Graph    | `AudioDebugGraph.svelte` |

Either way both views are one click apart, the same `audioTuningStore` is
behind both, and a value changed in one reads back in the other. Switching
does not reload or renavigate, so a track keeps playing across the switch.

### Sliders view (the original)

- **Six sliders**, one per `audioTuningStore` field above. Drag one while
  listening; the change is live.
- **A bar meter** showing the current `bass` reading against two threshold
  lines — the beat threshold (`bassAvg × beatRatio`) and the big-hit
  threshold (`bassAvg × bigHitRatio`, in red). Watching a kick cross these
  lines live is the fastest way to find a threshold that actually matches
  the track you're tuning against.
- **A numeric readout**: `bass`, `bassAvg`, and the ratio between them
  (`bass / bassAvg`) — the single number most worth watching, since it's
  exactly what `beatRatio`/`bigHitRatio` are compared against.
- **Beat / big-hit counters**, so you can eyeball whether a track is
  producing roughly the density of hits you'd expect.

It is deliberately the narrow one: it fits beside a running app without
covering it, and a number is still the fastest way to read a number.

### Graph view

Two of these six values are shapes rather than numbers, and the sliders
cannot show either. This view draws both, on canvases painted from one
`requestAnimationFrame` loop that reads the store directly rather than
through Svelte reactivity.

- **Low-pass response.** The filter's actual frequency response on a log
  axis, 20 Hz to 20 kHz, so what the RMS stage is measuring is visible
  before any threshold is argued about — a 125 Hz cutoff does not mean
  130 Hz is gone, it means 130 Hz is about a decibel down and 1 kHz is
  thirty. **Drag inside the lit band** (the region the two sliders can
  actually reach, edged so its bounds are visible) to move the cutoff, and
  drag up or down for Q. The handle sits _on_ the curve because it belongs
  there: an RBJ low-pass has `|H(f0)|` equal to its own linear Q and Web
  Audio states this filter's Q in dB, so the height of the curve at the
  cutoff **is** the Q value. Under the graph: the real -3 dB corner (which
  sits above the nominal cutoff whenever Q is above 0 dB), the slope
  measured off the drawn curve rather than asserted, and how much of a 60 Hz
  kick fundamental survives.
- **Bass vs. thresholds.** The last few seconds of `bass` against the beat
  threshold, the big-hit threshold, `bassAvg`, and `beatFloor`, with the
  refractory window each counted beat opens (`beatGapMs`) shaded in — the
  one tuning value whose effect is otherwise invisible, since it shows up
  only as beats that did _not_ get counted. Ticks along the bottom mark
  beats the detector actually fired, red for big hits. The `1×/2×/4× zoom`
  button lifts the amplitude axis for a quiet track.

**Every line except the ticks is recomputed from stored averages against the
_current_ tuning**, not against the tuning in force when each sample was
taken. That is the point of the view: drag the beat-ratio slider and the
threshold redraws through the last few seconds of real bass, so where it
_would_ have landed is visible immediately rather than only affecting hits
that have not happened yet.

Dragging the graph is pointer-only on purpose. The same two sliders are
rendered directly beneath it and are the keyboard and assistive-technology
route to those values — and the finer one, since a drag moves Q by roughly
0.4 dB per pixel while the slider steps 0.1 dB.

The curve is computed in `src/lib/audioFilterResponse.js` rather than read
off the live `BiquadFilterNode`: that node lives inside an `AudioContext`
`AudioPlayer` creates lazily and only for a track that permits analysis at
all, so `getFrequencyResponse()` is unavailable exactly when you most want
to look at the filter. Pure math instead means the graph draws before
anything is playing, and means the response is unit-tested
(`audioFilterResponse.test.js`).

### Both views

- **Reset counts**, **Reset to defaults**, and **Copy values** — the last
  one copies the six current slider values to the clipboard as a
  ready-to-paste object literal.

### Locking in a tuning pass

The panel only changes the _running_ values — nothing it does persists
across a reload, and nothing here writes to a file. Once you've found
numbers you like:

1. Click **Copy values**.
2. Paste the result into `AUDIO_TUNING_DEFAULTS` in
   `src/lib/audioTuning.svelte.js`, replacing the existing object.
3. Run `npm run check && npm run lint && npm run test:unit -- --run` and
   re-verify a track still reacts the way you expect against the new
   defaults (the panel is still available for a final spot-check).

## The reaction: `audioReaction.js`

Once a beat or big hit is _reported_ (via `audioLevelStore`'s
`level`/`pulse`/`bigHitId`), `audioReaction.js` decides what the background
does about it. Three exports, all pure — no state, no side effects:

- **`driftBoost(audio)`** — the particle-drift speed multiplier.
  `1 + level × levelWeight + pulse × pulseWeight`, weighted hard toward
  `pulse` over `level` (measured: sustained loudness on real music barely
  moves, so driving speed from it alone made the background look inert).
- **`decayHitScale(hitScale)`** — the per-frame decay step for a particle's
  own radius pulse on a big hit (peaks at `hitScale.peak`, decays by
  `hitScale.decay` each frame).
- **`burstOpacity(ageMs)`** — the fade-in/fade-out envelope for one of the
  extra particles spawned on a big hit (`burst.count` of them, living
  `burst.lifetimeMs`).

All the actual numbers live in one exported object, `AUDIO_REACTION_DEFAULTS`.

**Why a pulse/burst reaction and not a flash.** The big-hit reaction used to
be a low-opacity full-screen radial flash, timed to music. That's a real
photosensitive-seizure trigger risk — a rapid, large-area luminance change
on a beat is exactly the pattern seizure-safe-content guidelines warn
against — so it was removed outright rather than dimmed further. What
replaced it (particles pulsing size, a small burst of extra particles)
reacts through many small, localized changes instead of one large, rapid
one, which is a materially different risk profile. **Don't reintroduce a
screen-wide flash/strobe tied to beat detection** without re-examining that
tradeoff specifically.

### Reusing the reaction for a new background

`AmbientBackground.svelte`'s own `variant` prop already anticipates a second
background (`drifty-stars` is the only one today). A new variant that wants
the same audio reaction imports the same three functions and constant
rather than re-deriving its own:

```js
import {
	AUDIO_REACTION_DEFAULTS,
	driftBoost,
	decayHitScale,
	burstOpacity
} from '$lib/audioReaction.js';

// per frame:
const boost = driftBoost(audioLevelStore); // multiply your own drift/speed by this

// on a new audioLevelStore.bigHitId:
myThing.hitScale = AUDIO_REACTION_DEFAULTS.hitScale.peak;

// per frame, per thing that pulses:
myThing.hitScale = decayHitScale(myThing.hitScale);

// per frame, per burst particle:
particle.opacity = burstOpacity(performance.now() - particle.bornAt);
```

A variant that wants a _different_ feel (snappier pulse, more/fewer burst
particles) can pass its own tuning object as the optional second argument to
any of the three functions, shaped like the matching slice of
`AUDIO_REACTION_DEFAULTS` — the defaults aren't the only value these
functions accept, just the ones `AmbientBackground.svelte` happens to use
today.
