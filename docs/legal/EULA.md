|                   |                                        |
| ----------------- | -------------------------------------- |
| **Version**       | 1.0                                    |
| **Last updated**  | August 17, 2026                        |
| **Licensor**      | Jamaal Ephriam, operating as IndieNode |
| **Governing law** | State of Florida, United States        |
| **Contact**       | contact@keyjayonline.com               |

## Preamble

IndieNode is licensed to you for use only under the terms of this Agreement. This Agreement covers IndieNode's web-based client surfaces — the embeddable widget, the static reader, the ambient field view, and the client-side site generator. It does not cover distribution through a native app store; use of any native app version of IndieNode would be governed by separate terms specific to that distribution.

This is the consent a Creator gives when submitting a Node to IndieNode. It governs submission and Node licensing specifically; it is not a general Terms of Use for visitors who only browse the ring.

**Relationship to the open-source license.** IndieNode's client software is separately licensed under **GPL-3.0-or-later** (see `LICENSE` in the project repository). That license governs the source code itself and grants broad rights to anyone who obtains it independently — copying, modifying, and redistributing it under GPL's own terms. This Agreement does not restrict, narrow, or replace those rights. It governs a different thing: your use of IndieNode as deployed and operated by the Licensor, and the terms under which you submit a Node to be included in the live, published `ring.json`. If you fork the source and run your own instance, this Agreement does not apply to that instance; the GPL does.

## Table of Contents

1. Definitions
2. What IndieNode Is
3. License Grant and Restrictions
4. Personal Data: Local Storage and Submission-Review Data
5. Node Submission and Content Types
6. Ownership Verification
7. Contribution License and Compensation Waiver
8. Moderation Standard
9. Media Hosting and Bandwidth
10. Money and Visibility
11. Performing Rights Organization (PRO) Disclosure
12. Personalization and Local-Only Data
13. Disclaimer of Warranty
14. Limitation of Liability
15. Termination
16. Intellectual Property Claims
17. Applicable Law
18. Contact Information
19. Miscellaneous

## 1. Definitions

- **"Agreement"** means this End User License Agreement.
- **"IndieNode" / "the Service"** means the client surfaces the Licensor operates: the embeddable widget, the static reader, the ambient field view, the client-side site generator, and the `/join` submission flow.
- **"ring.json"** means the single public data file that lists every published node. It is the actual product; every client surface reads from it.
- **"Node"** means an entry in `ring.json` representing a single creator's space — not a single work — including its associated metadata, tags, and linked media.
- **"Creator" / "you"** means the individual or entity submitting a Node.
- **"Contribution"** means the metadata, descriptive text, tags, and linked media a Creator submits through the submission flow.
- **"Licensor"** means Jamaal Ephriam, the operator of IndieNode.

## 2. What IndieNode Is

IndieNode is a lightweight, decentralized indie-creator discovery tool built around a public, static data file (`ring.json`). It is a webring, not a platform. There is no account system and no algorithmic recommendation engine deciding what surfaces. A Node represents a creator's own space, built from curated evidence of that creator's work in one of four declared content types: audio, comic, text, or game. Members' work circulates through an embeddable widget placed on the creator's own site, so traffic does not depend on IndieNode being a destination in its own right.

## 3. License Grant and Restrictions

3.1 The Licensor grants you a non-transferable, non-exclusive, non-sublicensable license to access and use IndieNode's client surfaces as permitted by this Agreement.

3.2 You may not resell, rent, lease, sublicense, or otherwise redistribute IndieNode's client software as your own product, separately from your rights under the GPL-3.0-or-later license described in the Preamble. This restriction does not apply to `ring.json` itself, which is intended to be publicly readable, or to sites exported by the client-side site generator, which belong to the creator who exported them.

3.3 The Licensor reserves the right to modify this Agreement. Material changes will be reflected in a version-tracked update, and this document's "Last updated" date and version number will change accordingly.

## 4. Personal Data: Local Storage and Submission-Review Data

4.1 **Browsing and personalization.** IndieNode requires no account to browse the ring, use the widget, or read a node. Any personalization — liked entries, playback queues, layout/arrangement of the field view — lives entirely in your own browser's local storage and is never transmitted to IndieNode's infrastructure. Export and import of your liked-entries list is available as a downloadable file under your own control. This paragraph describes the reading/browsing experience; it does not describe submission, which §4.2 covers separately.

