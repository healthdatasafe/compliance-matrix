# Operator backup vs subject DSAR backup — symmetry audit

**Status:** implementer reference + audit of the two backup paths Pryv ships — the operator-side `bin/backup.js` (server-side, raw-row disaster-recovery snapshot) and the subject-facing `@pryv/account-backup` (public-API DSAR / portability tool, currently v0.5.0). Companion to `account-backup-coverage.md`, which covers the subject side per-data-type. Last updated 2026-06-13 against `@pryv/account-backup` v0.5.0.

---

## TL;DR

Pryv has shipped **three** backup tools with non-overlapping audiences. Two are current (operator + subject CLI); the third (a self-serve Web UI on top of the subject CLI) was operated historically and is currently dormant. An auditor evaluating Art.15 / Art.20 / §1798.110 / Principle 4.9 / nLPD Art.25 coverage should know all three exist and which one satisfies the article in question.

| | Operator backup (`open-pryv.io/bin/backup.js`) | Subject backup (`@pryv/account-backup`) |
|---|---|---|
| Audience | system operator | data subject (or implementer on behalf of subject) |
| Surface | server-side; runs inside the core process | end-user CLI; runs against the public API |
| Auth | direct storage access (no token); restricted by OS-level filesystem perms + admin process | personal token (`Service.login` with username + password + appId) |
| Output | raw storage rows (incl. internal IDs, integrity hashes) — disaster-recovery snapshot | per-resource JSON files + sha256 manifest — subject-portable disclosure packet |
| Scope per user | streams, accesses, profile, webhooks, events, attachments, accountData, audit, HFS series | account, streams, accesses (+ revoked/expired), profile, audit-logs, events (chunked by month), per-app profile, HFS series per-event, per-access webhooks, integrity manifest |
| Restore semantics | full re-import via engine-level write paths (PG `INSERT`, SQLite `INSERT`) | re-create via standard public API (`events.create`, `streams.create`, `addPointsToHFEvent`); audit / webhooks / accesses deliberately NOT replayed (system-generated or token-bearing) |
| Compliance role | disaster recovery, migration, regulator-mandated record retention | GDPR Art.15 (access) / Art.20 (portability) / CCPA §1798.110 / PIPEDA Principle 4.9 / Swiss nLPD Art.25 |

## Third tier — operator-hosted subject Web UI (`pryv-account-backup-webapp`)

`pryv-account-backup-webapp` is the current sample web UI for subject-facing backups. Operator hosts the static bundle on their own domain; subjects log in via a web form, click **Start backup**, download a series of ZIP files. The webapp consumes the browser-isomorphic resource fetchers from `pryv-account-backup` v0.7.0+ (`api-resources`, `events-chunked`, `audit-as-events`, `accesses-history`, `attachments`, `hf-data`, `webhooks-export`) — no server-side runtime, deploy via `npm run build && copy dist/ to your web server's docroot`.

| | `pryv-account-backup-webapp` (Web UI tier, v0.2.0 against library v0.7.0+) |
|---|---|
| Audience | end user (the subject) — no Node / CLI knowledge required |
| Surface | static site bundled by esbuild; vanilla JS + vanilla CSS; ~350 LOC of orchestrator + UI; no backend |
| Auth | subject's Pryv credentials submitted via the web form (operator's TLS); direct `Service.login` (no MFA handling — webapp directs MFA-enabled subjects at the CLI) |
| Distribution | git-clone + `npm install && npm run build`; deploy `dist/` behind operator's HTTPS |
| Compliance role | same as the CLI tier — GDPR Art.15 / Art.20 / §1798.110 / PIPEDA Principle 4.9 / Swiss nLPD Art.25 — with significantly lower subject-side friction (no clone / install / CLI run) |
| Coverage caveat | webapp omits **only** `manifest.json` (per-file sha256 tamper-evidence — auditor-facing, CLI-only by design). All read-side resources (attachments / HFS series / webhooks / events / audit / accesses + history / profile) are covered with feature parity from v0.7.0 / webapp v0.2.0. The webapp also produces a portable `sync-state.json` inside the final ZIP — the subject re-uploads it on the next visit for cross-browser / cross-device incremental |

**Why it matters for the symmetry audit:**

- This is the **most ergonomic** path for an actual DSAR — a subject who can't be expected to install Node or run a CLI can still self-serve.
- It is **operator-hosted**, so it moves the "who runs the export" responsibility back to the operator while keeping the output bundle subject-portable.
- It consumes the **same library code** the CLI consumes (browser-isomorphic resource fetchers from v0.7.0) — no drift category between flavors. The seven core fetchers all expose the same `(connection, writer, stateStore-or-array, options, cb, log)` shape; the orchestrator drives both flavors uniformly.

