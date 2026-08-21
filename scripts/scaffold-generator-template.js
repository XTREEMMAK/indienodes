#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REGISTRY_PATH = join(PROJECT_ROOT, 'src/lib/generator/registry.js');
const TEMPLATE_ROOT = join(PROJECT_ROOT, 'src/lib/generator/templates');
const TYPES = new Set(['audio', 'comic', 'text', 'game']);
const prettierOptions = (await resolveConfig(PROJECT_ROOT)) ?? {};

const [, , type, id, ...labelParts] = process.argv;
const label = labelParts.join(' ').trim();

function usage(message) {
	if (message) console.error(message);
	console.error(
		'Usage: npm run generator:new -- <audio|comic|text|game> <kebab-id> "Display Label"'
	);
	process.exit(1);
}

if (!TYPES.has(type)) usage(`Unknown template type "${type ?? ''}".`);
if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id ?? '')) {
	usage('The template id must be lowercase kebab-case, for example signal-bloom.');
}
if (!label) usage('A display label is required.');
if (/[\r\n]/.test(label)) usage('The display label must fit on one line.');

const folder = id.replace(/-([a-z0-9])/g, (_, character) => character.toUpperCase());
const templateDir = join(TEMPLATE_ROOT, type, folder);
const registry = await readFile(REGISTRY_PATH, 'utf8');
const marker = `// generator-scaffold:${type}`;
const markerIndex = registry.indexOf(marker);
if (markerIndex === -1) usage(`Registry marker for "${type}" is missing.`);
if (registry.includes(`id: '${id}'`)) usage(`Template id "${id}" is already registered.`);

try {
	await access(templateDir);
	usage(`Template directory already exists: ${templateDir}`);
} catch {
	// Expected for a new template.
}

const worksByType = {
	audio: `const works = (data.tracks ?? []).length
		? '<ul class="works">' + (data.tracks ?? []).map((track) =>
			'<li><strong>' + escapeHtml(track.label) + '</strong><audio controls preload="none" src="' + escapeAttr(track.url) + '"></audio></li>'
		).join('') + '</ul>'
		: emptyState('No tracks uploaded yet.');`,
	comic: `const works = (data.pages ?? []).length
		? '<div class="works">' + (data.pages ?? []).map((page, index) =>
			'<figure><img src="' + escapeAttr(page.url) + '" alt="' + escapeAttr(page.caption || 'Page ' + (index + 1)) + '" /><figcaption>' + escapeHtml(page.caption || 'Page ' + (index + 1)) + '</figcaption></figure>'
		).join('') + '</div>'
		: emptyState('No pages uploaded yet.');`,
	text: `const samples = (data.excerpts ?? []).map((value) => value.trim()).filter(Boolean);
	const works = samples.length
		? '<div class="works">' + samples.map((sample) => '<article><p>' + escapeHtml(sample) + '</p></article>').join('') + '</div>'
		: emptyState('No text samples yet.');`,
	game: `const works = imageOrPlaceholder(
		data.screenshotUrl,
		'work-image',
		data.displayName + ' screenshot',
		'GAME ART'
	);`
};

const helperImports = [
	'accentColorOverride',
	'escapeHtml',
	'fill',
	'imageOrPlaceholder',
	'socialLinksIconHtml',
	'templateResult',
	'verificationMeta',
	'widgetEmbedHtml'
];
if (type !== 'game') helperImports.push('emptyState');
if (type === 'audio' || type === 'comic') helperImports.push('escapeAttr');
helperImports.sort();

