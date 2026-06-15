# Data retention: voluntarily missing at the platform, operator-owned

GDPR Art.5(1)(e) "storage limitation" requires personal data to be
**kept in a form which permits identification of data subjects for
no longer than is necessary** for the purposes for which it is
processed. Equivalent obligations live in PIPEDA Principle 4.5,
HIPAA-Privacy §164.530(j) (records retention), ISO 27701 A.7.4.5
(deletion at end of processing), HDS data-conservation, Swiss nLPD
Art.6 proportionality.

For an **active subject**, "necessary" is open-ended — the
purpose is alive. For **stale data** — events older than N
days for a given stream class, inactive accounts that have not
authenticated in M months — the obligation bites: the operator
must enforce automatic deletion or anonymisation, not wait for
the subject to come back and click "delete account".

## What Pryv ships

**No TTL / retention / auto-delete primitive on the platform
layer.** A code-level audit of `components/business/`,
`components/mall/`, `components/storage/`, and
`components/api-server/src/schema/` finds:

- No `retention` / `ttl` / `expireAfter` / `maxAge` field on
  event-type schemas.
- No `deleteAfter` / `pruneOlderThan` config on stream definitions.
- No scheduler / cron primitive in core. The only background
  loops shipped today are LE certificate renewal and Bootstrap
  TokenStore TTL on one-shot join tokens (24 h default) —
  domain-specific, not generalised.
- No "user inactivity" tracking that could trigger automatic
  account deletion. Audit-log read of "last authentication
  time" requires a custom query.

`access.expires` exists but bounds the **authorisation
lifetime** (the moment after which the access-token stops
authenticating requests) — not the lifetime of the data the
access has already written.

`clientData.retention` (per `context/client-data-conventions.md`)
is **advisory metadata only**. It documents the operator's
declared retention policy for an access; it does not enforce
deletion at expiry.

## What Pryv DOES expose for the operator to build retention on

Five composable primitives — each independently usable from an
external retention job:

1. **`events.get` with `toTime` filter** — query stale events
   matching a stream selection. Date-bounded reads are
   indexed-supported on every engine
   (`open-pryv.io/components/mall/src/events/` per-engine
   adapters). Pagination + streaming response support
   batch-sized scans.

2. **`events.delete`** — two-stage delete (first call sets
   `trashed: true`; second call hard-deletes). Both stages are
   in `AUDITED_METHODS`
   (`open-pryv.io/components/audit/src/ApiMethods.ts:56`) — every
   deletion leaves a row with the calling access reference and
   timestamp.

3. **`streams.delete`** — same two-stage pattern for whole
   sub-trees. Cascades to events within when
   `mergeEventsWithParent=false`. Useful for stream-class-scoped
   retention ("`audit-trace/*` purge older than 18 months").

4. **`auth.delete` (`system.users.delete`)** — full account
   deletion (with the engine-dependent audit-survival gap noted
   in Q8 / `proposals/audit-on-user-delete.md`). Use for the
   "inactive user, full erasure" path.

5. **Audit log as inactivity oracle** — `GET /audit/logs`
   (engine-dependent: per-user SQLite by default,
   PG `audit_events` table for the v2 default) gives the
   operator the "last-active timestamp" without requiring a
   separate `lastSeen` field on the account.

## The operator pattern (recommended)

Retention is **a scheduled job the operator owns**, running
adjacent to the Pryv API. The pattern parallels the operator-side
backup-encryption pattern (Q15 — Pryv produces the artefact, the
operator wraps it). Concrete shape:

