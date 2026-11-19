# Workforce access patterns: group access + sub-access derivation

Several matrix rows describe Pryv's access-control surface as
"per-stream permissions; access is the unit of authorization":

- `hipaa-security.164.308(a)(3)(ii)(C)`: Termination procedures
- `hipaa-security.164.308(a)(4)(ii)(B)`: Access Authorization
- `hipaa-security.164.308(a)(4)(ii)(C)`: Access Establishment +
  Modification
- `iso-27001.A.5.16`: Identity management
- `iso-27001.A.5.18`: Access rights

An implementer evaluating Pryv for a workforce-oriented deployment
(hospital with 100 nurses + 30 attending physicians + 10 admin
staff, etc.) will ask how Pryv handles **role / group abstractions**
on top of the per-access model. Pryv does not ship roles + groups
*inside* the platform, group membership is deliberately external,
but provides **two composable patterns** that cover the realistic
workforce-control needs. A **third pattern** (Pattern 3 below,
open-pryv.io 2.0.0-rc.53): a group that shares one Pryv account
reaches patient data through cross-account consent, each member
under an access of their own minted by the group's core, so the
implementer needs no backend of their own.

## Pattern 1: Group access + per-caller audit

A single access token can be granted to a group (e.g., "nurses"),
with the group membership managed *outside* Pryv by the
implementer's IdP / IGA / hospital identity system.

**Wire format:** the API request carries auth in the form
`Authorization: <TOKEN> <CALLERID>` (token + space + caller id).
Pryv parses the auth string and captures the caller id alongside
the access id.

**Audit semantics:** the stored `createdBy` and `modifiedBy` fields
become `<accessId> <callerId>` (space-separated). Audit log rows
likewise carry both. So an auditor reviewing "who did what" sees
the group identity (via the access id) AND the acting individual
(via the caller id) on every action.

