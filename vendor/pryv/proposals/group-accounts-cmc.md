# Group accounts over CMC: member accesses without an implementer backend

**Status: shipped in 2.0.0-rc.53 (61fb28dd)**, open-pryv.io release of 2026-10-15
(feature commits `0f21ea91`, `0c176116`, `96e6e07e`, `a9c2fd59`, `155367dd`, `196de2c5`,
review rounds `6823813d`, `34de3219`, `fb9cc5db`, `c73d9847`, `ab48bb19`, `718a5dab`,
`1fce65a5`). The withdrawal cascade it depends on shipped in 2.0.0-rc.52 (`96af58ad`,
2026-10-14). All 15 chips discharged and the rows rewritten on 2026-10-15; see
`UPDATE-TRIGGERS.md` Section A `GROUP-ACCOUNTS-CMC` for the per-row record. The text below
is the proposal as filed (2026-10-14) and is kept as history: where the shipped behaviour
differs (the mint is refused to the group's personal and delegate tokens, the in-flight
limit is per membership and patient, a member asks for named data streams only, a member
access never outlives its membership, every teardown leaves a deletion record), the rows,
`context/workforce-access-patterns.md` Pattern 3 and the release notes are authoritative.
Not yet released at that date: the reference account app's consent notice, memberships
view and audit display (app-web-user-account, first release after 0.21.0), `@pryv/cmc`
3.21.0 and the reference member app.
**Delivery vehicle:** a scheduled open-pryv.io release (with data-types, `@pryv/cmc` and the
reference account app), tracked by a public issue, not a backlog file. This mirror exists
so the affected rows can carry `planned:` chips and a reader can see what will change.
**Filed:** 2026-10-14, from a product question: should a practice, a research team or a
bridge that shares one Pryv account be able to reach patient data through CMC without
running a backend?
**Slug:** `GROUP-ACCOUNTS-CMC` (Section A of `UPDATE-TRIGGERS.md`).
**Tracking:** https://github.com/pryv/open-pryv.io/issues/158, v2 board card
https://github.com/orgs/pryv/projects/5?pane=issue&itemId=271216458&issue=pryv%7Copen-pryv.io%7C158

**Surfacing question:** *"Our practice has one Pryv account; patients consent to it. Each
practitioner should read a patient's data under an access that names them, and lose it the
day they leave, on every patient account. Can we do that from a static web app, without a
server of our own?"*

## State today (verified on open-pryv.io master, 2.0.0-rc.51)

| Control | Status | Anchor |
|---|---|---|
| A CMC offer can make the grant the person accepts delegable (`request.accessType: 'app'`) | ✅ since 2.0.0-rc.9 | `components/cmc/src/acceptOrchestration.ts` `accessTypeFromOffer` |
| An `app` access derives `shared` children, bounded by its permissions and expiry; `accesses.delete` of the parent (the API route) deletes them | ✅ | `components/api-server/src/methods/accesses.ts`, `components/business/src/accesses/AccessLogic.ts` |
| Per-member accesses on a patient account, derived from the group's grant | ⚠️ only in the implementer's own backend, which must hold the grant token | workforce Pattern 2 across accounts |
| The member named on the patient's account | ⚠️ in the access name or a forwarded `callerId` only (labels the implementer's code chooses) | `context/workforce-access-patterns.md` Pattern 1 |
| A member leaving ends their accesses on every patient account | ❌ the implementer's backend must find and delete them | none |
| Group membership as a recorded, two-sided consent | ❌ no notion of membership; group membership is external | none |
| The person's cross-account withdrawal (`consent/revoke-cmc`, the reference account app, a delegation detach, account deletion) ends the accesses derived from the grant | ❌ today those paths remove the grant only; derived accesses live until their own expiry. Fix scheduled ahead of this release | `components/cmc/src/mallAccessesAdapter.ts` `delete` (single row), `handleRevoke.ts`, `handleIncomingRevoke.ts` |

## After shipping (as designed; wire shapes may change until release)

- **Membership by consent.** The member writes `consent/request-cmc` with
  `request.membership: true` on their own account and hands the capability URL (link or
  QR) to an administrator of the group (the owner, or a delegate of the group account),
  who accepts it and chooses the teams (streams). The grant on the group account is the
  membership access (`clientData.cmc.role: 'member'`, `membership: { approvedBy,
  requestedScopes }`). The server constrains membership offers at write and at accept:
  `:_cmc:apps:*` stream permissions only, `read` or `contribute` at most, no feature
  permissions, never delegable, never `:_cmc:inbox`
  (`cmc-membership-permissions-invalid`).
