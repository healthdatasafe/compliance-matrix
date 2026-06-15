# Implementer FAQ — gap-probing answers

Q&A from the implementer-perspective gap-probing sessions on the
matrix. Each entry pairs (a) the question a Pryv customer might ask
during evaluation with (b) the answer + the matrix-side encoding
that resulted. Each entry links to the commit on
`pryv/compliance-matrix master` that recorded the decision.

The questions are deliberately written from a Pryv customer's
perspective — they probe gaps an implementer would care about, not
abstract regulatory text. Future evaluators reading this FAQ can
short-circuit the same conversation.

## Session 2026-05-19

### Q1 — Do you support customer-managed encryption keys (CMEK / BYOK) for event data at rest?

**Short answer:** **voluntarily missing**. At-rest encryption of
bulk event data is the hosting provider's responsibility (LUKS,
PG TDE, KMS-wrapped backup archives). Customer-managed encryption
keys (CMEK / BYOK) sit at the same infrastructure layer.

**Future direction:** end-to-end encryption where the server itself
never holds plaintext — research direction is proxy re-encryption,
tracked under internal backlog slug `E2E-ENCRYPTION`.

**Matrix encoding:**
- `proposals/e2e-encryption.md` — mirror of the upstream backlog;
  lists rows that would shift coverage if E2E ships.
- `hipaa-security.164.312(a)(2)(iv)` `detail` block extended to
  spell out the deliberate-out-of-scope + future direction.

**Commit:** `53a613e`.

### Q2 — Is the audit log tamper-resistant against an admin with root on the Pryv host?

**Short answer:** **voluntarily missing today**. Audit log rows are
append-only by convention in the write path, but there is no
software-side tamper-resistance signal — no hash chain, no per-row
signature, no operator-signed checkpoint, no automated WORM export.
Integrity rests on operator-side filesystem hardening (immutable
mounts, append-only flags, file-integrity monitoring like AIDE /
Tripwire, out-of-band SIEM forwarding to a WORM store).

**Future direction:** chained / hashed / signed audit log (per-row
`prev_hash` + periodic operator-signed checkpoints). Tracked under
internal backlog slug `AUDIT-LOG-CHAINING`.

**Matrix encoding:**
- `proposals/audit-log-chaining.md` — mirror of the upstream
  backlog; lists rows that would shift coverage when shipped.
- `hipaa-security.164.312(c)(2)` + `iso-27001.A.8.15` `detail`
  blocks extended to spell out today's posture + planned chain.

**Commit:** `3764978`.

### Q3 — What does "per-user storage isolation" mean per engine? Can a bug let user A's events leak to user B?

**Short answer:** **logical isolation on PG, physical on
SQLite.** SQLite gives one file per user — physical filesystem-level
separation; the wrong API call can't open the wrong file. PG shares
tables with isolation enforced by app-code `userId` filtering — a
bug that forgets the filter leaks across users. **Both engines are
first-class** for legitimate operator reasons (scale vs strict-audit
posture).

**Engine-switch is supported.** `bin/backup.js` dumps user data in
engine-neutral format; `--restore` reads into whichever engine the
target deployment uses. Operators can start strict-on-SQLite, scale
to PG later (or vice versa for emergency DR).

**Side question — per-account DB on PG?** Technically yes (PG
supports many DBs per cluster), but **sharp cardinality limit**: PG
handles up to ~5K-10K DBs gracefully; beyond that, autovacuum
degrades + schema migrations have to iterate every DB. Fits B2B
SaaS with hundreds of operator-tenants; pathological for consumer-
scale millions of users. **Not currently a Pryv-supported mode.**

**Matrix encoding:**
- `context/per-engine-isolation.md` — canonical per-engine
  isolation breakdown + engine-switch fact + four operator
  mitigation patterns (PG row-level security, per-schema,
  per-account-DB low-cardinality only, per-tenant deployment).
- `gdpr.Art.25` + `hipaa-security.164.312(a)(1)` `detail` blocks
  cross-link to the context note.

**Commit:** `7e74f59`.

### Q4 — SMS-OTP is deprecated for AAL2+ MFA. Should the matrix's `Implemented | High` rows on authentication-strength downgrade?

**Short answer:** **MFA is pluggable.** The `Service` base class at
`components/business/src/mfa/Service.ts` defines `challenge()` +
`verify()` methods that subclasses override. Two subclasses ship
today (`ChallengeVerifyService`, `SingleService`) targeting
HTTP-callable external providers (SMS by config default), but the
abstraction is generic. Operators can plug in **any HTTP-based MFA
provider** via `services.mfa` config without code change — Twilio
Authy, Auth0 MFA, Duo Web push, etc. Operators writing a `Service`
subclass can implement any provider.

**Gap is documentation, not feature scope.** The primitive
catalogue's "SMS-based by default" phrasing reads as feature scope
when it's a default. NIST AAL framing depends on configured
provider: SMS-only = AAL1; TOTP+push or WebAuthn = AAL2.

