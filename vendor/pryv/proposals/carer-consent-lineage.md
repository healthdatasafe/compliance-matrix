# Consent given by a carer (delegate) for the account they manage

**Status:** shipped in full. Delegate accept with lineage shipped in open-pryv.io
`9ba9c78c` (2.0.0-rc.30; feature commits `87bbdfb1`, `d495d5d4`, `29836b29`, merge
`bc7410e0`); reviewed detach shipped in `b77320df` (2.0.0-rc.31; reference account
app app-web-user-account 0.10.0, superseded by 0.11.0); consent invites in the
authorisation request shipped in `6496ffbb` (2.0.0-rc.32, merge `f262854b`;
app-web-user-account 0.11.0 `791e3ae`). Every chip of this slug is discharged and the
rows rewritten on 2026-10-01. **Delivery vehicle:** scheduled
open-pryv.io releases tracked by the three public issues below, not a backlog item.
There is no standalone backlog file; this mirror exists so the affected rows can carry
`planned:` chips and so a reader can see what will change and when.
**Filed:** 2026-10-01, from an implementer's carer-and-child onboarding request.
**Slug:** `CARER-CONSENT-LINEAGE` (Section A of `UPDATE-TRIGGERS.md`).
**Tracking:**

| Issue | What | Target release |
|---|---|---|
| https://github.com/pryv/open-pryv.io/issues/143 | a delegate may accept a cross-account consent for the account it manages; the minted data grant carries the delegation lineage; the delegate is recorded on the accept event; detaching the delegate revokes such grants and notifies the requester | open-pryv.io 2.0.0-rc.30 |
| https://github.com/pryv/open-pryv.io/issues/144 | reviewed detach: before a delegate is detached, the account holder reviews each consent that delegate gave and keeps or drops it (nothing kept by default) | open-pryv.io 2.0.0-rc.31 |
| https://github.com/pryv/open-pryv.io/issues/145 | consent invites carried inside the authorisation request, each presented and decided on its own, never implied by approving the app access | open-pryv.io 2.0.0-rc.32 |

Release targets are plans, not commitments; the chips carry them in `eta_release` and
move if a release slips.

**Surfacing question:** *"A parent manages their child's account. A study asks the
child's account to share data. Can the parent accept that for the child, and if they
do, will the record show it was the parent, and will the consent end when the parent
stops managing the account?"*

## State before this work (verified, open-pryv.io 2.0.0-rc.23 to rc.29)

| Control | Status | Anchor |
|---|---|---|
| A delegate grants an app access to the managed account through the auth request, with server-stamped lineage | ✅ | `clientData.delegation.kind: 'delegated-child'`, `[DCH01]`, `[DCH03]` |
| Grants made through a delegation are revoked when the delegate is detached | ✅ | `[DCH12]` |
| A delegate accepts a cross-account consent (`consent/accept-cmc`) for the managed account | ❌ refused | `delegation-grant-requires-owner`, `[DCH14]` |
| A delegate requests or rescopes a cross-account consent (`consent/request-cmc`, `consent/scope-update-cmc`) | ❌ refused | `[DCH14]` |
| A delegate gives OAuth2 consent for the managed account | ❌ refused | `403 access_denied`, `[OE27]` |

The CMC refusal exists because the cross-account data grant is minted outside the access
creation path that stamps lineage. Without lineage the grant would survive the end of the
delegation, so the platform refuses the accept rather than mint a consent that could
outlive the carer's authority. The consequence for you today: a carer must sign in as
the managed account itself to accept a cross-account consent, and the record does not
show that a carer acted.

## After shipping

### rc.30 (issue #143): the delegate may accept, and it is recorded

- A delegate token (or an access granted through a delegation) may write
  `consent/accept-cmc` on the managed account. Pryv stamps
  `content.approvedBy = { delegate, relId }` on the accept event from the authenticated
  access, and deletes any client-supplied `approvedBy` (non-forgeable, same rule as the
  lineage attribute). An accept written by the account holder carries no `approvedBy`.
- The data grant the accept mints carries the same lineage attribute as any other grant
  made through a delegation (`clientData.delegation.kind: 'delegated-child'`, naming the
  delegate), so `accessInfo` reports `delegation.grantedVia` on it.
- If the delegation ends before the accept is processed, no grant is minted (the trigger
  fails with `cmc-handler-delegation-ended`).
- Detaching the delegate revokes each such grant through the cross-account revoke path,
  so the requester is told the consent ended (delivery best-effort), instead of being left
  with a dead token.
- Unchanged: `consent/request-cmc` and `consent/scope-update-cmc` stay refused to
  delegation-derived tokens; OAuth2 consent stays owner-only (`[OE27]` stays cited).

