# IndieNode v2 — Submission Form Spec

**Version:** v0.3
**Status:** Ready for implementation
**Scope:** Submission form fields, validation, EULA copy, and data model mapping for the ring.json publishing pipeline. This is an implementation spec, not a legal reasoning document. Safe for the public repo.
**Changelog (v0.3):** Section 5 rewritten: a submission now lands in a private review queue before anything is public, and the pull request that used to be the review mechanism itself is demoted to a final, post-approval, email-stripped artifact. Added `email` to Section 2.2, scoped to this submission's own back-and-forth only. Section 7 rewritten for the queue's own storage and admin surface, which is a real new question this introduces rather than a detail of the earlier design.
**Changelog (v0.2):** Added Section 7 (Architecture), deciding where Section 5's token generation and reachability check actually run, since this project's own architecture (a static build with no required backend) does not obviously have a place for either. Also records that this form replaces the pull-request and issue paths outright rather than sitting alongside them.

---

## 1. Purpose

Defines the fields, validation rules, and required consent copy for the entry submission flow. This is the source of truth for building the submission form. It maps directly onto the `ring.json` schema in the main project brief and adds the fields needed for ownership verification and consent.

## 2. Form Fields

### 2.1 Core entry data (maps to ring.json)

| Field       | Type                           | Required    | Notes                                                        |
| ----------- | ------------------------------ | ----------- | ------------------------------------------------------------ |
| creator     | text                           | yes         | Display name                                                 |
| type        | enum                           | yes         | audio, comic, text, game                                     |
| title       | text                           | yes         | Entry or featured-work title                                 |
| why         | text                           | yes         | One line, short character limit, human framing               |
| source_url  | url                            | yes         | Must be a URL the creator owns or controls                   |
| tags        | multi-select or free tag input | yes         | At least one tag                                             |
| tracks      | repeatable group               | conditional | Required if type is audio. Max 3. Each has label + media_url |
| pages       | repeatable group               | conditional | Required if type is comic. Each has image_url + caption      |
| excerpt     | text                           | conditional | Required if type is text                                     |
| thumb_url   | url                            | conditional | Required if type is game                                     |
| preview_url | url                            | conditional | Optional if type is game. Muted preview only                 |

### 2.2 Verification and consent fields (not in ring.json, used at review stage only)

| Field               | Type             | Required    | Notes                                                                |
| ------------------- | ---------------- | ----------- | -------------------------------------------------------------------- |
| email               | email            | yes         | See below. Never written to ring.json, never stored as an account.   |
| verification_token  | system-generated | yes         | Opaque string, shown to submitter to place at source_url or profile  |
| rights_confirmation | checkbox         | yes         | See Section 3 warranty text                                          |
| pro_membership      | select           | yes         | Options: Not a member / ASCAP / BMI / SESAC / GMR / Other / Not sure |
| pro_membership_name | text             | conditional | Shown if pro_membership is not "Not a member"                        |
| eula_agreement      | checkbox         | yes         | See Section 4                                                        |

The `pro_membership` field is data collection only. It does not block or approve submissions. It exists to give the project accurate visibility into PRO exposure across the live ring. Do not build any rejection logic against this field without a separate decision to do so.

**`email` is scoped narrowly, and the scope is the whole point of it.** It exists only for this one submission's own back-and-forth: telling a submitter their reachability check failed if they've already navigated away, or that their entry was approved or rejected. It is not an account (nothing is gated behind it, nothing persists it as an identity), and it is not a mailing list (it is never used to reach a submitter about anything other than the specific submission that collected it). It is retained only until that submission is resolved, approved or rejected, and deleted after. It is visible to maintainers during review (Section 5) and is never written to `ring.json` and never appears in the pull request Section 5 eventually opens.

## 3. Rights Warranty (checkbox label text)

Shown as a single checkbox the submitter must check to proceed:

> "I confirm that I hold full rights to the recording and composition I am submitting, including that no third party such as a co-writer, sample owner, publisher, or label holds a claim that would require separate compensation for its use on IndieNode. I understand that PRO membership does not prevent me from submitting, but I am disclosing it accurately above."

## 4. EULA Clause (shown at submission, required checkbox)

> "By submitting your work, you affirm that you hold full rights to the submitted recording and composition, including that no third party, including any performing rights organization, publisher, co-writer, or sample owner, holds a claim requiring separate compensation for its use on IndieNode. IndieNode does not collect revenue on the basis of any individual creator's work and operates on a donation only basis. You waive any claim to royalties or compensation from IndieNode arising from the streaming of your submitted work on this basis. This waiver applies to the relationship between you and IndieNode and does not, and cannot, affect obligations IndieNode may independently hold to third party rights organizations."

This text should render in full above the `eula_agreement` checkbox, not behind a separate link only. Keep it short enough that a full-text checkbox is reasonable, this version already is.

## 5. Ownership Verification Flow

