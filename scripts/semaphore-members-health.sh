#!/usr/bin/env bash
set -euo pipefail

# Entry point for Semaphore's "Deploy indienodes members:health" Task
# Template. Semaphore's Bash task type runs a script file from the repo
# checkout (a "Script Filename" field) rather than taking an inline
# command, so this exists purely to give it one. See
# docker-webappserver-andible's docs/semaphore.md, "Scheduled Tasks (cron)"
# section, for the Task Template + Schedule setup this backs, including the
# state-persistence caveat around check-member-links.js's
# --failure-threshold debounce.

npm ci
npm run members:health