4.2 **Submission review.** Submitting a Node is not anonymous and is not account-free in the same sense as browsing. The submission flow collects an email address and consent fields (see §5) and holds them, together with your Contribution, in a private review queue operated on the Licensor's behalf, until a maintainer approves or rejects the submission. This is: (a) used only for that submission's own back-and-forth — telling you a verification check failed, or that your Node was approved or rejected — and never repurposed as a mailing list or marketing contact; (b) never written to `ring.json` and never made public; (c) deleted once the submission is resolved, whether approved or rejected. Only the `ring.json`-shaped fields of an approved submission are carried forward into the published ring.

## 5. Node Submission and Content Types

5.1 Submissions are limited to four declared content types: comic, game, text, and audio. A Node represents a creator's space rather than a single-release showcase, built from fields specific to its declared type, for example, up to three audio tracks, comic pages, up to three text samples, or a game's screenshot and preview. A Node with no directly playable media (an audio entry that is a link-out only, for instance) is a supported shape, not a rejected one.

5.2 If you don't already have a site of your own to point to, IndieNode's built-in client-side site generator can build one for you from uploaded files (up to three works, an icon, and optional social links), exported as a downloadable site you host wherever you choose. IndieNode does not host it for you.

5.3 A Creator may link up to two Nodes across different content types under a shared, backend-assigned `creator_id`. This cap is a moderation-checklist rule, not a technically enforced limit or a subjective editorial judgment.

5.4 By submitting a Node, you represent that:

- You are the creator of the submitted work, or hold the necessary rights and permissions to submit it.
- The submitted work does not infringe any third party's copyright, trademark, or other proprietary rights.
- The declared content type accurately matches the submitted content.
- The submission does not violate applicable law.

5.5 **Updating or removing a Node.** To update an already-published Node's content, or to request its removal from `ring.json`, contact the Licensor directly at the address in §18.

## 6. Ownership Verification

6.1 **A self-owned space is the only path to verification.** Whether that space already existed before you submitted, or was just built for you by the site generator in §5.2, verification always works the same way:

1. The system issues a verification token bound to your submission.
2. You place that token at your `source_url` — as a meta tag or well-known path if you're linking a site you already control, or automatically embedded if the site was built by IndieNode's generator.
3. You press **Verify**, an explicit step inside the form. The check is automated and synchronous: it confirms the token is present at the destination in real time and reports pass or fail immediately, while you are still looking at the screen.

6.2 The token expires 24 hours after it is issued. If verification isn't completed within that window, a new token must be requested.

6.3 This is a checklist-based process, not an adversarial-proof one, and is consistent with the thin-moderation standard described in §8.

## 7. Contribution License and Compensation Waiver

7.1 **This is the operative consent you give by checking the EULA box at submission**, quoted here in full and unchanged from what is shown inline in the modal on `/join`:

> By submitting your work, you affirm that you hold full rights to what you are submitting, including that no third party, including any performing rights organization, publisher, co-writer, sample owner, or collaborator, holds a claim requiring separate compensation for its use on IndieNode. IndieNode does not collect revenue on the basis of any individual creator's work and operates on a donation only basis. You waive any claim to royalties or compensation from IndieNode arising from the display, distribution, or streaming of your submitted work on this basis. This waiver applies to the relationship between you and IndieNode and does not, and cannot, affect obligations IndieNode may independently hold to third-party rights organizations.

7.2 This section restates and elaborates that clause; it does not narrow or contradict it. This Agreement is intentionally narrower than a typical platform EULA — IndieNode does not claim broad or perpetual rights over your work. By submitting a Node, you grant the Licensor a royalty-free, non-exclusive license limited to:

- Displaying the submitted Contribution's metadata, `why` text, tags, and linked preview media within IndieNode's client surfaces.
- Linking to your `source_url` and creator-controlled media.
- Including your submission's public metadata within `ring.json` for the purpose of operating the webring.

7.3 This license does not grant the Licensor the right to rehost your media, sell your work, create derivative works from it, or use it for purposes beyond operating IndieNode's client surfaces. Media referenced in `ring.json` remains hosted on infrastructure you control; bandwidth cost for that media sits with you, not with IndieNode (§9).

