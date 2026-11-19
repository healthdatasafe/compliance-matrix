# Data retention: voluntarily missing at the platform, operator-owned

> **Account-level auto-deletion shipped in open-pryv.io 2.0.0-rc.66
> (2026-10-30):** an account is deleted at a date its holder picks,
> or after a period without use, with reminders. It changes the
> account level of this note only; the event and stream levels stay
> operator-owned. See "Account-level auto-deletion" below, the
> operator page `customer-resources/account-auto-deletion` and
> `proposals/account-auto-deletion.md`. Transfer to a beneficiary
> is implemented and merged, not released yet (last section).

GDPR Art.5(1)(e) "storage limitation" requires personal data to be
**kept in a form which permits identification of data subjects for
no longer than is necessary** for the purposes for which it is
processed. Equivalent obligations live in PIPEDA Principle 4.5,
HIPAA-Privacy §164.530(j) (records retention), ISO 27701 A.7.4.5
(deletion at end of processing), HDS data-conservation, Swiss nLPD
Art.6 proportionality.

For an **active subject**, "necessary" is open-ended, the
purpose is alive. For **stale data**, events older than N
days for a given stream class, inactive accounts that have not
authenticated in M months, the obligation bites: the operator
must enforce automatic deletion or anonymisation, not wait for
the subject to come back and click "delete account".

## What Pryv ships

**No TTL / retention / auto-delete primitive for events and
streams.** (Whole accounts: account auto-deletion, since
2.0.0-rc.66, see below.) A code-level audit of `components/business/`,
`components/mall/`, `components/storage/`, and
`components/api-server/src/schema/` finds:

- No `retention` / `ttl` / `expireAfter` / `maxAge` field on
  event-type schemas.
- No `deleteAfter` / `pruneOlderThan` config on stream definitions.
- No scheduler / cron primitive in core. The background loops
  shipped are domain-specific, not generalised: LE certificate
  renewal, Bootstrap TokenStore TTL on one-shot join tokens (24 h
  default), the cross-account (CMC) retry loop, the account
  auto-deletion sweep (since 2.0.0-rc.66, whole accounts only), and, since
  open-pryv.io 2.0.0-rc.56, an opt-in daily purge of the deletion
  records of accesses deleted more than
  `accesses.deletionRecords.retentionDays` ago (default 0: kept
  until the account is deleted). That purge touches access
  records only, never events, streams or audit rows; past it an
  audit row names such an access by id only.
