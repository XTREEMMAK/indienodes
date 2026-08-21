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