**Trust model:** Pryv trusts the access-token holder (the
implementer's app / IdP) to forward a truthful caller id. Caller
id is not separately authenticated by Pryv, it's a label the app
provides. The chain of trust is:
1. The external IdP authenticates the individual.
2. The implementer's app calls Pryv with the group token + the
   authenticated individual's id as `callerId`.
3. Pryv records both.

If the implementer's app lies about the caller id, the audit log
contains a fiction. The mitigation is that the implementer's app
is itself audited / hardened / under the same compliance regime as
the Pryv deployment.

**Code (open-pryv.io):**
- `components/business/src/MethodContext.ts` `parseAuth()`,
  splits the auth header on the first space character.
- `components/business/src/accesses/refs.ts` `composeStoredRef()`,
  composes the `<accessId> <callerId>` storage form.

**When to use this pattern:**
- The group is large and high-churn (100s of staff, weekly
  joiners/leavers).
- Group-level access management (start/stop the whole group)
  matters more than per-individual revocation latency.
- The implementer already runs a trusted IdP / IGA system that
  authenticates individuals.

**Compliance benefit:** per-individual audit accountability without
the cost of provisioning per-individual accesses in Pryv. HIPAA-
Security §164.308(a)(3)(ii)(C) Termination, terminating an
individual means removing them from the external group; no Pryv-
side action needed. ISO 27001 A.5.16 identity lifecycle delegates
to the external IdP.

## Pattern 2: Seed access for sub-account derivation

An "app" access can be the seed for sub-accesses. The app holding
the seed can create individual sub-accesses for each group member
on demand; each sub-access is independently revocable; the seed
access can list / manage all its children.

**Mechanism:** when an access creates another access via
`accesses.create`, Pryv records the creating access's id as the
new access's `createdBy`. The set of accesses where
`createdBy = <seed>` is the seed's managed children. The seed can
list them (`accesses.get` filtered by `createdBy`), modify them
(`accesses.update` if their `createdBy` matches), and delete them
(`accesses.delete`).

**Code (open-pryv.io):**
- `components/api-server/src/methods/accesses.ts`,
  `query.createdBy = currentAccess.id` filters on listing /
  modification; `isManaged = createdByBase === context.access.id`
  gate on management operations.

**When to use this pattern:**
- Per-individual revocation matters (a single nurse's access
  yanked without affecting the rest of the group).
- Group-level operations need to compose (deleting the seed through
  `accesses.delete` deletes its children with it; a child can never
  outlive the seed's expiry; widening the seed does not widen its
  children, and narrowing the seed's permissions or expiry is
  refused while a child would fall outside the new bounds
  (`cannot narrow access: would orphan managed shared accesses`,
  `offendingChildren` lists them), so your role engine narrows or
  deletes those children first).
- The implementer wants Pryv to be the source of truth for
  per-individual access state (audit, expiry, scope).

**Trade-off:** higher Pryv-side state cost (N sub-accesses for N
group members), but full per-individual control.

**Across accounts.** The seed can be a cross-account (CMC) data
grant: an offer that sets `request.accessType: 'app'` (since
open-pryv.io 2.0.0-rc.9, default `'shared'`) makes the grant the
person accepts delegable, so the requester can derive per-member
sub-accesses on the person's account from it. In this pattern that
derivation runs in the requester's own backend, which holds the
grant token; Pattern 3 moves it to the group's Pryv core. Every
cross-account withdrawal path (`accesses.delete` of the grant,
`consent/revoke-cmc`, the reference account app's consent page, the
requester withdrawing, a delegation detach, account deletion) deletes
the sub-accesses derived from the grant with it, since open-pryv.io
2.0.0-rc.52 (`96af58ad`; tests `[MAAC]`, `[CMCHS-APPGRANT]`). On
earlier releases only `accesses.delete` of the grant did;
`bin/access-scope-audit.js` (read-only) lists sub-accesses an earlier
withdrawal left behind, for review and deletion.

**Compliance benefit:** clean §164.308(a)(3)(ii)(C) termination,
individual sub-access deleted, others untouched, audit row
records the revocation timestamp. ISO 27001 A.5.18 access-rights
lifecycle is per-individual + the seed allows efficient bulk
operations.

## Pattern 3: Group account over CMC, server-minted member accesses

**Status.** Shipped in open-pryv.io 2.0.0-rc.53 (release commit
`61fb28dd`, 2026-10-15). Tracked at
https://github.com/pryv/open-pryv.io/issues/158 (v2 board card
https://github.com/orgs/pryv/projects/5?pane=issue&itemId=271216458&issue=pryv%7Copen-pryv.io%7C158).
Wire reference: `open-pryv.io/components/cmc/IMPLEMENTERS-GUIDE.md`
and the release notes (`CHANGELOG-v2.md`, 2.0.0-rc.53). Integration
tests `[CMCGA]` (`components/api-server/test/cmc-group-accounts.test.js`);
unit tests `[CMCMB]` (member role and membership offer), `[CMCMA]`
(member access mint), `[CMCMR]` (offboarding) in
`components/cmc/test/`.

**The case.** A practice, a research team or a bridge shares one
Pryv account (the *group account*) and reaches patient data through
cross-account consent (CMC). Each member (a practitioner, a
researcher) has their own Pryv account and works from a static web
app: no implementer backend holds the group's grants or mints
anything.

**Mechanism:**

1. **Patients consent to the group.** A member publishes the invite
   on the group account, on a team stream they hold `contribute` on
   (`:_cmc:apps:<app>[:<team>]`), with `request.accessType: 'app'`,
   so the grant each patient accepts is delegable (since
   open-pryv.io 2.0.0-rc.9). The invite's `createdBy` on the group
   account names the member who wrote it. A membership that a
   delegate administrator approved is not treated as a delegate
   token for these invites: the delegation guard does not apply to
   `consent/request-cmc` written through a membership `[DDG04]`. The
   reference account app's consent page tells the patient, in one
   line, that the grant is delegable to members of the group, from
   its first release after 0.21.0 (app-web-user-account).
2. **Members join through consent, not a role table.** The member
   writes a `consent/request-cmc` with `request.membership: true` on
   their own account and hands its capability URL (link or QR) to an
   administrator of the group (the account owner, or a delegate of
   the group account), who accepts it with a personal or delegate
   token and picks the teams (`request.allowUserChoice` is forced to
   `true`). The grant minted on the group account is the *membership
   access*, a `shared` access named
   `cmc-member:<appId>:<username>@<host>` with
   `clientData.cmc.role: 'member'` and `clientData.cmc.membership =
   { approvedBy, requestedScopes }` (`approvedBy` names the delegate
   and the delegation, or is `null` when the owner accepted)
   `[GA01]`, `[MB30]`, `[MB32]`: a two-sided consent record,
   withdrawable by either party. The server constrains what a
   membership offer may ask for, at write and again at accept:
   stream permissions on the group's user-creatable
   `:_cmc:apps:<app>[:<path>]` streams only (not the chat or
   collector streams, not `:_cmc:inbox`, not `*`), `read` or
   `contribute` at most, no feature permissions, never delegable
   (refused with `cmc-membership-permissions-invalid`) `[GA02]`,
   `[MB01]`..`[MB03]`, `[MB31]`; no chat channel is provisioned, and a
   chat or alert written through a membership is refused
   (`cmc-member-channel-not-supported`) `[MB21]`. A delegate
   administrator cannot approve a membership requested from their own
   account `[MB34]`.
3. **The group's core mints a per-member access on the patient's
   core.** The member writes `consent/member-access-cmc` (`{
   counterparty, scopeStreamId?, permissions?, expireAfter? }`) on a
   team stream of the group account. At write, the group's core
   checks that the writer is a membership access (personal and
   delegate tokens are refused too: `cmc-member-access-not-member`),
   that a patient relationship with a completed handshake sits under
   the member's team streams, that the requested stream permissions
   name data streams within what the patient's offer granted (never
   `*`, never a `:_cmc:` stream), the lifetime bounds
   (`cmc.memberAccess.minTtl` / `maxTtl`, default 60 s and 7 d; the
   default lifetime `defaultTtl` is 24 h), two budgets per membership
   counted for the whole core (new member accesses: `mintBurst` 5000
   at once, then `ratePerMinute` 1000 a minute; requests of any kind:
   `askBurst` 10000, then `askRatePerMinute` 3000 a minute; asking
   again for a live access spends no new-access budget; past either,
   `429` with `Retry-After`; since 2.0.0-rc.79, before which every
   ask counted, 30 per membership per minute per worker process) and
   one mint in flight per membership
   and patient (`maxInFlightPerMembership`, per worker process)
   `[GA12]`, `[GA15]`, `[GA16]`, `[GA17]`, `[CMCMA]`. The budgets pace
   a membership; what ends its reach is its expiry and its revocation. Then, through the patient's grant,
   it creates on the patient's core a `shared` child access with a
   server-derived name (`cmc-member--<member>--<hash>`) that never
   outlives the membership's own expiry `[GA14]`. The patient's core
   completes the child's `clientData.cmc` stamp with the group, the
   grant id, the scope and the app code, taken from the authenticated
   grant, never from the request; from a delegable grant it accepts
   only the exact member stamp (`cmc-member-stamp-invalid`
   otherwise) `[MB10]`..`[MB12]`. The child's endpoint (with its
   token) is returned once, in the synchronous `events.create`
   answer to the member's write; it is never stored on the trigger,
   logged, or retried `[GA10]`, `[MA50]`. Asking again for the same
   patient with the same permissions returns the same child while it
   has more than five minutes left; other permissions replace it
   `[GA11]`. The group's core keeps a hidden ledger of the children
   it minted (`:_cmc:_internal:members`), so the sweep below never
   depends on names.