- Account inactivity is measured for account auto-deletion only
  (since 2.0.0-rc.66): the latest `lastUsed` of the account's
  personal accesses (app accesses too only with
  `account.autoDeletion.inactivity.countAppUse`, since 2.0.0-rc.81),
  a sign-in recording `lastUsed` (`[LGLU1]`..`[LGLU4]`,
  `[ACAC1]`..`[ACAC11]`, `[ACST20]`); see below. Any
  other inactivity measure (for example "last authentication
  time" from the audit log) is a custom query.

`access.expires` exists but bounds the **authorisation
lifetime** (the moment after which the access-token stops
authenticating requests), not the lifetime of the data the
access has already written.

`clientData.retention` (per `context/client-data-conventions.md`)
is **advisory metadata only**. It documents the operator's
declared retention policy for an access; it does not enforce
deletion at expiry.

## What Pryv DOES expose for the operator to build retention on

Five composable primitives, each independently usable from an
external retention job:

1. **`events.get` with `toTime` filter**: query stale events
   matching a stream selection. Date-bounded reads are
   indexed-supported on every engine
   (`open-pryv.io/components/mall/src/events/` per-engine
   adapters). Pagination + streaming response support
   batch-sized scans.

2. **`events.delete`**: two-stage delete (first call sets
   `trashed: true`; second call hard-deletes). Both stages are
   in `AUDITED_METHODS`
   (`open-pryv.io/components/audit/src/ApiMethods.ts:56`), every
   deletion leaves a row with the calling access reference and
   timestamp.

3. **`streams.delete`**: same two-stage pattern for whole
   sub-trees. Cascades to events within when
   `mergeEventsWithParent=false`. Useful for stream-class-scoped
   retention ("`audit-trace/*` purge older than 18 months").

4. **`auth.delete` (`system.users.delete`)**: full account
   deletion (with the engine-dependent audit-survival gap noted
   in Q8 / `proposals/audit-on-user-delete.md`). Use for the
   "inactive user, full erasure" path.

5. **Audit log as inactivity oracle**: `events.get` over the
   `:_audit:` store (engine-dependent: per-user SQLite by default,
   PG `audit_events` table for the v2 default) gives the
   operator the "last-active timestamp" without requiring a
   separate `lastSeen` field on the account.

## The operator pattern (recommended)

Retention is **a scheduled job the operator owns**, running
adjacent to the Pryv API: Pryv provides the deletion primitives,
the operator owns the schedule and the rules. Concrete shape:

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
      action: delete            # the only platform verb (no account-level anonymise)

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
#       (Q23 provider façade): count deleted, time elapsed,
#       errors per stream.
```

The job's own audit trail (which subject deleted, when, by what
access reference) is automatic via the existing audit log. The
**why** (citing the rule) lives in the operator's job
configuration; reviewers cross-reference job logs and audit logs
to reconstruct the chain.

## Why "voluntarily missing" not "should-be-built"

Pryv could ship a built-in retention primitive, declared on
event-type schemas, enforced by a background loop, configured
via `service.retention.*`. The architecture allows it. The
choice not to ship it is deliberate, for three reasons:

1. **"Necessary" is irreducibly contextual.** A wellness app's
   30-day raw-reading retention, a clinical-trial study's
   15-year retention regime, a financial-services 7-year
   regulatory retention, a paediatric-record retention until
   age-of-majority + N years, these cannot share one
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
after X days" claim is **forensically defensible**, the audit
log shows the deletion stream, the access ref ties back to the
retention job, the timestamp documents the lag between the
policy boundary (event `time`) and the actual deletion
(`audit.time`).

The Q9 audit-minimality posture
(`context/data-masking-projection-vs-transformation.md`)
applies, request body is not captured, so the retention job's
deletions cannot accidentally leak event content into the audit
log.

## Cross-engine considerations

Retention extends to backups per the same engine-dependent
considerations noted under Art.17:

- **SQLite**: per-user files; backup-restore granularity is
  per-user. Retention deletions reflect in next-cycle
  filesystem backups when the file is rewritten / removed.
- **PostgreSQL**: row-level deletion. Existing
  backup snapshots retain the deleted rows until backup
  rotation prunes them. Operators with strict Art.5(1)(e)
  posture either (a) rotate backups aggressively enough that
  retention obligations are met within the rotation window, or
  (b) build a backup-rewriting pipeline that re-emits
  retention-respecting backups.

The `pryv-account-backup` tool (per-subject export) is
unaffected, each export reflects the current account state at
export time, so post-deletion exports do not contain deleted
events.

## Account-level retention via the audit-log oracle

On releases before 2.0.0-rc.66 (without account auto-deletion),
the "inactive user, 3-year deletion" pattern uses the audit log as
the inactivity oracle; from 2.0.0-rc.66 on, prefer the built-in
feature (next section), it carries the reminders, the minimum
notice and the deletion guards this pseudocode leaves out:

```js
// Pseudocode, operator's retention job, per-account scan.
const cutoff = Date.now() - 3 * 365 * 24 * 60 * 60 * 1000;
const lastActivity = await getLastAuditTime(userId);
if (lastActivity < cutoff) {
  await pryv.system.users.delete(userId);
}
```

The alias primitive that shipped (`accesses.create
{randomAlias:true}`, GH
[`#38`](https://github.com/pryv/open-pryv.io/issues/38)) is **not**
a de-identification companion to deletion: it aliases an access
(hides the username from that access's holder), it does not
anonymise an account or its data. For retention regimes where
"anonymised after N years" is the policy, the anonymisation is the
operator's own transformation; the platform verb is `delete`.

## Account-level auto-deletion

**Status:** shipped in open-pryv.io 2.0.0-rc.66 (`8521c8d5`,
2026-10-30). The release note and the operator page
(`customer-resources/account-auto-deletion` on pryv.github.io) are
authoritative for the wire shapes. Tests: schedule engine
`[ACXP1]`..`[ACXP19]`, sweep `[ADSW1]`..`[ADSW27]`, mails
`[ACRM1]`..`[ACRM5]`, API `[ACST1]`..`[ACST19]` and
`[ACST15A]`..`[ACST15C]`, activity `[ACAC1]`..`[ACAC10]`, login
`[LGLU1]`..`[LGLU4]`, configuration `[ACCF1]`..`[ACCF9]`,
`[CVAD1]`..`[CVAD4]`, `[CKCF8]`, state `[ADKS1]`..`[ADKS6]`,
`[ADKR1]`..`[ADKR4]`.

**What it does.** An account is deleted at a date its holder chose
(`date`), or after a number of days without use (`inactivity`),
with reminder mails before. Two sources of a schedule:

- **The holder's own setting** (`account.setAutoDeletion`, from the
  reference account app): `date`, `inactivity` within your bounds
  (`inactivity.minDays` / `maxDays`, 90 / 3650 days), `never`, or
  `default` (follow your preset). Arming a schedule or bringing the
  deletion nearer needs the account password; a delegate can read
  it but not set it; every change is confirmed by mail.
- **Your preset** (`account.autoDeletion.inactivity.defaultDays`,
  default `null`: none). It covers only plain accounts with an
  email address on a core that sends mail: never accounts without
  an address, group accounts or accounts under a delegation.

**What counts as use:** the latest `lastUsed` of the account's
`personal` accesses: a sign-in, every call made with its token or
with a personal token of the holder, every call of a delegate with
their own token. Since 2.0.0-rc.81 `app` accesses (an app the holder
connected, an OAuth session, an app a delegate granted) count only
with `account.autoDeletion.inactivity.countAppUse: true` (default
false): an app syncing in the background does not keep an account
alive. `shared`
accesses never count (a doctor reading shared data does not keep an
account alive), nor do failed sign-ins, webhooks or attachment
downloads. Inactivity needs `accessTracking.isActive` (default on);
an inactivity preset with tracking off refuses the boot.

**Safeguards built in:** reminders at 60, 30, 7 and 1 days
(`reminders.leadDays`), once per deadline, only the most imminent
one after downtime; no deletion less than `reminders.minNoticeDays`
(7) after the first notice actually sent (the confirmation counts;
a reminder that cannot be sent holds the deletion back); a preset's
clock starts the first time it applies to an account, so turning
one on gives dormant accounts the full schedule, and lowering it
restarts the clock; at the deadline the core's sweep re-reads the
account's use, runs the deletion guards of `auth.delete` (a refusal
is held and mailed once), then erases exactly as `auth.delete`
does, relationships torn down included. One sweep per core, no
cluster coordination (an account lives on one core).