- **Server-minted member access.** `consent/member-access-cmc` written by a membership
  access makes the group's core create, through the patient's grant, a `shared` child on
  the patient's core: server-derived name, permissions a subset of the offer, expiry 24 h
  by default (60 s to 7 d, `cmc.memberAccess.*`), `clientData.cmc` stamped by the
  patient's core with the member and the group. The token is returned once in the
  synchronous response, never stored, logged or retried. Gate errors at write
  (`cmc-member-access-not-member`, `-relationship-not-found`, `-scope-outside-membership`,
  `-permissions-not-subset`, `-expiry-out-of-range`, `-rate-limited`, `-in-flight`) and on
  the trigger (`-grant-not-delegable`, `-peer-rejected`, `-peer-unreachable`,
  `-membership-gone`).
- **Offboarding sweep.** Every end of a membership (revoked by the group, left by the
  member, membership access deleted or expired, approving delegate detached, account
  deleted) deletes the member's children through the grants (a narrowed membership: the
  children outside it), confirms by read-back
  and records residuals on a server-written `consent/member-revoke-cmc`; retried when
  `cmc.retryLoop.enabled: true`, re-run periodically, bounded by child expiry.
- **Patient withdrawal** ends every member access derived from the grant, on every
  teardown path.
- **Attribution.** Patient side: child id on every audit record, `createdBy` = the grant,
  member and group in the stamped `clientData.cmc`; the reference account app shows
  "<member access> via <grant name>", deleted accesses included. Group side: mint and sweep
  events name the member. Older patient cores: name-only attribution for one release cycle
  (`cmc.memberAccess.allowNameOnly`), then refused.
- **Consent notice.** The reference consent page tells the patient, in one line, when the
  offer's grant is delegable.
- **Not in scope:** an organisation entity, roles inside Pryv, member chat through the
  member access, a directed "join" delivery.

## Affected matrix rows

| Scope | Ref | Today | Kind | Impact | After shipping |
|---|---|---|---|---|---|
| hipaa-security | 164.308(a)(3)(ii)(C) | Implemented, High | feature | medium | termination of a group member is swept by the platform on every patient account, not by implementer code |
| hipaa-security | 164.308(a)(4)(ii)(B) | Implemented, High | feature | low | the membership accept is a recorded authorization act; member accesses are issued only under it |
| hipaa-security | 164.308(a)(4)(ii)(C) | Implemented, High | feature | low | narrowing a membership sweeps what falls outside it |
| hipaa-security | 164.312(a)(1) | Implemented, High | feature | low | a new derived access path, bounded by membership, offer and grant |
| hipaa-security | 164.312(a)(2)(i) | Implemented, High | feature | medium | each member identified by their own account, stamped by the server on the patient's access (not a forwarded label) |
| hipaa-security | 164.312(b) | Implemented, High | feature | low | per-member attribution on the patient's and the group's trail |
| iso-27001 | A.5.15 | Implemented, High | feature | low | access-control rule for member accesses |
| iso-27001 | A.5.16 | Implemented, High | feature | low | member identity lifecycle inside Pryv for this case |
| iso-27001 | A.5.18 | Implemented, High | feature | low | provision / review / modify / remove of member rights |
| iso-27001 | A.6.5 | Facilitated, Medium, primitive | feature | low | post-termination technical removal swept by the platform |
| gdpr | Art.7 | Implemented, High | feature | low | consent to a delegable grant, stated to the patient; withdrawal ends member accesses |
| gdpr | Art.29 | Facilitated, High, primitive | feature | low | each member's processing scoped and attributed under the grant the controller (or its processor) holds from the data subject |
| gdpr | Art.32 | Facilitated, High, infrastructure | feature | low | access-control bullet: member accesses short-lived, scoped, swept |
| soc2 | CC6.2 | Implemented, High | feature | low | member credentials issued after approval, removed with the membership |
| soc2 | CC6.3 | Implemented, High | feature | low | least privilege: per-patient, short-lived member accesses |

No coverage tier is expected to change: every row is already at the tier its claim
supports; the chips mark that the row's text (and, for the two `medium` rows, the
strength of the evidence) will change.

Rows to walk at release without a chip: `hipaa-security.164.312(d)` (members authenticate
as their own accounts, mechanism unchanged), `soc2.CC6.1` (no new authentication path or
architecture), `iso-27701.A.7.4.7` (records of processing: the new events are CMC
records, already covered), the DSAR and accounting-of-disclosures families (a patient's
personal token lists member accesses like any access; every member read is an audited
call under an attributable access), the erasure family (account deletion also sweeps
member accesses), and the B.2 rows (`gdpr.Art.20`, `hipaa-privacy.164.514`,
`soc2.PI1.1`, `PI1.2`, `P7.1`: the two new formats are protocol records, not data).
Config keys to add to rows at release: `cmc.memberAccess.*`, `cmc.retryLoop.enabled`.
Context notes to finalise: `context/workforce-access-patterns.md` (Pattern 3),
`context/cmc-consent-primitives.md` ("Group accounts"), `context/delegation-model.md`
(delegates as membership administrators).

The chips carry no `backlog:` key (no backlog file; `planned.backlog` is optional in the
schema) and point `tracking_url` at the v2 board card above.
