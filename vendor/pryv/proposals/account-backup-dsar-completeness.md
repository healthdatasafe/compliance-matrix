# Proposal: pryv-account-backup DSAR completeness

**Status: SHIPPED 2026-05-27 + 2026-06-13 — all chips discharged.**

- **2026-05-27, v0.4.0:** initial DSAR-completeness fix on `pryv/pryv-account-backup` master at [`ea6ae6a`](https://github.com/pryv/pryv-account-backup/commit/ea6ae6a) (Plan 72 Phase C). Three commits: [`1a05482`](https://github.com/pryv/pryv-account-backup/commit/1a05482) v0.3.0 (audit log + HFS data points + webhooks + per-file integrity manifest), [`30b1661`](https://github.com/pryv/pryv-account-backup/commit/30b1661) C.4 partial (series event containers + HFS data-points round-trip on restore), [`ea6ae6a`](https://github.com/pryv/pryv-account-backup/commit/ea6ae6a) v0.4.0 (full dependency upgrade + multi-attachment restore). Discharged 5 bug chips (`gdpr.Art.15`, `ccpa.1798.110`, `hipaa-privacy.164.524`, `pipeda.Principle.4.9`, `swiss-nlpd.Art.25`) + 1 feature chip (`gdpr.Art.20` multi-attachment / HFS restore).
- **2026-06-13, v0.5.0:** chunked-events follow-up + completeness rounding (Plan 93). Feature commit [`d1eaf48`](https://github.com/pryv/pryv-account-backup/commit/d1eaf48), merge [`e59d5b3`](https://github.com/pryv/pryv-account-backup/commit/e59d5b3), [PR #14](https://github.com/pryv/pryv-account-backup/pull/14), tag [`v0.5.0`](https://github.com/pryv/pryv-account-backup/releases/tag/v0.5.0). Discharged the last feature chip on `gdpr.Art.15` (chunked time-range events fetch — `events-YYYY-MM.json` per UTC month). Also bundled `accesses-all.json` (revoked + expired access tokens for the full disclosure-history view) and opt-in `accesses-history/<accessId>.json` per access (via `?includeHistory=true`). Note: `pryv-account-backup` is not on the npm registry — distribution is git-clone-based per the README.

macroPryv backlog files archived: `_plans/_archives/78-account-backup-dsar-completeness-done.md` (v0.4.0 scope) and `_plans/_archives/93-account-backup-chunked-events-done.md` (v0.5.0 scope). GH#73 closed in 2026-05.

**Coverage gaps remaining after v0.5.0 (informational only, no chips):**

- Jurisdiction-per-host inference for CMC counterparty `host` is implementer-side (no host-to-country registry in the API).
- Operator security note: `profile_private.json` carries `profile.mfa = { content, recoveryCodes }` verbatim — the backup file is therefore as sensitive as a password-reset link. By-design; the subject IS entitled to their full MFA state. Documented in v0.5.0 CHANGELOG.

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
