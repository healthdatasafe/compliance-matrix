# Proposal: pryv-account-backup DSAR completeness

**Status: SHIPPED 2026-05-27 + 2026-06-13 + 2026-06-15 — all chips discharged.**

- **2026-05-27, v0.4.0:** initial DSAR-completeness fix on `pryv/pryv-account-backup` master at [`ea6ae6a`](https://github.com/pryv/pryv-account-backup/commit/ea6ae6a) (Plan 72 Phase C). Three commits: [`1a05482`](https://github.com/pryv/pryv-account-backup/commit/1a05482) v0.3.0 (audit log + HFS data points + webhooks + per-file integrity manifest), [`30b1661`](https://github.com/pryv/pryv-account-backup/commit/30b1661) C.4 partial (series event containers + HFS data-points round-trip on restore), [`ea6ae6a`](https://github.com/pryv/pryv-account-backup/commit/ea6ae6a) v0.4.0 (full dependency upgrade + multi-attachment restore). Discharged 5 bug chips (`gdpr.Art.15`, `ccpa.1798.110`, `hipaa-privacy.164.524`, `pipeda.Principle.4.9`, `swiss-nlpd.Art.25`) + 1 feature chip (`gdpr.Art.20` multi-attachment / HFS restore).
- **2026-06-13, v0.5.0:** chunked-events follow-up + completeness rounding (Plan 93). Feature commit [`d1eaf48`](https://github.com/pryv/pryv-account-backup/commit/d1eaf48), merge [`e59d5b3`](https://github.com/pryv/pryv-account-backup/commit/e59d5b3), [PR #14](https://github.com/pryv/pryv-account-backup/pull/14), tag [`v0.5.0`](https://github.com/pryv/pryv-account-backup/releases/tag/v0.5.0). Discharged the last feature chip on `gdpr.Art.15` (chunked time-range events fetch — `events-YYYY-MM.json` per UTC month). Also bundled `accesses-all.json` (revoked + expired access tokens for the full disclosure-history view) and opt-in `accesses-history/<accessId>.json` per access (via `?includeHistory=true`). Note: `pryv-account-backup` is not on the npm registry — distribution is git-clone-based per the README.
- **2026-06-15, v0.6.0:** library + CLI split + incremental backup via `events.get?modifiedSince=T` + audit-as-events + browser-isomorphic core + sample webapp (Plan 94). Foundation commit [`6cfc7fc`](https://github.com/pryv/pryv-account-backup/commit/6cfc7fc), merge [`3e10cb1`](https://github.com/pryv/pryv-account-backup/commit/3e10cb1), [PR #15](https://github.com/pryv/pryv-account-backup/pull/15). Isomorphism commit [`e957ce2`](https://github.com/pryv/pryv-account-backup/commit/e957ce2), [PR #16](https://github.com/pryv/pryv-account-backup/pull/16). AGENTS.md commit [`df785b0`](https://github.com/pryv/pryv-account-backup/commit/df785b0), [PR #17](https://github.com/pryv/pryv-account-backup/pull/17). Sample webapp at [`pryv-account-backup-webapp`](https://github.com/pryv/pryv-account-backup-webapp) commits [`e57aeec9`](https://github.com/pryv/pryv-account-backup-webapp/commit/e57aeec9) + [`81dccc4`](https://github.com/pryv/pryv-account-backup-webapp/commit/81dccc4). [`pryv/example-service-bluebutton`](https://github.com/pryv/example-service-bluebutton) archived. Customer-resources doc on dev-site [PR #184](https://github.com/pryv/dev-site/pull/184). **Important upstream context:** the dedicated `/audit/logs` route was **removed** from open-pryv.io on 2026-06-15 (commit [`19d1c11f`](https://github.com/pryv/open-pryv.io/commit/19d1c11f) on master). v0.5.0 and earlier call this route directly and now produce empty `audit_logs.json` files (or 404 errors) against any deployment running that build. **v0.6.0 is the minimum required subject-side backup tool version for current open-pryv.io deployments.** v0.6.0 fetches audit via `events.get?streams=[':_audit:accesses',':_audit:actions']` — continues to work post-removal AND supports `modifiedSince`.
- **2026-06-15, v0.7.0 (CLI library) + webapp v0.2.0:** attachments / HFS / webhooks browser-isomorphic + portable `sync-state.json` for cross-session incremental in the browser (Plan 97). Closes the v0.6.0 webapp coverage gap. The `StateStore` interface gains per-category work-ref tracking (`pushRef` / `listPending` / `markDone` / `clearCategory`) + portable `export()` / `import()`; the three remaining Node-only fetchers (`attachments`, `hf-data`, `webhooks-export`) drain refs from the store. `api-resources` gains an opt-in `onParsed(doc)` tee; `events-chunked` lifts that into `onEvents(events[])` — the orchestrator wires both hooks to push `attachment` + `series-event` refs from events and `webhook` refs from accesses. Run-end writes a portable `sync-state.json` via the writer (CLI: backup-dir root; webapp: inside the final ZIP) — kv-only snapshot (`lastRunAt` + `events.lastModifiedSince` + `audit.lastModifiedSince` + tool/format version). Subject keeps it alongside the backup; CLI auto-reads on the next run, webapp accepts it as upload on the login screen. The webapp's pre-login state panel scans `localStorage` and shows per-prior-state details (Tool version, Last run at, events / audit thresholds, pending refs, Reset action). Smoke validated against `perki.pryv.me` (initial 75 KB ZIP / 102 reqs / 76 month-chunks; incremental 18 KB / 36 reqs / single `events?modifiedSince` call; full + attachments 543 KB / 110 reqs / 8 binary attachments drained / 11 webhooks; 3/11 expired tokens skipped silently as 401/403). Schema doc at [`pryv-account-backup/docs/sync-state.md`](https://github.com/pryv/pryv-account-backup/blob/master/docs/sync-state.md). No new compliance chips — this is a coverage-symmetry refresh on top of v0.6.0's already-discharged work.

macroPryv backlog files archived: `_plans/_archives/78-account-backup-dsar-completeness-done.md` (v0.4.0 scope), `_plans/_archives/93-account-backup-chunked-events-done.md` (v0.5.0 scope), `_plans/_archives/94-incremental-backup-rewrite-done/` (v0.6.0 scope), and `_plans/_archives/97-webapp-attachments-hfs-webhooks-done/` (v0.7.0 scope). GH#73 closed in 2026-05.

**Coverage gaps remaining after v0.7.0 (informational only, no chips):**

- Jurisdiction-per-host inference for CMC counterparty `host` is implementer-side (no host-to-country registry in the API).
- Operator security note: `profile_private.json` carries `profile.mfa = { content, recoveryCodes }` verbatim — the backup file is therefore as sensitive as a password-reset link. By-design; the subject IS entitled to their full MFA state. Documented in v0.5.0+ CHANGELOG.
- Webapp omits `manifest.json` (per-file sha256 tamper-evidence) by design — it's the auditor-facing artefact, and the webapp ZIPs are signed by the operator's TLS already. Subjects who need third-party-auditor tamper-evidence should be routed at the CLI flavor.

**Regression fixed in v0.6.0:** v0.5.0's `hf-data.js` inspected only the legacy `events.json` to discover `series:*` events; on a chunked backup (which writes `events-YYYY-MM.json` instead), every series-event was silently skipped and the bundle produced zero HFS data points despite the v0.3.0+ design saying it should carry them. v0.6.0 iterates `BackupDirectory.listEventFiles()` so legacy AND chunked file layouts both work; regression test `[PAHF]` added. Affected window: 2026-06-13 (v0.5.0 ship) through 2026-06-15 (v0.6.0 ship) for HFS-using subjects on v0.5.0; operators who answered DSARs in that window with v0.5.0 against an HFS subject should consider re-running against v0.6.0+.

**Latent bug fixed in v0.7.0:** v0.4.0–v0.6.0's `attachments.js` referenced an undeclared `mkdirp` helper on the opt-in stream-path-mirrored output layout (`BackupDirectory.settingAttachmentUseStreamsPath = true`, default). Any account with a `streamId` that mapped to a top-level stream (typical) would have crashed on the first attachment; the codepath was rarely-exercised because the `streamsMap.children` typo-key meant nested streams never registered. v0.7.0 drops the stream-path layout in favor of the simpler flat `attachments/<eventId>_<fileName>` (stream-path metadata is recoverable from `events*.json` + `streams.json` for any consumer that needs the old layout).

---

**(historical proposal preserved below)**

**Status (when open):** **bug fix queued** + tooling enhancement. Mirror of the
upstream backlog item (filed 2026-05-20 from the implementer-
perspective gap-probing session — Q10 on DSAR full-loop performance
+ completeness at production scale).

## Today's posture (Implemented | High — with caveats)

`pryv-account-backup` v0.2.3 is the npm tool subjects (or
implementers acting on a subject's behalf) run to satisfy GDPR
Art.15 + Art.20 / CCPA §1798.110 + §1798.115 / PIPEDA Principle 4.9 /
Swiss nLPD Art.25. It works for the common case — typical app
deployments, small-to-medium event volumes — and produces a
`./backup/<apiEndpoint>/` folder with JSON resources + opt-in
binary attachments.

**Known gaps at production scale** (full audit in
`context/account-backup-coverage.md`):

- Audit log not fetched (`/audit/logs` missing) — **Art.15(1)(c)
  disclosure-recipient history absent**.
- HF series data points not fetched (`GET /events/<id>/series`
  missing) — series-event containers are exported but their data
  payload is lost.
- Webhooks not fetched (`/webhooks` missing).
- Single-shot events fetch with no chunking — won't scale to GB
  event volumes.
- Restore path loses HF data + multi-attachment events on the way
  back in (Art.20 round-trip).
- Legacy `/followed-slices` request returns 404 in v2.

The matrix's `Implemented | High` claim on Art.15 / Art.20 holds
because **the underlying API endpoints expose every data piece** —
the gap is in tooling completeness, not API surface area.

## Direction when shipped

Three phases (full detail in the upstream backlog):

1. **Phase 1 — High-severity (Art.15 completeness)**: add audit
   log fetch + HFS series data fetch + webhooks fetch; chunk the
   events request by time-range; drop the v1-only
   followed-slices call.
2. **Phase 2 — Medium-severity**: access version history; CMC
   counterparty metadata audit.
3. **Phase 3 — Restore-path repair (Art.20)**: HF series data
   restore via `POST /events/<id>/series`; multi-attachment
   support via `attachments.add`.

No open-pryv.io API changes required — every gap is reachable
from existing v2 endpoints. Two read-side ergonomics ideas
(`GET /export` aggregator, `audit/logs?asExport=true` subset)
are nice-to-have but not strict prerequisites.

## Affected matrix rows (today's framing → after Phase 1)

| Scope | Row | Today | After Phase 1 |
|---|---|---|---|
| gdpr | Art.15 | Implemented \| High | Implemented \| High (coverage narrative tightens; backup-tool primitive cited; gap caveats removed) |
| gdpr | Art.20 | Implemented \| High | unchanged read-side; restore-side claim sharpens after Phase 3 |
| ccpa | 1798.110 | Implemented \| High | unchanged tier; tooling story tightens |
| pipeda | Principle.4.9 | Implemented \| High | unchanged tier; tooling story tightens |
| swiss-nlpd | Art.25 | Implemented \| High | unchanged tier; tooling story tightens |
| hipaa-privacy | 164.524 (access to PHI) | already mapped to events.get etc. | tooling story improves |

## Rows updated alongside this proposal

- `gdpr.Art.15` detail + planned: extended with backup-tool primitive
  citation + the four high-severity gaps + operational guidance.
- `gdpr.Art.20` detail + planned: round-trip caveat (HF + multi-attach
  restore loss).
- `ccpa.1798.110` + `pipeda.Principle.4.9` + `swiss-nlpd.Art.25` —
  add `planned:` chips pointing at this proposal (they all
  derive_from gdpr.Art.15).
- `hipaa-privacy.164.524` — same, for the HIPAA access-right side.
- `docs/pryv-primitives.md` — new `account-backup-tool` primitive
  entry.

## Why this is a bug + a feature, not voluntarily-missing

The tool's stated purpose is "backup your Pryv data" and it's
distributed under the `@pryv/account-backup` npm name. Subjects
+ implementers reasonably expect the export to be complete. The
gaps aren't deliberate scope choices — they're stale relative to
v2 (audit + HFS + webhooks all exist in v2 but the tool predates
their evolution) or legacy artefacts (followed-slices is in v2
test fixtures but removed from the runtime API by Plan 07). Hence
the audit-log + HF-series gaps are `kind: bug`; the round-trip
fixes + Phase 2 history features are `kind: feature`.

## Related

- Upstream backlog:
  `_plans/XXX-Backlog/ACCOUNT-BACKUP-DSAR-COMPLETENESS.md`
- Context note: `context/account-backup-coverage.md`
- Sibling proposal: `proposals/audit-on-user-delete.md` — audit
  retention modes intersect (`keep` increases bundle size;
  `pseudonymise` means alias-only audit content).
- pryv-account-backup repo: `pryv/pryv-account-backup` (added to
  macroPryv workspace 2026-05-20).