4. **The member reads the patient's data directly** from the
   patient's core with that child access. A `shared` child cannot
   call `accesses.*`, cannot exceed the grant (the patient's core
   re-checks the bound; a refusal there is reported as
   `cmc-member-access-permissions-not-subset`), and cannot outlive it.
5. **Offboarding is a sweep.** Whenever a membership ends (the
   group revokes it, the member leaves, the membership access is
   deleted or expires, the delegate who approved it is detached and
   the owner does not keep it, the membership vanishes), the group's
   core deletes each child it minted for that member through the
   patient grants, reads each one back, and records the outcome per
   patient (`deleted`, `absent` or `residual`) on a server-written
   `consent/member-revoke-cmc` event on the membership's team stream,
   with the `reason` (`revoke`, `accesses.delete`, `expired`,
   `detach`, `vanished`, `narrowed`) `[GA20]`..`[GA23]`,
   `[MR20]`, `[MR30]`..`[MR33]`. When the membership access is only
   narrowed (an `accesses.update` removing teams, or a team stream
   deleted for good), only the children outside what it still covers
   are deleted (`narrowed`, the deleted stream named in
   `content.uncovered`) `[GA41]`, `[MR27]`, `[MR34]`. A residual (a
   patient core unreachable or refusing) fails the record with
   `cmc-member-revoke-residual`; the retry loop re-sweeps it (six
   attempts over about 30 minutes), then the periodic ledger pass
   (`cmc.memberAccess.sweepIntervalMs`, every minute by default, at
   most fifty residuals per pass) `[MR25]`, `[MR40]`; the child's own
   expiry bounds what a core that stays down keeps. Retries and the
   periodic pass need `cmc.retryLoop.enabled`, `true` by default since
   2.0.0-rc.53; with `false` a warning is logged at boot and a
   residual stays until the child expires `[MR42]`. When the group
   account itself is deleted, its children are deleted through the
   grants before the erasure, and no record is kept (the account is
   erased) `[GA40]`, `[MR28]`. A patient relationship the group ends
   has its member children deleted through the grant before the
   revoke is delivered.