### Your role as operator

1. **Default: nothing is deleted.** With no preset, an account is
   scheduled only because its holder asked, and only where holders
   may delete their own account: the `delete` action is offered
   when `user-account.delete` lists `personalToken` (the shipped
   default lists `adminToken` only). A holder cannot schedule what
   they could not do directly. Your preset is not bound by that
   setting: it is your act.
2. **Two lawful-basis situations, kept apart.**
   - **A schedule the holder chose** is the data subject's own
     erasure request (GDPR Art.17 §1(a): they judge the account no
     longer necessary; §1(b): where your processing rests on
     consent, the schedule is a withdrawal that takes effect at a
     date). It is not a retention rule of yours. Your remaining
     duties are the Art.17 §3 exceptions: the feature has no
     per-account hook for them (see point 5).
   - **Your preset** is your storage-limitation rule (Art.5 §1(e);
     PIPEDA Principle 4.5; ISO 27701 A.7.4.5). Set it from your
     purposes, the same value on every core for a platform-wide
     rule (configuration is per core), and **state it in your
     privacy notice**: the period, and what counts as use of an
     account (Art.13 §2(a); Art.14 §2(a) where you hold data not
     obtained from the person). `allowUserOptOut: false` turns the
     preset into an enforced rule (holders cannot choose `never`);
     with the default `true` a holder may keep their account, and
     your notice should say so. `userOverride: false` keeps holders
     from choosing their own date or period.
3. **Measure before you arm a preset.** Set `dryRun: true` and let
   at least one sweep pass run (`sweepIntervalMs`, 6 h by default;
   the first pass runs 10 minutes after boot): the sweep logs the
   reminders it would send and the accounts it would delete, and
   sends, deletes and writes nothing. Then arm it. Keep
   `maxDeletionsPerPass` (20 by default) as the blast-radius limit
   against a configuration mistake. Check that `service.account`
   is set (the mails link to the account app and its data export)
   and, on a platform whose mail templates were seeded before the
   release, add the three new templates with
   `bin/mail.js templates set` (the seeder fills an empty platform
   database only); without them no notice goes out, and the
   minimum notice then holds every deletion back.
4. **Accounts a preset never covers** (no email address, group
   accounts, accounts under a delegation) stay under your own
   retention procedure if your rule must reach them; their holders
   can still schedule their own deletion.