**Operational guidance for implementers:**

- If you need a self-serve DSAR for a non-technical subject population, the webapp repo is a production-ready scaffold — fork, rebrand CSS custom properties, redeploy.
- The operator security note about `profile.mfa.recoveryCodes` applies — the recovery codes ride verbatim in `profile_private.json`. Treat the downloaded ZIPs as password-reset-equivalent secrets; consider rotating recovery codes after disclosure.
- Subjects who need third-party-auditor tamper-evidence (e.g. handing the bundle to an external compliance auditor) should still use the CLI flavor — only the CLI emits the per-file sha256 `manifest.json`.

### Historical tier (archived 2026-06-15) — `pryv/example-service-bluebutton`

Operator-hosted Express service that wrapped `@pryv/account-backup` 1.0.x behind a Web UI. Last substantive release v1.2.0 on 2022-10-11. The public Pryv-operated instance at `https://bluebutton.pryv.me/` was dormant by 2026-06; the repo was archived on 2026-06-15 as part of the v0.6.0 ship and replaced by `pryv-account-backup-webapp`. Listed here for historical context — operators with existing bluebutton deployments should plan a migration to the new webapp.

## Per-resource symmetry (v2 deployments; subject backup at v0.7.0)

| Resource | Operator `bin/backup.js` | Subject `@pryv/account-backup` v0.7.0 (CLI + webapp) | Notes |
|---|---|---|---|
| streams | ✅ raw rows (`storageLayer.streams.exportAll`) | ✅ `/streams[?state=all]` | symmetric coverage; subject sees wire shape, operator sees row shape |
| accesses (current) | ✅ raw rows | ✅ `/accesses` → `accesses.json` | wire format on subject side carries `clientData.cmc` for CMC counterparties (see CMC row) |
| accesses (deletions + expired) | ✅ raw rows (`exportAll` includes soft-deleted) | ✅ **0.5.0+** `/accesses?includeDeletions=true&includeExpired=true` → `accesses-all.json` | adds `accessDeletions[]` array |
| accesses (per-access history) | ✅ raw history rows | ✅ **0.5.0+** opt-in: `accesses-history/<accessId>.json` per access, fetched via `GET /accesses/<id>?includeHistory=true`. CLI prompts; off by default (O(N) calls) | symmetric coverage when the operator opts in |
| profile (private + public + per-app) | ✅ raw rows | ✅ `/profile/private` + `/profile/public` + per-app `/profile/app` | symmetric |
| webhooks | ✅ raw rows (no token replay risk on operator side) | ✅ **CLI + webapp** (v0.7.0+): per-access `/webhooks` aggregated to `webhooks.json` keyed by `accessId` | symmetric, both flavors; expired (401/403) tokens skipped silently and non-fatally |
| events | ✅ raw rows from events table (cross-user filter by `user_id`) | ✅ **0.5.0+** chunked monthly: `events-YYYY-MM.json` (one file per UTC month in the discovered range; probed via `limit=1` ascending + descending) | subject side avoids single-shot timeout at production scale |
| attachments | ✅ binary stream from `eventFiles.getAttachmentStream(userId, eventId, fileId)` | ✅ **CLI + webapp** (v0.7.0+): opt-in binary stream from `GET /events/<id>/<attId>?readToken=…` piped chunk-by-chunk through the `StorageWriter` | symmetric, both flavors |
| audit | ✅ per-user audit store (`auditStorage.forUser(userId).exportAllEvents()`) | ✅ `GET /audit/logs?fromTime=…&toTime=…` → `audit_logs.json` | same data; audit-store is also exposed as streams under the `:_audit:` store prefix (e.g., `:_audit:access-<accessId>`) — both backups capture it via different paths |
| HFS series data points | ✅ per-user series DB (`seriesConnection.exportDatabase(userId)`) | ✅ **CLI + webapp** (v0.7.0+): per-event `GET /events/<id>/series` → `hf-data/<eventId>.json` | symmetric, both flavors |
| account / system-streams account-tree | ✅ raw rows from user-account storage | ✅ `/account` (the standard system-streams account tree) | symmetric for visible system streams |
| MFA enrolment metadata | ✅ in private profile (`profile.mfa = { content, recoveryCodes }`) | ✅ already in `profile_private.json` (`profile.get` returns the full profile verbatim) | **fully exported on both sides**, including `content` (template substitutions — phone number, headers) and `recoveryCodes` (10 UUIDs that bypass the SMS challenge). **Operator security note:** the subject backup file is therefore as sensitive as a password reset link — implementer must transport over a secure channel and document destruction policy. Recovery codes can be rotated post-export by re-running activate-confirm |
| CMC counterparty metadata | ✅ via `clientData.cmc.counterparty` + `clientData.cmc.apiEndpoint` on each shared access row | ✅ via `clientData.cmc.counterparty` + `clientData.cmc.apiEndpoint` on each shared access (passed through `composeWireAccess`) | **no gap** — federation counterparty `{username, host}` and back-channel `apiEndpoint` round-trip in both tools. Jurisdiction-per-host inference is the implementer's responsibility — no host-to-country registry in the API |
| Integrity manifest | ⚠️ engine-level only (PG `pg_dump` checksums, SQLite WAL); no per-file sha256 emitted by `bin/backup.js` | ✅ `manifest.json` (sha256 per file, tool version, ISO timestamp, `manifest.verify(rootDir, cb)`) | **asymmetric by design** — operator backup leans on engine-level integrity (full-cluster snapshot guarantees), subject backup needs portable proof for a third-party auditor |