**Future direction:** ship reference plugins for server-side TOTP +
WebAuthn (the latter needs a `LocalService` abstraction since
WebAuthn ceremonies don't fit the HTTP-roundtrip `Service` shape).
Tracked under internal backlog slug `MFA-MODERN-METHODS`, as part
of the broader OAuth2 / account-based-signatures auth-modernisation
arc.

**Matrix encoding:**
- `proposals/mfa-modern-methods.md` — mirror of the upstream
  backlog; three-step modernisation (docs → TOTP → WebAuthn).
- `docs/pryv-primitives.md` MFA section rewritten to spell out
  pluggability + per-provider AAL framing.
- `hipaa-security.164.312(d)` `detail` block extended.

**Commit:** `23c9895`.

### Q5 — How do you handle workforce / role-based access control granularity (e.g., 100 nurses in a hospital deployment)?

**Short answer:** **two composable patterns**.

**Mechanism 1 — group-access with per-caller audit:** a single
access token can be granted to a group (e.g., "nurses"). The group
itself is managed *outside* Pryv (the implementer's IdP / IGA /
hospital IT system maintains membership). When a group member makes
an API call, the request passes the access token PLUS the acting
individual's id via `Authorization: <TOKEN> <CALLERID>`
(space-separated). Pryv records both in audit: the access id (group
identity) and the caller id (individual). Trust model: Pryv trusts
the access-token holder to forward a truthful `callerId`.

Code: `components/business/src/MethodContext.ts` `parseAuth()` +
`components/business/src/accesses/refs.ts` `composeStoredRef`.
The stored `createdBy` / `modifiedBy` becomes `<accessId> <callerId>`
when callerId is present.

**Mechanism 2 — seed access for sub-account derivation:** an app
holding an access can create sub-accesses (one per group member)
lazily. Each sub-access is independently revocable; the seed access
is the parent that can manage all its children (`createdBy === seed`).
Combines fine-grained per-person revocation with group-level
operations. Useful when individual revocation matters more than
audit fidelity, or when group membership churns.

Code: `accesses.ts` `query.createdBy = currentAccess.id` lookups +
`isManaged` parent/child check.

**Neither is "roles + groups inside Pryv".** Pryv deliberately
delegates group membership to external systems; the two patterns
provide the right hooks for either audit-trail-preserving group
exercise (mechanism 1) or independently-revocable per-member
provisioning (mechanism 2).

**Matrix encoding:**
- `context/workforce-access-patterns.md` — full breakdown of both
  patterns + when to use each + trust models + matrix-row mapping.
- `hipaa-security.164.308(a)(3)(ii)(C)` (Termination procedures)
  `detail` extended with the two patterns for hospital-scale
  termination.
- `iso-27001.A.5.16` (Identity management) `detail` extended:
  roles + groups deliberately outside Pryv; IdP is the source of
  truth.

**Commit:** `6c5f070`.

### Q6 — Rate limiting / API throttling / DoS protection. Does Pryv ship throttling?

**Short answer:** **voluntarily missing at the Pryv layer.** In-
process rate limiting was considered + deliberately rejected for
two reasons: (1) multi-core load distribution makes per-core
counters mis-fire (a cross-core shared counter becomes itself a
DoS target); (2) abuse signatures are operator-specific (research
batch imports vs consumer-app per-user limits are wildly
different). The right layer is the reverse proxy / WAF / API
gateway — already deployed by the operator for TLS / geo-routing /
WebSocket upgrades, purpose-built for traffic shaping, and tunable
per actual workload.

**What Pryv contributes:** detection layer, not enforcement.
- Audit log captures every API call (fail2ban watches it for
  auth-failure patterns; SIEM consumes for anomaly detection).
- Observability adapter surfaces per-core request-rate + latency +
  error-rate metrics.
- `accesses.delete` is the kill-switch when abuse is detected.

**What the operator handles:** per-IP rate limits, per-token rate
limits, per-route limits, WAF rules, account-lockout via fail2ban,
DDoS scrubbing, burst / cost protection — all in their existing
reverse-proxy / WAF / API-gateway stack.

**Future direction:** ship reference reverse-proxy configs (nginx,
HAProxy, Cloudflare, Traefik, Caddy) per workload profile
(consumer-app, B2B research, hospital) + matching fail2ban jail
definitions. Tracked under internal backlog slug
`RATE-LIMITING-RECIPES`. Doesn't change the
Pryv-side stance; closes the operator-experience gap of "what do
I actually configure?"

**Matrix encoding:**
- `context/rate-limiting-and-dos-protection.md` — full rationale +
  operator mitigation patterns + when the stance might change.
- `iso-27001.A.8.21` (network services security) `detail` extended.
- `hipaa-security.164.308(a)(5)(ii)(C)` (login monitoring) `detail`
  extended with the fail2ban + reverse-proxy pattern.

**Commit:** `271f34d`.

### Q7 — Webhook delivery: HMAC signing, replay protection, TLS-only, retry, token-leakage? (Classic push-with-content security minefield)

**Short answer:** **Pryv webhooks are signal-only by design.** The
webhook POST body carries a notification that something changed —
not the changed data itself. Receivers consume the change by
making an **authenticated GET** back to Pryv (using the access
token they already hold) and reading the current state via
`events.get` / `streams.get`.

This sidesteps most of the classic webhook security minefield by
construction:

| Classic concern | Pryv signal-only consequence |
|---|---|
| HMAC signing | not required — no sensitive content in body to authenticate; forged signal → at worst an extra authenticated GET |
| Replay protection | not required for data integrity — replayed signal → idempotent GET |
| Token leakage in body | impossible — tokens stay with receiver, not in wire payload |
| Body-content tampering | no sensitive content to tamper with |

**What still matters operationally:**
- TLS on delivery (don't leak the *existence* of a change).
- Delivery retries + back-off; receiver awareness of failure
  state so it can fall back to polling.
- Receiver poison-pill protection (timeouts + concurrency caps on
  the Pryv worker side).
- GET-side auth (already secured by `access` + `permissions` +
  `audit`).

**Matrix encoding:**
- `context/webhooks-signal-only.md` — full design + operational
  caveats + the security-implications comparison table.
- `docs/pryv-primitives.md` gets a new `webhooks` primitive entry.
- `hipaa-security.164.312(e)(1)` (transmission security) `detail`
  extended with the signal-only framing.

**Commit:** *(this commit)*.

## Session 2026-05-20

### Q8 — Right-to-erasure end-to-end including the audit log itself: when `auth.delete` runs, does the audit log referencing the deleted subject also disappear?

**Short answer:** **engine-dependent today — undocumented gap;
queued as a bug fix + operator setting** (not a "voluntarily
missing" call). The `gdpr.Art.17` row claims "configurable end-to-
end erasure", but on a PostgreSQL audit deployment the audit rows
referencing the deleted subject silently survive.

**What the code actually does.** The `auth.delete` pipeline
(`components/api-server/src/methods/auth/delete.ts`) runs
`checkIfAuthorized → validateUserExists → validateUserFilepaths →
deleteUserFiles → deleteHFData → deleteAuditData → deleteUser`.
The `deleteAuditData` middleware
(`components/business/src/auth/deletion.ts:104-108`) calls
`userLocalDirectory.deleteUserDirectory(userId)` — i.e. it wipes
the per-user filesystem directory wholesale.

| Audit engine | Storage layout | Outcome of `auth.delete` |
|---|---|---|
| SQLite | per-user file under user-data directory | wiped ✅ |
| PostgreSQL | shared `audit_events` table, rows keyed by `user_id` | **not touched** ⚠️ |

`AuditStoragePG.deleteUser(userId)` exists
(`storages/engines/postgresql/src/AuditStoragePG.ts:60-63`) and
runs `DELETE FROM audit_events WHERE user_id = $1` — but the only
in-tree caller is `RestoreOrchestrator.ts:341` (backup-restore
preflight). The `auth.delete` pipeline does not call it.

**Planned fix (one bundled change).**

1. Add `deleteAuditDataStorage` as its own explicit middleware in
   `auth.delete`, calling `auditStorage.deleteUser(userId)`. Decouples
   "wipe filesystem directory" from "erase audit rows". Both engines
   converge.

2. Operator setting `audit.onUserDelete: erase | keep | pseudonymise`
   (default `erase`).
   - `erase` — runs `auditStorage.deleteUser(userId)`; matches
     today's SQLite default + the GDPR/CCPA/PIPEDA-friendly path.
   - `keep` — skips the call; for HIPAA §164.316(b)(2)(i) 6-year
     retention, MDR Art.10(8) device-history retention, or any
     regime keeping audit under a separate lawful basis (GDPR
     Art.17(3)(b) "compliance with a legal obligation"); the
     implementer documents this in their DPIA.
   - `pseudonymise` — null/hash the audit row's personal
     identifiers (`accessId`, `userId`, params containing personal
     data); keep timestamps + action verbs. Composes with the
     `randomAlias` primitive
     (`proposals/aliases-as-pseudonymization-primitive.md`) — an
     alias-issuing deployment never stores the canonical
     identifier in the audit row at all.

**Future direction note.** The chained-audit-log proposal
(`proposals/audit-log-chaining.md`) must accommodate post-hoc row
deletion / pseudonymisation — likely via "tombstone" rows that
preserve chain continuity while removing the personal data.

**Matrix encoding:**
- `proposals/audit-on-user-delete.md` — mirror of the upstream
  backlog; lists rows that would tighten when shipped.
- `gdpr.Art.17` `detail` block extended with the per-engine
  truth-table + planned consistency fix + operator setting +
  pointer to the `randomAlias` composition.
- `hipaa-security.164.316(b)(2)(i)` (6-year audit retention)
  `detail` block added — calls out the `keep` mode as the
  HIPAA-friendly path + the §164.530(j) separate-lawful-basis
  framing.
- Upstream backlog: internal slug `AUDIT-ON-USER-DELETE`.

**Commit:** *(this commit)*.

### Q9 — Data masking. Specifically: read-time per-role redaction, static masking for non-prod environments, audit-log PII leakage, field-level encryption at the schema layer

**Short answer:** **Pryv enforces masking by *projection*, not by
*transformation*.** Stream-level isolation + permission-scoped access
tokens hide whole sub-trees from a given role — that's Pryv's
contribution. Rewriting field values at read time, walking a clone
to apply faker transforms, hash-on-read — all **application-layer
concerns by design**. The audit log is **data-minimal by
construction** (no request body captured). Field-level encryption is
solved today at the infrastructure layer; **E2E encryption is the
natural future primitive** for the transformation-flavour use cases.

Per the four flavours asked:

| Flavour | Classification |
|---|---|
| Read-time per-role redaction (`j***@example.com`) | **voluntarily missing** — application layer by design; Pryv keeps the storage layer deterministic (no "partially redacted" API response) |
| Static masking for non-prod environments | **voluntarily missing** — application layer today; E2E encryption would help indirectly (cryptographically opaque clones) |
| Audit log PII leakage | **filled by existing design** — audit captures action + source + URL query + access ref + integrity hash; **never the request body** (verified at `components/audit/src/Audit.ts:151-166` + `components/middleware/src/setMinimalMethodContext.ts:29`); the `auth=` param is explicitly stripped |
| Field-level encryption at the schema layer | **voluntarily missing today** — operator/infrastructure layer (LUKS / PG TDE / KMS-wrapped backups) or application-layer pre-encryption; E2E encryption is the natural future primitive |

**Why projection-only.** Rewriting one field for one access at read
time would require runtime knowledge of which field is "sensitive"
in the context of that access — a policy decision tied to the
deployment, the regulatory regime, and the consumer's role. Pryv's
position: that policy lives in the calling application where
business context is rich; the storage layer ships the substrate
(stream isolation + permission scoping) that makes the projection
mechanically enforceable. Keeps the API deterministic for auditors
(canonical event or 403, not "partially-redacted").

**Audit-no-content is a non-trivial design property.** It means:
- The audit log itself doesn't accumulate residual personal data
  (favourable under GDPR Art.5(1)(c) data minimisation + Art.17
  erasure).
- HIPAA §164.502(b) minimum-necessary review of the audit log is
  trivial — there's no PHI in the audit row to assess in the first
  place.
- The §164.528 accounting-of-disclosures description column lives
  at the API-shape level (e.g., `events.get` on stream X), not at
  the per-event-content level — sufficient under §164.528 and
  safer than alternative designs that store more.

**Matrix encoding:**
- `context/data-masking-projection-vs-transformation.md` — full
  design rationale + the projection-vs-transformation table.
- `docs/pryv-primitives.md` audit entry — extended with the
  "captures / does NOT capture" + "data-minimal by construction"
  language.
- `scopes/iso-27001.yml` A.8.11 (Data masking) — overview rewritten
  to lead with projection-vs-transformation framing; detail block
  spells out the boundary.
- `scopes/gdpr.yml` Art.30 technical block — adds the audit no-
  content + Art.17 + Art.5(1)(c) implications.
- `scopes/hipaa-security.yml` 164.312(b) detail — adds the
  "audit is not a second copy of PHI" framing for §164.502(b).
- `scopes/iso-27001.yml` A.8.15 detail — flags the no-content
  property as a separate auditor-relevant fact.
- `scopes/hipaa-privacy.yml` 164.528 detail — sharpens the
  "description" field guidance (URL query/path, not body).
- `proposals/e2e-encryption.md` — extended with the static-
  masking-for-non-prod + field-level-encryption use cases that E2E
  would help when shipped.

No new backlog filed: transformation-flavour masking is
intentionally application-layer; the E2E proposal already covers
the future Pryv-native angle.

**Commit:** *(this commit)*.

### Q10 — DSAR full-loop at production scale: is there a Pryv-native "give me everything" tool, and does it ship a complete Art.15 bundle?

**Short answer:** **Yes there's a tool** —
[`pryv-account-backup`](https://github.com/pryv/pryv-account-backup)
(npm `@pryv/account-backup`, **v0.4.0** since 2026-05-27) — subjects or
implementers run it with the subject's credentials and get a downloadable
folder. The Q10 original gaps (audit log + HF series data points + webhooks
+ dead `/followed-slices` v1 leftover) all **closed 2026-05-27**
(commits `1a05482` v0.3.0 + `30b1661` C.4 partial + `ea6ae6a` v0.4.0).
Tier stays `Implemented | High`; one tooling follow-up remains
(chunked-events fetch for production-scale subjects — feature chip on
`gdpr.Art.15`).

**Per the five sub-questions (updated 2026-05-27):**

| # | Sub-question | Answer |
|---|---|---|
| 1 | Pryv-native DSAR export primitive? | **Yes — `pryv-account-backup`** (`npm start`). Walks account / profiles / streams / accesses / events / attachments / **audit log** / **HF series data points** / **webhooks** / per-file integrity manifest. Subject-driven (no operator credentials needed). |
| 2 | HF series read pattern at scale? | `GET /events/<id>/series` per series-event reads data points (HFS worker). The backup tool calls this for every `series:*`-typed event as of v0.3.0; data points land in `hf-data/<eventId>.json`. Per-series 4xx is non-fatal (series may be empty / unreadable; skip + log). |
| 3 | Attachment download semantics in the bundle? | Backup script downloads bytes inline (10-parallel) via `GET /events/<id>/<attId>?readToken=...`. Inline binaries land in `attachments/` under the bundle folder. Multi-attachment events round-trip in full as of v0.4.0 (multi-attachment restore). |
| 4 | Cross-core aggregation in multi-core deployments? | Subject's user-account is core-affine — `apiEndpoint` resolves to the home core. CMC counterparty data lives in the counterparty's account on whichever core hosts that subject. Backup runs against one `apiEndpoint`; the subject must run a separate backup against each CMC-shared account they hold. Not a v2-only concern; same for multi-region deployments. |
| 5 | Audit log truncation interaction with `audit.onUserDelete` (Q8)? | Both Q8 + Q10 fixes shipped 2026-05-27. The backup tool fetches audit via `/audit/logs`. `audit.onUserDelete: keep` mode means the bundle includes the long audit history; `pseudonymise` mode (REFUSED AT BOOT until `auth.randomAlias` ships) will mean the audit content carries aliases rather than the canonical username; `erase` (default) means the audit content matches whatever wasn't already erased by prior `auth.delete` calls. The subject's right to read their own audit log via `audit.getLogs` works directly with their personal token. |

**Audit of pryv-account-backup v0.4.0 vs Art.15(1) sub-paragraphs** — full
table at `context/account-backup-coverage.md`. Highlights:

- (a) purposes — `access.clientData.purpose` ✅
- (b) categories — derivable from `events.json` ✅
- (c) recipients — accesses ✅, audit ✅, webhooks ✅
- (d) retention — `access.clientData.retention` + expiry ✅
- (g) source — events ✅, audit cross-ref ✅

**Operational guidance until the backlog ships** (per
`context/account-backup-coverage.md`): augment the
`pryv-account-backup` output by manually fetching `/audit/logs` +
`GET /events/<id>/series` per series-event + `/webhooks`, then
combine with the bundle. The subject's personal token has all
necessary permissions.

**Does Pryv-the-API need additions for this?** Read side: no.
Every gap is reachable from existing v2 endpoints. Two
ergonomics ideas (`GET /export` aggregator + `audit/logs?asExport=true`)
are nice-to-have but not blockers. Restore side: also no — HF
series data + multi-attachment writes both use existing endpoints
that the backup tool just doesn't exercise yet.

**Matrix encoding:**
- `pryv/pryv-account-backup` registered in the workspace
  (2026-05-20).
- `proposals/account-backup-dsar-completeness.md` filed (mirror
  of internal backlog slug `ACCOUNT-BACKUP-DSAR-COMPLETENESS`).
- `context/account-backup-coverage.md` — coverage matrix + Art.15(1)
  sub-paragraph map + operational guidance for today.
- `docs/pryv-primitives.md` — new `account-backup-tool` primitive
  entry.
- Rows tagged with `account-backup-tool` primitive + `planned:`
  chips: `gdpr.Art.15` (bug + feature), `gdpr.Art.20` (Art.20
  round-trip feature), `ccpa.1798.110`, `pipeda.Principle.4.9`,
  `swiss-nlpd.Art.25`, `hipaa-privacy.164.524`.

**Commit:** *(this commit)*.

### Q11 — Time synchronization across cores. Audit row ordering, LE cert rotation, access expiry — do I need to run NTP, and does Pryv enforce or detect skew?

**Short answer:** **clock sync is the operator's job** (`chronyd` /
`ntpd` on each host). Pryv uses machine wall-clock + ships
**`meta.serverTime` in every API response** for client-side skew
detection. Server-side, the architecture is **core-affine** —
users live on exactly one core, the data plane never proxies
across cores, and PlatformDB is an indexing + uniqueness service
(not a routing layer). So **cores never need to agree on clock
value or cert validity**; the dangerous failure modes are all
intra-core. Two **small queued additions** (`CLOCK-SKEW-CLUSTER-CHECKS`)
will add server-side skew detection at two natural checkpoints:
bootstrap-join + pre-cert-load.

**Architectural correction recorded** (from this Q):
- A user is **assigned to one core**; subsequent API calls resolve
  to that home core via `/reg/:uid/server` (PlatformDB
  `user-core/<username>` lookup).
- Cores never proxy a user's data calls to each other. The only
  cross-core flow is the registration-time `forwardIfCrossCore`
  handshake + the CMC counterparty pattern where user
  B's client talks directly to user A's home core (B's client has
  two `apiEndpoint`s, not one core talking to another).
- PlatformDB carries: `user-core/*` lookups, `emailIndex/*`
  uniqueness, DNS records, TLS materials, `access-state/*`,
  `cluster_kv/*`. **Not** events / streams /
  accesses / audit / attachments.

**Per the three sub-questions:**

| # | Question | Answer |
|---|---|---|
| 1 | Audit row timestamps coherent across cores? | **Not relevant** — audit rows from a single user land on a single core (core-affine). Per-core monotonic time is the only requirement; cross-core ordering not meaningful by design. |
| 2 | LE cert rotation across cores? | Cores do **not** need to agree on cert validity; each core's TLS stack judges its loaded cert against its own clock at handshake time. The risk model is intra-core: forward-skew past `notAfter` → that core's TLS rejects its own cert; backward-skew before `notBefore` of a freshly-rotated cert → refuses to load it. LE's 60-day issue / 90-day expire gives ~30 days of overlap so it takes weeks of drift to bite. Queued fix: pre-load validity check refuses the swap if local clock falls outside the new cert's window. |
| 3 | Access expiry across cores? | **Not relevant** — an access is core-bound; a user authenticating on core-A then calling core-B cannot happen. One core, one clock judges expiry. |

**Pryv's contribution today:**
- `meta.serverTime` in every API response (Unix timestamp seconds;
  `components/api-server/src/methods/helpers/setCommonMeta.ts:49`).
- Webhook payloads include `serverTime`
  (`components/business/src/webhooks/Webhook.ts:185`).
- That's the **client-side** skew-detection primitive. No
  server-side skew detection today.

**Planned addition** (small dev, two intra-core checkpoints):

1. **Bootstrap-join skew check** — joining core compares its
   `Date.now()` to the issuer's `serverTime` before ack; refuses
   to ack if `|delta| > cluster.clockSkewThresholdSec`
   (default `30s`). Operator fixes NTP, retries.
2. **Pre-cert-load validity check** — worker-side `acme:rotate`
   handler parses the new cert with `x509.X509Certificate`, checks
   `validFromDate / validToDate` vs local clock with the same
   `clockSkewThresholdSec`. Refuses the swap on failure; keeps
   previous cert loaded; logs for operator alert.

After shipping, `iso-27001.A.8.17` (Clock synchronization) moves
from `out-of-scope` to `F: Awareness | Low` — Pryv contributes
detection at two checkpoints + the existing `serverTime` client
helper; operator still runs NTP.

**Audit-log-chaining (Q2 backlog) precondition recorded.** The
chain reconstructs per-core only because the data plane is
per-core; the chain requires per-core monotonic time, not
cluster-wide clock agreement. Added as an explicit constraint to
the `AUDIT-LOG-CHAINING` backlog and its proposal mirror.

**Matrix encoding:**
- New internal backlog slug `CLOCK-SKEW-CLUSTER-CHECKS`.
- New proposal `proposals/clock-skew-cluster-checks.md`.
- New architecture context `context/core-affinity-architecture.md`
  (the mental-model correction made during this Q).
- `iso-27001.A.8.17` Clock synchronization overview + detail
  rewritten with the `serverTime` cross-reference + core-affine
  framing + `planned:` chip.
- `docs/pryv-primitives.md` audit entry extended with
  time-semantics + `serverTime` cross-reference.
- `proposals/audit-log-chaining.md` + its internal-backlog
  twin both gain the "per-core monotonic time is the
  precondition" constraint section.

**Commit:** *(this commit)*.

### Q12 — Data residency: what actually pins user A's events to region X, and at what guarantee level?

**Short answer:** **core-level guarantee, enforced by the
architecture.** A user is bound at registration to one core (via
PlatformDB's `user-core/<username>` mapping); all their events,
streams, accesses, audit, and attachments live exclusively on that
core's storage. **Cores share no event/stream/audit data with each
other** — the only horizontal data is PlatformDB, which carries
`user-core/*` lookups, `emailIndex/*` uniqueness, DNS records, TLS
materials, `access-state/*`, `cluster_kv/*` — and nothing else.

**No intermediary in the data path**: client ↔ core data flow is
direct over TLS. No Pryv-shipped reverse-proxy, API gateway, CDN,
or backend hop. Each core terminates TLS itself (the optional
ACME integration runs the cert on the same Node process serving the
API + HFS endpoints). Operators *can* place a reverse-proxy in
front of their cores (`docs/nginx-ingress-sample.conf` in
open-pryv.io is a sample), but that's an operator-side choice +
an operator-side compliance concern, not a Pryv-native step. The
residency story therefore extends to "no third party in the
read/write path that could log, cache, or replicate the data"
by default.

**The mechanism**: PlatformDB's `user-core/<username>` mapping is
the residency anchor. Set at registration, immutable in normal
operation. Cross-region data movement is **not** a Pryv-native
primitive — moving a user between cores requires deliberate
operator action (`bin/backup.js` on source + `--restore` on
target). There is no per-event geographic tag, no per-stream
region constraint, no admission check at the API layer. The
architecture itself is the enforcement.

**CMC counterparty consideration** (the one cross-jurisdiction
runtime case): when an EU subject shares a stream with a US
counterparty via Cross-Modular Capability, the US counterparty's
client connects directly to the EU subject's `apiEndpoint` (i.e.,
the EU core). The EU data does **not** replicate to the US core
— it's fetched on-demand by the US client. From the EU subject's
GDPR Art.44 perspective this fetch *is* an international transfer
(data crosses borders to reach the reader), but the data-at-rest
residency is preserved (no copy in the US). The implementer
records the recipient hosting + lawful basis on the access's
`clientData.cross_border_basis` to make the transfer auditable.

**Multi-core vs single-core**: a multi-core deployment is the only
way to get per-user-jurisdiction residency on Pryv. A single-core
deployment in `us-east-1` means every user's data is in
`us-east-1`. Per-user residency is opt-in at the platform topology
level (the operator deploys cores in the relevant regions and
exposes them via `auth.hostings`).

**Why "no separate enforcement layer"**: there's no need for
per-event tags or admission checks because the data simply never
leaves the core. Pryv's compliance posture for data residency is
"no primitive exists to move data between cores", which is a
stronger guarantee than runtime-enforced rules (a runtime rule
can be misconfigured or bypassed; an architectural absence
cannot).

**Matrix encoding:**
- `docs/pryv-primitives.md` `data-residency` entry extended with
  the "Guarantee level — core-level" + "No intermediary in the
  data path" sections.
- `gdpr.Art.44` detail block extended with the architecture-as-
  enforcement framing + CMC counterparty nuance.
- `swiss-nlpd.Art.34` detail block extended with the same.
- `context/core-affinity-architecture.md` (filed in Q11) is the
  full mechanism reference — already cited from the relevant
  rows.

No backlog filed: this is a "filled by existing primitive"
classification — the architecture is the enforcement, and
already documented; the gap was the matrix not surfacing the
guarantee level clearly enough.

**Commit:** *(this commit)*.

### Q13 — Webhook subscription lifecycle: does revoking an access cascade to its webhooks?

**Short answer:** **No — this is a bug, classified + queued for
fix** (`WEBHOOK-CASCADE-ON-ACCESS-DELETE`). Today,
`accesses.delete` removes the access from cache + storage but
does NOT delete webhooks created by that access. The webhook
rows survive with a now-dangling `accessId` and **keep firing**
on matching events until the responder manually walks
`webhooks.get` + `webhooks.delete`.

**Code-verified findings:**
- `deleteAccesses` in `components/api-server/src/methods/
  accesses.ts:723-738` has no webhook cleanup step.
- The webhook repository (`components/business/src/webhooks/
  repository.ts`) ships `deleteOne(webhookId)` +
  `deleteForUser(user)` but no `deleteByAccess(accessId)`.
- `Webhook.send()` at `components/business/src/webhooks/
  Webhook.ts:106-147` checks `state === 'inactive'` but does NOT
  verify the parent access still exists / is still valid before
  firing.

**Sanity-check counter-path** (this is fine): full
user-account erasure via `auth.delete` **does** delete webhooks
through the `storageLayer.webhooks.removeAll` call in
`components/business/src/auth/deletion.ts:113-119`. The user-
erasure path closes the channel cleanly; only `accesses.delete`
in isolation leaks.

**Bounded by Q7's signal-only design**: a dangling webhook keeps
POSTing notifications to its URL but the receiver can't fetch
the data because their access token is dead (401 on the
authenticated GET back). So the **data exposure** is limited to
the existence of a change (metadata: "something happened on
stream X at time T"). However, the URL itself remains an active
outbound channel — non-zero severity in a breach scenario where
the original webhook URL was attacker-controlled.

**Planned fix** (small dev — `WEBHOOK-CASCADE-ON-ACCESS-DELETE`):
1. Add `deleteByAccess(user, accessId)` to the webhook
   repository.
2. Wire into the `deleteAccesses` middleware (call BEFORE the
   access-storage delete — partial-failure safety).
3. Belt-and-braces: `Webhook.send()` does a fire-time
   access-validity cache lookup; on miss, mark `state =
   'inactive'` + persist. Self-heals any future dangling-
   webhook situation.

**Operational workaround until the fix ships** (for responders
handling an immediate compromise):

```
# Walk all webhooks under the personal access:
GET /<apiEndpoint>/webhooks
# For each webhook returned:
DELETE /<apiEndpoint>/webhooks/<webhookId>
# Then revoke the compromised access:
DELETE /<apiEndpoint>/accesses/<accessId>
```

Order matters: delete webhooks BEFORE the access (the personal
token needs to still be valid when walking `webhooks.get`).

**Matrix encoding:**
- `proposals/webhook-cascade-on-access-delete.md` filed.
- `hipaa-security.164.308(a)(3)(ii)(C)` (Termination procedures)
  tagged with `planned: kind: bug, impact: medium`.
- `iso-27001.A.5.16` (Identity management) + `A.5.18` (Access
  rights) tagged with the same.
- Upstream backlog: internal slug
  `WEBHOOK-CASCADE-ON-ACCESS-DELETE`.

**Commit:** *(this commit)*.

### Q14 — Custom event-type catalogues: can implementers add their own types without forking `data-types`?

**Short answer:** **yes — filled by an existing primitive.** The
implementer maintains a **sibling data-model repo** (small,
schema-only, no Pryv runtime), publishes a merged catalogue to a
URL, and points the Pryv.io deployment's `service.eventTypes`
config at that URL. The server fetches at startup, validates
against the JSON Schema meta-schema, and **deep-merges** the
fetched catalogue on top of the baked-in defaults
(`components/business/src/types.ts:143-186`
`TypeRepository.tryUpdate` does
`defaultTypes = deepMerge(defaultTypes, fetched)`).

**Custom types are first-class**: same z-schema validation
pipeline, same canonical JSON serialisation in `events.get`,
same portability in `events.json` exports. They're indistinguishable
from upstream `pryv/data-types` types at the API surface.

**Two publication strategies:**

| Strategy | Catalogue content | Trade-off |
|---|---|---|
| Additive | only custom types (e.g. `{ types: { "measurement/vo2max": {...} } }`) | simpler — ride upstream `pryv/data-types` updates automatically via the baked-in default |
| Complete merged | vendor full upstream + add custom (HDS pattern) | deterministic — pin exact catalogue version, selectively cherry-pick upstream updates |

For most implementers the additive strategy is the right default.
Regulated deployments (HDS, DiGA, MDR) where the operator wants
explicit version-pinning for audit purposes lean toward the
complete-merged strategy.

**HDS exemplar**: `hds-macro/data-model` is a real-world
implementer-side data-model repo. Its build merges
`eventTypes-legacy.json` (vendored upstream) +
`eventTypes-hds.json` (HDS-specific additions like
`vulva-mucus-inspect/9d-vector`) into `dist/eventTypes.json`,
published via GitHub Pages at `model.datasafe.dev`. A Pryv.io
deployment serving HDS sets:

```yaml
service:
  eventTypes: https://model.datasafe.dev/eventTypes.json
```

**Validation guarantees**:
- Catalogue must validate against JSON Schema meta-schema at
  fetch time — invalid catalogues are rejected; server refuses
  to start.
- Per-event validation at write time — `events.create` calls
  `typeRepo.lookup(type).validate(content)`; unknown types or
  invalid content → `400`. No silent fallback.

**What the extension model does NOT cover**:
- Server-side computed fields (BMI from height+weight etc.) —
  application layer.
- Custom converters / transformations — application layer (HDS
  ships `converters/` but those are app artefacts, not server
  schemas).
- Custom stream hierarchies — documented in the data-model repo
  as conventions, not server-enforced; stream IDs remain
  free-form.

**Compliance implications**:
- GDPR Art.20 — custom types serialise identically to legacy;
  portability holds between deployments that share the catalogue.
  A receiving Pryv.io deployment without the custom catalogue
  rejects unknown types at write — implementer ensures schema
  alignment between transmitting + receiving operators.
- MDR Annex II §5 — implementer custom schemas live alongside
  legacy `pryv/data-types`; MDR-specific device-record formats
  can be authored once + reused across deployments.
- DiGA Annex 1.3.1 — FHIR-flavoured custom catalogue (each
  BfArM-approved FHIR resource → a Pryv event type) plugs into
  the same extension model. Mapping transformation stays
  app-side; the schemas being mapped are first-class.
- ISO 13485 §7.3 — the data-model repo IS the design-control
  artefact for the data layer (versioned, reviewed, signed off
  per §7.3.4).

**Matrix encoding:**
- New `context/custom-event-type-catalogues.md` — full pattern
  + HDS exemplar + the two-publication-strategies table.
- `docs/pryv-primitives.md` `data-types` entry extended with
  the extension model + cross-reference to the context note.
- `gdpr.Art.20` detail extended with the portability-of-custom-
  types section.
- `diga.A1.3.1` (FHIR-R4 interoperability) detail extended with
  the FHIR-flavoured-custom-catalogue path.

No backlog filed — this is "filled by existing primitive". The
extension model works today.

**Commit:** *(this commit)*.

### Q15 — `bin/backup.js`: does the dump file ship encrypted at rest by Pryv?

**Short answer:** **no — voluntarily missing by design; encryption
of backups is operator-side.** `bin/backup.js` produces an
**unencrypted dump file**; the operator wraps it with their
at-rest encryption layer (LUKS on the backup volume, GPG / age
before offsite ship, S3 SSE-KMS / Azure SSE / customer-managed
keys on bucket-level encryption) at the storage boundary. Same
pattern as the broader bulk-event-data at-rest encryption posture
(per Q1: at-rest encryption of bulk data is voluntarily
operator-side; see `proposals/e2e-encryption.md`).

**Why this classification stands** (vs "missing feature"): the
matrix's `Implemented | High` for HIPAA §164.308(a)(7)(ii)(A) and
`F: Infrastructure | Medium` for ISO 27001 A.8.13 both hold —
Pryv ships the backup primitive (`bin/backup.js` per-user dump
+ `--restore`); the *encryption layer* on the dump file is a
storage-engineering concern handled outside the Pryv runtime.
Implementer documents the chosen encryption scheme in their
backup-plan SOP.

**Concrete operator pipelines** (any one of these satisfies the
"protected at the same security level as the source" expectation
of ISO A.8.13):

- `bin/backup.js --output-dir /backups/<user>/`, with `/backups`
  mounted on a LUKS-encrypted volume.
- `bin/backup.js | gpg --encrypt --recipient backup-keypair`
  before `aws s3 cp`.
- `bin/backup.js --output-dir /tmp/backup/`, then
  `restic backup` (built-in AES-256 encryption + content-
  addressable storage + de-duplication) to S3 / B2 / Azure.
- S3 bucket-level SSE-KMS with a customer-managed CMK + IAM
  least-privilege on the upload role.

**HDS Activity.5** (Outsourced backup) already documents this
explicitly in its row overview — the operator handles transport
+ retention + at-rest encryption; Pryv provides the
backup-generation + restoration primitives.

**Matrix encoding:**
- `hipaa-security.164.308(a)(7)(ii)(A)` detail extended with
  the operator-side encryption framing + cross-reference to the
  e2e-encryption proposal as the broader pattern.
- `iso-27001.A.8.13` detail extended with the same.
- `hds.Activity.5` already had this language — no change needed.

No backlog filed — this is "voluntarily missing by design" +
already reflected in existing row tiers; the gap was the prose
not surfacing the operator-side scope cleanly enough.

**Commit:** *(this commit)*.

### Q16 — Audit log archival + pruning: what's the operator's story for a deployment running 5–10 years?

**Short answer:** **no Pryv-shipped pruning primitive** (consistent
with Pryv-as-end-user-will-enforcement — operators can't reach
into a user's own audit data freely). Audit growth is the
operator's storage-engineering problem to solve, **but Pryv
provides the architectural hook**: the audit log is exposed via
`@pryv/datastore` (`auditDataStore` registered as `_audit` in
`Mall.addStore`), so an operator can write a custom
`auditStorage` engine plugin that tiers hot recent rows + cold
archived rows behind the same `audit.getLogs` API. End users see
one continuous log; the operator chooses how the storage backs
it. Full pattern in
`context/audit-archival-via-custom-datastore.md`.

**Framing correction recorded during this Q**: HIPAA
§164.316(b)(2)(i) is a **minimum** 6-year retention rule, not a
maximum. HIPAA never *requires* destruction at the 6-year mark.
GDPR Art.5(1)(e) / PIPEDA Principle 4.5 / Swiss nLPD Art.6(4)
"no longer than necessary" framings exist but audit's lawful
basis is typically GDPR Art.17(3)(b) "compliance with a legal
obligation" — long retention is legitimate ground.

| Regulation | Audit retention pressure |
|---|---|
| HIPAA §164.316(b)(2)(i) | **minimum** 6 years; no max |
| MDR Art.10(8) | **minimum** 10 years device records |
| GDPR Art.5(1)(e) | "no longer than necessary" — but Art.17(3)(b) gives a separate lawful basis for the retention itself |
| Swiss nLPD Art.6(4) | "no longer than necessary" — same caveat |
| PIPEDA Principle 4.5 | "no longer than necessary" — same caveat |

So pressure to prune is **operational** (storage cost, query
performance over 1B+ row scales), not regulatory.

**The two tiering flavours** (full detail in
`context/audit-archival-via-custom-datastore.md`):

| Flavour | Approach | Available today |
|---|---|---|
| A — custom `auditStorage` engine plugin | Write a `storages/engines/<custom-tiered>/` package matching the existing SQLite + PG engine pattern; the `_audit` Mall registration is unchanged, the storage layer beneath it does the tiering | **yes** — engine-plugin system already exists |
| B — custom `@pryv/datastore` replacing `_audit` | Write a datastore module + register via `custom:dataStores` config with `override: true` to replace the built-in `_audit` registration | **partial** — Mall's `addStore` is a `Map.set(id, store)` and custom entries load before built-ins, so they get silently overwritten. Requires `BUILTIN-STORE-OVERRIDE` enhancement (DX-only, no compliance impact) |

The `BUILTIN-STORE-OVERRIDE` follow-on is filed as a DX
enhancement (not a compliance-shifting backlog item — the
extension path A works today; B would be ergonomics-only).

**Matrix encoding:**
- New context note `context/audit-archival-via-custom-datastore.md`
  documenting the pattern + the no-pruning-primitive rationale
  + the two flavours.
- `hipaa-security.164.316(b)(2)(i)` (Documentation — time
  limit) overview + detail rewritten to surface the
  minimum-not-maximum framing + cite the tiering pattern.
- `iso-27001.A.8.15` (Logging) detail extended with the
  tiering note for long-running deployments.
- `UPDATE-TRIGGERS.md` gains the `BUILTIN-STORE-OVERRIDE` entry
  flagged as DX-only.
- New internal scope-discipline feedback note distinguishing
  regulator-relevant gaps from DX/operational-sugar. User flagged
  this Q's drift into the override-by-id detail as the canonical
  example of where to stop and check scope.

No `planned:` chips added for the DX enhancement — the matrix
rows are correctly classified today; the extension hook
provides the operator's path.

**Commit:** *(this commit)*.

### Q17 — Breach scoping in under 72 hours: what artefact does Pryv hand my incident-response team at hour 0?

**Short answer:** **today, audit data is queryable per access
+ time window via `audit.getLogs?streams=[access-<id>]&fromTime=
<T>`, but no bundled `bin/breach-scope.js` exists and three
concrete gaps prevent a clean Art.33(1)(b)–(d) artefact.**
Filed as a feature backlog (`BREACH-SCOPE-TOOL`) with a
three-phase implementation plan.

**Gap analysis (user-directed during this Q):**

User confirmed `accessId` is bound to a single subject per the
core-affine architecture (`context/core-affinity-architecture.md`),
so per-access scoping is single-user-scoped by construction.
AccessIds are present in both the audit log + the `@pryv/boiler`
HTTP request log. With that anchor, what's missing for
`bin/breach-scope.js --access <id> --since <ts>`:

| Gap | What's missing | Impact |
|---|---|---|
| **Hard** | Global `accessId → userId` lookup | Without it, responder either walks all users O(N) via `system.users.list` + per-user `audit.getLogs?streams=[access-<id>]&limit=1`, or relies on SIEM-external correlation. Won't fit the 72h budget for large deployments. **Direction**: add `GET /system/accesses/<accessId>` admin API backed by a PlatformDB reverse-index. |
| **Medium** | `recordCount` on audit row for read operations | `events.get`/`streams.get` audit rows capture the input query but NOT the number of records returned. Re-running the historical query is fragile if events have changed since. **Direction**: extend audit-write path to capture `result.events.length` on the row. |
| **Medium** | `affectedStreamIds[]` on audit row | Complex stream queries (`*`, `.children`, `any/and/not` trees) resolve at request time; the resolved list isn't persisted. **Direction**: extend audit row with `content.affectedStreamIds[]`. |
| **Soft** | `bin/breach-scope.js` itself | Once inputs above exist, ~300 lines of glue: audit walk + event-type lookup for category derivation + Markdown / JSON report render. |

**What Pryv already ships toward this artefact**:

- Per-access audit query via stream filter `access-<accessId>`
  (every audit row carries the access stream + access-serial
  variant + an `action-<methodId>` stream).
- Time-range filter via `fromTime`/`toTime` on `audit.getLogs`.
- Action / method invoked in `content.action`.
- URL query in `content.query` (Q9 — body never captured).
- Integrity payload for mutating operations: `content.record =
  { key, integrity }` — gives a non-repudiable hash anchor for
  HIPAA-Breach §164.414 burden-of-proof.
- `meta.serverTime` per response → reliable clock anchor for
  the time-window picker.
- `Pryv-Access-Id` response header → SIEM-side log enrichment.
- `@pryv/boiler` HTTP log → second audit source for methods
  filtered out of application audit.

**Multi-core consideration (none needed)**: accessId is
single-subject + single-core. The reverse-index lookup runs
against PlatformDB (cluster-replicated) but the audit query
runs against one core's storage. No cross-core aggregation
required for a single compromised access.

**Phasing** (full detail under internal backlog slug
`BREACH-SCOPE-TOOL`):
1. `GET /system/accesses/<accessId>` + PlatformDB reverse-index
   — ~1-2 days.
2. Audit row extensions (`recordCount` + `affectedStreamIds`) —
   ~2-3 days (touches per-engine audit conformance).
3. `bin/breach-scope.js` + report shape — ~2-3 days.

**Why this is regulator-relevant** (not DX sugar): the §33
72-hour clock makes "ship a usable scoping artefact quickly"
a regulator-visible capability. The audit-row extensions in
particular fill information that's regulator-required
(§33(1)(b) "approximate number of records affected") and not
recoverable post-hoc without them. Distinguishes from the Q16
`BUILTIN-STORE-OVERRIDE` DX item where the matrix tier
doesn't shift.

**Matrix encoding:**
- `proposals/breach-scope-tool.md` filed.
- `gdpr.Art.33` tagged with `planned: kind: feature, impact:
  medium`.
- `swiss-nlpd.Art.24` (derives_from gdpr.Art.33) tagged with
  same.
- `pipeda.s.10.1` (already had AUDIT-LOG-CHAINING chip) gets
  the breach-scope-tool chip added — both proposals improve
  the RROSH evidence chain.
- `hipaa-breach.164.404(b)` (timeliness) tagged with same.
- `hipaa-breach.164.404(c)` (content) tagged with same.
- `hipaa-breach.164.414` (burden of proof; already had
  AUDIT-LOG-CHAINING chip) gets the breach-scope-tool chip
  added.

**Commit:** *(this commit)*.

### Q18 — CMC counterparties and GDPR Art.26 joint controllers: when User A's operator shares a stream with User B's operator via CMC, what's the controller relationship?

**Short answer: NOT joint controllership.** Pryv's CMC primitive
**requires subject validation** — User A's `consent/accept-cmc`
event is the authorising step for any cross-account data flow.
Each operator remains the **sole controller** for their
respective user's data; the lawful basis for B's operator
processing A's data is A's CMC consent record (GDPR Art.6(1)(a)),
not a controller-to-controller agreement. This is **controller-
to-controller transmission via subject consent** (Art.20(2)
lineage), not Art.26 joint controllership.

**Why this matters**: the matrix's `gdpr.Art.26` row previously
read like CMC was the joint-controller technical substrate.
That's misleading. Operators using CMC don't inherit Art.26
obligations from the CMC architecture; they get them only if
they separately decide to jointly process data outside the
subject-driven flow.

**The CMC flow in code** (verified at
`components/cmc/src/acceptOrchestration.ts`):

1. Requester (B's app) creates a `consent/request-cmc` offer
   event on a capability stream — declares title, description,
   consent text, requested permissions, expiry.
2. Capability URL delivered to A (out-of-band: email / QR /
   deep link).
3. A's app fetches the offer, displays it to A.
4. **A writes `consent/accept-cmc` event on A's account** —
   subject's explicit consent recorded durably.
5. CMC plugin (server-side, on A's core) creates the
   bidirectional access pair + delivers the back-channel
   apiEndpoint to B.
6. B's operator now holds an access token that resolves to
   A's `apiEndpoint`; B's client reads A's data directly from
   A's core (no replication).

The `consent/accept-cmc` event is queryable, auditable, and
revocable — A's subsequent `consent/revoke-cmc` triggers
bidirectional access revocation.

**Art.26 test mapped to CMC**:

| Art.26(1) element | CMC reality |
|---|---|
| "two or more controllers" | yes — Operator-X and Operator-Y |
| "JOINTLY determine purposes" | **no** — A's `consent/request-cmc` content + A's `consent/accept-cmc` decision determine the purpose; operators are infrastructure |
| "JOINTLY determine means" | **no** — A's access permissions are the technical control; operators run the API but neither decides the means |

So Art.26 doesn't apply to the CMC pattern by construction.
What applies instead:

- **Art.6(1)(a) (consent)** — A's `consent/accept-cmc` is the
  lawful basis for B's operator processing A's data.
- **Art.20(2) (controller-to-controller transmission)** — the
  CMC delivery IS this transmission; subject's right to
  transmit with consent.
- **Art.13/14 (transparency)** — each operator has their own
  transparency obligation to their respective user. A's
  operator informs A about who receives the data; B's
  operator informs B about what data they received + the
  lawful basis (A's consent).
- **Art.7(3) (right to withdraw)** — A's `consent/revoke-cmc`
  triggers symmetric bidirectional revocation.

**Where Art.26 actually applies (separately from CMC)**: two
operators running a joint research programme, joint health
platform, or shared-purpose service where both decide on
processing rules independently of subject choices. In that
case the arrangement IS the operator-side contract; Pryv's
contribution is `clientData.joint_controller_arrangement` on
the relevant accesses (point to the written agreement) +
"essence" of the arrangement in `clientData.privacy_notice`
for Art.26(2). Operator-edited metadata, no Pryv primitive
enforces it. This makes `gdpr.Art.26` correctly
`F: Awareness | Low` (was `F: Storage | Low`).

**Matrix encoding:**
- `gdpr.Art.26` overview rewritten to lead with the
  "CMC is NOT a joint-controller pattern by default" framing.
  Detail block spells out the Art.26 test mapped to CMC +
  where Art.26 actually applies.
- Facilitation mode shifted `storage` → `awareness` (the row
  is more about implementer awareness of the regulatory
  distinction than about Pryv storing arrangement metadata).
- `context/cmc-consent-primitives.md` extended with the Q18
  Art.26 finding alongside the existing Art.7 + Art.30
  treatments.

No backlog filed — this is matrix-prose tightening on a
correctly classified-but-misframed row. The CMC primitive
itself works as documented; the matrix just needed to surface
the regulatory framing correctly.

**Commit:** *(this commit)*.

## Session 2026-05-21

### Q21 — Data accuracy at ingest: what does Pryv reject, and where does the implementer take over?

**Short answer:** Pryv enforces **structural** accuracy at ingest
(JSON Schema validation via ajv-draft-04, including
`minimum`/`maximum`/`pattern`/`maxLength` where the catalogue
declares them); **semantic** accuracy (is THIS medication right
for THIS patient?) is implementer-owned by design. The
built-in catalogue uses bounds sparingly — operators tighten
structural guarantees by extending via `service.eventTypes`
URL (Q14 pattern). Rectification is auditable via
`events.update` + `?includeHistory=true`.

**Sub-question matrix:**

| Sub-question | Pryv's answer | Where it lives |
|---|---|---|
| Does Pryv reject payloads that don't match the event-type's JSON Schema? | Yes — ajv-draft-04 validation on every `events.create` AND `events.update`; HTTP 400 with structured field-path error | `components/api-server/src/methods/events.ts:273, 564, 755-774` (`validateEventContentAndCoerce` middleware); `components/utils/src/jsonValidator.ts` (façade); `components/business/src/types/basic_type.ts:60-65` (`callValidator`) |
| Are numerical bounds expressible in event-types? | Yes — `minimum` / `maximum` / `exclusiveMinimum` / `exclusiveMaximum` / `minLength` / `maxLength` all enforced | JSON Schema draft-04 spec |
| Do the **built-in** event-types use bounds? | Sparingly: only `mood/rating` (0..1) and `note/*` (4 MB `maxLength`). Physical-measurement types (`temperature/c`, `mass/kg`, `frequency/bpm`, …) ship as `"type": "number"` with no bounds | `components/business/src/types/event-types.default.json` (5 bound directives total across ~4750 lines) |
| Can implementers add bounds via custom catalogue? | Yes — the Q14 extension model (`service.eventTypes` URL → `deepMerge` over defaults) | `components/business/src/types.ts:143-186` (`TypeRepository.tryUpdate`); HDS exemplar at `hds.com/data-model` declares 28 `minimum` + 23 `maximum` + 7 `pattern` constraints |
| Does `events.update` preserve the prior (inaccurate) value? | Yes — event versioning; `GET /events/:id?includeHistory=true` returns the chain via `mall.events.getHistory()` | `components/api-server/src/methods/events.ts:178-200` |
| Is the rectification itself audited? | Yes — `events.update` is in `AUDITED_METHODS`; audit captures method + access ref + timestamp (not the request body, per Q9 audit-minimality) | `components/audit/src/ApiMethods.ts` |
| Does Pryv detect semantic inaccuracy? | **No, by design** — the platform lacks the patient's clinical record, drug-interaction context, device calibration state, treatment plan; implementer's app layer carries that context | — |

**Why this is the right split** — the regulator-relevance test:
when an Art.5(1)(d) complaint lands ("my health data showed an
impossible value"), the implementer can defensibly say:

1. Pryv rejected anything that violated the declared schema
   (cite the ajv pipeline + the failing-payload HTTP 400
   semantics).
2. The deployment used a bounded catalogue (cite the custom
   `service.eventTypes` URL + the relevant per-type bounds — OR
   acknowledge the deployment is on built-in defaults and
   commit to a catalogue tightening).
3. Semantic checks are the implementer's responsibility and run
   at the app layer before `events.create`; provide the specific
   service / rule responsible.
4. When inaccuracy was detected, `events.update` corrected it
   and the prior value is preserved + the rectification is
   audited.

If the platform attempted to enforce semantic accuracy, it would
require seeing clinical context, drug-interaction databases,
calibration metadata — which would violate Pryv's data-
minimisation posture. The split is consistent with the broader
implementer-owns-clinical-logic architecture (Q9 audit-minimality,
Q12 core-affinity, Q15 backup-encryption-is-operator-side, Q19
revocation-UI-is-implementer-side, Q20 DPIA-section-(d)-is-
implementer-assembled).

**Matrix encoding:**
- `gdpr.Art.5` detail block — Art.5(1)(d) bullet rewritten with
  the structural-vs-semantic split + ajv-draft-04 citation +
  HDS exemplar reference + the implementer-hand boundary.
- `gdpr.Art.16` row gained a `detail:` block (was overview-only)
  covering rectification mechanics + the ajv-validation-on-update
  guarantee + `includeHistory` + audit-trail behaviour + the
  detection-is-implementer-side cross-reference.
- `docs/pryv-primitives.md` `data-types` entry extended with
  the ajv-draft-04 backing + built-in-bounds sparsity + HDS
  exemplar.
- New canonical context note
  `context/data-accuracy-structural-vs-semantic.md` carries the
  full architecture treatment in 4 layers (structural
  validation; range bounds via catalogue extension; semantic
  out-of-scope; rectification trail).

No backlog filed, no proposal, no `planned:` chips —
classification is **"filled by existing primitive"** for the
structural / rectification slice + **"voluntarily missing"** for
the semantic slice. The matrix needed prose tightening, not new
features.

**Commit:** *(this commit)*.

### Q22 — GDPR Art.9 special categories: does Pryv "know" my streams hold health data?

**Short answer:** **No — voluntarily missing at the platform
layer, highly facilitated for vertically-integrated operators**
who control both the Pryv core AND the clients writing to it AND
the stream-tree design AND the event-type catalogue. Pryv ships
no `sensitivity:` flag, no server-side hook refusing writes to
"health" streams, no auto-encryption tier for sensitive data — by
design, because hard-coding "what counts as special-category"
would either over-classify (forcing wellness apps into HIPAA-grade
overhead) or under-classify (missing categories specific to a
regulator Pryv didn't model). But the operator composes a strong
Art.9 enforcement layer from a toolkit of 8 levers.

**Three sub-questions answered:**

1. **Does Pryv know any of this is "health data"?** — No.
   `body/temperature`, `body/heart-rate`, `body/sleep` are
   "a number with a unit" to the platform. The operator's
   classification decision is editorial and lives in three
   operator-owned places: (a) the stream-tree convention
   (`health/*`, `biometrics/*`, etc.), (b) `clientData` metadata
   on accesses, (c) custom catalogue annotations like
   `x-art9-category: health` on event-type schemas (passed
   through Pryv unchanged; client-side code reads + gates on
   them).

2. **Does Pryv require an Art.9(2) exception before accepting
   writes?** — No, but the operator can add this themselves via
   `customExtensions.customAuthStepFn` — a hook into the
   access-grant flow that demands the lit-letter claim before
   minting the access. The claim is then persisted on the
   access's `clientData.special_category_basis` and survives
   version updates.

3. **Does any platform layer treat special-category data
   differently?** — Not automatically, but every relevant layer
   has an operator-side knob:
   - Storage tiering via custom `@pryv/datastore` per subtree.
   - Per-engine isolation (separate PG instance + WAL +
     replicas) per the storages-as-plugins model.
   - Audit log automatically captures every read/write —
     audit-minimality (Q9) means the audit is safe to retain
     at long horizons.
   - Backup encryption tiering via `bin/backup.js` wrapping
     (Q15 operator-side encryption framing).

**The two-deployment-topology distinction** — central to
classifying this row honestly:

| | Vertically-integrated operator | Open Pryv platform |
|---|---|---|
| Operator runs core + ships clients + designs stream tree | Yes | No (or only partially) |
| Third-party apps register against the platform | Rare | Common |
| Art.9 facilitation strength | **High** — operator composes every lever | **Medium** — operator enforces at the access-permission boundary; third-party app code is opaque beyond that |

Most regulated health deployments built on open-pryv.io are
vertically-integrated by design — the operator wants control over
the client-side classification UX, the consent flow, and the data
custody. The matrix encoding (`coverage: facilitated`,
`facilitation_mode: primitive`, `pryv_effort_saved: medium`) is
deliberately a single tier that holds across topologies; the
deployment-specific facilitation strength is in the detail prose.

**The 8-lever operator toolkit** (full treatment in
`context/special-categories-operator-facilitated.md`):

1. Stream-tree design with reserved sensitive subtrees.
2. `clientData.special_category_basis` recording on accesses.
3. Custom event-type catalogue with sensitivity annotations
   (`x-art9-category`, `x-swiss-nlpd-sensitive`, etc. — passed
   through, client-side enforced).
4. Custom `@pryv/datastore` for per-subtree storage tiering.
5. Per-engine isolation at storage layer (storage-engine plugins).
6. `customExtensions.customAuthStepFn` access-grant gate.
7. Audit log automatic capture (Pryv-invariant).
8. Backup encryption tiering (operator-side, Q15 pattern).

CMC consent flows (Q18) are a ninth lever for cross-account
sensitive sharing: `consent/accept-cmc` IS the Art.9(2)(a)
explicit-consent record for the cross-account flow.

**Honest limits — when the toolkit doesn't reach:**

- Third-party apps the operator doesn't author. The
  access-permission scope IS the enforcement boundary; if the
  third-party's access is scoped to non-sensitive streams, its
  client-side classification logic is moot.
- Per-field sensitivity within a single event (Pryv permissions
  are per-stream, not per-field). Operator splits the event
  type so sensitive subset is its own event-type.
- Free-form `note/txt` or `picture/attached` events where
  implementers embed Art.9 data without the platform knowing.
  Client-side input validation + operator training; out of
  scope for platform enforcement.

**Why this is the right posture** — the regulator-relevance test:
when the supervisory authority asks "how does your deployment
enforce Art.9 protection?", a vertically-integrated implementer
gives a concrete claim like:

> *"Sensitive data is classified at design time via our
> `data-model` repo's `x-art9-category` annotations; the operator's
> mobile + web clients route writes exclusively to `health/*` /
> `biometrics/*` subtrees; every access touching a sensitive
> subtree carries `clientData.special_category_basis` populated by
> the custom-auth-step hook; the `health/*` subtree is backed by a
> dedicated PostgreSQL instance with at-rest encryption; the audit
> log captures every read/write against sensitive streams; backups
> of the sensitive tier are encrypted with a separate KMS key with
> quarterly rotation."*

Every clause cites a Pryv-side primitive the deployment composes;
none of them is "Pryv enforces Art.9". Same architectural shape
as Q19 (revocation UI is implementer's), Q20 (DPIA section (d) is
implementer-assembled), Q21 (semantic accuracy is implementer's).

**Matrix encoding:**

- `gdpr.Art.9` overview rewritten to lead with the "voluntarily
  missing + highly facilitated for vertically-integrated
  operators" framing; the prior implicit "operator builds it"
  prose was correct but didn't surface the topology distinction.
- `gdpr.Art.9` detail block extended with the 8-lever toolkit
  enumeration + topology framing.
- New canonical context note
  `context/special-categories-operator-facilitated.md` with
  the full operator-toolkit treatment + the two-topology
  comparison table + honest limits.
- No tier shift on `gdpr.Art.9` (`coverage: facilitated`,
  `facilitation_mode: primitive`, `pryv_effort_saved: medium`
  hold across topologies; deployment-specific strength is in
  prose).
- Related rows (`swiss-nlpd.Art.5`, `hipaa-privacy.164.502`)
  unchanged — their existing `derives_from` cross-refs to the
  GDPR row carry the framing along.

No backlog, no proposal, no `planned:` chips. Classification is
**"voluntarily missing + highly facilitated"** — a useful sub-
pattern of "voluntarily missing" worth naming explicitly
alongside the simpler "voluntarily missing + operator-owned" we
saw in Q15 (backup encryption).

**Commit:** *(this commit)*.

### Q23 — GDPR Art.28 processor agreements: what subprocessors come with Pryv, and what flows where?

**Short answer:** **Zero mandatory subprocessors.** Every external
integration is opt-in through config. Let's Encrypt ships as a
**dev-platform facilitator** (production operators should choose
their CA). When integrations ARE activated, **three real
data-flow guarantees** limit what the subprocessor sees:
audit-by-construction (Q9), logger `inspectAndHide` credential
redaction (`[BIH]` test set), observability PII attribute
exclude list.

**Three sub-questions answered:**

1. **Does Pryv emit any artefact listing my deployment's
   subprocessors?** — Not today. The operator reads
   `override-config.yml` + per-host overlays and identifies
   which optional integrations are non-default. **The planned
   bootstrap-admin-panel work** will fix this — `GET /system/admin/
   config/effective` exposes the merged effective config per core
   as a single JSON artefact ready to feed the operator's DPA
   register + Art.30 pipeline.

2. **Does Pryv differentiate PII-handling subprocessors vs.
   non-PII?** — Not as a structured flag, but the integration
   type implicitly classifies:
   - **PII-handling (when configured)**: SMTP (email + name +
     templated bodies), SMS endpoints (phone + MFA code), CMC
     peer cores (cross-account share of subject's events).
   - **Non-PII**: Let's Encrypt (hostnames only), upstream
     catalogue fetch (`service.eventTypes` URL — fetch-only of
     JSON Schema fragments; no personal data crosses the
     boundary).
   - **Filtered PII**: observability vendor (operator's choice
     — the façade is pluggable; New Relic ships as the first
     adapter). With the NR adapter, aggregated metrics + error
     traces flow with a hard-coded attribute-exclude list in
     front. Custom adapters (Datadog, Honeycomb, OpenTelemetry,
     internal Prometheus pipelines, etc.) implement PII
     filtering through their vendor's mechanism; the operator
     owns the equivalence check.

3. **Are there platform guarantees about what flows where?** —
   Yes, three layers, each verified in code + tests:

   **Layer 1 — Audit-by-construction (Q9 finding):**
   `components/audit/src/Audit.ts:151-166` — audit captures
   method + access ref + URL query + integrity hash; never
   request body; `auth=` query-string params stripped before
   write.

   **Layer 2 — Logger `inspectAndHide` credential redaction:**
   `components/boiler/src/logging.ts:253-298`. Every
   `Logger.{info,warn,error,debug}` call passes args through
   `inspectAndHide` before emission. Two mechanisms:
   - Object-key redaction: `password` / `passwordHash` /
     `newPassword` → `'(hidden password)'`.
   - String regex strip (`hideSensitiveValues`): `auth=c[a-z0-
     9-]*` → `'auth=(hidden)'`; serialised JSON password
     fields → `'$1=(hidden)'`.

   Tested by `[BIH1]`-`[BIH6]` in
   `components/api-server/test/boiler-inspectAndHide.test.js`.
   `[BIH6]` specifically asserts the password-redaction shape.
   End-to-end coverage at `system-seq.test.js:533` checks the
   `(hidden password)` substitution against `passwordHash` log
   payloads.

   **Honest scope** — `inspectAndHide` redacts **credentials**
   (auth tokens + password fields), not PII broadly. Email
   addresses, usernames, phone numbers, event payloads are
   NOT auto-redacted from log lines — they only leak if a
   caller explicitly logs them. The guarantee is "no
   credentials leak via logs", not "no PII whatsoever". The
   operator's log-aggregator destination + their broader
   PII-in-logs policy fill the rest of the picture.

   **Layer 3 — Observability PII filter** (when observability
   opt-in, provider-specific): the **observability primitive
   is a pluggable façade** at
   `components/business/src/observability/index.ts` — any APM
   vendor's adapter plugs in via the
   `{init, setTransactionName, recordError, recordCustomEvent,
   startBackgroundTransaction}` contract. **New Relic ships as
   the first concrete adapter**; operators free to write
   adapters for Datadog, Honeycomb, OpenTelemetry, an internal
   Prometheus pipeline, or any vendor the deployment requires.

   The NR adapter's hard-coded attribute exclude list at
   `components/business/src/observability/providers/newrelic/
   newrelic.ts:39-49`:

   ```js
   allow_all_headers: false,
   attributes: {
     exclude: [
       'request.headers.authorization',
       'request.headers.cookie',
       'request.headers.proxy-authorization',
       'request.headers.set-cookie*',
       'request.headers.x-*',
       'request.body'
     ]
   },
   transaction_tracer: { record_sql: 'off' }
   ```

   Plus `high_security: false` default — operator opts into
   account-side HSM if their observability account supports
   it. For the NR adapter, the exclude list is platform-defined
   in the adapter source; the operator can tighten further but
   not loosen the credential-strip guarantees without modifying
   adapter source. For custom adapters, **the operator owns the
   PII-filter equivalence** — every custom adapter must be
   reviewed for its own PII-exposure surface; the façade
   contract doesn't enforce filtering across all providers.

**Subprocessor inventory at deployment level** — five opt-in
integrations, each off by default:

| Config gate | Subprocessor | Data crossing the boundary |
|---|---|---|
| `letsEncrypt.enabled: true` | LE — or any ACME directory you point `directoryUrl` at | Hostnames for ACME challenges only — no user data. Operator's call whether LE matches their compliance posture; alternative CAs drop in without code changes |
| `services.email.smtp.*` | Operator's SMTP relay | Email + name + one-time tokens; body templates operator-owned via admin panel |
| `services.mfa.mode: enabled` + `sms.endpoints[*]` | Operator's SMS provider | Phone number + MFA code |
| `observability.provider: <id>` | Operator's chosen APM vendor — pluggable façade; New Relic ships as the first adapter; Datadog / Honeycomb / OpenTelemetry / internal Prometheus / etc. drop in as custom `providers/<id>/` adapters | Aggregated metrics + error traces; Layer 3 PII filter is adapter-specific (NR adapter ships a strict exclude list) |
| `service.eventTypes: <URL>` (default points at upstream `pryv/data-types`) | Catalogue host | **Fetch-only of schemas INTO the core; no personal data flows out** — pinning to self-hosted URL severs the dependency entirely |

**Where Pryv-the-software is NOT the Art.28 answer-source**:

- **Cloud provider** (AWS / Azure / Hetzner / on-prem) — opaque
  to Pryv; operator-to-provider relationship.
- **CDN / reverse-proxy** if you deploy one (nginx /
  Cloudflare). Pryv doesn't ship one; operator's deployment
  topology choice (per `RATE-LIMITING-RECIPES` backlog Q6)
  determines whether a CDN vendor is in scope.
- **External monitoring** beyond the observability-provider
  integration (Prometheus + Grafana operator runs themselves,
  log aggregator like Loki / ELK / Splunk). Pryv emits logs;
  the operator routes them.

**Matrix encoding**:

- `gdpr.Art.28` detail extended with the zero-mandatory-
  subprocessor framing + the 5-integration enumeration with
  data-flow per integration + the LE-as-dev-facilitator
  distinction + the three-layer data-flow guarantee table +
  the future config-effective inventory-pipeline cross-reference.
- `gdpr.Art.28` `pryv_primitives:` extended with
  `observability-provider` (was missing; the row already cited
  `letsEncrypt-integration` + `encryption-at-rest-secrets`).
- New canonical context note
  `context/subprocessor-posture-and-data-flow.md` with the
  full per-integration code-anchor analysis + the three
  data-flow layers + the "where Pryv is NOT the answer"
  honest-limits section.
- `gdpr.Art.30(1)(f)` unchanged — the existing register-field
  mapping table already covers "categories of recipients"; the
  subprocessor framing flows through naturally.
- `docs/pryv-primitives.md` `observability-provider` entry
  unchanged (already documents the PII filter; this Q
  cross-references rather than duplicating).

No backlog, no proposal, no chips — classification is
**"filled by existing primitive" + "operator-configured"**
for the integrations themselves + **"voluntarily missing
(absorbed by the planned bootstrap-admin-panel work)"** for the
structured-inventory artefact. The future inventory pipeline
already has its slot in `UPDATE-TRIGGERS.md`
(`CONFIG-EFFECTIVE-EXPOSURE`); no separate Art.28 backlog needed.

**Commit:** *(this commit)*.

### Q24 — Software supply-chain compliance: what does Pryv tell me about its OWN dependency hygiene?

**Short answer:** Pryv follows **`npm audit` + GitHub Dependabot
security alerts** today (partial + passive — a 2026-04-30 sweep
cleared 22 alerts → 0). A **full SCA pipeline using tools
like OWASP-Dependency-Check / Snyk / Grype is planned** — backlog
`SUPPLY-CHAIN-SCANNING-PIPELINE` filed with a three-phase
implementation plan. When shipped, ISO 27001 A.5.21 coverage
shifts F:Awareness Low → F:Evidence Medium.

**What's verified in code TODAY** (the partial-and-passive baseline):

| Control | Status | Code anchor |
|---|---|---|
| npm `package-lock.json` committed | ✅ | `open-pryv.io/package-lock.json` (`lockfileVersion: 3`) |
| CI `npm install --ignore-scripts` | ✅ | `.github/workflows/ci.yml:44, 70, 84` |
| Per-commit Docker SHA tag | ✅ | `.github/workflows/ci.yml` last `tags:` block (`pryvio/open-pryv.io:2.0.0-pre-${{ github.sha }}`) |
| rqlite version pin | ✅ | `Dockerfile` `ARG RQLITE_VERSION=9.4.5` |
| Dependabot security alerts | ✅ | GitHub Security tab — 2026-04-30 sweep cleared 22→0 |
| Manual `npm audit` triage | ✅ | (procedural — no CI gate) |
| **CI gate on `npm audit`** | ❌ | (not in workflow) |
| **SCA tool integration** | ❌ | (no OWASP Dep-Check / Snyk / FOSSA) |
| **Container image scan** | ❌ | (no Trivy / Grype in Docker job) |
| **Base image digest-pinned** | ❌ | `FROM node:24-bookworm` — moving tag |
| **rqlite tarball checksum verification** | ❌ | `Dockerfile:17` `curl -fsSL` with no `sha256sum -c` |
| **SBOM emission** | ❌ | (no CycloneDX / SPDX manifest per release) |
| **Image signing** | ❌ | (no cosign / Docker Content Trust on pushed images) |
| **SLSA attestation** | ❌ | (no in-toto / provenance) |

**The three-phase pipeline** (per the
`SUPPLY-CHAIN-SCANNING-PIPELINE` backlog):

**Phase 1 — In-CI gates** (~0.5 day):

- `npm audit --audit-level=high` step in CI fails the build on
  high / critical CVE. Operators get build-time confirmation
  instead of waiting for the GitHub UI to surface alerts.
- Pin base image: `FROM node:24-bookworm@sha256:<digest>`.
- rqlite tarball: add `RQLITE_SHA256` `ARG` + `sha256sum -c`
  before `tar xzf`.

**Phase 2 — Pipeline tooling** (~1.5 days):

User-recommended tools (operator framing 2026-05-21): OWASP-ZAP,
Snyk, Grype. Note OWASP-ZAP is a DAST proxy scanner, not a
dependency tool — fits Phase 3 candidate as separate web-app
security testing. Recommended Phase 2 stack:

- **Syft** — CycloneDX SBOM emission for npm tree + Docker
  image.
- **Grype** — vulnerability scan against NVD; CI gate on
  Critical / High; report Medium / Low without failing.
- **SBOM as GitHub Release artefact** — every release publishes
  the CycloneDX JSON.

Alternative: Snyk (commercial; free for open-source repos) — at
the cost of a vendor relationship.

**Phase 3 — Provenance + signing** (~2 days):

- **cosign image signing** — `cosign sign` after Docker push;
  documented `cosign verify` step in `INSTALL.md`.
- **SLSA Level 2+ attestation** — provenance attached via
  cosign's in-toto attestation flow.
- **Release-notes SBOM link** — every GitHub Release body links
  to the CycloneDX SBOM.

**Why a regulator would care**:

- ISO 27001 **A.5.21** "ICT supply chain" — direct match;
  shifts F:Awareness Low → F:Evidence Medium when shipped.
- ISO 27001 **A.5.22** "Monitoring of supplier services" — the
  ongoing-monitoring artefact (continuous SCA scan + dependabot
  + manual triage cadence) is what this control wants. Matrix
  row may need to be ADDED.
- GDPR **Art.32 §1(b)/(c)** "ongoing CIA + integrity" — the
  Pryv-internal supply-chain hygiene strengthens the integrity
  side of the equation; chip filed alongside the existing
  `E2E-ENCRYPTION` + `ALIASES` chips.
- HIPAA Security **§164.308(a)(8)** periodic technical
  evaluation — the SBOM + latest scan output are the concrete
  artefact for the periodic evaluation.

**Matrix encoding**:

- `iso-27001.A.5.21` overview rewritten to honestly reflect
  current state (dropped overstated "published dependency-audit
  pipeline" claim — that prose was forward-looking; today's
  reality is npm audit + dependabot, manual). `planned:` chip
  added pointing at the proposal mirror + backlog slug.
- `gdpr.Art.32` `planned:` chip added (third chip on the row,
  alongside `E2E-ENCRYPTION` + `ALIASES`); chip `impact: low`
  since Art.32 is multi-aspect and supply-chain is one axis
  among many.
- New `proposals/supply-chain-scanning-pipeline.md` with the
  current-state-verified table + 3-phase plan + per-row tier
  shifts.
- New internal backlog slug `SUPPLY-CHAIN-SCANNING-PIPELINE`.
- New Section A entry in `UPDATE-TRIGGERS.md`.
- No context note filed — the proposal + backlog carry the
  full treatment; no architectural framing to capture
  separately.

Classification: **"filled by existing primitive (partial /
passive)" + "planned (3-phase pipeline)"**. The partial baseline
is real and defensible — the 2026-04-30 sweep is evidence that
dependabot triage works in practice. The full pipeline is the
regulator-defensible upgrade.

**Commit:** *(this commit)*.

### Q25 — GDPR Art.46 cross-border transfers: operationalisation in a Pryv deployment

**Short answer:** Three cross-border surfaces in a typical
deployment, each with its own answer. Access-bound transfers
(CMC counterparty fetches + third-party-app reads across
jurisdictions): **filled by existing primitive** via the
documented `clientData.transfer_basis` convention (zero Pryv
code change; existing primitives carry persistence + versioning
+ audit). PlatformDB cluster replication in multi-region clusters:
**Tier 1 of the two-tier residency model — IS a continuous
cross-border transfer**; Art.46 mechanism required; two mitigation
backlogs filed (at-rest encryption + PII hashing); structural
answer (tokenisation) staying brainstorm-tier until operator
direction. Subprocessor outbound (Q23 follow-on): **per-core
SMTP / SMS configuration recommended** so the relay matches each
core's region/country when residency is a hard requirement.

**The three surfaces in detail:**

### Surface 1 — Access-bound transfers (CMC + cross-jurisdiction app reads)

Convention: `access.clientData.transfer_basis` structured shape
per `context/transfer-basis-convention.md`. Same pattern as
`clientData.lawful_basis` (Q6) + `clientData.special_category_
basis` (Q22). Existing primitives carry persistence + audit
trail + version chain for free. Art.30(1)(e) register answer
becomes a one-liner:

```bash
curl https://core.example.com/accesses -H "Authorization: <token>" \
  | jq '[.accesses[] | select(.clientData.transfer_basis) | {...}]'
```

Field reference (mechanism, scc_module, scc_version,
scc_signed_date, scc_document_ref, origin_country,
destination_country, adequacy_decision) detailed in the
context note. Operator-owned editorial metadata; no Pryv
enforcement; convention only.

### Surface 2 — Multi-region PlatformDB replication (the deep one)

**Two-tier residency model** the matrix now makes explicit:

- **Tier 2 — Content + audit (residency-pinned):** events,
  streams, audit, attachments, access metadata. NOT replicated.
  Q12 core-affinity holds cleanly here.
- **Tier 1 — Identification + routing (cluster-replicated):**
  usernames, emails, DNS subdomains, user-core mappings,
  ephemeral access-state, MFA SessionStore. PER USER ~50-200
  bytes; for 100k users ~5-20 MB cluster-wide. **Quantity
  doesn't change the legal analysis** — it's still personal
  data crossing borders.

Full keyspace inventory + threat-model framing in
`context/cross-border-platformdb-implications.md`.

**A/B/C mitigation options** (filed as backlog where committed):

- **(A) At-rest encryption of PlatformDB**
  (`PLATFORMDB-AT-REST-ENCRYPTION` backlog, ~1d Path 1 / ~2-3d
  Path 2). Protects against SSD-forfeiture / backup-tape /
  decommissioned-hardware / filesystem-read scenarios. Does NOT
  change the legal status of cross-border replication; runtime
  + Raft stream still in cleartext. **Real defence-in-depth.**
- **(B) HMAC-pseudonymisation of PII at PlatformDB layer**
  (`PLATFORMDB-PII-HASHING` backlog, ~4-5d for three postures:
  cleartext / hashed / **minimised** [email stripped from
  PlatformDB; user's preferred posture]). Strengthens Art.32(1)(a)
  pseudonymisation evidence + SCCs + pseudonymisation combined
  narrative. **Does NOT make PlatformDB Art.46-free under EDPB
  guidance** — hashing of low-entropy identifiers is
  pseudonymisation, not anonymisation (Recital 26 keeps it in
  scope; brute-force re-identification feasible by reasonable
  means).
- **(C) Tokenisation with per-region mapping table** (not yet
  backlogged — brainstorm-tier). Random opaque token replaces
  username in PlatformDB; the `username ↔ token` mapping lives
  only on home core. **The structural answer** to "no PII
  leaves home region" — many weeks of architectural work; pairs
  with the `ALIASES` backlog.

**The hash-vs-tokenisation distinction** is regulator-important:
the user's intuition that "a hash is not invertible, so it
shouldn't be pseudonymisation" is **cryptographically correct
but legally incorrect under EDPB guidance**. The legal test is
re-identifiability by "reasonable means" (Recital 26 + WP29
Opinion 05/2014), not whether the function itself is invertible.
Brute-forcing HMAC of a username dictionary at 10⁹/sec is
"reasonable means". Only random-token mapping (Option C) reaches
the legal threshold for "no longer attributable to a natural
person" because the cluster-replicated value has effectively
unbounded entropy.

**Posture recommendation** (per operator's deployment topology):

- Single-region cluster: **A** worth doing as baseline.
- Multi-region cluster + SCCs in place: **A + B**. SCCs legally
  authorise the transfer; A + B strengthen the defence-in-depth
  + Art.32 narrative.
- Multi-region cluster + "no PII may leave EU" hard requirement:
  **A + C** is the structural answer (B is insufficient).
- Multi-region cluster + no Art.46 mechanism: stop multi-region
  until the legal basis is established. Hashing doesn't
  substitute.

### Surface 3 — Subprocessor outbound (Q23 follow-on)

**Pryv recommends per-core SMTP configuration** so the relay can
match each core's region/country when residency matters: the
`services.email.smtp.*` config block is per-core, so
an EU core routes mail through an EU SMTP relay independently
of a US core's relay. **Same pattern for SMS endpoints** —
`services.mfa.sms.endpoints.*` is per-core.
Operators configuring residency-sensitive deployments take
advantage of this to keep "EU subjects' password-reset emails
never touch a US-jurisdiction relay" as a hard guarantee.

Observability vendor is harder — the façade is pluggable (Q23)
but most APM vendors don't have per-region account routing built
in; operator-side concern.

### Matrix encoding

- `gdpr.Art.46` overview + detail rewritten to lead with the
  three-surface model + the `clientData.transfer_basis`
  convention; cross-references both new context notes.
- `gdpr.Art.44` detail rewritten to surface the two-tier
  residency model explicitly (was previously the single-tier
  "core-affine" narrative which is true for Tier 2 but
  incomplete).
- `gdpr.Art.28` detail (subprocessor table) gets the **per-core
  SMTP recommendation** for residency-sensitive deployments.
- `gdpr.Art.32` `planned:` chips added for the two new backlog
  items (alongside existing `E2E-ENCRYPTION`, `ALIASES`,
  `SUPPLY-CHAIN-SCANNING-PIPELINE` chips).
- New `context/transfer-basis-convention.md` — full
  convention shape + Art.30 register query recipe + honest
  limits.
- New `context/cross-border-platformdb-implications.md` — the
  canonical two-tier model + A/B/C mitigation options +
  posture recommendation + the hash-vs-token-vs-Recital-26
  legal framing.
- `context/subprocessor-posture-and-data-flow.md` SMTP section
  updated with the per-core recommendation.
- `UPDATE-TRIGGERS.md` Section A entries filed for
  `PLATFORMDB-AT-REST-ENCRYPTION` + `PLATFORMDB-PII-HASHING`
  with the per-row tier shifts.
- New proposals: `proposals/platformdb-at-rest-encryption.md` +
  `proposals/platformdb-pii-hashing.md`.
- Internal backlog slugs:
  `PLATFORMDB-AT-REST-ENCRYPTION` +
  `PLATFORMDB-PII-HASHING`.

Classification: **"filled by existing primitive (via documented
convention)"** for Surface 1; **"planned (two backlog items A +
B; structural option C deferred)"** for Surface 2; **"filled by
existing primitive (per-core configuration recommendation)"**
for Surface 3.

**Commit:** *(this commit)*.

### Q26 — GDPR Art.22 automated decision-making + profiling: what does Pryv do, what's on the implementer?

**Short answer:** **Pryv does no automated decision-making or
profiling — substrate only.** No inference, no classification,
no scoring, no anomaly detection, no recommendation surface
ships with open-pryv.io. Everything Art.22-relevant happens in
**operator app code on top of Pryv**, with the consent +
contract claims recorded on `access.clientData` per the
established convention family.

The Art.22 row's existing prose already encodes this correctly
— Q26 is a **confirmation Q** rather than a gap-discovery one.
What this Q surfaces is the consolidation of all the
`clientData.*` conventions discovered across the gap-probing
arc into a single canonical reference.

**The three sub-questions:**

1. **Does Pryv do automated decision-making or profiling?**
   **No.** The platform is content-agnostic — it stores events,
   carries access semantics, manages permissions, audit-logs
   methods. It does not classify event content, score subjects,
   detect anomalies, or surface recommendations. If your
   deployment needs any of those, you run them in your app
   layer (your ML model reads events via an access, computes,
   writes the decision back as a `decisions/*` event).

2. **Recording the "this access feeds automated decisions"
   classification** — `access.clientData` carries it, same
   pattern as every other regulatory basis claim. The Art.22
   row's existing detail block documents the convention:

   ```json
   {
     "clientData": {
       "processing_purpose": "automated_decision_making",
       "art22_basis": "(c) consent",
       "decision_logic_version": "risk-model-v2.3.1"
     }
   }
   ```

   And the decision OUTPUT event (written to a `decisions/*`
   stream by the operator's ML pipeline) carries
   `clientData.input_audit_ref` pointing back to the audit-row
   range that fed the decision — making "human intervention"
   requests per Art.22(3) tractable (the subject can locate
   the specific decision record).

3. **Human-in-the-loop workflow (Art.22(3))** — not a Pryv
   primitive. The implementer builds it on top of existing
   primitives: a queue of decisions needing review (a stream
   of pending-decision events), an admin app that surfaces
   them, an audit-log entry for the human reviewer's
   intervention. Pryv's existing `accesses.update` +
   event-streaming machinery is sufficient; no platform
   feature gap.

**The broader pattern this Q surfaces** — `access.clientData`
has emerged as **Pryv's unified compliance-claim surface**
across the gap-probing arc:

- `clientData.lawful_basis` — Art.6 (Q6)
- `clientData.consent` + `clientData.consent_event_id` — Art.7
- `clientData.special_category_basis` — Art.9 (Q22)
- `clientData.transfer_basis` — Art.46 (Q25)
- `clientData.processing_purpose` + `clientData.art22_basis` —
  Art.22 (Q26 / existing matrix prose)
- `clientData.purpose` — Art.30 general
- `clientData.retention` — Art.5(1)(e)

Each convention is **operator-side editorial discipline** —
none require Pryv code changes. Together they make
`GET /accesses` a near-complete Art.30 records-of-processing
register, queryable in one `jq` command. Full consolidated
reference: `context/client-data-conventions.md`.

**Why this pattern is regulator-defensible without platform
enforcement**:

- **Durable persistence** — `clientData` survives access
  updates; version chain preserved; deletions audit-logged.
- **Single source of truth** — every basis claim is on the
  same object as the technical authorisation it justifies.
  Auditor can't claim "you said one thing in your notice and
  authorised something else technically" — both are linked.
- **Per-access granularity** — different accesses against the
  same subject can carry different basis claims (research
  under Art.6(1)(f), billing under Art.6(1)(b)). The register
  reflects reality, not a global per-deployment assumption.

**Matrix encoding:**

- `gdpr.Art.22` unchanged — existing prose correctly encodes
  the substrate-only + clientData-convention framing.
- New `context/client-data-conventions.md` consolidating all
  seven conventions discovered across the gap-probing arc into
  a single canonical reference for implementers.
- No backlog, no proposal, no `planned:` chips — classification
  is **"filled by existing primitive (via documented
  convention)"** for Q26.1 + Q26.2; **"voluntarily missing
  (implementer-built workflow on existing primitives)"** for
  Q26.3 human-in-the-loop.

**Commit:** *(this commit)*.

### Q27 — GDPR Art.25 privacy by design + by default: what Pryv ships out of the box

**Short answer:** Pryv's architecture is **privacy-by-design by
founding pattern, not retrofitted** — Data Governance + Access
Control + per-Subject audit are separate layers every process
traverses; the process registry is self-documented (`GET
/accesses` + audit log IS the Art.30 register). Twelve concrete
defaults satisfy Art.25(2). Customer-facing reference at
[`pryv.github.io/guides/privacy-by-design.html`](https://pryv.github.io/guides/privacy-by-design.html);
matrix-internal canonical treatment at
`context/privacy-by-design-and-default.md`.

**Architectural commitment (§1)** — Pryv's topology contrasts
with the standard PbD anti-pattern:

| Standard (PbD anti-pattern) | Pryv (privacy-by-design) |
|---|---|
| Processes have direct access to personal data | Access Control is a separate layer every process traverses |
| Cannot track per-resource access | Audit captures every API call per-subject (invariant — no opt-out) |
| Process registry maintained manually (drifts) | Process registry self-documented (`GET /accesses` + audit) |

**Data-model commitment** — streams + events segregated by
**data-subject AND context**. Enables granular consent
(per-stream-subtree grants, not wall-of-text privacy policies)
+ data minimisation (Art.5(1)(c)) + adapt data collection per
subject without schema migration.

**Privacy-by-default UI pattern** — `app-web-auth3` ships the
opt-in flow (explicit permissions per stream + Accept/Refuse
buttons) rather than the "by continuing you agree" anti-pattern.
The auth UI primitive doesn't support the anti-pattern, so
operators can't accidentally ship it.

**12 platform defaults** (the catalogue answer):

1. Default-deny on permissions (empty `permissions: []`).
2. Audit-on by default (invariant, no opt-out — Q9).
3. TLS enforced (the optional Let's Encrypt integration).
4. Hosting region pinned per user (Q12 architectural residency).
5. Stream-permission granularity (Q22 — no "public" tier exists).
6. Data-minimal audit (Q9 — never captures request body).
7. Schema validation at ingest (Q21 — ajv rejects out-of-shape).
8. Zero mandatory subprocessors (Q23 — every integration opt-in).
9. Audit-minimal logger (Q23 — `inspectAndHide` invariant,
   `[BIH1-6]` tests).
10. CMC requires explicit subject consent (`consent/accept-cmc`).
11. PlatformDB encrypted secrets (LE + observability patterns).
12. Withdrawal API exists by default (Q19 — `DELETE
    /accesses/:id` always available).

**Still in the operator's hands (Art.25 §2 — operator's
by-default settings)**:

- Are app tokens minted with the smallest possible scope?
- Is subject's notice-of-collection on by default?
- Is data retention set to the shortest necessary period?
- Is the operator's auth UI using the opt-in pattern, or a
  "by continuing you agree" anti-pattern?

**Privacy-enhancing technologies (PETs)** the dev-site guide
catalogues — operator's enrichment path:

- **Pseudonymisation** — partial; `auth.randomAlias` planned
  (`ALIASES` backlog).
- **Proxy re-encryption** — `E2E-ENCRYPTION` backlog +
  github.com/perki/test-proxy-re-encrypt PoC. Client-side
  keying during consent request; backend re-crypts data for
  the accredited recipient on demand. Full-dataset breach
  resistance.
- Homomorphic encryption / Differential privacy / Multiparty
  computation — out-of-scope at platform layer; implementer
  enrichment.

**Customer-facing surface** — shipped: the new dev-site Guides
page [`pryv.github.io/guides/privacy-by-design.html`](https://pryv.github.io/guides/privacy-by-design.html)
exposes the architecture story to customers + auditors
directly. This is the citable public artefact; the matrix
context note mirrors it for internal cross-referencing.

**Matrix encoding:**

- `gdpr.Art.25` detail rewritten with the 12-default catalogue
  + architectural commitment + PET catalogue + operator's-
  hand items.
- New canonical `context/privacy-by-design-and-default.md`
  with the full PbD treatment (architecture diagram, data-model
  contrast, UI pattern, 12 defaults, PETs, operator citation
  recipe for DPIA Section (d) safeguards inventory).
- No tier shift on `gdpr.Art.25` — existing
  `facilitated/infrastructure/high` is correct; the row gains
  richer prose.
- No backlog or new proposal — Pryv's architectural posture IS
  the answer; existing primitives carry it. PET catalogue
  cross-references existing backlogs (`ALIASES`,
  `E2E-ENCRYPTION`).

Classification: **"filled by existing primitive
(architecturally enforced)"** for §1 + §2; matrix tier remains
`facilitated` because §2 still has operator's-hand items.

**Commit:** *(this commit)*.

### Q28 — GDPR Art.21 right to object: same mechanism as Art.7(3)

**Short answer (operator's framing):** **The mechanism is the
same as Art.7(3) withdrawal (Q19)** — `DELETE /accesses/:id`
or `accesses.update` to narrow permissions. The legal
distinction is semantic (legitimate-interests / public-interest
basis under Art.6(1)(e)/(f) vs. consent basis under
Art.6(1)(a)); the platform primitives are basis-agnostic.

**Three sub-questions resolved:**

1. **Pryv mechanism for Art.21**: same as Art.7(3). Subject
   uses `DELETE /accesses/:id` (full revocation) or
   `accesses.update` (scope-down). No separate "objection"
   semantic on the platform — the access-revocation primitive
   covers both Art.7(3) and Art.21 because the EFFECT is the
   same (stop the processing); the regulatory framing is
   recorded on `clientData`.

2. **Art.21(3) "compelling legitimate grounds" exception**:
   record the operator-side review outcome on
   `clientData.objection_outcome` — one of `"honoured"` (access
   revoked / narrowed), `"overridden_compelling_grounds"`
   (override applied), `"out_of_scope"` (the access didn't
   actually do the objected-to processing). Add
   `clientData.objection_rationale` (free-text or URI pointer)
   when overriding. Both travel with the access version chain
   — auditable.

3. **Art.21(5) transparency** ("right to object presented
   clearly and separately from any other information at the
   time of the first communication"): same convention family as
   Art.7 consent text. Persist `clientData.objection_notice` at
   access mint time so the version chain proves what the
   subject was told when.

**Matrix encoding:**

- `gdpr.Art.21` overview tightened to lead with "mechanism is
  the same as Art.7(3)" framing; detail extended with the
  three-field convention (`objection_outcome`,
  `objection_rationale`, `objection_notice`).
- `context/client-data-conventions.md` extended with a new
  Art.21 section in the convention catalogue.
- No tier shift (`facilitated/primitive/medium` correct).
- No backlog, no proposal, no `planned:` chips.

Classification: **"filled by existing primitive"** —
Art.21 is the Art.7(3) primitive applied to a different legal
basis; the access-revocation mechanism is invariant across
bases.

**Commit:** *(this commit)*.

### Q29 — GDPR Art.8 children's consent + parental verification

**Short answer:** **Voluntarily missing at platform layer +
`clientData` convention for the recording trail.** Pryv is
age-blind by design — the default account schema ships only
`email`; no `birthDate` / `dateOfBirth` / `minor` field. The
operator extends `customExtensions.systemStreams` to add an age
field and records the verification trail on `clientData`.

**Four sub-questions verified in code:**

1. **Age-gate primitive at registration?** **No.** Verified at
   `config/default-config.yml` `custom.systemStreams.account:`
   — ships only `email`. Operator extends the system streams to
   add `birthDate` (or equivalent) if their deployment targets
   minors.

2. **`consent/parental-cmc` event format in `data-types`?**
   **No** (verified at `data-types/dist/event-types.json` —
   only the five CMC-flow events ship: `request-cmc`,
   `accept-cmc`, `revoke-cmc`, `scope-request-cmc`,
   `invalidate-link-cmc`). The Art.8 matrix row's existing
   reference to `consent/parental-cmc` is **aspirational** — a
   convention the implementer authors in their custom catalogue
   (Q14 pattern). HDS-style data-model repos targeting
   paediatric use-cases are the natural home for upstreaming
   this format.

3. **Scheduled re-verification surface?** **No.** Pryv has no
   cron / scheduler primitive. The operator runs an external
   job that watches `birthDate` + access `created` timestamp +
   chosen jurisdiction's age of majority and triggers a
   re-consent prompt at the crossing date.

4. **Dual / multi-parental-holder convention?** Supported by
   the array form `clientData.parental_holder_consent_event_ids:
   [...]` (operator's editorial discipline; not enforced).
   App code at access-mint time enforces "both parents must
   accept" or whichever jurisdiction-specific rule applies.
   Each parental-holder consent event independently satisfies
   the access-history record; revocation of any one of them
   is the operator's signal to revoke or scope-down the
   access (Q19 + Q28 mechanisms).

**Matrix encoding:**

- `gdpr.Art.8` overview sharpened with the code-verified
  age-blindness framing (was implicit; now explicit at
  `custom.systemStreams.account` level).
- `gdpr.Art.8` detail block added — the convention with both
  singular and array forms, the catalogue-extension note for
  `consent/parental-cmc`, the operator-side cron concern, the
  multi-holder framing.
- `context/client-data-conventions.md` gains the Art.8
  section in the convention catalogue.
- No tier shift (`facilitated/storage/low` correct).
- No backlog or proposal — same posture as other "voluntarily
  missing + clientData convention" rows (Q6 Art.6, Q22 Art.9,
  Q25 Art.46, Q26 Art.22, Q28 Art.21).

Classification: **"voluntarily missing + clientData convention
(operator-implemented)"**. Same architectural shape as the rest
of the convention family — the platform substrate doesn't
enforce the regulatory specifics; it persists the operator's
claim alongside the technical authorisation, audit-traceable.

**Commit:** *(this commit)*.

### Q30 — GDPR Art.37-39 DPO designation, position, tasks

**Short answer:** DPO **designation** (Art.37) and **independence /
position** (Art.38 §1-§3) are organisational — out-of-scope for
the platform. But the **DPO contact-point obligation** (Art.38(4)
+ Art.13(1)(b)) is **filled by an existing primitive**: the
`serviceInfo.support` URL returned by `GET /service/info` on every
core. Operators publish DPO contact details on their support page;
`app-web-auth3` already renders the link in its consent UI; zero
extra Pryv code needed.

**Two sub-questions:**

1. **Pryv-side surface for DPO contact info?** **Yes — existing**:
   the `serviceInfo` fields shipped today already include
   `home` (controller identity), `support` (DPO contact +
   support), `terms` (ToS) — all operator-controlled, propagated
   to every client app via the standard `GET /service/info`
   read. Verified at
   `open-pryv.io/components/api-server/src/schema/service-info.ts:25-26`.

   Implementation patterns:
   - **Easiest** (most operators): DPO contact section on the
     support page that `support` URL points at. Zero extra
     surface needed; matches the existing ToS pattern via the
     `terms` field.
   - **Dedicated**: a separate DPO page (`https://operator.example.com/dpo`),
     linked from the support page header.
   - **Future enhancement** (not currently needed): add an
     optional `serviceInfo.dpo` field — requires schema change
     + `app-web-auth3` to render. Filed as candidate only if a
     critical mass of operators wants a dedicated structured
     field beyond the `support`-URL convention.

   Companion convention catalogue:
   `context/service-info-conventions.md` (new this Q) — the
   serviceInfo-side complement to
   `context/client-data-conventions.md` (per-access claims).

2. **DPO-scoped audit-log access across all accounts?** **Not
   today** — audit-log access is currently bound to per-user
   permissions; no built-in "cross-account audit reader"
   personal-token tier. Operators granting DPOs platform-wide
   audit visibility use one of:
   - `auth.adminAccessKey` style admin auth (high-trust;
     coarse-grained).
   - A side-process exporting audit events into the DPO's
     observability / SIEM stack (Q23 observability-provider
     pluggable façade).
   - A custom dataStore (`@pryv/datastore`) that mirrors audit
     events into a DPO-readable destination.

   Probably "voluntarily missing + operator-built" at this
   layer — the operator's DPO-monitoring tooling is org-specific
   enough that a one-size primitive doesn't make sense. If
   demand emerges, a backlog candidate would be a dedicated
   "DPO audit reader" role tier with `GET /audit/*` cross-user
   scope.

**Matrix encoding:**

- `gdpr.Art.37` unchanged (out-of-scope; HR / org decision).
- `gdpr.Art.38` **shifted from out-of-scope to facilitated**
  for §4 specifically; overview updated to surface
  `serviceInfo.support` as the contact-point primitive; cross-
  reference to the new context note.
- `gdpr.Art.39` detail extended — practical DPO-monitoring
  patterns (audit-log access mechanics, compliance-matrix as
  evidence trail, DPIA / breach-scope tooling threading from
  Q17 / Q20).
- `gdpr.Art.13` overview rewritten — the information-items
  split is now explicit between the **deployment-wide
  serviceInfo surface** (`home` / `support` / `terms`) and the
  **per-access clientData surface** (the convention family
  from Q26). `docs:` extended to include the new
  `guides/privacy-by-design.md` dev-site page.
- New canonical `context/service-info-conventions.md` —
  serviceInfo schema + the 5 compliance-relevant convention
  uses (Art.13(1)(a)/(b) identity + DPO; Art.13(1)(d)
  recipients; Art.13(2)(f) automated decisions; Art.7
  transparency) + comparison with clientData conventions +
  honest limits.
- No tier shift on Art.13 (existing `facilitated/storage/medium`
  correct).
- No backlog or proposal (existing primitives carry the
  contact-point obligation; cross-account audit reader is a
  candidate-only enhancement pending demand).

Classification: **"filled by existing primitive"** for
Art.38(4) + Art.13(1)(b) contact point + controller identity
(via existing `serviceInfo.support` + `home` URLs);
**"out-of-scope"** for Art.37 designation + Art.38 §1-§3
independence; **"facilitated (evidence-only)"** for Art.39
monitoring tasks. Same shape as Q26 / Q28 / Q29 confirmation
Q's — existing primitives + documented convention; matrix
prose tightening rather than feature work.

**Commit:** *(this commit)*.

### Q31 — GDPR Art.5(1)(e) storage limitation: automatic retention of stale data

**Short answer:** **Voluntarily missing at the platform layer +
operator-owned.** Pryv ships no TTL / auto-delete / scheduler
primitive — automatic retention enforcement is the operator's
external scheduled job, composing existing primitives
(`events.get toTime=<cutoff>` + `events.delete` two-stage +
`streams.delete` + `auth.delete` + the audit log as inactivity
oracle). Same shape as Q15 backup encryption: Pryv provides the
deletion APIs and the audit trace; the operator owns the
scheduler + retention-rule definitions + legal-hold overrides.

**The customer scenario:**

> "Building a wellness app on Pryv. GDPR Art.5(1)(e) says I must
> not keep personal data longer than necessary. For active users,
> 'necessary' is open-ended. But for **inactive users** — say
> hasn't authenticated in 3 years and never explicitly closed
> their account — I need to enforce automatic deletion. Does
> Pryv ship a retention / TTL primitive I can configure
> declaratively (e.g., 'auto-delete events older than N days for
> stream X', 'auto-delete account if no audit-log activity in M
> days'), or is this entirely my external-job problem?"

**Code findings** (verified before classifying):

| Question | Finding |
|---|---|
| Built-in event TTL / retention primitive? | **None.** `grep` across `components/business/`, `components/mall/`, `components/storage/`, `components/api-server/src/schema/` shows no retention / TTL / auto-delete config. The only `expires` field is on `access` (authorisation lifetime — not data lifetime); `TokenStore.TTL_MS` exists for Bootstrap one-shot tokens (24 h). |
| Built-in cron / scheduler? | **None.** No primitive in core. The only background loops shipped are LE certificate renewal and Bootstrap join-token expiry — domain-specific, not generalised. |
| Event lifecycle | **Two-stage manual delete.** `events.delete` first sets `trashed: true`; a second call hard-deletes. Operator-triggered only. |
| `clientData.retention` convention | **Advisory metadata only** (Q26 catalogue). Documents the operator's declared retention policy on the access; does NOT enforce deletion. |
| Audit trace on deletion | **Yes.** `events.delete` is in `AUDITED_METHODS` (`components/audit/src/ApiMethods.ts:56`); every deletion logs with access ref + timestamp. |
| Account deletion | `auth.delete` exists (caller-triggered); recall Q8 left the `AUDIT-ON-USER-DELETE` gap where PG audit silently survives on user-account delete — relevant when retention triggers account deletion on PG deployments. |

**The recommended operator pattern:**

A scheduled job adjacent to the Pryv API. Concrete shape:

1. **Declare retention rules in operator config** — per stream
   class, per access purpose, per account-inactivity threshold.
   Example shape (operator-owned YAML, not a Pryv config):

   ```yaml
   retention_rules:
     - stream: "wellness/raw-readings/*"
       max_age_days: 365
       action: delete
     - stream: "audit-trace/*"
       max_age_days: 540
       action: delete
     - account_inactivity:
         no_auth_for_days: 1095   # 3 years
         action: delete           # or: anonymise (when ALIASES ships)
   ```

2. **Schedule via the operator's deployment-native scheduler** —
   systemd timer / Kubernetes CronJob / AWS EventBridge / GCP
   Cloud Scheduler / GitHub Actions schedule. Whatever the
   operator's deployment already has (with retries, alerting,
   observability already wired). Pryv does NOT impose one.

3. **For each rule**, the job:
   - Queries the population — `events.get streams=<stream>
     toTime=<cutoff>` (paged for large populations).
   - Calls `events.delete` (or `streams.delete` for sub-tree
     retention) per result.
   - For account-level retention: uses audit log as the
     inactivity oracle (`GET /audit/logs` filtered by recent
     authentication-action types) → `auth.delete` if cutoff
     crossed.
   - The audit log automatically captures each deletion (Q9
     audit-by-construction).
   - Job results logged into the operator's observability
     stack (Q23 provider façade) — deleted-count, time
     elapsed, errors per stream.

**Why "voluntarily missing" not "should-be-built"** — three
deliberate reasons:

1. **"Necessary" is irreducibly contextual.** A wellness app's
   30-day raw-reading retention vs a clinical-trial's 15-year
   retention vs a 7-year financial-services regime vs paediatric
   "age-of-majority + N years" cannot share a sensible default.
   Pryv's content-agnostic posture means it doesn't pretend to.
2. **Retention conflicts with legal-hold / litigation-hold.** A
   built-in retention loop would need a `legalHold` opt-out
   surface per-subject, per-stream, per-event-type — a
   substantial primitive for a slot most operators run as a
   30-line cron script.
3. **Scheduler primitives belong to the operator's deployment
   topology** — Kubernetes CronJob, systemd timer, cloud-managed
   scheduler — all with retries / alerting / observability
   already wired. A Pryv-internal scheduler would be redundant
   at best, conflicting at worst.

**Sub-questions resolved:**

1. **Audit trace on scheduled deletion?** **Yes — automatic
   via existing audit log.** Every retention deletion captures
   `accessId` (the retention-job token) + `accessSerial` +
   `action` (`events.delete`) + `params.id` + `time` + caller
   IP / UA. Audit minimality (Q9) applies — no request body
   leaks event content into the audit log. Forensically
   defensible "deleted within N days of policy boundary" claim.

2. **Recommended scheduler / cron pattern from Pryv?**
   **None — explicitly operator-choice.** Pryv documents no
   preferred scheduler. The operator's deployment-native
   scheduler (Kubernetes / systemd / managed-cloud) IS the
   right choice; a Pryv-shipped scheduler would compete with
   already-wired retries / alerting / observability.

3. **Anonymisation as alternative to deletion?** **Planned
   feature** — `auth.randomAlias` (backlog `ALIASES`, GH
   [`#38`](https://github.com/pryv/open-pryv.io/issues/38))
   becomes the de-identification companion to deletion once
   shipped. The retention job then has two action verbs
   (`delete` / `anonymise`) instead of one. Currently
   anonymisation is the operator's own application-layer
   transformation; the matrix already encodes this on
   `iso-27701.A.7.4.5`.

4. **Sample-app candidate?** **Possibly.** A reference
   retention-job (`samples/scheduled-retention-job/` — a
   ~150-line Node script + systemd-timer + Kubernetes-CronJob
   examples + a YAML rule-language) would materially reduce the
   "did I implement this right?" burden for new operators.
   Added to `SAMPLE-APPS.md` parking buffer (this Plan-internal)
   for plan-close build/defer/drop decision.

5. **Effect of the Q8 audit-survival gap?** **Operationally
   minor; documentation-relevant.** When the retention job
   triggers `auth.delete` on a PG-audit deployment, the deleted
   subject's audit rows currently survive (PG `audit_events`
   table not wiped — see `proposals/audit-on-user-delete.md`).
   For most retention regimes this is fine (audit-log retention
   is itself a separate obligation under HIPAA §164.316(b)(2)(i)
   minimum-6-year etc.) — and once GH
   [`#75`](https://github.com/pryv/open-pryv.io/issues/75) ships
   the `audit.onUserDelete: erase|keep|pseudonymise` setting,
   the operator chooses the policy. The retention job's pattern
   does not change.

**Matrix encoding:**

- `gdpr.Art.5` **§1(e) detail rewritten** — replaces the
  prior 1-liner deferral ("CONFIGURABLE. Engine-dependent — see
  Art.17") with the full "voluntarily missing + operator-owned"
  framing + recipe pointer + audit-trace claim.
- `gdpr.Art.17` detail extended with the **caller-triggered vs
  scheduled-deletion** distinction; cross-link to the new
  context note clarifies the boundary (Art.17 = right-to-erasure
  caller call; Art.5(1)(e) = operator scheduled-retention).
- `pipeda.Principle.4.5` overview extended — same operator-
  owned framing for the Canadian retention obligation.
- `iso-27701.A.7.4.5` overview extended — "soon as the
  original PII is no longer necessary" framing + the
  `auth.randomAlias` anonymisation-companion pointer (already
  has the planned chip).
- New canonical `context/data-retention-operator-owned.md` —
  full treatment: code findings + 5 composable primitives +
  recommended operator pattern + "why voluntarily missing"
  rationale + audit-trace details + cross-engine considerations
  + account-level retention via audit-log oracle + caveats +
  see-also.
- **No backlog** filed — voluntarily missing by design.
- **No `planned:` chips** added — same reason.
- **No `proposals/` mirror** — same reason.

Classification: **"voluntarily missing + operator-owned"**.
Same shape as Q15 backup encryption (`gdpr.Art.32` /
`hipaa-security.164.308(a)(7)(ii)(A)`) — Pryv ships the
generation primitive, operator owns the wrapping policy +
scheduling. Distinct from Q22 "voluntarily missing + highly
facilitated" (special-category data) because retention is
genuinely operator-territory by-design; even a
vertically-integrated operator builds the retention job at the
deployment layer, not the platform.

**Commit:** *(this commit)*.

### Q32 — GDPR Art.32(1)(d): "regular testing, assessing, evaluating effectiveness of TOMs" — what does upstream Pryv ship?

**Short answer:** **Mixed — three layers are filled by existing
primitives + one layer is a genuine queued gap.**

| Sub-question | Classification |
|---|---|
| Pen-test report? | Voluntarily missing |
| Vulnerability disclosure program? | **Bug + small dev** — backlog `VULNERABILITY-DISCLOSURE-PROGRAM` |
| Test suite as effectiveness evidence? | Filled by existing primitive |
| Deploy-validation runbook? | Filled (with documentation gap — sample-app candidate) |

**The customer scenario:**

> "GDPR Art.32(1)(d) requires me to demonstrate regular testing,
> assessing, and evaluating the effectiveness of TOMs. For my own
> code, I run my own CI. But for the **Pryv platform itself** —
> the substrate I rely on — what testing/assessment evidence does
> upstream open-pryv.io ship that I can cite in my Art.32
> compliance file?"

**Code findings (verified before classifying):**

| Question | Finding |
|---|---|
| Pen-test / security audit report? | **None published.** No `pen-test`, `penetration`, `security audit`, `security review` text in `open-pryv.io/*.md`. No CVE / GHSA references in CHANGELOG. |
| Vulnerability disclosure program? | **Minimal.** `SECURITY.md` exists at `open-pryv.io/SECURITY.md` but is **6 lines** total; the only directive is "report to the [support team](https://github.com/pryv/open-pryv.io/issues)" — i.e., the public issue tracker. No `security@pryv.com` mailbox, no PGP key, no GitHub Security Advisories private-report flow enabled, no bounty, no scope statement, no response-time SLA, no safe-harbor language, no security.txt at deployment hosts. |
| Test-suite scale | **~2351 tests PG and SQLite baseline (matched) / ~175 test files**. Two-engine matrix (PG default, SQLite alternative). Lint + typecheck + per-component unit + integration + acceptance. CI green on both engines (2026-05-29 baseline). |
| Deploy-validation runbook? | **Yes (partial).** 8-row scenario deploy-validation matrix exercised on every release (internal artefact); post-deploy `lib-js` conformance suite at 168/169 baseline (per-deployment runnable) — but neither is packaged as a customer-facing "verify your deployment" guide. |
| Dependabot / supply-chain | Covered by Q24 (`SUPPLY-CHAIN-SCANNING-PIPELINE` backlog filed; 22 alerts → 0 on `open-pryv.io` master per 2026-04-30 sweep). |

**Per sub-question resolution:**

1. **Pen-test / published security audit — voluntarily
   missing.** No shipped pen-test report; operator commissions
   their own if their deployment-tier compliance regime requires
   it (HIPAA-CE / HDS / SOC 2). Pre-empting this gap is
   operator-territory; a published redacted summary of any
   internal review would be a "facilitated" addition if it
   surfaces later but isn't required.

2. **Vulnerability disclosure program — bug + small dev.**
   `SECURITY.md` is materially under-specified for a substrate
   that markets at GDPR / HIPAA / HDS / Swiss nLPD compliance
   markets. The current "report via the public issue tracker"
   directive is the **opposite** of responsible disclosure —
   any researcher following the documented guidance creates a
   public issue exposing the exploitable gap before the fix is
   shipped. Modern open-source norm: private channel via
   **GitHub Security Advisories** (free, GitHub-native) + a
   `security@<domain>` mailbox + **PGP** key + explicit
   **scope statement** + **response-time SLA**
   (ack ≤ 72h / triage ≤ 14d / fix-or-mitigation ≤ 90d high
   severity) + **safe-harbor** language for good-faith
   researchers + a **published advisory history**. Three-phase
   plan under internal backlog slug `VULNERABILITY-DISCLOSURE-PROGRAM`
   (Tier 1 minimum viable VDP, Tier 2 process maturity, Tier 3
   discoverability + ongoing assurance).

3. **Test-suite scale as effectiveness evidence — filled by
   existing primitive.** ~2351 tests passing on PostgreSQL and
   SQLite (matched baseline) + ~175 test files across `components/*/
   test/` + CI green on every commit + lint + typecheck gates +
   the multi-engine matrix architecture — together this **is**
   §1(d) "regular testing" effectiveness evidence under any
   reasonable reading. Auditors will accept it; what's been
   lacking is matrix prose that makes the claim explicit and
   cites the concrete numbers. The Art.32 §1(d) detail block
   has been rewritten this Q to surface the test-matrix
   evidence inline (previously a 1-liner "DOCUMENTED").

4. **Deploy-validation runbook — filled (with doc gap).** The
   8-row deploy-validation matrix + the `lib-js`
   conformance suite (168/169 baseline) together cover the
   "verify your deployment behaves as the upstream tests
   expect" use-case, but neither is packaged as a customer-
   facing guide. Filed as sample-app proposal #6
   (`deployment-verification-runbook`) in this plan's
   `SAMPLE-APPS.md` parking buffer for plan-close build / defer /
   drop decision. If accepted, it becomes a
   `compliance-matrix/samples/deployment-verification-runbook/`
   directory shipping a one-command operator-side script that
   runs the lib-js conformance suite + reports
   pass/fail against the deployed core.

**Matrix encoding:**

- `gdpr.Art.32` **§1(d) detail rewritten** — replaces the
  prior 1-liner "DOCUMENTED — multi-engine test matrix
  runbook" with the full evidence catalogue (CI test matrix +
  lint + typecheck + deploy-validation + conformance suite +
  supply-chain pipeline once shipped) **plus** explicit
  partial-gap framing for VDP. New `planned:` chip for
  `VULNERABILITY-DISCLOSURE-PROGRAM` (kind: enhancement,
  impact: medium).
- `iso-27001.A.5.7` (threat intelligence) overview rewritten
  + new `planned:` chip — "Pryv's VDP + GHSA log becomes the
  substrate-vulnerability threat-intelligence feed".
- `iso-27001.A.5.24` (info-sec-incident-management planning)
  overview extended + new `planned:` chip — VDP as the
  externally-facing intake channel.
- `hipaa-security.164.308(a)(6)(i)` (security incident
  procedures) overview extended + new `planned:` chip — same
  external-intake-channel framing.
- `hipaa-security.164.308(a)(8)` (evaluation) overview
  extended + new `planned:` chip — VDP + GHSA history as one
  evidence input.
- New internal backlog slug `VULNERABILITY-DISCLOSURE-PROGRAM`
  — 3-tier plan with the full SECURITY.md template + scope
  statement + SLA + safe harbor + security.txt notes.
- New `compliance-matrix/proposals/vulnerability-disclosure-
  program.md` — matrix-side mirror.
- New `UPDATE-TRIGGERS.md` Section A entry
  `VULNERABILITY-DISCLOSURE-PROGRAM`.
- New `SAMPLE-APPS.md` proposal #6
  (`deployment-verification-runbook`) for the Q4 sub-question.

Classification: **mixed** — sub-questions Q1 / Q3 / Q4 are
**"filled by existing primitive"** (with documentation
tightening) or **"voluntarily missing"**; sub-question Q2 is
**"bug + small dev"** with regulator-defensible work
queued. The composite outcome is one new backlog file + one
new sample-app candidate + matrix-prose strengthening on
5 rows + new planned chips on 5 rows.

**Commit:** *(this commit)*.

### Q33 — GDPR Art.34: communication of breach to data subjects (delivery side)

**Short answer:** **Two-surface split.** **Identification**
is filled by existing primitives + Q17 BREACH-SCOPE-TOOL (audit
log → per-subject roster). **Delivery** is **voluntarily missing
+ operator-owned** — same shape as Q15 backup encryption + Q31
retention. The audit-trace bridge that lands per-recipient
send-receipts inside Pryv's event chain uses operator-authored
`compliance/breach-notification/sent-cmc` events satisfying
the §164.414-equivalent burden-of-proof obligation.

**The customer scenario:**

> "Q17 covers the identification side (BREACH-SCOPE-TOOL once
> shipped — `accessId → userId` reverse-index + `recordCount`
> + `affectedStreamIds`). But once I know **who** was affected,
> how does Pryv help me **deliver** the notifications? For a
> multi-thousand-user platform, this is bulk-send + retries +
> rate-limiting + receipt tracking + audit trace, all 'without
> undue delay'. Or is breach-comm entirely my external email/
> SMS/in-app infrastructure?"

**Code findings (verified before classifying):**

| Question | Finding |
|---|---|
| Bulk-send primitive? | **None.** `components/api-server/src/methods/helpers/mailing.ts` `sendmail()` is single-recipient, single-template, per-call. Three delivery methods (`in-process` / `microservice` / `mandrill`) all designed for transactional one-off (welcome / password-reset / MFA code). |
| Template registry | **Yes (but transactional)** — `components/mail/src/TemplateRepository.ts` + `Template.ts` + `TemplateSeeder.ts`; Pug templates seeded into PlatformDB; refreshed via master broadcast. Per-language support inherited; bulk-send orchestration absent. |
| Subject-notification primitive (write to subject's account) | **None native.** The CMC `consent/*-cmc` family covers counterparty consent flows; an unsolicited operator-to-subject notification event format would be operator-authored via Q14 custom-catalogue extension. |
| Webhooks for subject-side | **No.** Webhooks are app-side outbound (apps subscribe to event changes); subjects don't have webhooks. |
| Audit trace of notification | **None native** — operator's mail provider has the send-log; not in Pryv's audit log. |
| Rate-limiting / throttling | **None native** for bulk send. SMTP provider limits apply. |
| Multi-lang template render | **Partial** — `sendmail()` takes `lang` parameter for the existing transactional templates; bulk-send orchestration missing. |
| Existing Art.34 row treatment (pre-Q33) | **Thin** — `coverage: documented`, 3-line overview deferring to "operational". |

**Why "voluntarily missing + operator-owned":**

1. **Operators have established notification stacks.** Most
   regulated-market deployments already have a CRM-side bulk
   email pipeline (SendGrid / Mailgun / AWS SES), an SMS
   provider (Twilio / Vonage), an in-app push channel,
   sometimes a legal-comms-team escalation route. Building
   a Pryv-shipped breach-comm would be redundant.
2. **Operators without one would need legal/comms expertise
   to use it well anyway.** Art.34 §2 mandates specific
   content elements (nature of breach + DPO contact + likely
   consequences + measures taken). The phrasing + the timing
   + the regulator-defensibility narrative aren't something
   a Pryv-side template can pre-fab without operator-specific
   tailoring.
3. **The Art.34 §3 exemptions** (encryption made data
   unintelligible, subsequent measures eliminated high risk,
   disproportionate effort) are legal judgements operator-
   counsel makes — a platform primitive can't determine them.

**The operator pattern (recommended):**

Composes the identification primitive (Q17 BREACH-SCOPE-TOOL
once shipped) with the operator's existing comms stack:

1. **Identification** — `bin/breach-scope.js --access-id X
   --window-start ... --window-end ...` produces
   `affected.json` with per-subject `userId` + `recordCount`
   + `affectedStreamIds` + audit-row hashes.
2. **Delivery** — operator's CRM / mail provider ingests
   `affected.json`, joins against subscriber-contact records
   (email + lang + timezone + preferred channel), renders
   breach-notice template with Art.34 §2 content elements,
   queues for send through the operator's normal
   transactional pipeline.
3. **Audit-trace bridge** — operator writes
   `compliance/breach-notification/sent-cmc` event per
   recipient on a compliance system stream, capturing
   `recipient.userId` + `recipient.email_hash` (HMAC-SHA256
   to avoid plaintext) + `channel` + `provider.message_id`
   + `time` + `notice_version`. These events become the
   §164.414-equivalent burden-of-proof artefact + are
   queryable per subject (`events.get streams=
   compliance/breach-notification/* recipient.userId=<X>`).
4. **Incident-response record** — operator's
   `compliance/incidents/<id>/*` event tree cross-references
   the affected.json input + the per-recipient send-receipt
   subtree.

**Multi-jurisdiction nuance:** subjects in different
jurisdictions face different timing regimes (GDPR Art.34
"undue delay" / HIPAA-Breach §164.404 ≤60d / PIPEDA s.10.1
"as soon as feasible" / California §1798.82 ≤45d / Swiss
nLPD Art.24 conditional). Operator's runbook derives per-
subject timing from `clientData.jurisdiction` recorded on
the account.

**Matrix encoding:**

- `gdpr.Art.34` **detail rewritten** — replaces the
  3-line `coverage: documented` overview with the full
  two-surface split (identification filled-by-existing-
  primitive + delivery voluntarily-missing-operator-owned)
  + recipe pointer + audit-trace bridge pattern. Tier
  shifted `documented` → `facilitated/evidence/low`;
  `pryv_primitives` populated with `audit, access,
  encryption-at-rest-secrets, event, system-streams`.
- `hipaa-breach.164.404` overview rewritten + detail
  extended — same two-surface split framing; cross-link
  to the new context note.
- `pipeda.s.10.1` detail extended — explicit operator-
  owned delivery framing; 24-month record-retention rides
  on the same `compliance/breach-notification/sent-cmc`
  event chain.
- `swiss-nlpd.Art.24` unchanged — already notes the
  conditional subject-side trigger (Art.24 makes subject
  notification narrower than GDPR Art.34); the delivery
  pattern applies whenever the operator elects to notify.
- `ccpa` — no specific subject-breach row exists in the
  matrix scope (Cal Civ Code §1798.82 is separate
  statute); §1798.150 civil-action row covers the
  encryption-narrowing-trigger side only.
- New canonical `context/breach-notification-delivery-
  operator-owned.md` — code findings + two-surface split
  treatment + recommended operator pattern + audit-trace
  bridge details + multi-jurisdiction nuance + cross-engine
  considerations + implementer takeaway + see-also.
- **No backlog** filed — voluntarily missing by design.
- **No `planned:` chips** added — same reason.
- **No `proposals/` mirror** — same reason.

Classification: **"voluntarily missing + operator-owned"**
(delivery side) + **"filled by existing primitive"**
(identification side, with Q17 BREACH-SCOPE-TOOL completing
the per-subject roster). Same shape as Q15 backup encryption,
Q31 retention. Distinct from Q22 "voluntarily missing +
highly facilitated" because breach-comm delivery is
genuinely operator-territory even for vertically-integrated
operators — they already have the comms stack.

**Commit:** *(this commit)*.

### Q34 — GDPR Art.6(4) compatible-purpose secondary processing

**Short answer:** **Filled by existing primitives (via clientData
convention + 4 composable patterns).** Pryv exposes four
composable access-management patterns for purpose pivot — the
operator picks per the compatibility-vs-fresh-consent decision
rule. The fourth pattern (sub-access from an `app` seed) feeds
**purpose-driven access matching directly into the audit
trail**, which is the Pryv-native answer when an app
legitimately operates under multiple compatible-purpose facets.
A new three-field clientData convention records the §6(4) pivot
metadata for regulator-defensibility.

**The customer scenario:**

> "GDPR Art.6(4) lets me process for a new purpose ONLY if
> compatible per the 5-factor test OR I have a new lawful basis.
> When the purpose changes for already-collected wellness data
> (e.g., health-tracking → ML model training), what's the
> Pryv-side mechanism, how is purpose-history audited, and is
> there platform support for re-prompting the subject?"

**Three sub-questions resolved one by one:**

### Sub-Q1 — mechanism for purpose change

**Four composable patterns** + a clear decision rule.

| Pattern | Mechanism | When to use |
|---|---|---|
| **A — Mint new access** | `accesses.create` with `clientData.purpose: <new>` + fresh consent flow via app-web-auth3 | **Mandatory** when new purpose is outside the original AND no fresh override-by-law basis applies (Art.6(4)(a) compatibility test fails → fresh consent required) |
| **B — Update existing access** | `accesses.update` with new `permissions` + `clientData`; access-version chain preserves prior state | Narrow / compatible change (scope-down or compatible expansion); audit chain reconstructs purpose-history automatically |
| **C — Separate compatibility-assessment event** | `compliance/compatibility-assessments/<id>` event on dedicated stream (operator-authored format via Q14); access carries `compatibility_assessment_event_id` pointer | Whenever the 5-factor analysis is non-trivial; composes with A or B |
| **D — Sub-access derivation from `app` seed** | App access mints per-purpose sub-accesses via `createdBy` mechanism (`context/workforce-access-patterns.md` Pattern 2); each sub-access has its own narrower `permissions[]` + `clientData.purpose` | When same app legitimately operates under multiple compatible-purpose facets — **audit log records each sub-access id independently, feeding purpose-driven access matching at query time** (operator addition; key correction to my initial analysis) |

**Decision rule** (operator-side):

1. New purpose **inside** the original (compatible refinement /
   narrowing) → Pattern B; no fresh consent.
2. New purpose **alongside** the original (compatible expansion,
   same app, multiple facets) → Pattern D sub-access OR Pattern
   A new access; no fresh consent if compatibility passes; Art.13(3)
   notice update may be required.
3. New purpose **outside** the original AND not covered by fresh
   override-by-law basis → **Pattern A + force fresh consent**.
   "If the purpose is outside the initial one or not in cases
   covered by law, the logic would require a new consent"
   (operator confirmation).
4. Any non-trivial 5-factor analysis → **Pattern C**
   compatibility-assessment event for audit-defensibility.

### Sub-Q2 — purpose-history audit chain

**Yes — access-versioning preserves it automatically.** Pattern
B's `accesses.update` snapshots the pre-mutation `permissions` +
`clientData` (including prior `purpose`) into a history row;
`accesses.get ?includeHistory=true` returns the full chain. The
bumped `accessSerial` threads through every audit row so
post-pivot reads/writes correctly attribute to the new purpose
state, and pre-pivot rows resolve via history-walk to the prior
state. Cross-link to `context/access-versioning.md` for the
snapshot semantics + the wire-format details.

### Sub-Q3 — re-prompt support

**No built-in re-prompt workflow** — operator's app layer
triggers fresh consent by minting a new access (Pattern A) and
presenting the updated notice via `app-web-auth3`. The subject's
positive opt-in IS the fresh-basis capture under Art.6(4) when
compatibility fails. For revocation of the old access alongside
the new mint, `accesses.delete` is the standard path (Q19 / Q28
withdrawal mechanism family).

**clientData convention extension** (added to
`context/client-data-conventions.md` — 9 conventions total):

- `clientData.compatibility_assessment_event_id` — pointer to
  the §6(4) 5-factor assessment artefact.
- `clientData.purpose_change_basis` — enum
  (`compatible_purpose` / `new_consent` /
  `new_legal_obligation` / `new_legitimate_interest`).
- `clientData.previous_purpose` — redundant prior-purpose copy
  at the pivot moment; recoverable from access-version chain
  but makes "what changed and when" answerable from a single
  row.

**Matrix encoding:**

- `gdpr.Art.6` **detail rewritten** — replaces the §1-only
  treatment with §1 + §4 coverage. §4 detail introduces the
  4 patterns + the decision rule + the re-prompt surface
  paragraph + the three-field clientData convention pointer.
  `text` field extended to mention §4 explicitly.
  `pryv_primitives` extended (audit + event added).
- New three-field convention added to
  `context/client-data-conventions.md` — 9 conventions total
  (8 + Q34's compatibility/pivot trio).
- **No backlog** filed — filled by existing primitives.
- **No `planned:` chips** added — same reason.
- **No `proposals/` mirror** — same reason.
- **No new context note** — the 4-pattern treatment fits the
  Art.6 detail + cross-links to existing `access-versioning`
  + `workforce-access-patterns` (Pattern 2) + `client-data-
  conventions` notes.

Classification: **"filled by existing primitive (via clientData
convention)"** — same shape as Q26 / Q28 / Q29 confirmation
Q's, plus the key operator addition of Pattern D sub-access
derivation that I missed in my initial analysis. The
**purpose-driven access matching** that sub-accesses feed into
the audit log is the Pryv-native answer for multi-facet apps
under compatible-purpose pivots.

**Commit:** *(this commit)*.

## How to use this FAQ

When evaluating Pryv:
- Read this file end-to-end first; many "does Pryv do X?" questions
  are already answered.
- Each Q&A links to the commit + the matrix files updated; follow
  those for the full encoding.
- "Voluntarily missing" answers point at backlog items for future
  shipping; "pluggable" answers point at the extension surface.

When authoring future Q&A:
- Pose questions as a customer evaluating Pryv would, not as
  abstract regulator-language.
- Capture the answer + which rows / proposals / context notes /
  primitives got updated.
- Cite the commit.
