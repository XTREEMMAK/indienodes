# Generator template authoring

The generator has sixteen plain static-site templates under
`src/lib/generator/templates/<type>/<folder>/`. Each template owns its HTML
shell, CSS, optional decorative JavaScript, and the small renderer that maps
generator data into that shell.

## Source of truth

An external HTML mockup is useful for exploring and approving a design. Once
that design has been integrated, the template directory in this repository is
the source of truth. Continue visual refinement here so every change is seen
through the real data contract, preview, export path, fixtures, and tests.

Keep the original external file only as design history. Re-importing a later
copy risks overwriting data mapping, escaping, accessibility, responsive fixes,
and generator-specific behavior.

## Create a template

Run:

```bash
npm run generator:new -- audio signal-bloom "Signal Bloom"
```

The valid types are `audio`, `comic`, `text`, and `game`. The command:

1. Validates the lowercase kebab-case id.
2. Creates a camelCase folder such as `audio/signalBloom/`.
3. Adds `index.js`, `shell.html`, and `styles.css` starter files.
4. Registers a lazy loader in `src/lib/generator/registry.js`.

The generated files and updated registry are formatted automatically. The
command refuses to overwrite an existing directory or template id. Add
`decorative.js` only if the exported page needs JavaScript, then import it
with `?raw` from the template's `index.js`.

## Template contract

Every `index.js` exports:

```js
export function render(data) {
	return { html, css, js };
}
```

The full `GeneratorData` shape is documented in
`src/lib/generator/templates/shared.js`. User-entered text and attributes
must pass through `escapeHtml` or `escapeAttr`. Use `fill` for flat
`{{TOKEN}}` replacement, and leave layout-specific markup in the template's
own `index.js`.

`shared.js` is for layout-neutral concerns such as escaping, verification
metadata, social icons, widget markup, empty states, and image fallbacks. Do
not add a central variant table that knows class names or markup for many
templates. Local duplication is preferable when designs genuinely differ.

The registry contains synchronous picker metadata and asynchronous `load`
functions. `loadTemplate(type, id)` loads only the selected template module,
so picker screens do not download all template HTML and CSS up front.

## What a template lets a creator change

Customization is declared in `src/lib/generator/templateOptions.js`, one
entry per registered template id, and `/join` renders whatever it finds
there. **The form never branches on a template id and never names a CSS
variable.** It used to do both, which is why for a long time exactly one
template offered a page background and three offered nothing at all despite
appearing to.

```js
'my-template': {
	colors: [
		color(ACCENT, '--accent', '#6fae9c'),
		color(GROUND, '--paper', '#fbf8f0'),
		color(INK, '--ink', '#111111')
	],
	switches: []
}
```

A **role** is what the creator is choosing (`accent`, `ground`, `surface`,
`text`); the second argument is whatever _your_ stylesheet calls it. That
indirection is the point: designs are free to keep their own vocabulary —
`--paper`, `--m-bg`, `--c-card` are all real — without the form needing to
know any of it. The third argument is your own default, so an untouched
picker shows the truth rather than some other template's color.

Rules worth knowing before you fill one in:

- **Omit a role you cannot serve well.** Slow Light has no cards, so it
  declares no `surface`. Neon Signal's `--card` is a translucent `rgba()`
  and a color input can only produce opaque hex, so overriding it would
  flatten the glass the design is built on — omitted too. A missing control
  is better than one that disappoints.
- **The variable has to exist in your `styles.css`.** A typo emits a valid
  but inert override and the page looks completely correct while ignoring
  it. `registry.test.js` reads every stylesheet off disk and fails on a role
  that names a variable the file does not define.
- **Every template needs at least `accent` and `ground`**, also enforced by
  that test.
- **Your shell needs `{{COLOR_OVERRIDE}}`** in `<head>`, after the
  stylesheet link so it wins, and your `render` passes
  `COLOR_OVERRIDE: data.colorOverride ?? ''`. The `<style>` block arrives
  pre-resolved; a template never sees roles.
