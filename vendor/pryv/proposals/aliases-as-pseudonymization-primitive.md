# Proposal: username aliases as a Pryv-native pseudonymization primitive

**Status:** proposal (backlog feature exists upstream; matrix would benefit
when shipped).
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
ship a native pseudonymization primitive — the implementer is left to
build a code-to-real-identifier mapping themselves on a designated
stream subtree. Once aliases ship, these rows could move toward
`configurable` (config key `auth.randomAlias`) or even `implemented`
(when the alias becomes the default for app/shared accesses):

| Scope | Row | Current | Could become |
|---|---|---|---|
| `gdpr` | Art.4 — Definitions (pseudonymisation entry in the term table) | `facilitated` (storage) | `configurable` — alias IS the pseudonym |
| `gdpr` | Art.32 §1(a) — pseudonymisation as a security measure | `facilitated` (multi-aspect infrastructure) | `configurable` per-row would name `auth.randomAlias` as the on switch |
| `hipaa-privacy` | §164.514(c) — re-identification code | `facilitated` (storage(low)) | `configurable` — alias satisfies §514(c)(1)(ii) "not derived from / related to information about the individual" by construction (alias is random) |
| `iso-27001` | A.8.11 — Data masking | `facilitated` (stream/system-streams) | `configurable` — alias masks the real username at the access layer |
| `iso-27701` | A.7.4.5 — De-identification + deletion | `configurable` (current) | unchanged (deletion is already the primary mechanism), but stronger derives_from |
| `ccpa` | §1798.140(ae) — Sensitive PI | `facilitated` (stream-isolation) | unchanged at row level, but the deployment-pattern recommendation shifts: don't store linkable identifiers — store aliases |

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
   `overview` — proposals aren't decisions yet) so the matrix records
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
