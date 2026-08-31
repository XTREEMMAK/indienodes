# Security audit — 2026-08-27

## Scope

This review covered the static Svelte application, generated creator pages, the
cross-origin ring widget, member health checks, Caddy deployment, and the n8n
intake, verification, contact, update, removal, and administrator-review
workflows. It is a source audit, not a penetration test of the deployed proxy,
n8n instance, DNS, or GitHub organization.

## Executive summary

No direct stored-XSS path was found in the public ring data or private review
page: generated review HTML escapes submitter values, published member fields
are allowlisted, the JSON schema rejects unknown fields, review decisions use
expiring HMAC signatures with constant-time comparison, and approval opens a PR
rather than writing to `main`.

Two high-risk operational gaps remain and should block treating the webhook
stack as hardened:

1. **Partially addressed 2026-08-31.** The n8n ownership verifier previously never
   resolved a hostname at all during validation — only a literal IP was range-checked
   — so a domain with its A record pointed at `169.254.169.254` or another
   private/reserved address passed cleanly with no rebinding timing required. It now
   resolves every hostname via DNS-over-HTTPS and rejects any resolved A/AAAA record
   in a private, loopback, link-local, CGNAT, or metadata range, closing that
   untimed bypass. **Still open:** a true DNS-rebinding race remains between that
   lookup and the fetch node's own independent resolution moments later, and there is
   still no response-size ceiling on the HTTP node. Route this fetch through an
   egress proxy that resolves once, pins the connection to the validated address, and
   limits response bytes for the complete fix.
2. **Fixed 2026-08-31 for update/removal.** `TURNSTILE_ENABLED` is now true, with a
   real Cloudflare credential wired in and verified server-side (Cloudflare's
   siteverify, not just token presence) before `submit_update`/`request_removal`
   proceed. **Still open:** `issue_token`/`verify`/`submit` remain unguarded by
   design (a deliberate, documented scope decision, not an oversight), and
   `/contact` has no server-validated challenge at all — its honeypot and
   client-reported dwell time are still friction, not authentication.

## Findings

| Severity | Area                      | Finding                                                                                                                                                                                              | Status / required action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | n8n outbound verification | Hand-written URL checks previously never resolved a hostname's DNS answer at all, only a literal IP's — a domain pointed at a private/metadata address passed untouched, no rebinding timing needed. | Partially fixed 2026-08-31: hostnames are now resolved via DNS-over-HTTPS and rejected if any answer is private/reserved. Open: the residual TOCTOU race against the fetch node's own resolution, and the fetch still has no infrastructure-enforced response-size ceiling — a hardened egress proxy remains the complete fix.                                                                                                                                                                                                                                                                                                                                         |
| High     | Public webhooks           | Turnstile is disabled; public endpoints can be automated to create rows, send mail, and cause verification fetches.                                                                                  | Fixed 2026-08-31 for `submit_update`/`request_removal`: real Cloudflare credentials provisioned, the site key deployed, and `wf_finalize_submission` pushed live with `TURNSTILE_ENABLED` on, verified against its fetched-back live definition. A real browser-driven smoke test (unsolved challenge rejected, real solve succeeds) is still outstanding. Still open: `wf_contact` has no Turnstile plumbing at all, which is unbuilt work, not a flag flip; add proxy rate limits and periodic expired-row cleanup. See `open-questions.md`.                                                                                                                         |
| High     | Member-site widget        | `embed.v1.js` executes in the member page's JavaScript realm. Shadow DOM isolates styling, not script authority; a compromised origin/build can read or alter the host page.                         | Fixed 2026-08-31: a sandboxed cross-origin iframe (`/embed-frame`, sandbox `allow-scripts allow-popups allow-popups-to-escape-sandbox`, no `allow-same-origin`) is now the default `widget` tier. The script tag survives only as an explicitly weaker-trust `widget-script` "advanced" option. See `decisions.md`'s widget-iframe-isolation entry for why this is a same-origin route rather than a dedicated subdomain. Still open: immutable content-addressed URLs + SRI for the script tier (a distinct, non-trivial versioning project, tracked in `roadmap.md`, deliberately not done alongside this).                                                          |
| Medium   | Generated preview frames  | `srcdoc` previews previously ran without a sandbox on the IndieNodes origin.                                                                                                                         | Fixed: every builder/widget preview now uses a sandbox without `allow-same-origin`. (The `/join` success screen's three widget-tier preview iframes still carried it until 2026-08-31, needed only because they embedded the real module-script widget snippet rather than the inert stand-in the live editor preview already used; they now use the stand-in too and carry the same sandbox.)                                                                                                                                                                                                                                                                         |
| Medium   | Generated social links    | Escaping attributes did not prevent `javascript:` or `data:` navigation payloads.                                                                                                                    | Fixed: generated social links now allow only HTTPS and `mailto:` and have regression tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Medium   | Browser headers           | The repository Caddy config had no baseline security headers.                                                                                                                                        | Fixed: `nosniff`, strict-origin referrer policy, restrictive permissions policy, and frame denial were added. A Content-Security-Policy was added 2026-08-31 and verified against a real Caddy instance; `script-src`/`style-src` carry `'unsafe-inline'` rather than the originally-planned hash, because SvelteKit's own per-page hydration script has no single stable hash to pin (see `decisions.md`'s CSP entry) -- everything else (`object-src`, `base-uri`, `form-action`, `frame-ancestors`, real `connect-src`/`frame-src` allowlists) is enforced. A per-page hash-injection build step for a stricter `script-src` remains open, tracked in `roadmap.md`. |
| Medium   | Participation health      | Availability and optional meta-token checks did not verify that a member still carried a supported ring embed.                                                                                       | Fixed: source-page health now checks the full widget or canonical badge/text-link target by default and reports absence as a warning.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Low      | Admin review UX           | Approve/reject links opened another form and some failure paths appeared as a blank response.                                                                                                        | Fixed in generated workflow: one review page contains two signed POST forms; result pages show a checkmark, and approval explicitly requires reviewing and merging the PR.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Low      | Development dependencies  | Registry lookup reports six development-only advisories through SvelteKit's `cookie` dependency and Capacitor CLI's `xcode`/`uuid` chain.                                                            | Open upstream: `npm audit --omit=dev` reports zero runtime advisories; current automated fixes require breaking/downgrade changes, so do not apply `--force`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Webhook authentication decision

