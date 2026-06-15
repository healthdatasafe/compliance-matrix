# PlatformDB PII hashing / minimisation

**Proposal mirror of**: `_plans/XXX-Backlog/PLATFORMDB-PII-HASHING.md` (macroPryv).
**Filed during**: Plan 71 Q25 — cross-border PlatformDB analysis.

## Goal

Replace cleartext PII columns in PlatformDB (username, email,
DNS subdomain, indexed-field values) with HMAC-derived hashes
keyed by a cluster-shared pepper. Optionally **strip email out
entirely** (user's preferred posture per Q25). Reduces the
runtime-replicated PII exposure in multi-region clusters from
"cleartext crossing borders" to "HMAC crossing borders" — with
the email-uniqueness-check tradeoff for the minimised posture.

Three configurable postures:

| Posture | username storage | email storage | "find user by email" feature | Cluster-global email uniqueness |
|---|---|---|---|---|
| Today (default) | cleartext | cleartext | ✅ | ✅ |
| Hashed | HMAC | HMAC | ✅ (caller hashes before lookup) | ✅ |
| **Minimised (recommended for multi-region)** | HMAC | **not in PlatformDB** | ❌ | ❌ (home-core-local) |

Operator opts via new `platform.piiMode: cleartext | hashed | minimised`.

## Legal framing (honest)

Hashing is classified as **pseudonymisation, NOT anonymisation**
under EDPB / WP29 Opinion 05/2014 on Anonymisation Techniques.
Re-identification by "reasonable means" is feasible because:

- Input domain is low-entropy (usernames + emails are constrained
  formats; brute-force grinding at ~10⁹ HMAC/sec is tractable).
- Auxiliary information is in scope: cluster-shared pepper +
  runtime request paths carrying cleartext (DNS queries, HTTP
  `Host:`, login bodies on the receiving core).
- Recital 26 keeps such pseudonymised data **in GDPR scope**.

**An Art.46 mechanism (SCCs / BCRs / etc.) is still required**
for cross-border replication of HMAC-pseudonymised PII. This
proposal is **defence-in-depth + Art.32(1)(a) evidence**, not
an Art.46 escape.

The structural answer (option C — tokenisation with per-region
mapping table) is the path to "no PII leaves home region" if
that's a hard requirement. This proposal is the medium-effort
intermediate step.

## Compliance impact

| Scope | Ref | Kind | Impact | After shipping |
|---|---|---|---|---|
| gdpr | Art.32 | feature | medium | concrete pseudonymisation evidence on the PlatformDB layer (Art.32(1)(a) explicitly names pseudonymisation) |
| gdpr | Art.5(1)(f) | feature | low | confidentiality strengthened at the cluster-replicated identification layer |
| gdpr | Art.46 | enhancement | low | residual exposure reduced even with SCCs in place; SCCs + pseudonymisation combined narrative materially stronger than SCCs alone |
| iso-27001 | A.8.11 | feature | medium | data-masking control gains the PlatformDB-layer instance |
| iso-27001 | A.8.24 | feature | medium | use-of-cryptography (HMAC) at the platform layer |

NOT a tier shift on `gdpr.Art.46` itself — legal status of
cross-border replication unchanged by hashing under Recital 26.

## Effort estimate

- Posture 1 (hashing toggle, both columns) — ~3 days for the
  `Platform.ts` hashing layer + caller updates + tests +
  migration + rotation tooling + INSTALL.md.
- Posture 2 (minimised — strip email entirely) — +1 day for
  the home-core-local email-uniqueness fallback + the recovery
  flow simplification.
- **Total: ~4-5 days**.

## Cross-references

- macroPryv backlog: `_plans/XXX-Backlog/PLATFORMDB-PII-HASHING.md`
  for the full design (operations table, pepper rotation,
  migration plan).
- `compliance-matrix/UPDATE-TRIGGERS.md` Section A entry
  `PLATFORMDB-PII-HASHING`.
- `compliance-matrix/context/cross-border-platformdb-implications.md`
  — option B in the A/B/C mitigation matrix.
- `_plans/XXX-Backlog/PLATFORMDB-AT-REST-ENCRYPTION.md` —
  orthogonal mitigation (option A); recommended in combination.
- `_plans/XXX-Backlog/ALIASES.md` — pairs with this work; alias
  + HMAC combination strengthens the brute-force-resistance
  story (HMAC of a random alias has effectively unbounded input
  domain, unlike HMAC of a human-chosen username).
