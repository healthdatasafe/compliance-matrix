# Proposal: username aliases as a Pryv-native pseudonymization primitive

**Status:** shipped in `open-pryv.io` `4054c67a` (`accesses.create
{randomAlias:true}` → routable `r-XXXXXXXX` alias, returned by `access-info`;
tested on PostgreSQL + SQLite; PG platform engine conformance-green). The
related changeable-username feature (`account.changeUsername`) shipped in the
same merge and reuses the alias mechanism (a superseded username is demoted to a
routable alias). The matrix rows in the `ALIASES` trigger can now be reclassified
(see UPDATE-TRIGGERS.md `ALIASES`).
**Hardening re-check (2026-10-29):** guarantees completed in `open-pryv.io`
`4547b32a` (released in 2.0.0-rc.66); see
"Re-check after the hardening" below.
**Alias-bound addressing shipped (walked 2026-11-09):** open-pryv.io
2.0.0-rc.69 (`784a9a47`) accepts an aliased access under its own alias only,
which lifts the limit recorded below; every citing row now states it from
rc.69, with earlier releases named as the gap. Same release: OAuth2 pairwise
subjects; 2.0.0-rc.76 (`6e3b241b`): address aliases. See the `randomAlias`
primitive and UPDATE-TRIGGERS.md B.9.
**Upstream backlog item:** macroPryv `_plans/XXX-Backlog/ALIASES.md`.
**Filed:** 2026-05-19, while backfilling the facilitation typology and
realising several matrix rows currently treat pseudonymization as
"app-layer" when an upstream backlog feature could make it Pryv-native.

## The upstream proposal in one paragraph

When creating an access with parameter `randomAlias: true`, the platform
mints a 10-character alias of the form `r-XXXXXXXX` (platform-unique).
The alias is returned by `access-info` as the `username` field. Works
for both `dnsLess: true` and `dnsLess: false` modes. From the access
holder's side, the alias is the only identifier they see; the
real-username-to-alias mapping is held by the platform / operator and
not exposed via the aliased access.

## Why the matrix cares

Multiple rows currently land at `facilitated` because Pryv does not
ship a native pseudonymization primitive, the implementer is left to
build a code-to-real-identifier mapping themselves on a designated
stream subtree. Once aliases ship, these rows could move toward
`configurable` (config key `auth.randomAlias`) or even `implemented`
(when the alias becomes the default for app/shared accesses):

| Scope | Row | Current | Could become |
|---|---|---|---|
| `gdpr` | Art.4, Definitions (pseudonymisation entry in the term table) | `facilitated` (storage) | `configurable`, alias IS the pseudonym |
| `gdpr` | Art.32 §1(a), pseudonymisation as a security measure | `facilitated` (multi-aspect infrastructure) | `configurable` per-row would name `auth.randomAlias` as the on switch |
| `hipaa-privacy` | §164.514(c), re-identification code | `facilitated` (storage(low)) | `configurable`, alias satisfies §514(c)(1)(ii) "not derived from / related to information about the individual" by construction (alias is random) |
| `iso-27001` | A.8.11, Data masking | `facilitated` (stream/system-streams) | `configurable`, alias masks the real username at the access layer |
| `iso-27701` | A.7.4.5, De-identification + deletion | `configurable` (current) | unchanged (deletion is already the primary mechanism), but stronger derives_from |
| `ccpa` | §1798.140(ae), Sensitive PI | `facilitated` (stream-isolation) | unchanged at row level, but the deployment-pattern recommendation shifts: don't store linkable identifiers, store aliases |

## What this proposal does not propose

- It does **not** propose redesigning pseudonymization as a separate
  field on `event`. The username-alias pattern is light-touch + plumbing-
  compatible with everything else.
- It does **not** propose a new `coverage` tier. The existing 5 tiers
  remain.
- It does **not** propose anything for `event.content` field-level
  pseudonymization. That's still application-layer (encode SSN as a
  hashed token in `event.content.subject_id` etc.). The alias proposal
  only addresses the *username* surface.

## Action items

1. **Track the upstream feature.** When `auth.randomAlias` ships,
   update §164.514(c), ISO 27001 A.8.11, and the GDPR Art.4
   pseudonymisation entry to cite it. Move coverage to `configurable`
   where the configuration is the alias toggle.
2. **Add aliases as a primitive.** When the feature ships, add an
   `aliases` entry to `docs/pryv-primitives.md` so future rows can
   cite it via `pryv_primitives: [aliases]`.