- **A `switch` is a boolean the creator toggles.** It reaches `render` as a
  named field on `data` (see Neon Signal's `backgroundGlowMotion`), so add
  it to the `GeneratorData` typedef in `shared.js` when you introduce one.
- **A `text` is copy your design hard-codes that the creator should own.**
  Static Ticker's scrolling banner is the example: it shipped with someone
  else's tour dates baked into the shell. Declare it under `texts` with a
  `fallback` (your own copy, used until they replace it) and a `maxLength`,
  and read it off `data` in `render`. `textValue` resolves the creator's
  value or your fallback, so a template never sees an empty string it has to
  guess about.

**Comment your shell and your stylesheet.** These two files are what a
creator opens when they want to change something, and they are the only
documentation they will ever have for it. Every template carries a header in
both saying what the design is and what is safe to edit; keep that habit for
anything non-obvious you add.

**The bio is inline HTML, not plain text.** `data.bioHtml` is sanitized to
`br`, `strong`, `em`, `u`, `s`, and `a` only — every design renders the bio
inside a paragraph, so a block element would nest `<p>` inside `<p>`. Render
it directly (`BIO: data.bioHtml || 'No bio yet.'`); do not run it through
`escapeHtml`, which would show the tags. `data.bio` is still the plain text
if you need it somewhere markup cannot go.

- **A `range` is a number on a slider**, for a quantity with no obviously
  right value. Static Ticker's scroll speed is the example. Read it off
  `data` like a switch.

**A template can emit more than one page.** Pass a `pages` object as
`templateResult`'s fourth argument, keyed by filename — the text templates
use `{ 'about.html': aboutPageHtml(data, { iconClass, backLabel }) }` to move
the portrait and bio off a reading surface. Extra pages share `styles.css`
and `script.js` with the index, so a page is markup only, and the editor
grows a Home/About switch above the preview automatically. `aboutPageHtml`
takes your **own class names** — `wrapperClass`, `headerClass`, `iconClass`,
`linksClass` — and that is what makes it look like your template. Loading the
same stylesheet is not enough on its own: you style your page wrapper and
your link lists by class, so a page built from generic names inherits your
background and body font and nothing else. Pass the classes the index uses
and the About page is laid out by your own rules.

**The ring widget centres itself.** `widgetEmbedHtml` emits its wrapper with
the centring inline, so you do not need a `.ring-widget` rule to place it —
only to give it the margins or the panel your design wants around it.

Choices a creator never touches are simply absent from the resolved
override, leaving your stylesheet's own defaults in place — the fallback in
the declaration is for the picker's swatch, not something re-asserted into
the export.

## Preview while editing

```bash
npm run generator:preview
npm run generator:preview -- audio
npm run generator:preview -- audio signal-bloom
npm run generator:preview -- audio signal-bloom --long
npm run generator:preview:once
```

The watch command renders into `.generator-preview/` and serves an index at
`http://localhost:4175/`. Open pages reload automatically after a successful
template render. A syntax error keeps the last good output visible and prints
the failure in the terminal.

Normal fixtures use project-owned local assets from `testing/generator-assets/`.
`--long` uses boundary fixtures with long names, biographies, labels,
captions, prose, and social links. Use both desktop and narrow browser widths
before considering a design complete.

## Validation

Run the focused renderer tests:

```bash
npm run test:unit -- --run src/lib/generator/registry.test.js
```

They load all sixteen templates against normal and long fixtures, check that
shell tokens are filled, and confirm each design remains distinct.

Visual references live beside
`testing/generator-templates.visual.e2e.js`. To compare current output:

```bash
npx playwright test testing/generator-templates.visual.e2e.js
```

When a visual change is intentional, inspect it in the live preview first,
then regenerate and review the references:

```bash
npx playwright test testing/generator-templates.visual.e2e.js --update-snapshots
```

Do not update references merely to make a failure disappear. The changed
image is the review artifact.

Before handing off a template change, also run `npm run check` and the export
tests in `src/lib/generator/zipExport.svelte.test.js`. Preview and ZIP export
both call the same renderer, which is the core guarantee of this system.