Do not add a bearer token to public frontend calls. Any token shipped in static
JavaScript is public and would add no authorization boundary. Public endpoints
need server-verified bot challenges, rate limits, strict schemas, request/body
limits, expiry cleanup, and constrained side effects.

Administrator review is different: its expiring HMAC-signed URL is already a
bearer capability. The decision and expiry are covered by the signature,
signatures are compared in constant time, state changes accept POST only, and
optimistic claims prevent concurrent duplicate actions. If the review page is
placed behind Cloudflare Access, a VPN, or another identity-aware proxy, that is
a useful additional layer; a second static bearer parameter is not.

The n8n platform supports Basic, Header, and JWT webhook authentication, but
those modes are appropriate only where the caller can keep a credential. They
can protect private operator callbacks, not an anonymous join/contact form.

## Existing controls confirmed

- Published member JSON is schema-validated with `additionalProperties: false`.
- Submission-to-member conversion and approval both use explicit allowlists.
- Review HTML consistently escapes submitter-controlled text and attributes.
- Review links are HMAC signed, expire, and use a constant-time comparison.
- Approval creates a branch and pull request; merge remains a manual action.
- Verification does not follow redirects, blocks obvious local/reserved URL
  forms before the outbound n8n request, and (as of 2026-08-31) resolves a
  hostname via DNS-over-HTTPS and rejects any answer in a private, loopback,
  link-local, CGNAT, or metadata range before treating it as safe to fetch.
- Member health fetches validate DNS answers and each redirect target, limit
  source-page reads to 2 MB, and apply timeouts/concurrency limits.
- Emails and review data are scrubbed or deleted after resolution according to
  the workflow's retention behavior.

## Recommended order of operations

1. Put the n8n verifier behind DNS-pinned, byte-limited egress and deny all other
   n8n outbound network access where practical.
2. Enable and server-verify Turnstile, then add edge rate limits by endpoint and
   source IP plus an expired-row sweeper.
3. Migrate the recommended full widget to a sandboxed iframe/isolated origin;
   keep the script embed only as a documented compatibility option until retired.
4. Introduce CSP in report-only mode, inventory inline scripts/styles and third-
   party origins, then enforce a nonce/hash policy after violations are clean.
5. Run registry-backed dependency advisories in CI. A manual follow-up on
   2026-08-27 found zero runtime advisories and six development-only advisories
   (three low, three moderate); neither advisory chain currently has a safe
   automated fix. CI should keep that result visible as upstream packages move.

## References

- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Cloudflare Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [OWASP Third Party JavaScript Management](https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Javascript_Management_Cheat_Sheet.html)
- [MDN iframe sandbox reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)
- [MDN Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
- [n8n webhook authentication credentials](https://github.com/n8n-io/n8n-docs/blob/main/docs/integrations/builtin/credentials/webhook.md)
