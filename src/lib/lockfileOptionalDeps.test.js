import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `npm ci` must work on a clean machine, and twice now it has not.
 *
 * `@img/sharp-wasm32` and `@tailwindcss/oxide-wasm32-wasi` declare optional
 * dependencies on `@emnapi/runtime` and `@emnapi/core`. Some npm versions
 * write those package entries into the lockfile and some do not, because they
 * are optional and irrelevant on the machine doing the resolving. A lockfile
 * written by an npm that omits them still installs fine there — and then fails
 * on any machine whose npm evaluates them, with:
 *
 *   npm error `npm ci` can only install packages when your package.json and
 *   package-lock.json ... are in sync
 *   npm error Missing: @emnapi/runtime@1.11.3 from lock file
 *
 * `99d0ede` fixed this by hand-adding the entries. `4314b0f` removed them
 * again, not deliberately but as a side effect of `npm install` rewriting the
 * lockfile while adding an unrelated dependency, and main's build broke the
 * next time anything ran `npm ci`.
 *
 * That is the loop this guard exists to break. Any `npm install` can drop
 * these, silently and while doing something else entirely, and the CI job that
 * would notice runs only on main and on pull requests targeting it — so
 * without this the next discovery is a red default branch.
 *
 * If this test fails: re-add the missing `node_modules/@emnapi/*` entries to
 * `package-lock.json` rather than deleting the test. `git show 99d0ede --
 * package-lock.json` is the reference, and a clean-room `npm ci` in an empty
 * directory holding only package.json, package-lock.json and .npmrc is how to
 * confirm the repair.
 */
const lock = JSON.parse(
	readFileSync(fileURLToPath(new URL('../../package-lock.json', import.meta.url)), 'utf8')
);

describe('package-lock.json keeps the optional wasm runtime entries', () => {
	it.each(['node_modules/@emnapi/core', 'node_modules/@emnapi/runtime'])(
		'still declares %s',
		(path) => {
			expect(lock.packages).toHaveProperty([path]);
		}
	);

	// Every optional dependency any package names must have an entry of its
	// own, which is the general form of the failure above rather than the two
	// package names that happened to hit it.
	it('has an entry for every optional dependency something declares', () => {
		const declared = new Set();
		for (const pkg of Object.values(lock.packages)) {
			for (const name of Object.keys(pkg.optionalDependencies ?? {})) declared.add(name);
		}
		const missing = [...declared].filter(
			(name) =>
				!Object.keys(lock.packages).some(
					(path) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)
				)
		);
		expect(missing).toEqual([]);
	});
});
