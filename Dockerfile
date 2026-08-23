# IndieNodes is a static SvelteKit site (adapter-static): the build produces
# plain HTML, CSS, and JS with no server process behind it, so this image is
# a build stage plus a static file server, nothing more. That is a real
# difference from a typical SvelteKit container, not an oversight worth
# "fixing" later: there is no Node process, no PM2, no database, and no
# adapter-node in this project at all (see docs/roadmap.md's Production
# packaging section). GGRequestz's Dockerfile was used as a structural
# reference for the parts that DO transfer (multi-stage layout, non-root
# PUID/PGID) — its process manager, database migrations, and entrypoint
# script are adapter-node concerns this project does not have.

FROM node:22-alpine AS build
WORKDIR /app

# Every VITE_ var is compiled into the client bundle at build time, not read
# at runtime: adapter-static means there is nothing running later that could
# read an environment variable (see src/lib/config.js, .env.example).
# `docker run -e` on the final image does nothing; changing any value means
# rebuilding the image with a different --build-arg.
#
# This is the complete build-time surface for a production image -- every
# VITE_ var the app reads, except VITE_RING_URL, which stays out on purpose:
# it exists to point `npm run dev:fixture` at the 50-entry test fixture and
# has no legitimate production value, so it is not something infra should be
# offered a knob for. Whether any of the five below are actually set is an
# infra decision this image takes no position on: SITE_ORIGIN defaults to the
# project's own site as a starting point for a bare `docker build .` with no
# args -- not this repo's opinion of the "real" value, and any build that
# cares what origin ships should pass its own --build-arg rather than rely on
# it -- and the rest default to unset, which is itself a valid, documented
# choice (mocks in dev, "closed"/no-widget/no-tab in a production build)
# rather than an oversight to fix later.
# Docker's own build linter flags VITE_TURNSTILE_SITE_KEY below as
# "sensitive data in ARG/ENV" -- a false positive worth leaving documented
# rather than silenced. Turnstile's *site* key is designed to be public and
# embedded in every page that renders the widget; the matching *secret* key
# (the one that would actually be sensitive) never appears in this repo at
# all, by design -- see the .env.example entry this ARG mirrors.
ARG VITE_SITE_ORIGIN=https://indienodes.us
ARG VITE_SUBMISSION_WEBHOOK_URL=
ARG VITE_CONTACT_WEBHOOK_URL=
ARG VITE_TURNSTILE_SITE_KEY=
ARG VITE_KOFI_URL=
ENV VITE_SITE_ORIGIN=$VITE_SITE_ORIGIN
ENV VITE_SUBMISSION_WEBHOOK_URL=$VITE_SUBMISSION_WEBHOOK_URL
ENV VITE_CONTACT_WEBHOOK_URL=$VITE_CONTACT_WEBHOOK_URL
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
ENV VITE_KOFI_URL=$VITE_KOFI_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Chains build:widget first (see package.json); adapter-static then picks up
# the generated static/embed.js and static/embed.v1.js as ordinary static
# assets, which is why this is one RUN rather than two separate build steps.
COPY docs/legal/EULA.md docs/legal/EULA.md
RUN npm run build

# ---------------------------------------------------------------- runtime --
FROM caddy:2-alpine AS runtime

ARG PUID=1000
ARG PGID=1000

# Reuse the group/user if the chosen id already exists in the base image,
# rather than failing on a collision — same guard GGRequestz's Dockerfile
# uses for the same reason.
RUN (getent group ${PGID} || addgroup -g ${PGID} -S indienodes) && \
	(getent passwd ${PUID} || adduser -S -u ${PUID} -G indienodes indienodes)

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=${PUID}:${PGID} /app/build /srv

# /config/caddy and /data/caddy (Caddy's own state/storage dirs) ship
# world-writable in the base image already, so no chown is needed there for
# a non-root USER to start cleanly.
USER ${PUID}:${PGID}

# Not 80: binding a privileged port needs root or a capability this
# container deliberately does not have. See the Caddyfile.
EXPOSE 8080

# wget, not curl: curl is not in caddy:2-alpine's base image and this stays
# a one-line check rather than adding a package for it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD wget -qO- http://127.0.0.1:8080/ || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