## Article coverage by tool

| Article / clause | Satisfied by | Notes |
|---|---|---|
| GDPR Art.15(1)(a) — purposes of processing | Subject backup (`accesses-all.json` 0.5.0+ for consent-state-at-time-of-access provenance) | revoked + expired tokens carry the historical "what permission did this app have, when" view |
| GDPR Art.15(1)(c) — recipients of data | Subject backup (`audit_logs.json` + `accesses-all.json` + `webhooks.json`) | audit log carries actual disclosures; accesses-all carries the recipient-token universe; webhooks carry outbound delivery configuration |
| GDPR Art.15(1)(f) — third-country transfers | Subject backup (`clientData.cmc.counterparty.host` on each shared access; implementer infers jurisdiction from host) | no built-in jurisdiction-per-host registry — operator policy concern |
| GDPR Art.20 — portability | Subject backup (read side complete; restore side experimental — audit/webhooks/accesses deliberately not replayed; HFS + multi-attachment round-trip work 0.4.0+) | operator backup not a portability tool; rows aren't subject-shape |
| GDPR Art.30 — records of processing | Operator backup (raw row history for the operator's own Art.30 register) | not a subject-disclosure tool |
| CCPA §1798.110 — right to know | Subject backup | same as Art.15 |
| CCPA §1798.115 — right to know about sale/sharing | Subject backup (`accesses-all.json` includes shared-access history) | |
| PIPEDA Principle 4.9 — access | Subject backup | |
| Swiss nLPD Art.25 — right to information | Subject backup | |
| HIPAA-privacy §164.524 — access to PHI | Subject backup | |
| Disaster recovery / regulator-mandated retention | Operator backup | restore-into-fresh-engine; cross-cluster migration |

## Where the asymmetries are intentional

- **Integrity manifest** — operator backup relies on engine-level integrity (PG `pg_dump` checksums + SQLite WAL); subject backup emits per-file sha256 because the subject's auditor cannot inspect engine internals.
- **Restore-side gaps on subject backup** — audit logs, webhooks, and accesses are explicitly excluded from restore in 0.5.0. Reason: audit is system-generated (injecting it would produce false audit history); webhooks are keyed by `accessId` which changes on a fresh destination; access tokens are server-minted and not replayable. Subject backup IS the historical record for these.
- **Wire shape vs row shape** — operator backup writes raw storage rows including internal serial columns (`createdBySerial`, `modifiedBySerial`, `headId`); subject backup uses `composeWireAccess`-equivalent shapes so the subject sees the same field names as the API documentation.

## Where the asymmetries are unintentional (known gaps)

None known after 0.5.0 — per-access version history shipped behind an opt-in CLI flag; MFA enrolment metadata was already covered (re-verified during the 0.5.0 audit — `profile.mfa` rides verbatim through `profile.get`, which was the source of an earlier mis-classification).

The only items deliberately left out are the restore-side gaps documented in the intentional-asymmetries section (audit/webhooks/accesses can't be replayed safely).

## Reading order for an auditor

1. **Start with this note** to understand which tool to ask the operator to run for a given right-of-access / portability request.
2. **`account-backup-coverage.md`** for the subject-side per-data-type checklist + the if-you-must-answer-a-DSAR-before-the-backlog-ships fallback procedure.
3. **`proposals/account-backup-dsar-completeness.md`** for the shipped-vs-queued evidence trail.

## Related primitives

- `proposals/account-backup-dsar-completeness.md` — Status: SHIPPED through v0.5.0.
- `proposals/audit-on-user-delete.md` — audit-retention modes intersect with audit-in-DSAR (`keep` mode means more rows to export; `pseudonymise` mode means the exported audit carries alias not identifier).
- `docs/pryv-primitives.md` — audit entry confirms audit-in-DSAR is data-minimal by construction.