5. **Legal hold.** There is no per-account operator hold (an
   admin method to clear a schedule is later work). To
   stop deletions on a core, set `inactivity.defaultDays: null`
   (stops the preset) or `enabled: false` (hides the feature and
   stops the sweep entirely, holders' own schedules included).
   Build your litigation-hold procedure on those switches, or keep
   the preset off where holds are frequent.
6. **What remains after a deletion.** Each erasure is logged at
   WARN before it starts and after it completes (username, user id,
   trigger, whether the holder or your preset set the schedule,
   deadline, when the notices were sent; never an email address).
   With `audit.onUserDelete: keep` (and the audit active) an
   `account.autoDeletion.erase` row with the same fields is written
   in the account's audit trail before the erasure: the choice for
   HIPAA §164.316(b)(2)(i) or any regime that keeps the audit under
   its own basis. With the default `erase`, your log retention is
   the record. An erasure interrupted half-way completes at the
   next pass.
7. **Backups** are unchanged: the engine-dependent backup tail
   above (and in GDPR Art.17) applies to a scheduled deletion as to
   any other.

### Why built in for accounts, when records stay operator-owned

The three reasons above (necessity is contextual, legal hold,
scheduler topology) still hold for retention of records inside an
account. For whole accounts the balance differs: inactivity is
measured by the platform itself (access usage), the reminders need
the account's own email and language, and the deletion must run the
platform's deletion guards and teardowns; an external job would
rebuild all three from the outside. The feature keeps the neutral
default (no preset, nothing deleted) and leaves every retention
decision to you or to the holder.

## Planned: transfer to a beneficiary (implemented, not released)

A release after account auto-deletion adds a second
action at the deadline, chosen by the holder only (a preset always
deletes): **transfer** the account to one beneficiary instead of
deleting it. At the deadline a claim window opens (90 days by
default, `transfer.claimWindowDays`); the beneficiary receives a
claim link (an HMAC under the core's link key of which only a
per-transfer salt is stored, so a database dump holds no usable link)
and, by signing in to or creating an account on the
platform, becomes the **controller** of the holder's account through
the existing delegation handshake. Unclaimed, the holder's
`fallback` applies: delete, or keep the account. In `inactivity`
mode any use before the claim cancels the transfer.

The holder enters the beneficiary's **email** (required) and,
optionally, a **name** and **date of birth**, used only by you, the
operator, to identify a person who asks for the account without
access to that email address. Those two fields are stored
AES-256-GCM encrypted in their own field (key
`account.autoDeletion.transfer.identitySecretsKey`, or derived from
the admin key: rotating the admin key without a dedicated key makes
stored values unreadable), unreadable before the transfer starts,
and erased with every version on claim, cancellation, decline or
account deletion. The method by which you would read them (admin
key, stated reason, audited, reported to the holder) is deferred: in
the first transfer release nothing can read them.

**GDPR reading** (all points **unconfirmed** until your DPO or
counsel reviews them for the jurisdictions you serve):

- **Whose data, which controller.** The beneficiary's data is not
  obtained from the beneficiary. Whoever operates the platform as
  controller (you, or the implementer you operate it for) owes the
  beneficiary Art.14 information. The holder's own entry may fall
  under the household exemption (Art.2 §2(c)); your storage of it
  does not.
- **Basis (Art.6).** Art.6 §1(f): the holder's legitimate interest
  in arranging what becomes of their own account, and yours in
  carrying out that instruction, balanced by minimisation (Art.5
  §1(c): only the email required), encryption at rest (Art.32), no
  read path before the trigger, erasure with the transfer. Art.6
  §1(b) does not fit: the beneficiary is not party to your contract
  with the holder.
- **Holder notice (Art.13).** The reference account app and the
  setup confirmation tell the holder, next to the two optional
  fields, what they are used for, that they are stored encrypted,
  that you can read them only after the transfer started, that
  every reading is logged and reported to the holder's address, and
  that they are deleted with the transfer. Whoever builds the
  deferred read method must honour that notice as published.
- **Beneficiary notice (Art.14), two options chosen by the holder.**
  - `notifyBeneficiary: atSetup`: an email when named (who named
    them, what it means, the name / date-of-birth conditions if
    given, a single-use decline link). This is the first
    communication of Art.14 §3(b).
  - `notifyBeneficiary: atTrigger`: the first contact is the claim
    email at the deadline, possibly years later, carrying the same
    information. Art.14 §3(a) asks for information within a
    reasonable period, at the latest one month. The exemption relied
    on is **Art.14 §5(b)**: informing at setup would seriously impair
    the objective of the processing where the holder wants the
    arrangement kept private while they use the account; with the
    safeguards §5(b) requires (data minimised and optional,
    encrypted, unreadable before the trigger, erased on
    cancellation, the transfer feature described publicly in your
    privacy notice, full information at first contact). **Weak
    point:** supervisory authorities read §5(b) narrowly, and a
    holder's wish for privacy may not be accepted as an objective
    of the processing; if it is not, `atTrigger` with a stored name
    and date of birth would not be compliant for you. The design was
    kept with both options by product decision; it has no switch
    restricting holders to `atSetup`. If your counsel does not
    accept §5(b) here, ask for that switch before you offer the
    transfer.
- **National digital-legacy rules** (for example the French
  post-mortem data directives of the Loi pour une République
  numérique) concern a person's instructions for their data after
  death. A transfer at a date or after inactivity is not designed
  as such a directive and may or may not satisfy one: context for
  your own legal reading, not a claim of the matrix.

## Caveats for the operator

- **Audit-survival gap on PG (Q8 / GH
  [`#75`](https://github.com/pryv/open-pryv.io/issues/75))**,
  `auth.delete` does not currently call
  `auditStorage.deleteUser(userId)` on PostgreSQL deployments,
  so account-level deletions leave the audit history of the
  deleted subject in `audit_events`. For most retention regimes
  this is fine (audit is a separate retention concern under
  HIPAA §164.316(b)(2)(i) minimum-6-year + similar regs, see
  Q16) but the operator should know.

- **Stream-level retention does not delete attached metadata
  on parent streams**, if metadata about the deleted events
  lives on the parent stream's `clientData` or as separate
  metadata events, those need their own retention rule.

- **Cascade discipline**: `streams.delete` with
  `mergeEventsWithParent=false` cascades to all events in the
  sub-tree. `mergeEventsWithParent=true` re-parents events to
  the deleted stream's parent, which is wrong for retention
  (events would survive their retention boundary). Always
  `mergeEventsWithParent=false` for retention scenarios.

- **HFS series data retention**: `series:*` event-type events
  carry a separate data-point store; `events.delete` on the
  series event deletes the container but the operator should
  also call the HFS series-clear endpoint (`DELETE /events/<id>/
  series`) to drop the data points. The
  `ACCOUNT-BACKUP-DSAR-COMPLETENESS` work (Q10 / GH
  [`#73`](https://github.com/pryv/open-pryv.io/issues/73))
  addresses the related gap in the backup tool; the retention
  pathway is consistent, both APIs are exposed, the operator
  composes both.

## Implementer takeaway

If a regulator asks "how does your deployment satisfy storage
limitation under Art.5(1)(e)":

1. **Cite the policy**: your retention rules document, with
   per-stream-class periods + per-purpose justifications.
2. **Cite the enforcement**: your retention job (deployment
   topology + scheduler + runbook).
3. **Cite the audit trail**: Pryv's audit log captures every
   retention deletion with access ref + timestamp; combined
   with your job logs, the chain is reconstructible.
4. **Address the engine-dependent backup tail**: your backup
   rotation policy + retention cutoffs together complete the
   storage-limitation argument across the full data lifecycle.

Since account auto-deletion (2.0.0-rc.66), the account level of the
same answer is: your preset (`account.autoDeletion.inactivity.
defaultDays`) as the policy, stated in your privacy notice; the
core's sweep as the enforcement, measured with `dryRun` before it
was armed; the sweep's WARN log lines (and, with
`audit.onUserDelete: keep`, the `account.autoDeletion.erase` audit
rows) as the trail.

If a regulator asks "show me last week's retention deletions":
`events.get` with `fromTime=<last-week>` and a stream query selecting
the `:_audit:action-events.delete` action under the retention job's
`:_audit:access-<retention-job-token>` access.

## See also

- `context/client-data-conventions.md`,
  `clientData.retention` advisory-metadata convention (the
  policy-claim side of the same primitive set).
- `proposals/audit-on-user-delete.md`: Q8 / Art.17 audit-
  survival gap on PG; relevant when retention triggers
  account-level deletion.
- `proposals/aliases-as-pseudonymization-primitive.md`, the
  access alias (`randomAlias`) and why it is not an account-level
  anonymisation verb.
- `context/audit-archival-via-custom-datastore.md`: Q16 audit
  log tiering pattern; a different retention dimension (audit
  data itself rather than event data).
- `docs/pryv-primitives.md`: `audit-event-stream` +
  `backup-restore` entries (the primitives the retention
  pattern composes).
- `proposals/account-auto-deletion.md`: account-level
  auto-deletion (shipped in 2.0.0-rc.66) and the planned transfer,
  the rows they change.
- `samples/scheduled-retention-job/`: the event-level retention
  job recipe (account-level retention: the built-in feature since
  2.0.0-rc.66).