**As shipped in rc.30 (`9ba9c78c`), differences from the plan above.** Detach
deletes the delegate's consent grants itself, synchronously and before it answers
(a hard delete, as every CMC revoke), then forwards `consent/revoke-cmc` to each
requester through the same notification path as a raw `accesses.delete`; it does
not write a `consent/revoke-cmc` trigger on the managed account. The subject-side
record of a consent ended by a detach is therefore the accept event (`approvedBy`,
`dataGrantAccessId`) plus the audit row of `delegations.detachDelegate`; a
per-grant withdrawal marker on the accept event moves to rc.31. The writable token
is the delegate token itself: an app or shared access the delegate granted stays
refused by the CMC personal-token gate. Tests: `[DCH15]` (lineage, `approvedBy`,
`access-info`), `[DCH16]` (`approvedBy` not client-settable), `[DCH17]` (request and
scope-update stay owner-only), `[DCH18]` (detach deletes and notifies), `[DCH19]`
(accept in progress at detach mints nothing); `[DCH14]` now asserts the narrowed
refusal.

### rc.31 (issue #144): reviewed detach

- `delegations.detachDelegate` gains `keepAccessIds`: the account holder (genuine login)
  reviews the consents the delegate gave and keeps or drops each; nothing is kept unless
  chosen. A kept grant loses its lineage attribute and its accept event gains
  `ownerConfirmedAt`, so it becomes the holder's own consent with the history preserved.
  Dropped grants are revoked with notification, as in rc.30, and their accept
  events gain a withdrawal marker.
- This is the technical shape of a young person reclaiming their account at majority:
  they decide, consent by consent, which of the carer's decisions they adopt.

**As shipped in rc.31 (`b77320df`).** One call, `delegations.detachDelegate { username,
keepAccessIds? }` (over HTTP, repeated `keepAccessIds` query parameters). Every id must
name a consent grant (a CMC data grant with `clientData.cmc.role === 'counterparty'`)
carrying the lineage of the relationship being removed; otherwise the whole call is
refused before any write (`400`, `delegation-invalid-keep-list`, `error.data.accessId`
names the first id refused). Kept: `clientData.delegation` removed from the grant (it is
then the holder's own, `access-info` reports no delegation, the requester is told
nothing) and `content.ownerConfirmedAt` on the accept event, `approvedBy` kept as
history. Dropped: deleted and notified as in rc.30, plus `content.withdrawal = { at, by:
'delegation-detach', relId }` on the accept event. `approvedBy`, `ownerConfirmedAt` and
`withdrawal` form one server-owned record: dropped from any client create, restored from
the stored event on any client update, never added by an update, by any token. The
other accesses granted through the delegation are deleted whatever the keep list. The
keep-list check reads the relationship's accesses before any write; the sweep re-reads
them after the delegate token is deleted, so a grant minted during the deletion is still
caught. Page rule (reference account app): nothing preselected; a grant whose accept
event is not `completed` (delivery to the requester never finished) is shown as not
delivered and cannot be kept; when the consents cannot be listed, nothing is removed;
after the call the page reports the consents that actually survived. Tests: `[DCH21]`
(keep path), `[DCH22]` (drop path, withdrawal marker), `[DCH23]` (foreign id refused,
nothing changed), `[DCH24]` (markers cannot be forged or erased through the API),
`[DDK07]` (withdrawal vs confirmation markers), `[APB08]`..`[APB12]` (server-owned field
hook); app-web-user-account `[DKP7]` (undelivered grant cannot be kept), `[DKP8]`
(listing failure removes nothing).

### rc.32 (issue #145): consent invites in the authorisation request

- An app may carry cross-account consent invites inside its authorisation request. The
  authentication page presents each invite as its own block with its own Approve and
  Decline, never implied by approving the app access, and accepts them before granting
  the app access. Outcomes returned to the app are hints; the authoritative record is
  the accept event on the subject's account.