3. **Cross-link this proposal** from the affected rows' `detail` (not
   `overview`: proposals aren't decisions yet) so the matrix records
   the open question without overcommitting today.

## Upstream backlog item, verbatim

From macroPryv `_plans/XXX-Backlog/ALIASES.md`:

> Usernames can be aliased at access creation stage. When creating an
> access with parameter `randomAlias` a platform unique alias should be
> created.
>
> The alias should be 10 characters long, start with `r-` and should
> work `dnsLess=true` and `dnsLess=false`.
>
> We have to make sure that access-info returns this alias as username.

## Open questions to upstream

- Alias rotation: can the platform issue a new alias on demand for an
  existing access, or is the alias permanent for the access lifetime?
- Alias-to-real-username mapping recovery: is the mapping held by the
  operator (privileged admin lookup), or one-way only (the alias cannot
  be reversed)? The §164.514(c) "code that can be used to re-identify
  by the covered entity" expects the former; an irreversible alias
  would shift the row's coverage interpretation toward de-identified
  data per §514(a)-(b).
- Discoverability of the alias-username link in audit: does the audit
  row record the real username or the alias? For compliance evidence
  it matters whether the operator-internal review can connect activity
  to a real workforce member.

## Re-check after the hardening (2026-10-29, open-pryv.io `4547b32a`)

Two cross-model code reviews of the shipped feature found that the
pseudonymisation claim did not hold in every configuration. The fixes
merged to open-pryv.io master as `4547b32a` and shipped in 2.0.0-rc.66. Re-check of the rows this proposal cites:

| Property the rows rely on | Before `4547b32a` | From `4547b32a` | Evidence |
|---|---|---|---|
| The alias routes after a backup and restore | ❌ the alias index was not backed up: aliased accesses and former usernames answered `404` after a restore, and a former username was registrable by a third party | ✅ the per-user manifest lists `aliases`; the restore reserves them again and reports the ones another account or core took | `[BKAL1]`, `[BKAL3]` |
| The alias routes on a single core answering DNS (`dns.active`, not DNSless) | ❌ no name to core row for aliases and changed usernames: `NXDOMAIN` | ✅ rows written on every topology; existing single cores repaired by one run of `bin/reconcile-user-cores.js` | `[ALRT1]`, `[ALRT3]` |
| An aliased access cannot read the username through an account stream | ✅ on the default configuration (refuted finding), ⚠️ a custom account field named `username` or `usernameChangeCount` would have exposed the stored rows | ✅ such a configuration is refused at boot | `[AL08]`, `[SDB3]` |
| A refused create leaves no alias; alias count bounded | ❌ alias minted before the refusals; unbounded per account | ✅ minted after every check, given back on insert failure; `accesses.maxAliasesPerAccount` (default 1000) | `[AL10]`, `[AL11]`, `[AL12]` |

**Configuration note (rows: gdpr Art.32, hipaa-privacy 164.514(c),
iso-27001 A.8.11):** custom account field ids `username` and
`usernameChangeCount` are refused at boot; the operator setting
`accesses.maxAliasesPerAccount` bounds the aliases an account holds (an
expired access keeps its alias until it is deleted); `auth.usernameChangeLimit`
(default 2, `0` disables) bounds username changes.

**Limit, recorded on every row that cites the primitive:** the alias hides
the username from the holder of the access; it does not stop a holder who
already suspects which account it is from confirming the guess. The token
works under every name of the account, so a call with it under a guessed
username succeeds exactly when the guess is right (a sign-in probe under
the alias tells the two cases apart the same way). The rows therefore
describe the alias as pseudonymisation towards the holder, not as
unlinkability against guessing. Alias-bound addressing (a token accepted
only under its alias) was planned to lift this limit. *(It shipped in
open-pryv.io 2.0.0-rc.69; the rows were updated 2026-11-09, see the header.)*

**Not changed:** `audit.onUserDelete: pseudonymise` is still not
implemented (refused at boot); the alias is not an account-level
anonymisation verb for retention.

**Tier changes:** none. Rows walked: gdpr Art.4, Art.32; hipaa-privacy
164.514(c); iso-27001 A.8.11; iso-27701 A.7.4.5 (overclaim corrected: the
alias reduces identification during processing, it does not de-identify the
PII at the end of processing); ccpa 1798.140(ae); soc2 C1.1.
