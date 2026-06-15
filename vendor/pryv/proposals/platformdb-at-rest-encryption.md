# PlatformDB at-rest encryption

**Proposal mirror of**: `_plans/XXX-Backlog/PLATFORMDB-AT-REST-ENCRYPTION.md` (macroPryv).
**Filed during**: Plan 71 Q25 — cross-border PlatformDB analysis.

## Goal

Encrypt PlatformDB (rqlite-backed cluster-replicated store) at
rest. Protects against SSD-forfeiture, backup-tape forfeiture,
decommissioned-hardware exposure, filesystem-level breach. Runtime
+ live replication path unchanged.

Two implementation paths:

- **Path 1 — rqlite native disk encryption** (verify rqlite v9.4.5
  ships the encrypted-build variant for Linux + Darwin). ~1 day.
- **Path 2 — storage-adapter envelope encryption** at the
  `RqlitePlatformDB.ts` boundary (AES-256-GCM via the same pattern
  as Plan 35 LE certs + Plan 38 observability secrets). ~2-3 days
  including SIV mode for queried columns.

Operator-supplied key: `platformDB.atRestKey` (32-byte base64),
operator-sync identical to `letsEncrypt.atRestKey`.

- **Path 3 — PostgreSQL-native at-rest options** (new since
  open-pryv.io gained `storages.platform.engine: postgresql` for
  single-core dnsLess deployments): when platform data lives in
  PostgreSQL (`platform_kv` table), pgcrypto / volume encryption /
  managed-PG TDE apply to it like any other PG data. Covers the
  diskless shape only; rqlite-backed multi-core platforms still
  need Path 1 or 2.

## Compliance impact

| Scope | Ref | Kind | Impact | After shipping |
|---|---|---|---|---|
| gdpr | Art.32 | feature | medium | adds concrete encryption-at-rest evidence for the PlatformDB layer (chip removed; detail block extended) |
| gdpr | Art.46 | enhancement | low | reduces residual passive-forfeiture risk that remains even with SCCs in place; detail prose tightens |
| iso-27001 | A.5.33 | feature | medium | record protection strengthened — concrete cryptographic control on the PlatformDB layer |
| iso-27001 | A.8.24 | feature | medium | use-of-cryptography clause gains the PlatformDB instance |

## Threat model — what this DOES and does NOT cover

DOES cover (defence-in-depth):
- SSD / hardware decommissioning with PlatformDB plaintext on disk.
- Backup tape forfeiture of the rqlite data directory.
- Filesystem-level read-only breach (attacker without
  application-level access).
- Foreign-jurisdiction subpoena of the storage layer (yields
  ciphertext only).

Does NOT cover:
- Runtime memory dumps (plaintext is in-memory during queries).
- Application-level breaches (caller already has the key).
- Cross-border replication (plaintext is in the in-transit Raft
  stream; this proposal touches at-rest only). Pairs with
  `PLATFORMDB-PII-HASHING` for the replication-stream side.

## Cross-references

- macroPryv backlog: `_plans/XXX-Backlog/PLATFORMDB-AT-REST-ENCRYPTION.md`
- `compliance-matrix/UPDATE-TRIGGERS.md` Section A entry
  `PLATFORMDB-AT-REST-ENCRYPTION`.
- `compliance-matrix/context/cross-border-platformdb-implications.md`
  — option A in the A/B/C mitigation matrix.
- `_plans/XXX-Backlog/PLATFORMDB-PII-HASHING.md` — orthogonal
  mitigation (option B); recommended in combination.
