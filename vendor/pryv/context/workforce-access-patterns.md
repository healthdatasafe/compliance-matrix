# Workforce access patterns — group access + sub-access derivation

Several matrix rows describe Pryv's access-control surface as
"per-stream permissions; access is the unit of authorization":

- `hipaa-security.164.308(a)(3)(ii)(C)` — Termination procedures
- `hipaa-security.164.308(a)(4)(ii)(B)` — Access Authorization
- `hipaa-security.164.308(a)(4)(ii)(C)` — Access Establishment +
  Modification
- `iso-27001.A.5.16` — Identity management
- `iso-27001.A.5.18` — Access rights

An implementer evaluating Pryv for a workforce-oriented deployment
(hospital with 100 nurses + 30 attending physicians + 10 admin
staff, etc.) will ask how Pryv handles **role / group abstractions**
on top of the per-access model. Pryv does not ship roles + groups
*inside* the platform — group membership is deliberately external —
but provides **two composable patterns** that cover the realistic
workforce-control needs.

## Pattern 1 — Group access + per-caller audit

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
id is not separately authenticated by Pryv — it's a label the app
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
- `components/business/src/MethodContext.ts` `parseAuth()` —
  splits the auth header on the first space character.
- `components/business/src/accesses/refs.ts` `composeStoredRef()` —
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
Security §164.308(a)(3)(ii)(C) Termination — terminating an
individual means removing them from the external group; no Pryv-
side action needed. ISO 27001 A.5.16 identity lifecycle delegates
to the external IdP.

## Pattern 2 — Seed access for sub-account derivation

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
- `components/api-server/src/methods/accesses.ts` —
  `query.createdBy = currentAccess.id` filters on listing /
  modification; `isManaged = createdByBase === context.access.id`
  gate on management operations.

**When to use this pattern:**
- Per-individual revocation matters (a single nurse's access
  yanked without affecting the rest of the group).
- Group-level operations need to compose (revoking the seed
  cascades to all children; updating the seed's permission scope
  doesn't auto-propagate — the role-engine refreshes children
  on a schedule or on-demand).
- The implementer wants Pryv to be the source of truth for
  per-individual access state (audit, expiry, scope).

**Trade-off:** higher Pryv-side state cost (N sub-accesses for N
group members), but full per-individual control.

**Compliance benefit:** clean §164.308(a)(3)(ii)(C) termination —
individual sub-access deleted, others untouched, audit row
records the revocation timestamp. ISO 27001 A.5.18 access-rights
lifecycle is per-individual + the seed allows efficient bulk
operations.

## When to combine

The patterns are complementary:

| Use case | Pattern |
|---|---|
| Large transient group with external IdP | 1 (group token + caller id) |
| Small stable team with strict per-person revocation | 2 (seed + sub-accesses) |
| Large group with both — group-level rev + per-person audit + occasional per-person revocation | 1 + 2 (seed access used by the IdP to provision sub-accesses on first access; per-call `callerId` adds the audit detail) |

## What this is not

- **Not roles / RBAC inside Pryv.** No `role` primitive, no
  `role-to-permission` mapping, no hierarchy. The role abstraction
  lives entirely outside Pryv (in the implementer's IdP / IGA
  system). Pryv records the consequences (which accesses exist,
  what they grant) but not the role assignments.
- **Not group identity authentication.** The `callerId` in
  pattern 1 is a label, not an authenticated claim. The Pryv layer
  doesn't independently verify that the caller is who the
  implementer's app claims.
- **Not a directory service.** Pryv doesn't maintain "list of all
  workforce members"; that's the IdP's job. Pryv knows about
  accesses (and through pattern 1, about caller ids it has seen);
  it doesn't enumerate group memberships.

## Matrix rows that lean on these patterns

| Scope | Row | Pattern leveraged |
|---|---|---|
| hipaa-security | 164.308(a)(3)(ii)(C) Termination | 1 (drop from IdP) + 2 (delete sub-access) |
| hipaa-security | 164.308(a)(4)(ii)(B) Access Authorization | 2 (mint sub-access per individual) |
| hipaa-security | 164.308(a)(4)(ii)(C) Establishment + Modification | 2 (seed manages children) |
| hipaa-security | 164.312(a)(2)(i) Unique user identification | 1 (callerId IS the per-person identifier on a group token) |
| iso-27001 | A.5.16 Identity management | 1 (external IdP) + 2 (Pryv-side per-individual access) |
| iso-27001 | A.5.18 Access rights | 1 + 2 |
| iso-27001 | A.6.5 Post-termination responsibilities | 1 (IdP removes) + 2 (seed deletes) |
| gdpr | Art.29 Processing under the authority | 1 (caller id ties action to a workforce member) |
| iso-27701 | A.7.4.7 Records of PII processing | 1 (callerId on audit row enriches the register) |

These rows should reference this document via their `detail` block
when an implementer is likely to ask the workforce-control
question explicitly.

## Related primitives

- `access` — the unit of authorization; pattern 1 shares one across
  a group, pattern 2 derives many from a seed.
- `audit` — captures both `accessId` and `callerId` per call.
- `permissions` — per-stream + per-level scope carried by every
  access (seed or shared).
- `system-streams` — for sensitive workforce metadata (role labels,
  IdP-side group memberships) the implementer can keep on a
  privileged subtree.
