# Per-engine user-data isolation semantics

Several matrix rows describe Pryv's "per-user storage isolation" as
the substrate for compliance obligations like GDPR Art. 25
(data-protection by design), GDPR Art. 32 (security of processing),
ISO 27001 A.5.34, HIPAA-Security §164.312(a)(1), PIPEDA Principle 4.7
safeguards, etc.

The phrase "per-user storage isolation" hides a substantive design
difference between the storage engines Pryv supports. An implementer
choosing an engine is implicitly choosing an isolation model. This
note pins the difference down so the matrix rows can refer back to a
single canonical statement.

## Two models

### SQLite engine — physical isolation

Each Pryv user has a **dedicated SQLite file** (and a per-user data
directory under the operator-configured `dataRoot`). Reading user
A's events means opening user A's file; reading user B's means
opening a different file.

- A bug in the API-surface permission check still cannot cause
  cross-user reads — the wrong API call would never open the wrong
  user's file because the user resolver locks the file path before
  the SQL runs.
- Erasure (GDPR Art. 17 / HIPAA §164.310(d)(1)) is `rm` of the
  per-user folder — removes the user from filesystem-level backups
  as well, depending on the operator's backup tool semantics.
- Audit log per-user SQLite under `components/audit/` follows the
  same model regardless of base-storage engine choice.

This is **physical filesystem-level isolation.** Cross-user reads
require either an OS-level read of another user's file (root
required) or a Pryv-side bug that mis-resolves the user identity.

### PostgreSQL engine — logical isolation

Every user's data sits in **shared tables** (e.g., `events`,
`streams`, `accesses`) with a `userId` column on every row.
Isolation is enforced at the **application layer**: every query
(read + write) is parameterised with `userId` as a SQL
`WHERE userId = ?` clause.

- No DB-level enforcement. Pryv does **not** ship PostgreSQL
  row-level-security (RLS) policies or per-tenant schemas. The DB
  sees a single tenant; isolation happens in the SQL string the
  application emits.
- A code bug that forgets to apply the `userId` filter, or a
  permission check that fires after a multi-user read returns,
  could leak data across users.
- Erasure is per-user row deletion (`DELETE FROM events WHERE userId
  = ?`). Engine backups are DB-engine-level snapshots (`pg_dump`);
  per-user erasure within a backup file requires either backup
  rotation (oldest pruned per policy) or backup rewriting.

This is **logical isolation, app-code-enforced.** Implementer trust
in cross-user separation reduces to trust in:
1. Pryv-the-software's correctness of `userId`-parameter handling
   in every query path.
2. The test matrix that exercises permission-failure paths.
3. The operator's filesystem hygiene for backup-engine output
   (which itself is multi-user).

## Why both engines are first-class

Pryv supports both for legitimate operator reasons:

- **SQLite** suits small + medium deployments where per-user
  physical isolation is the strongest signal for an HDS or HIPAA
  audit. Trade-off: scale ceiling lower; multi-core deployments
  rely on a shared rqlite control plane for platform data even
  though events stay per-user-SQLite.
- **PG** suits larger deployments where multi-master DB
  replication, point-in-time recovery, advanced query patterns,
  and DB-team operability matter more than physical-file isolation.

The matrix should not push either; it should make the trade-off
explicit on the rows that lean on "isolation."

## You can switch engines after deployment

Important for the risk calculus: **the engine choice is not
permanent.** Pryv's `bin/backup.js` dumps user data in an engine-
neutral format (per-user backup files); `bin/backup.js --restore`
reads that format into whichever engine the target deployment is
configured for. An operator who starts on SQLite for the
physical-isolation guarantee can migrate to PG later (or vice
versa) without losing data or rebuilding user accounts.

This matters for two implementer scenarios:

1. **Start strict, scale later.** Begin on SQLite during the
   regulated-onboarding phase (HDS audit, HIPAA risk assessment)
   when physical isolation is the auditable property. Move to PG
   once the user count or query complexity outgrows SQLite, and the
   audit posture has matured (e.g., operator now has RLS policies +
   WAF + SIEM forwarding documented).
2. **Disaster recovery onto a different engine.** If the production
   engine has a structural issue, restore onto the other engine in
   an emergency. Avoids vendor / engine lock-in as a top-line risk.

