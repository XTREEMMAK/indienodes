#!/usr/bin/env node
// Zero-dependency static server for testing/sites/, so the fictional
// creator pages in ring.test.json resolve to something real during local
// testing instead of a dead link. Not for production use.
//
// Also serves the fixture itself at /ring.test.json (reading from
// ../fixtures/, outside the sites/ root below), so a client running on a
// different port (the app on 5173, the widget bundle on whatever page
// embeds it) has one place to point at for the whole fixture. CORS is
// wide open here on purpose: this only ever runs on localhost, for
// development, and nothing here is sensitive.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const SITES_ROOT = fileURLToPath(new URL('../sites/', import.meta.url));
const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/ring.test.json', import.meta.url));
const PORT = Number(process.env.PORT) || 4174;

const MIME_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.wav': 'audio/wav',
	'.mp3': 'audio/mpeg',
	'.json': 'application/json'
};

const server = createServer(async (req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*');

	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

	if (url.pathname === '/ring.test.json') {
		try {
			const body = await readFile(FIXTURE_PATH, 'utf-8');

			// The fixture stores its own asset URLs as http://localhost:PORT,
			// which is correct on the machine running this and useless
			// anywhere else: opened on a phone, `localhost` is the phone, and
			// all 99 of them (covers, audio, comic pages) 404.
			//
			// Rewriting to whatever Host the request actually arrived on means
			// one committed fixture works from every device with nothing to
			// regenerate and nothing to reconfigure when the network changes.
			// Same-machine requests carry `localhost:PORT` and come back
			// unchanged.
			//
			// The scheme matters too, not just the host: this server only ever
			// speaks plain HTTP itself, but a reverse proxy terminating TLS in
			// front of it (nginx, Cloudflare) sets X-Forwarded-Proto to say so.
			// Hardcoding `http://` here silently rewrote every asset URL to
			// mixed content the moment this ran behind one -- the browser
			// blocks an `http://` media fetch from an `https://` page, so every
			// cover and track quietly failed to load with no error surfaced to
			// this server at all.
			const host = req.headers.host ?? `localhost:${PORT}`;
			const proto = req.headers['x-forwarded-proto'] ?? 'http';
			const rewritten = body.replaceAll(`http://localhost:${PORT}`, `${proto}://${host}`);

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(rewritten);
		} catch {
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('Not found');
		}
		return;
	}

	let path = normalize(decodeURIComponent(url.pathname));
	if (path.endsWith('/')) path += 'index.html';

	const filePath = join(SITES_ROOT, path);
	if (!filePath.startsWith(SITES_ROOT)) {
		res.writeHead(403).end('Forbidden');
		return;
	}

	try {
		const info = await stat(filePath);
		const type = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';

		// Weak validator from size and mtime. Enough for a dev fixture, and it
		// is what lets the browser answer a repeat request from cache instead
		// of pulling the file again: without it every rotation of a node
		// re-downloaded cover art that was already on screen a moment ago.
		const etag = `W/"${info.size}-${Math.floor(info.mtimeMs)}"`;
		const cacheHeaders = {
			ETag: etag,
			'Last-Modified': info.mtime.toUTCString(),
			// A short max-age rather than `no-cache`. Both prevent a
			// re-download, but `no-cache` still forces a revalidation request
			// per use, so cover art reappearing on a rotation kept showing up
			// in the network log even though nothing was actually transferred.
			// A minute is long enough to stay quiet during a session and short
			// enough that regenerating the fixture shows up without a hard
			// reload.
			'Cache-Control': 'max-age=60',
			// Advertised on every response, not just ranged ones. A media
			// element checks for this before it will allow seeking at all.
			'Accept-Ranges': 'bytes'
		};

		if (req.headers['if-none-match'] === etag) {
			res.writeHead(304, cacheHeaders);
			res.end();
			return;
		}

		// Range support, which is what makes audio seekable. Without it the
		// browser cannot jump to an unbuffered position, so dragging the
		// playhead simply restarted the track.
		const range = req.headers.range;
		const match = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
		if (match) {
			const [, rawStart, rawEnd] = match;
			const start = rawStart === '' ? info.size - Number(rawEnd) : Number(rawStart);
			const end = rawStart === '' || rawEnd === '' ? info.size - 1 : Number(rawEnd);

			if (!Number.isFinite(start) || start < 0 || start >= info.size || end < start) {
				res.writeHead(416, { ...cacheHeaders, 'Content-Range': `bytes */${info.size}` });
				res.end();
				return;
			}

			const clampedEnd = Math.min(end, info.size - 1);
			res.writeHead(206, {
				...cacheHeaders,
				'Content-Type': type,
				'Content-Range': `bytes ${start}-${clampedEnd}/${info.size}`,
				'Content-Length': clampedEnd - start + 1
			});
			createReadStream(filePath, { start, end: clampedEnd }).pipe(res);
			return;
		}

		res.writeHead(200, { ...cacheHeaders, 'Content-Type': type, 'Content-Length': info.size });
		createReadStream(filePath).pipe(res);
	} catch {
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		res.end('Not found');
	}
});

/**
 * Non-internal IPv4 addresses, so the address to open on a phone is visible
 * rather than something to hunt for.
 *
 * Virtual interfaces are skipped by name. A machine with Docker installed
 * reports a handful of `docker0` and `br-*` bridges that are real addresses
 * but reach nothing from a phone, and listing six candidates when one is
 * usable makes the output worse than no output.
 */
const VIRTUAL_INTERFACE = /^(docker|br-|veth|virbr|vmnet|tun|tap|lo)/i;

function lanAddresses() {
	return Object.entries(networkInterfaces())
		.filter(([name]) => !VIRTUAL_INTERFACE.test(name))
		.flatMap(([, nets]) => nets ?? [])
		.filter((net) => net.family === 'IPv4' && !net.internal)
		.map((net) => net.address);
}

server.listen(PORT, () => {
	console.log(`Serving testing/sites/ and ring.test.json`);
	console.log(`  local:  http://localhost:${PORT}`);
	for (const address of lanAddresses()) {
		console.log(`  on LAN: http://${address}:${PORT}`);
	}
	console.log('\nAsset URLs in the fixture are rewritten to match the host you request it from,');
	console.log('so opening the app from another device needs no extra setup.');
	console.log('Ctrl-C to stop.');
});
