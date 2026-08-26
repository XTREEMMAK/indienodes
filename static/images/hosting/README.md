# Suggested-host icons

Each PNG here is that service's own official favicon — Neocities, File Garden,
Nekoweb — fetched directly from `https://<site>/favicon.ico` and re-encoded to
a plain 64×64 PNG. Used next to the "sign up" links in `/join`'s no-site audio
step (see `JoinMediaStep.svelte` and `src/lib/config.js`'s `NEOCITIES_URL` /
`FILE_GARDEN_URL` / `NEKOWEB_URL`), not to imply any partnership or
endorsement — these are just the real marks rather than a hand-drawn
approximation, per the reasoning in `docs/decisions.md`'s entry on the no-site
audio hosting guidance.

**Why re-encoded rather than committed as-is.** All three sites serve a `.ico`
containing a raw 32bpp BMP frame, and this project's `sharp`/libvips build has
no BMP or ImageMagick input support at all (`sharp.format` lists nothing that
reads either). The DIB pixel data was decoded by hand — parse the
`BITMAPINFOHEADER`, read the bottom-up BGRA rows, hand `sharp` the result as a
raw buffer — rather than pulling in a dependency for a one-time conversion of
three small files. That decoder was a throwaway script, not committed; if a
site changes its favicon, the fetch-and-decode has to be redone the same way,
not re-run from something in this repo.

Self-hosted per the project's no-third-party-origin rule: fetched once here,
never requested from the visitor's browser at runtime, same as every other
image under `static/`.
