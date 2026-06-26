# pryv-account-backup — DSAR coverage matrix

**Status:** implementer reference + audit of `pryv-account-backup`
**v0.7.0** (`@pryv/account-backup`) against GDPR Art.15 / Art.20, CCPA
§1798.110 / §1798.115, PIPEDA Principle 4.9, and Swiss nLPD Art.25.
Originally recorded from the gap-probing session (Q10, 2026-05-20)
against v0.2.3; refreshed 2026-05-27 (v0.4.0 DSAR-completeness),
2026-06-13 (v0.5.0 chunked-events + accesses-completeness),
2026-06-15 (v0.6.0 library + CLI split + incremental backup +
audit-as-events + browser-isomorphic core + sample webapp), and
2026-06-15 (v0.7.0 attachments / HFS / webhooks browser-isomorphic +
portable `sync-state.json` for browser cross-session incremental).

> **Distribution note:** `@pryv/account-backup` is **not on the
> npm registry** — distribution is git-clone-based per the
> project README (`git clone … && cd pryv-account-backup &&
> npm install && npm start`). Operators answering a DSAR clone
> the tagged release, install, and run; there is no
> `npm i @pryv/account-backup` path.

## TL;DR

`pryv-account-backup` v0.7.0 is the recommended subject-side tool for
DSAR / portability requests. v0.6.0 → v0.7.0 finishes the
browser-isomorphic story: the three remaining Node-only fetchers
(attachments / HFS series / webhooks) are now `fetch` + `StorageWriter`
modules drained from a per-category ref store, and the sample webapp
[`pryv-account-backup-webapp`](https://github.com/pryv/pryv-account-backup-webapp)
v0.2.0 exposes all three behind Advanced-section toggles. Both flavors
now write a portable `sync-state.json` (kv-only snapshot) that drives
cross-session incremental — the subject keeps it alongside the backup
and re-supplies it on the next run (CLI auto-reads the backup directory;
webapp accepts it as an upload on the login screen).

**Coverage symmetry CLI ↔ webapp as of v0.7.0:** both flavors cover
every read-side resource (account / streams / accesses + accesses-all /
profile / audit log / events chunked-or-incremental / opt-in per-access
version history / attachments / HFS series / webhooks). The only
remaining CLI-only artefact is `manifest.json` (per-file sha256
tamper-evidence) — a deliberate trade-off; the subject answering their
own DSAR doesn't need third-party-auditor tamper-evidence, and the ZIP
files the webapp emits are signed by the operator's TLS already.

The operator-side companion is `bin/backup.js` shipped in `open-pryv.io`
(raw-row disaster-recovery snapshot, not subject-portable); see
`operator-backup-coverage.md` for the four-tier symmetry audit
(operator backup, subject CLI, subject webapp, archived bluebutton
historical tier).

**Production-broken in v0.5.0 and earlier:** the dedicated `/audit/logs`
route was **removed** from open-pryv.io on 2026-06-15 (commit
`19d1c11f` on master). v0.5.0 and earlier call this route directly and
now produce empty `audit_logs.json` files (or 404 errors) against any
deployment running that build. **v0.6.0 is the minimum required
subject-side backup tool version for current open-pryv.io deployments.**
v0.6.0 fetches audit via the standard events API on the `:_audit:*`
store streams (audit is a regular `@pryv/datastore` mounted there on
every Pryv core), which continues to work post-removal AND supports
`modifiedSince` for incremental fetches.

## Per-data-type coverage (v2 deployments + pryv-account-backup v0.7.0)

| Pryv data type | In backup today | Notes |
|---|---|---|
| account info | ✅ via `/account` | username, email, language, system-streams account-tree |
| public profile | ✅ via `/profile/public` | |
| private profile | ✅ via `/profile/private` | |
| per-app profile (app `clientData`) | ✅ via `/profile/app` per app token | re-authenticates with each app access token |
| streams tree | ✅ via `/streams` | including trashed when `?state=all` |
| events (standard) — initial run | ✅ chunked monthly via `events-YYYY-MM.json` (v0.5.0) | one file per UTC month in the discovered event-time range; replaced the v0.4.0 single-shot fetch that wouldn't scale to GB datasets |
| events (standard) — incremental run | ✅ `events-incremental-<TS>.json` via `events.get?modifiedSince=T&includeDeletions=true` (v0.6.0) | only events with `modified > T`; deletions included so deletion-aware restore consumers can reconstruct |
| event attachments | ✅ **CLI + webapp** (v0.7.0+): opt-in toggle in both flavors, via `GET /events/<id>/<attId>?readToken=...` streamed chunk-by-chunk through the `StorageWriter`. Output at `attachments/<eventId>_<fileName>` (flat layout). | refs collected from the events stream via `events-chunked.onEvents` hook; drained by `attachments.download`; per-attachment `markDone` enables mid-run resume |
| accesses (current) | ✅ via `/accesses` | |
| access version history | ✅ **covered** (v0.5.0) | `accesses-all.json` for deletions + expired tokens; opt-in `accesses-history/<accessId>.json` per access via `?includeHistory=true` for the full per-access version chain |
| CMC counterparty metadata | ✅ confirmed in `accesses.json` | `clientData.cmc.counterparty.{username,host}` + `clientData.cmc.apiEndpoint` ride through `composeWireAccess` on every shared access; jurisdiction-per-host is implementer-side (no host-to-country registry in the API) |
| HF series data points (`series:*`) | ✅ **CLI + webapp** (v0.7.0+): via `GET /events/<id>/series` per series-event (shipped in v0.3.0; regression fixed in v0.6.0; **webapp parity added in v0.7.0**). | series-event refs collected from the events stream via `events-chunked.onEvents` hook; drained by `hf-data.download` |
| webhooks | ✅ **CLI + webapp** (v0.7.0+): per-access via `/webhooks` (aggregated to `webhooks.json` keyed by accessId). | webhook refs collected from the accesses fetch via `api-resources.onParsed` hook; drained by `webhooks-export.download`; 401/403 on expired tokens is non-fatal |
| audit log | ✅ **v0.6.0+: via `events.get?streams=[':_audit:accesses',':_audit:actions']&modifiedSince=T`**. The dedicated `/audit/logs` route was removed from open-pryv.io on 2026-06-15 (commit `19d1c11f`); v0.5.0 and earlier are now production-broken for the audit-log section. Output filename `audit_logs.json` unchanged | supports `modifiedSince` for incremental delta |
| per-file integrity manifest | ✅ CLI only: `manifest.json` (sha256 per file). ❌ webapp omits — deliberate trade-off | `manifest.verify(rootDir)` available for tamper-detect on the CLI side; webapp ZIPs are signed by the operator's TLS instead |
| portable sync-state | ✅ **CLI + webapp** (v0.7.0+): `sync-state.json` written via the `StorageWriter` at run-end. Kv-only snapshot (`lastRunAt` + per-resource `lastModifiedSince` + tool/format version). | full schema: `pryv-account-backup/docs/sync-state.md`. CLI auto-reads on the next run; webapp accepts it as an upload on the login screen. Drives cross-session / cross-device incremental |
| followed-slices | n/a | v0.3.0 dropped the v1-only `/followed-slices` fetch |
| MFA enrolment metadata | ✅ **already covered** (re-verified during 0.5.0 audit) | `profile.mfa = { content, recoveryCodes }` lives in the user's private profile and `profile.get` returns the full profile verbatim, so `profile_private.json` carries MFA state today — including the 10 SMS-bypass recovery codes. **Operator security note:** treat the backup file as a secret on par with a password-reset link; consider rotating recovery codes after the disclosure. |

## Restore-side coverage (Art.20 portability — the round-trip)

`src/restore.js` re-uploads from a backup folder via the standard
write APIs. As of v0.4.0 (shipped 2026-05-27, commits `30b1661`
+ `ea6ae6a`):

- **HF series data**: a `series:*`-typed event is re-created as the
  empty container AND its data points are re-uploaded via
  `POST /events/<id>/series` (partial).
- **Multi-attachment events**: every attachment is re-uploaded
  (v0.4.0 multi-attachment restore).

Implication: a subject who runs `pryv-account-backup` today and
imports the result into a different Pryv account (the Art.20
"transmit to another controller" promise) round-trips HF series
data + multi-attachment events without loss.

## Map to Art.15(1) sub-paragraphs

| Sub-paragraph | Data piece | Pryv source | In backup? |
|---|---|---|---|
| (a) purposes | per-access `clientData.purpose` | `accesses.json` | ✅ |
| (b) categories of data | event `class/format` (data-types) | derivable from `events.json` | ✅ implicit |
| (c) recipients / disclosures | audit log (who accessed what when) + accesses + webhooks | `events.get?streams=[':_audit:*']` (v0.6.0; was `/audit/logs` in v0.4.0–v0.5.0) + `/accesses` + `/accesses?includeDeletions=true` + `/webhooks` | ✅ all four wired; **CLI + webapp** since v0.7.0 |
| (d) retention period | per-access `clientData.retention` + `access.expires` | `accesses.json` | ✅ |
| (e) rectification / erasure rights | nothing to export — these are operator obligations | n/a | ✅ (out of scope for export) |
| (f) right to lodge complaint | nothing to export | n/a | ✅ (out of scope) |
| (g) source of data | event `createdBy` + audit + clientData | derivable from `events-YYYY-MM.json` + `/audit/logs` | ✅ all sources wired in v0.5.0 |
| (h) automated decision-making | nothing native to Pryv | application layer | ✅ (out of scope) |

## Map to Art.20 (data portability)

- "structured, commonly used, machine-readable format" — JSON
  + binary attachments + canonical event types ✅
- "right to transmit to another controller" — restore-side
  is marked experimental. HF series data + multi-attachment
  events round-trip cleanly since v0.4.0; chunked event files
  concatenate transparently on read since v0.5.0. Audit logs,
  webhooks, and access tokens are intentionally NOT replayed
  on import (system-generated or token-bearing — see
  `operator-backup-coverage.md` § "Where the asymmetries are
  intentional" for the rationale).

## Operational guidance for implementers today

As of v0.5.0 (2026-06-13) the read-side bundle is complete — no
manual augmentation needed:

1. `git clone https://github.com/pryv/pryv-account-backup` and
   check out tag `v0.5.0` (or later).
2. `npm install`, then `npm start`.
3. Answer the prompts — at minimum say **Y** to attachments,
   trashed data, and per-access version history if the subject
   has revoked or rotated accesses.
4. Hand the subject the resulting `./backup/<apiEndpoint>/`
   directory + `manifest.json`. The directory layout:
   - `account.json`, `streams.json`, `accesses.json` + `accesses-all.json` + (opt-in) `accesses-history/`
   - `profile_private.json`, `profile_public.json`, `app_profiles/`
   - `events-YYYY-MM.json` (one per month), `attachments/`, `hf-data/`
   - `audit_logs.json`, `webhooks.json`, `manifest.json`
5. **Operator security note** — `profile_private.json` carries
   `profile.mfa.recoveryCodes` (10 SMS-bypass tokens) verbatim.
   Treat the bundle as a secret on par with a password-reset
   link; consider rotating recovery codes after delivery.

The matrix's `Implemented | High` claim on Art.15 / Art.20 holds
because all the data IS exportable via existing API endpoints,
and v0.5.0 wires every endpoint into the tool.

## Related

- Operator-side companion: `operator-backup-coverage.md` (side-by-side
  symmetry audit of `bin/backup.js` vs `@pryv/account-backup`).
- Upstream backlog: internal slug
  `ACCOUNT-BACKUP-DSAR-COMPLETENESS` (shipped — see proposal mirror
  Status header).
- Proposal mirror:
  `proposals/account-backup-dsar-completeness.md`.
- Audit erasure modes intersect:
  `proposals/audit-on-user-delete.md` (`keep` mode means more audit
  rows to export; `pseudonymise` mode means the exported audit
  carries alias not identifier).
- Audit no-content guarantee:
  `docs/pryv-primitives.md` (audit entry) — audit-in-DSAR is
  data-minimal by construction; safe to include.