7.4 You retain full ownership of your Contribution and all associated intellectual property. Requesting removal of your Node under §5.5 revokes the license granted under this section going forward. It does not retroactively undo distribution that already occurred through the webring's normal operation before that point.

## 8. Moderation Standard

Submission review is a checklist, not an editorial quality judgment: a valid URL, a working ownership-verification token, and a declared type matching the submitted content. Submissions are held in a private review queue and are not visible anywhere public until a maintainer approves them. The Licensor may decline or remove a submission that fails this checklist or that violates §5.4, but does not otherwise exercise discretionary editorial control over accepted content.

## 9. Media Hosting and Bandwidth

IndieNode does not rehost creator media. Every `media_url`, `image_url`, `thumb_url`, and `preview_url` must point to infrastructure the Creator controls — IndieNode's own domain is not a valid destination for any of these fields, and this is enforced at the data level, not only as a stated policy. IndieNode is not responsible for the availability of externally hosted media: a broken or unreachable link does not entitle a Creator to compensation, and does not, on its own, obligate the Licensor to any particular remedy.

## 10. Money and Visibility

IndieNode carries no ads and no third-party trackers, and funds its hosting costs, if at all, only through voluntary donations. Donating never changes what surfaces: there is no code path where a payment affects which Nodes appear, how often they rotate, or where they are placed in any client.

## 11. Performing Rights Organization (PRO) Disclosure

11.1 IndieNode's own web clients (widget, reader, field view) operate under blanket web licenses of the kind offered by performing rights organizations, covering the act of streaming linked audio through IndieNode's interface.

11.2 This blanket coverage applies to IndieNode's own operation. It does not substitute for a Creator's individual PRO membership obligations, if any, with respect to the media they host and link from their own infrastructure.

11.3 As part of the submission checklist, Creators submitting audio Nodes are asked to disclose PRO membership status (not a member / a named PRO such as ASCAP, BMI, SESAC, or GMR / other / not sure). This is a disclosure step for the Licensor's own visibility into PRO exposure across the ring — it is not a gate on submission eligibility, and no submission is accepted or rejected on the basis of this answer.

11.4 IndieNode's PRO and rights-organization licensing posture is addressed separately and is outside the scope of this Agreement.

## 12. Personalization and Local-Only Data

Likes, playback queues, and the "Play my Liked" feature operate entirely from data stored in your own browser, consistent with §4.1. Suggested expansions, such as continuing playback with related tagged entries, are always offered as an explicit, un-defaulted choice and never triggered automatically.

## 13. Disclaimer of Warranty

13.1 The Licensor warrants that IndieNode's client software is free of known malware at the time of release and functions as described in available documentation.

13.2 No warranty is provided for use that has been modified without authorization, combined with incompatible software, or affected by circumstances outside the Licensor's control.

13.3 Report defects to the contact address in §18. Defects reported within thirty (30) days of discovery will be investigated; the Licensor may remedy a confirmed defect through a fix or substitute delivery.

## 14. Limitation of Liability

The Licensor is not liable for damages arising from your use of IndieNode beyond what is required by applicable law. You are responsible for maintaining your own backups of any locally stored data, including liked-entries exports.

## 15. Termination

This license is valid until terminated by either party. It terminates automatically if you fail to adhere to its terms. Upon termination, you must stop using IndieNode's client surfaces; this does not require deletion of statically generated sites you have already exported and deployed independently under §5.2.

## 16. Intellectual Property Claims

If a third party claims that a submitted Node infringes their intellectual property rights, the submitting Creator is responsible for the investigation, defense, and resolution of that claim as it relates to their own Contribution, consistent with the representations made under §5.4.

## 17. Applicable Law

This Agreement is governed by the laws of the State of Florida, excluding its conflict-of-law rules.

## 18. Contact Information

For inquiries, complaints, claims, node updates, or removal requests concerning IndieNode, contact:

Jamaal Ephriam
contact@keyjayonline.com

## 19. Miscellaneous

19.1 If any term of this Agreement is found invalid, the remaining terms remain in effect, and the invalid term will be replaced with one that achieves its original purpose as closely as possible.

19.2 Amendments to this Agreement are valid only if made in writing and version-tracked, consistent with this document's own version header.