6. **A patient's withdrawal ends every member access** derived from
   their grant, on every teardown path, since the cascade of
   open-pryv.io 2.0.0-rc.52 (`96af58ad`); the patient's core needs
   2.0.0-rc.52 or later `[GA24]`. Every such deletion is the
   `accesses.delete` deletion since 2.0.0-rc.53, so it leaves a
   deletion record readable with `includeDeletions` `[GA22]`,
   `[GA30]`.

**Audit and attribution.** Patient side: every call by a member
carries the child access id; the child's `createdBy` is the group's
grant and its stamped `clientData.cmc` names the member and the
group, so an account app can show "<member access> via <grant
name>", deleted accesses included (the reference account app does,
from its first release after 0.21.0). Group side: each mint is a
`consent/member-access-cmc` event written through the member's own
membership access, with the server-owned outcome (`member`,
`relationshipAccessId`, `memberAccess` without the endpoint,
`status`), and each sweep a server-written
`consent/member-revoke-cmc` naming the member; a member cannot change
or delete these records, the owner can `[GA42]`. A patient core on a
release earlier than 2.0.0-rc.53 refuses the stamp; the group's core
then mints the child with the member in its name only and reports
`attribution: 'name-only'` while `cmc.memberAccess.allowNameOnly` is
`true` (the default for now, expected to become `false` in a later
release) `[GA13]`.

