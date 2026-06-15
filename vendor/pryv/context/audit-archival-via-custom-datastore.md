# Audit archival + tiering via custom `@pryv/datastore`

**Status:** architectural pattern — Pryv's answer to "audit grows
unboundedly over a 5-10 year deployment". No Pryv-shipped pruning
primitive; the answer is "use the `@pryv/datastore` extension
hook + write a custom audit storage tier". Recorded from the
gap-probing session (Q16, 2026-05-20).

## TL;DR

Pryv ships **no `bin/audit-prune.js` primitive**. Audit growth is
the operator's storage-engineering problem to solve, but Pryv
provides the **architectural hook**: the audit log is exposed via
`@pryv/datastore` (`auditDataStore` registered as `_audit` in
`Mall.addStore`), so an operator can write a custom datastore (or
custom `auditStorage` engine plugin) that **tiers hot recent rows
+ cold archived rows** behind the same `audit.getLogs` API. End
users see one continuous log; the operator chooses how the
storage backs it.

## Why no pruning primitive

Two reasons, captured here so future matrix authors don't confuse
"no primitive ships" with "missing feature":

1. **Pryv is end-user "will enforcement"**: the platform respects
   user sovereignty. Operator tooling that reaches into a user's
   own data — audit included — is deliberately minimal. There is
   no operator "delete user X's audit rows older than Y" knob,
   because that would let the operator silently truncate evidence
   the user might one day want to audit.

2. **No regulator demands deletion**:
   - HIPAA §164.316(b)(2)(i) requires a **minimum** 6-year
     retention, no maximum.
   - MDR Art.10(8) requires **minimum** 10-year retention for
     device-history records.
   - GDPR Art.5(1)(e) storage limitation + PIPEDA Principle 4.5
     + Swiss nLPD Art.6(4) all say "no longer than necessary" —
     but audit's lawful basis is typically GDPR Art.17(3)(b)
     ("compliance with a legal obligation" — the §164.316
     retention itself, or sectoral regs), which makes long
     retention legitimate ground.

   So pressure to prune is **operational** (storage cost, query
   performance over 1B+ row scales), not regulatory.

## The pattern

The audit data store at `components/audit/src/datastore/
auditDataStore.ts` registers as `id: '_audit'` via
`mall.addStore` (`components/mall/src/index.ts:69-73`). It
exposes `streams` + `events` properties implementing the
`@pryv/datastore` interface. Audit reads (`audit.getLogs`) flow
through the Mall like any other data-store read.

A tiered implementation has two flavours:

### Flavour A — custom `auditStorage` engine plugin

(Available today, more involved but architecturally clean.)

1. Write a new package in `storages/engines/<custom-tiered>/`
   following the existing SQLite + PG engine pattern.
2. Declare `"storageTypes": ["auditStorage"]` in `manifest.json`.
3. Implement the `AuditStorage` interface (`forUser`,
   `deleteUser`, etc.):
   - `forUser(userId)` returns a user-audit-DB facade that
     routes writes to the hot backend (recent SQLite / PG) and
     reads to a union view across hot + cold.
   - `deleteUser(userId)` cascades to both tiers.
4. Add a background migration loop that periodically walks the
   hot tier, identifies rows older than `hotRetentionDays`, and
   moves them to the cold backend (S3 Object Lock, Glacier,
   tape, etc.).
5. Configure the deployment to load the custom engine instead of
   the default SQLite / PG audit engine.

The existing `auditDataStore` (the `_audit` Mall registration)
doesn't change; the storage layer beneath it does. All audit
APIs remain identical.

### Flavour B — custom `@pryv/datastore` replacing `_audit`

(Cleaner config, but requires the `BUILTIN-STORE-OVERRIDE`
backlog enhancement to ship first — today the load order
silently overwrites the operator's custom entry. See the
`BUILTIN-STORE-OVERRIDE` internal backlog slug for the
`override: true` config-flag proposal.)

1. Write a custom datastore module:

   ```js
   const ds = require('@pryv/datastore');

   module.exports = ds.createDataStore({
     id: '_audit',
     name: 'Tiered audit',
     async init (params) {
       this.hot = new HotAuditTier(params.settings.hot);
       this.cold = new ColdAuditTier(params.settings.cold);
       this.streams = ds.createUserStreams({ /* delegate to hot
                       + cold; merge for reads */ });
       this.events  = ds.createUserEvents({  /* same */ });
       return this;
     },
     async deleteUser (userId) {
       await Promise.all([
         this.hot.deleteUser(userId),
         this.cold.deleteUser(userId)
       ]);
     }
   });
   ```

2. Register via config (after `BUILTIN-STORE-OVERRIDE` ships):

   ```yaml
   custom:
     dataStores:
       - id: _audit
         name: Tiered audit
         path: /app/configs/tiered-audit
         override: true
         settings:
           hot:
             engine: sqlite
             retentionDays: 730    # 2-year hot window
           cold:
             engine: s3-glacier
             bucket: audit-archive
             kms_key_arn: arn:aws:kms:...
   ```

## Compliance implications

The matrix's audit-related rows stay correctly classified today
because the architectural extension hook IS the Pryv contribution:

| Scope | Row | Today | Why no tier shift needed |
|---|---|---|---|
| hipaa-security | 164.316(b)(2)(i) | F: Storage \| Low | Pryv contributes the audit-write substrate + extension hook for archival; the 6-year-minimum retention SOP is the operator's. (Note: this row had earlier prose treating 6y as max, not min — corrected per Q16.) |
| iso-27001 | A.8.15 Logging | Implemented \| High | "produced, stored, protected, analysed" — Pryv produces + stores; operator's tiering is the "stored for longer than the hot tier" stage. |
| iso-27001 | A.5.24 Incident management | F: Evidence \| Med | Cold-tier audit remains queryable for forensic review years later. |
| gdpr | Art.30 Records of processing | Implemented \| High | Records survive in the cold tier through the operator's chosen retention window; the Art.17(3)(b) lawful basis covers retention. |

## What an implementer SHOULD document

In their DPIA / ISMS:

- **Audit retention policy** — how long the hot tier keeps rows,
  when migration to cold fires, when (if ever) cold rows are
  destroyed. Pryv-side: the audit write path is permanent until
  the operator explicitly migrates / deletes.
- **Tiering implementation** — which Flavour (A or B), which
  cold backend, what encryption at rest.
- **Lawful basis for retention beyond strictly-necessary** —
  typically Art.17(3)(b) "compliance with a legal obligation"
  (HIPAA / MDR retention regimes) or Art.17(3)(e) "legal
  claims" (audit defense in litigation).

## Related

- Internal backlog slug `BUILTIN-STORE-OVERRIDE` (DX
  enhancement to make Flavour B usable via config alone).
- `proposals/audit-on-user-delete.md` (Q8 — the
  `audit.onUserDelete: keep` mode + this tiering pattern are
  the two halves of "operator-controlled audit retention").
- `proposals/audit-log-chaining.md` (Q2 — when chained audit
  ships, tiering must preserve `prev_hash` continuity across
  the hot/cold boundary; a checkpoint at the boundary is the
  natural way to do this).
- `docs/pryv-primitives.md` `audit` entry (already documents
  the no-content guarantee + `serverTime` client helper;
  cross-references this note).
- `pryv-datastore` repo:
  https://github.com/pryv/pryv-datastore.