const indexJs = `import {
	${helperImports.join(',\n\t')}
} from '../../shared.js';
import shell from './shell.html?raw';
import css from './styles.css?raw';

/** @param {import('../../shared.js').GeneratorData} data */
export function render(data) {
	${worksByType[type]}
	const html = fill(shell, {
		VERIFICATION_META: verificationMeta(data.verificationToken),
		COLOR_OVERRIDE: accentColorOverride(data.accentColor),
		DISPLAY_NAME: escapeHtml(data.displayName),
		WHY: escapeHtml(data.why),
		BIO: data.bio?.trim() ? escapeHtml(data.bio) : escapeHtml(data.why || 'No bio yet.'),
		ICON: imageOrPlaceholder(data.iconUrl, 'creator-image', data.displayName, 'CREATOR'),
		WORKS: works,
		SOCIAL_LINKS: socialLinksIconHtml(data.socialLinks),
		WIDGET_EMBED: widgetEmbedHtml(data.widgetEmbed)
	});
	return templateResult(html, css);
}
`;

const shellHtml = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>{{DISPLAY_NAME}}</title>
		{{VERIFICATION_META}} {{COLOR_OVERRIDE}}
		<link rel="stylesheet" href="styles.css" />
	</head>
	<body>
		<header>
			{{ICON}}
			<div><h1>{{DISPLAY_NAME}}</h1><p>{{BIO}}</p></div>
		</header>
		<main>
			<p class="tagline">{{WHY}}</p>
			{{WORKS}}
		</main>
		<footer>{{SOCIAL_LINKS}}{{WIDGET_EMBED}}</footer>
		<script src="script.js"></script>
	</body>
</html>
`;

const stylesCss = `:root {
	--accent: #6fae9c;
	--background: #f7f4ed;
	--text: #202020;
}

* { box-sizing: border-box; }
body {
	margin: 0;
	background: var(--background);
	color: var(--text);
	font: 1rem/1.6 system-ui, sans-serif;
}
header, main, footer {
	width: min(70rem, calc(100% - 2rem));
	margin-inline: auto;
}
header {
	display: grid;
	grid-template-columns: minmax(8rem, 14rem) 1fr;
	gap: 2rem;
	align-items: center;
	padding-block: 3rem;
}
.creator-image, .work-image, .works img { display: block; max-width: 100%; height: auto; }
.works { display: grid; gap: 1.5rem; padding: 0; list-style: none; }
.works figure, .works p, .works li { margin: 0; }
.works audio { display: block; width: 100%; margin-top: 0.5rem; }
.social-links { display: flex; flex-wrap: wrap; gap: 1rem; padding-block: 2rem; }
.social-links a { color: inherit; }
.ring-widget { padding-block: 1rem 3rem; }
@media (max-width: 40rem) { header { grid-template-columns: 1fr; } }
`;

await mkdir(templateDir);
await Promise.all([
	writeFile(
		join(templateDir, 'index.js'),
		await format(indexJs, { ...prettierOptions, parser: 'babel' }),
		'utf8'
	),
	writeFile(
		join(templateDir, 'shell.html'),
		await format(shellHtml, { ...prettierOptions, parser: 'html' }),
		'utf8'
	),
	writeFile(
		join(templateDir, 'styles.css'),
		await format(stylesCss, { ...prettierOptions, parser: 'css' }),
		'utf8'
	)
]);

const safeLabel = label.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const markerLineStart = registry.lastIndexOf('\n', markerIndex) + 1;
const markerIndent = registry.slice(markerLineStart, markerIndex);
const previousCharacter = registry.slice(0, markerLineStart).trimEnd().at(-1);
const separator = previousCharacter === ',' ? '' : ',\n';
const entry = `${markerIndent}{ id: '${id}', label: '${safeLabel}', load: () => import('./templates/${type}/${folder}/index.js') }\n`;
const registryWithEntry =
	registry.slice(0, markerLineStart) +
	separator +
	entry +
	markerIndent +
	marker +
	registry.slice(markerIndex + marker.length);
const updatedRegistry = await format(registryWithEntry, {
	...prettierOptions,
	parser: 'babel'
});
await writeFile(REGISTRY_PATH, updatedRegistry, 'utf8');

console.log(`Created ${type}/${folder} and registered "${label}".`);
console.log(`Preview it with: npm run generator:preview -- ${type} ${id}`);