**Versions.** The group's core and the member's core need
2.0.0-rc.53 (the member's core checks the membership request at write
and marks the accept in the member's inbox). A patient core on an
earlier release gets name-only attribution (above); the deletion of
member accesses when a patient withdraws needs 2.0.0-rc.52 or later
on the patient's core.

**Trust model.** Pryv attributes each action to a member's own
account credential, authenticated by that member's own sign-in (and
MFA where enabled), not to a label an app forwards (contrast
Pattern 1's `callerId`). It still attributes to the credential, not
to the human: the group remains responsible for vetting members and
for their not sharing credentials. The group account itself holds
every patient grant, so its owner and administrators are the trust
anchor: protect them with MFA, and grant `read` on the group's
`:_cmc:inbox` only to apps you would trust with every grant (the
inbox records each accepted invite with the grant's endpoint, by
design, so that access equals holding every grant token; this is
true of any CMC account, not specific to Pattern 3). Members sharing
a team stream see each other's invites and mint events; use
per-member sub-streams (`<team>:<member>`) where that matters.

**When to use this pattern:**
- The group reaches patient data through cross-account consent and
  the implementer does not want to run a backend that holds the
  group's grants.
- Each member should read under an access that names them on the
  patient's account, and leaving the group must end that access on
  every patient account.

**Compliance benefit:** per-member authorization by a recorded
consent act (the membership accept), per-member attribution stamped
by the server on the patient's account and recorded on the group's,
per-member termination swept by the platform instead of by the
implementer's code, and a patient-side record that shows which member
acted under which grant.

## When to combine

The patterns are complementary:

| Use case | Pattern |
|---|---|
| Large transient group with external IdP | 1 (group token + caller id) |
| Small stable team with strict per-person revocation | 2 (seed + sub-accesses) |
| Large group with both, group-level rev + per-person audit + occasional per-person revocation | 1 + 2 (seed access used by the IdP to provision sub-accesses on first access; per-call `callerId` adds the audit detail) |
| Practice / research team sharing one account, reaching patients through CMC, no implementer backend | 3 (membership by consent, member accesses minted and swept by the group's core; open-pryv.io 2.0.0-rc.53) |
| Same, with the implementer running its own backend (or a core older than 2.0.0-rc.53) | 2 across accounts (delegable CMC grant, sub-accesses derived by the backend) + 1 if the backend acts for several people |

## What this is not

- **Not roles / RBAC inside Pryv.** No `role` primitive, no
  `role-to-permission` mapping, no hierarchy. The role abstraction
  lives entirely outside Pryv (in the implementer's IdP / IGA
  system). Pryv records the consequences (which accesses exist,
  what they grant) but not the role assignments. Pattern 3 does not
  change this: the group is an ordinary account, a "team" is a
  stream on it, and a membership is a consent relationship whose
  permissions name those streams. There is no organisation entity,
  no role name, no role-to-permission mapping and no hierarchy of
  groups; deciding who may join and which teams they get stays
  with the group's administrators.
- **Not group identity authentication.** The `callerId` in
  pattern 1 is a label, not an authenticated claim. The Pryv layer
  doesn't independently verify that the caller is who the
  implementer's app claims. (In Pattern 3 each member authenticates
  as their own account; Pryv still does not verify who the human
  behind that account is.)
- **Not a directory service.** Pryv doesn't maintain "list of all
  workforce members"; that's the IdP's job. Pryv knows about
  accesses (and through pattern 1, about caller ids it has seen);
  it doesn't enumerate group memberships. With Pattern 3 the group
  account's membership accesses are a list of the accounts its
  administrators approved, not a directory of people.

## Matrix rows that lean on these patterns

| Scope | Row | Pattern leveraged |
|---|---|---|
| hipaa-security | 164.308(a)(3)(ii)(C) Termination | 1 (drop from IdP) + 2 (delete sub-access); 3 (membership end sweeps member accesses) |
| hipaa-security | 164.308(a)(4)(ii)(B) Access Authorization | 2 (mint sub-access per individual); 3 (membership accept is the authorization act) |
| hipaa-security | 164.308(a)(4)(ii)(C) Establishment + Modification | 2 (seed manages children); 3 (narrowing a membership sweeps what falls outside) |
| hipaa-security | 164.312(a)(1) Access control | 3 (member accesses bounded by membership, offer and grant) |
| hipaa-security | 164.312(a)(2)(i) Unique user identification | 1 (callerId IS the per-person identifier on a group token); 3 (member stamped by the server) |
| hipaa-security | 164.312(b) Audit controls | 3 (per-member attribution on the patient's and the group's trail) |
| iso-27001 | A.5.15 Access control | 3 (member accesses bounded by membership, offer and grant) |
| iso-27001 | A.5.16 Identity management | 1 (external IdP) + 2 (Pryv-side per-individual access); 3 (member accounts) |
| iso-27001 | A.5.18 Access rights | 1 + 2; 3 (rights follow the membership) |
| iso-27001 | A.6.5 Post-termination responsibilities | 1 (IdP removes) + 2 (seed deletes); 3 (sweep) |
| gdpr | Art.7 Conditions for consent | 3 (the patient consents to a delegable grant; withdrawal ends member accesses) |
| gdpr | Art.29 Processing under the authority | 1 (caller id ties action to a workforce member); 3 (member access names the member) |
| gdpr | Art.32 Security of processing | 3 (access-control bullet) |
| soc2 | CC6.2 Credential issuance + de-provisioning | 3 (approved before issued, swept on removal) |
| soc2 | CC6.3 Least privilege | 2; 3 (short-lived per-patient member accesses) |
| iso-27701 | A.7.4.7 Records of PII processing | 1 (callerId on audit row enriches the register) |

These rows should reference this document via their `detail` block
when an implementer is likely to ask the workforce-control
question explicitly. The rows citing Pattern 3 carried a `planned:`
chip until open-pryv.io 2.0.0-rc.53 shipped it; their Pattern 3
claims hold for a group's core, member's core and patient's core on
that release (see "Versions" under Pattern 3).

## Related primitives

- `access`: the unit of authorization; pattern 1 shares one across
  a group, pattern 2 derives many from a seed, pattern 3
  has the group's core derive them from patient grants.
- `audit`: captures both `accessId` and `callerId` per call.
- `permissions`: per-stream + per-level scope carried by every
  access (seed or shared).
- `CMC`: the cross-account consent the group's patient grants and
  its memberships are made of. See
  [`cmc-consent-primitives.md`](./cmc-consent-primitives.md).
- `delegation`: delegates of a group account can act as
  membership administrators; see
  [`delegation-model.md`](./delegation-model.md).
- `system-streams`: for sensitive workforce metadata (role labels,
  IdP-side group memberships) the implementer can keep on a
  privileged subtree.