1. Submitter fills out core entry fields, plus `email`.
2. System generates a `verification_token`.
3. Submitter is shown two paths depending on source_url type:
   - **Owns the domain:** place token via meta tag or well-known path.
   - **Third-party platform profile (Bandcamp, itch.io, SoundCloud, etc.):** place token in a publicly visible field on that profile (bio, description, release notes).
4. Submitter presses **Verify**, an explicit step inside the form itself. The automated check confirms token presence at the destination in real time and reports pass or fail right there. This is a pass/fail checklist item, not a content judgment, and it is synchronous on purpose: this project collects no account and, before this version, no email either, so there was no channel to reach a submitter after they left the page. The submitter is still looking at the screen when this runs, so retry is just pressing the button again, not a separate flow.
5. **On pass, the submission (every field, including `email`) enters a private review queue.** This is new as of v0.3 and is not a public pull request. Nothing about the submission is visible outside the queue at this point, which is what keeps `email` from ever landing somewhere public. See Section 7 for what the queue actually is (still open).
6. A maintainer reviews the submission from inside the queue per the thin moderation standard (valid URL, working token, declared type matches content) and approves or rejects it. Because this is a private surface, the maintainer sees `email` and every other field, not just the `ring.json`-shaped ones.
7. **On approval, a pull request is opened carrying only the public `ring.json`-shaped fields** (Section 2.1, plus `verification_token`). `email`, `rights_confirmation`, `pro_membership`, and every other Section 2.2 field are stripped before the PR exists; none of them were ever meant to be public, and this is the point where that stops being merely a policy and becomes something the data flow enforces. `email` is deleted from wherever the queue held it once the submission reaches this step.
8. The PR goes through the existing pipeline (Semaphore/Ansible) to rebuild and deploy, unchanged from before this version. Whether that PR still needs its own human merge click, given a maintainer already approved the submission one step earlier, is noted as open in Section 7.
9. On rejection, the submitter is told so at `email`, and nothing about their submission is retained past that point.

## 6. Validation Rules

- `source_url` must be a valid, reachable URL at submission time.
- `tracks` array: max length 3 for type audio. Reject or truncate with a clear message if exceeded, do not silently drop entries.
- `media_url`, `image_url`, `preview_url`, `thumb_url`: must not point at IndieNode's own domain. This enforces the no-rehosting principle at the data layer, not just as a policy statement.
- `rights_confirmation` and `eula_agreement` must both be checked before the submit action is enabled. Disable the submit button rather than validating on click, so the requirement is visible before the attempt.
- `pro_membership_name` is required only if `pro_membership` is not "Not a member" or "Not sure."

## 7. Architecture: Where This Runs

Section 5 asks the system to generate a `verification_token`, run an automated reachability check against `source_url`, hold a submission privately (including `email`) until a human reviews it, and only then open a pull request carrying the public subset of the data. None of this has an obvious home: the brief's tech stack (Section 4 of `IndieNode_v2_Brief.md`) locks static site generation with "no required backend for the reader or widget," and the only server named anywhere is the Docker/Semaphore/Ansible pipeline that builds and deploys `ring.json` once an entry is already approved.

**Decided: a small serverless function, separate from the publishing pipeline, handles intake and the check.** It accepts the form submission, generates the token, and runs the reachability check. It writes nothing to `ring.json` directly, and it is not where the PR gets opened either; see below.

This keeps the reader-and-widget promise intact on its own terms: the function serves only the submission funnel, which nobody needs to have running to browse the ring, play its audio, or embed the widget. Extending the publishing webserver itself was the alternative and was rejected, specifically because that would make a service that currently only handles deploys load-bearing for intake too, which is a bigger claim on "no required backend" than the brief currently makes.

**Decided: the pull request is the last step, not the review mechanism.** The earlier version of this section had a passing submission become a PR immediately, with a human reviewing it there. That is no longer the design, specifically because of `email`: a PR is public the moment it opens, and `email` must never be. So a passing submission instead lands in a private review queue, a human reviews everything (including `email`) from inside that queue, and only _approval_ causes a PR to be opened, at which point it is built from just the `ring.json`-shaped fields (Section 5, steps 5-7). The PR survives in this design because it is still the right tool for what it is now used for: a human looking over one JSON object before it joins a public, versioned file, which is exactly what a PR review is for. It just no longer needs to be the surface where `email` also happens to sit.

**Genuinely new and unresolved: where the review queue itself lives, and what a maintainer actually looks at to review one.** This is a real second surface (some persistence for pending submissions, and _something_ a maintainer opens to see, approve, or reject them), not a detail of the already-decided intake function. It could be the same serverless platform's own storage plus a small protected page, or something else entirely; nothing here should be assumed until it's decided on its own terms.

**Also still open:** which serverless platform, how the function authenticates to open a PR (a bot account's token, most likely), and whether the resulting PR still needs a second, separate merge click from a maintainer given one already approved the submission a step earlier in the queue.

## 8. Out of Scope for This Spec

The reasoning behind why PRO licensing is deferred at POC stage, session thresholds that would change that, and the internal risk position are documented separately and intentionally kept out of this file and out of the repo. This spec exists to build the form, not to explain the legal posture behind it.