The migration itself is operational (script-driven, not real-time);
plan downtime windows. The per-user data + access lifetimes survive
the migration; access tokens stay valid afterwards.

## Operator mitigation patterns for PG deployments

If the implementer's risk model demands stronger isolation on
PG, four independent layers can be added (none shipped by
Pryv-the-software today):

1. **PostgreSQL row-level security (RLS).** The operator authors
   `CREATE POLICY userId_isolation ON events FOR ALL TO pryv_app
   USING (userId = current_setting('pryv.user_id'))` and sets the
   GUC per connection. Defeats accidental missing `WHERE userId`
   on top of the existing app-layer filter. Cheap; one-DB
   deployment.
2. **Per-schema isolation.** PG schemas per tenant; same engine,
   separate namespaces. Stronger than RLS, weaker than per-DB.
   Medium ops cost. Scales to thousands.
3. **Per-account DB isolation** *(low-cardinality only)*. One
   PostgreSQL database per Pryv user / tenant. DB-level isolation
   — connections are scoped to one DB, so a missing `userId`
   filter can't bridge across users. Closer to SQLite's per-user-
   file model.

   **Sharp cardinality limit.** PG handles many DBs per cluster
   gracefully only at low cardinality (low thousands). Above
   ~5K-10K DBs per cluster, `pg_database` catalog ops slow,
   autovacuum degrades, schema migrations must iterate every DB
   on each upgrade, connection pools must be per-DB. **Fits a
   B2B SaaS with ~hundreds of operator-tenants; pathological for
   a consumer-scale app with millions of subjects.**

   Not a currently shipped Pryv mode. The PG code paths assume one
   DB; supporting per-account DBs would require a user-resolver
   step (which DB connection?), per-DB pooling, and migration
   multiplexing. For high-cardinality deployments needing the
   physical-isolation property, use SQLite instead.

4. **Per-tenant Pryv deployment.** Run **N Pryv deployments** (one
   per tenant) using the multi-hosting + data-residency primitive.
   Strongest isolation, highest ops cost. Each deployment is a
   complete Pryv cluster — separate API, separate users, separate
   DBs. Useful when tenants are independent legal entities (e.g.,
   distinct healthcare providers in a federation).

Defence in depth at the network boundary (external WAF / API
gateway scoping requests per-token to per-user routes) is an
additional layer that composes with any of the above; operator-
side, outside Pryv.

The matrix records all four so an implementer asking "do you do
RLS / per-DB / separate deployments?" gets a clear answer per
risk-budget tier.

## Matrix rows that lean on this

| Scope | Row | Today's framing | Lean |
|---|---|---|---|
| gdpr | Art.25 | `F: Infrastructure \| High` | per-user storage isolation |
| gdpr | Art.32 | `F: Infrastructure \| High` | multi-aspect; access-control + isolation |
| gdpr | Art.1 | `F: Awareness \| Low` | "subject-centric storage" |
| iso-27001 | A.5.34 | `F: Infrastructure \| High` | derives_from gdpr.Art.25 |
| iso-27001 | A.8.3 | `Implemented \| High` | "Per-stream permissions … technical access-restriction primitive" |
| iso-27701 | B.8.4 | `F: Infrastructure \| High` | per-user isolation cited |
| pipeda | Principle.4.7 | `F: Infrastructure \| High` | multi-aspect safeguards |
| swiss-nlpd | Art.7 | `F: Infrastructure \| High` | per-user storage isolation cited |
| hipaa-security | 164.312(a)(1) | `Implemented \| High` | "no bypass on trust path" |

These rows should reference this document via their `detail` block
when an implementer is likely to ask the per-engine question
explicitly. The framing rows (Art.1, Art.25, A.5.34, B.8.4) link to
it from `detail`; the implementation rows (164.312(a)(1), A.8.3)
inherit the framing without needing the cross-link in every cell.

## Related primitives

- `stream`, `system-streams` — the data containers whose isolation
  this note characterises.
- `access`, `permissions` — the API-surface enforcement layer (which
  on PG is the only enforcement layer).
- `audit` — per-user SQLite regardless of base-storage engine.
- `backup-restore` — engine-specific erasure semantics tie back to
  the isolation model.