```
# 1. Configure retention policy declaratively, per stream class
#    or per access purpose, in the operator's own config store.
retention_rules:
  - stream: "wellness/raw-readings/*"
    max_age_days: 365
    action: delete
  - stream: "audit-trace/*"
    max_age_days: 540   # 18 months
    action: delete
  - account_inactivity:
      no_auth_for_days: 1095   # 3 years
      action: delete            # or: anonymise via auth.randomAlias

# 2. Cron-style scheduler (operator's choice: systemd timer,
#    Kubernetes CronJob, GitHub Actions schedule, AWS EventBridge,
#    GCP Cloud Scheduler, whatever the operator's deployment uses).
#    Runs the retention job daily / weekly / monthly per policy
#    aggressiveness.

# 3. The job uses a Pryv personal-token access with cross-user
#    scope (system.* admin auth for account-level operations;
#    per-user reduced-scope tokens for stream-level operations).

# 4. For each rule:
#    a. Query the population
#       (`events.get streams=<stream> toTime=<cutoff>`).
#    b. Iterate + call `events.delete` per result.
#    c. Audit log records every deletion automatically.
#    d. Log job results into the operator's observability stack
#       (Q23 provider façade) — count deleted, time elapsed,
#       errors per stream.
```

The job's own audit trail (which subject deleted, when, by what
access reference) is automatic via the existing audit log. The
**why** (citing the rule) lives in the operator's job
configuration; reviewers cross-reference job logs and audit logs
to reconstruct the chain.

## Why "voluntarily missing" not "should-be-built"

Pryv could ship a built-in retention primitive — declared on
event-type schemas, enforced by a background loop, configured
via `service.retention.*`. The architecture allows it. The
choice not to ship it is deliberate, for three reasons:

1. **"Necessary" is irreducibly contextual.** A wellness app's
   30-day raw-reading retention, a clinical-trial study's
   15-year retention regime, a financial-services 7-year
   regulatory retention, a paediatric-record retention until
   age-of-majority + N years — these cannot share one
   sensible default. Pryv is content-agnostic precisely so it
   doesn't pretend to know which applies.

2. **Retention conflicts with legal-hold / litigation-hold.**
   When the operator's lawyers say "freeze deletion on user X
   pending litigation", a platform-imposed retention loop
   would have to expose a `legalHold` opt-out per-subject, per-
   stream, per-event-type. That's a substantial primitive to
   build for a slot most operators run as a 30-line cron
   script.

3. **Scheduler primitives belong to the operator's deployment
   topology.** Operators running Pryv on Kubernetes have CronJob
   resources; operators on systemd have timer units; operators
   on cloud-managed runtimes have provider-native schedulers
   with retries + alerting + observability already wired in.
   A Pryv-internal scheduler would be redundant at best,
   conflicting at worst.

## Audit trace on scheduled deletion

Every `events.delete` / `streams.delete` / `auth.delete` call
made by the retention job is captured in the audit log with:

- `accessId` (the personal token the job runs under) +
  `accessSerial` (version reference).
- `action` (e.g., `events.delete`).
- `params.id` (the deleted resource ID).
- `time` (when the deletion occurred).
- Caller IP / user-agent (when present).

Combined effect: an Art.5(1)(e) "deleted without undue delay
after X days" claim is **forensically defensible** — the audit
log shows the deletion stream, the access ref ties back to the
retention job, the timestamp documents the lag between the
policy boundary (event `time`) and the actual deletion
(`audit.time`).

The Q9 audit-minimality posture
(`context/data-masking-projection-vs-transformation.md`)
applies — request body is not captured, so the retention job's
deletions cannot accidentally leak event content into the audit
log.

## Cross-engine considerations

Retention extends to backups per the same engine-dependent
considerations noted under Art.17:

- **SQLite** — per-user files; backup-restore granularity is
  per-user. Retention deletions reflect in next-cycle
  filesystem backups when the file is rewritten / removed.
- **PostgreSQL** — row-level deletion. Existing
  backup snapshots retain the deleted rows until backup
  rotation prunes them. Operators with strict Art.5(1)(e)
  posture either (a) rotate backups aggressively enough that
  retention obligations are met within the rotation window, or
  (b) build a backup-rewriting pipeline that re-emits
  retention-respecting backups.

The `pryv-account-backup` tool (per-subject export) is
unaffected — each export reflects the current account state at
export time, so post-deletion exports do not contain deleted
events.

## Account-level retention via the audit-log oracle