**As shipped in rc.32 (`6496ffbb`).** `POST /reg/access` accepts `cmcInvites: [{
capabilityUrl, mandatory?, for? }]`: 1 to 8 entries, each `capabilityUrl` an absolute
http(s) URL of at most 2048 characters, `mandatory` boolean (default `false`), `for`
`'self'` (default) or `'target'`; anything else `400 invalid-parameters`; stored
normalised, echoed on the 201 answer (the detection signal: an older core drops the
field) and on NEED_SIGNIN; the request size ceiling still applies. With `ACCEPTED` the
page posts one outcome per invite under `cmcInvites` (`{ acceptEventId,
dataGrantAccessId?, acceptedFor?: 'self' }`, `{ declined: true }` or `{ reason }`);
the core checks length and shape before any write, refuses them on another status or
on a request without invites, stores them as `cmcInviteOutcomes` (never read from the
posted body) and serves them as `cmcInvites` in every ACCEPTED answer, inline or
hand-off. Two reserved `reasonId`s on REFUSED: `REFUSED_MANDATORY_CONSENT` (a mandatory
invite declined) and `MANDATORY_CONSENT_FAILED` (a mandatory invite could not be
accepted). Reference account app 0.11.0: decide, then accept (mandatory first), then
grant; each invite its own block with its own Approve and Decline; declines answered
with `consent/refuse-cmc`; `for: 'target'` accepted with the delegate token on the
managed account. Capability URLs stay in the request (core memory only, at most one
hour). Tests: `[RCI1]`..`[RCI9]`; app-web-user-account `[ACI2]` (declined mandatory
refuses before any write), `[ACI14]` (declines answered with a refusal before the
grant).

## Affected matrix rows

| Scope | Ref | Today | Kind | Impact | Release | After shipping |
|---|---|---|---|---|---|---|
| gdpr | Art.7 | Implemented, High | feature | medium | rc.30 | the "consent given by a delegate" paragraph extends to cross-account consent: the accept event names the delegate (`approvedBy`), the grant carries lineage, ends with the delegation and the requester is notified; `[DCH14]` replaced by the new tests. No tier change is possible (already at the top tier); the demonstrability claim gains a new recorded consent path. |
| gdpr | Art.7 | same | feature | low | rc.31 | withdrawability paragraph: owner review at detach, nothing kept by default, `ownerConfirmedAt` on kept consents. |
| gdpr | Art.7 | same | feature | low | rc.32 | §2 "clearly distinguishable": consent invites decided one by one, separately from the app access, in the same authorisation flow. |
| gdpr | Art.8 | Facilitated, Medium, primitive | feature | medium | rc.30 | the parent can accept a cross-account consent for the child, recorded with the parent named and ended with parental control; `pryv_effort_saved` may move medium → high once both releases ship. |
| gdpr | Art.8 | same | feature | medium | rc.31 | owner reclaim at majority extends to consents: the young person reviews the parent's consents at detach and keeps only what they choose. |
| hipaa-security | 164.312(a)(1) | Implemented, High | feature | low | rc.30 | "Apps granted access through a delegation" paragraph: CMC accept leaves the refusal list, the data grant carries the lineage and is revoked with the delegation; `[DCH14]` replaced, `[OE27]` kept. |
| iso-27001 | A.5.15 | Implemented, High | feature | low | rc.30 | same correction as 164.312(a)(1): the access-control rule for delegated grants now covers CMC data grants; refusal list shrinks to request / scope-update / OAuth2. |

Why these rows carry a chip: each states today, in its detail text or its `tests:`, that a
delegate cannot accept a cross-account consent (`[DCH14]`), or describes the parental /
consent claim this work extends. After rc.30 that statement is no longer true, so a reader
should see that the row is about to change.

Rows to walk at release without a chip (their claim does not shift, only a sentence or a
test citation): `gdpr.Art.32` (the "Delegate-account control" bullet lists CMC accept
among the refused paths), `hipaa-privacy.164.502(g)` (the representative may also accept
a cross-account consent for the individual), `hipaa-security.164.312(b)` (the accept
event names the delegate), `soc2.CC6.2`, `soc2.CC6.3`, `iso-27001.A.5.16` (lifecycle of
grants made under a delegate's authority, now including CMC data grants). Context notes to
update at the same time: `context/delegation-model.md` ("Accesses granted through a
delegation") and `context/cmc-consent-primitives.md` (gates section).

The chips carry no `backlog:` key: the work is delivered by scheduled platform releases,
not a backlog file, and `planned.backlog` is optional in the schema. The `tracking_url`
pointed at the v2 board card
(https://github.com/orgs/pryv/projects/5?pane=issue&itemId=259442555).

**Discharged 2026-10-01.** Every chip above is removed from the rows: rc.30 on
`gdpr.Art.7`, `gdpr.Art.8`, `hipaa-security.164.312(a)(1)`, `iso-27001.A.5.15`; rc.31 on
`gdpr.Art.7` and `gdpr.Art.8`; rc.32 on `gdpr.Art.7`. No tier shifted: `gdpr.Art.7` was
already at the top tier, and the `gdpr.Art.8` `pryv_effort_saved` move medium to high
named above is left to the next review pass of that row. The row-by-row walk, with the
test codes added, is in `UPDATE-TRIGGERS.md` Section A under `CARER-CONSENT-LINEAGE`.
