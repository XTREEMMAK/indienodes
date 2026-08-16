// Static site generation: every route prerenders to static output with no
// runtime backend, per the locked stack decision in the bootstrap prompt.
//
// Nothing else lives here on purpose. This module ships to the browser to
// support client-side navigation, so anything it imports ships too. The
// changelog parse moved to `+layout.server.js` for exactly that reason; see
// the note there.
export const prerender = true;