The "inactive user, 3-year deletion" pattern uses the audit
log as the inactivity oracle:

```js
// Pseudocode — operator's retention job, per-account scan.
const cutoff = Date.now() - 3 * 365 * 24 * 60 * 60 * 1000;
const lastActivity = await getLastAuditTime(userId);
if (lastActivity < cutoff) {
  await pryv.system.users.delete(userId);
  // OR (less aggressive):
  // await pryv.auth.randomAlias(userId);
  // — pseudonymises the account, keeps the data, breaks the
  //   subject-linkability claim.
}
```

The `auth.randomAlias` primitive (backlog `ALIASES`, GH
[`#38`](https://github.com/pryv/open-pryv.io/issues/38)) is the
**de-identification companion to deletion** — for retention
regimes where "anonymised after N years" is the policy rather
than "deleted after N years". Currently a planned feature; once
shipped, the retention job has two action verbs (`delete` /
`anonymise`) instead of one.

## Caveats for the operator

- **Audit-survival gap on PG (Q8 / GH
  [`#75`](https://github.com/pryv/open-pryv.io/issues/75))** —
  `auth.delete` does not currently call
  `auditStorage.deleteUser(userId)` on PostgreSQL deployments,
  so account-level deletions leave the audit history of the
  deleted subject in `audit_events`. For most retention regimes
  this is fine (audit is a separate retention concern under
  HIPAA §164.316(b)(2)(i) minimum-6-year + similar regs — see
  Q16) but the operator should know.

- **Stream-level retention does not delete attached metadata
  on parent streams** — if metadata about the deleted events
  lives on the parent stream's `clientData` or as separate
  metadata events, those need their own retention rule.

- **Cascade discipline** — `streams.delete` with
  `mergeEventsWithParent=false` cascades to all events in the
  sub-tree. `mergeEventsWithParent=true` re-parents events to
  the deleted stream's parent — which is wrong for retention
  (events would survive their retention boundary). Always
  `mergeEventsWithParent=false` for retention scenarios.

- **HFS series data retention** — `series:*` event-type events
  carry a separate data-point store; `events.delete` on the
  series event deletes the container but the operator should
  also call the HFS series-clear endpoint (`DELETE /events/<id>/
  series`) to drop the data points. The
  `ACCOUNT-BACKUP-DSAR-COMPLETENESS` work (Q10 / GH
  [`#73`](https://github.com/pryv/open-pryv.io/issues/73))
  addresses the related gap in the backup tool; the retention
  pathway is consistent — both APIs are exposed, the operator
  composes both.

## Implementer takeaway

If a regulator asks "how does your deployment satisfy storage
limitation under Art.5(1)(e)":

1. **Cite the policy** — your retention rules document, with
   per-stream-class periods + per-purpose justifications.
2. **Cite the enforcement** — your retention job (deployment
   topology + scheduler + runbook).
3. **Cite the audit trail** — Pryv's audit log captures every
   retention deletion with access ref + timestamp; combined
   with your job logs, the chain is reconstructible.
4. **Address the engine-dependent backup tail** — your backup
   rotation policy + retention cutoffs together complete the
   storage-limitation argument across the full data lifecycle.

If a regulator asks "show me last week's retention deletions":
`GET /audit/logs from=<last-week> action=events.delete
accessId=<retention-job-token>`.

## See also

- `context/client-data-conventions.md` —
  `clientData.retention` advisory-metadata convention (the
  policy-claim side of the same primitive set).
- `proposals/audit-on-user-delete.md` — Q8 / Art.17 audit-
  survival gap on PG; relevant when retention triggers
  account-level deletion.
- `proposals/aliases-as-pseudonymization-primitive.md` —
  `auth.randomAlias` as the anonymisation companion to
  deletion.
- `context/audit-archival-via-custom-datastore.md` — Q16 audit
  log tiering pattern; a different retention dimension (audit
  data itself rather than event data).
- `docs/pryv-primitives.md` — `audit-event-stream` +
  `backup-restore` entries (the primitives the retention
  pattern composes).
