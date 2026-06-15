# Proposal: audit-log erasure on user account delete (engine-consistency fix + operator setting)

**Status: SHIPPED 2026-05-27** on `pryv/open-pryv.io` master. A.1 (engine-agnostic erasure) at [`891090d`](https://github.com/pryv/open-pryv.io/commit/891090d) + audit-routing follow-up at [`853e1cb`](https://github.com/pryv/open-pryv.io/commit/853e1cb) + A.2 (operator setting `audit.onUserDelete: erase|keep|pseudonymise`) at [`405b3a1`](https://github.com/pryv/open-pryv.io/commit/405b3a1) + test-file rename at [`a143de5`](https://github.com/pryv/open-pryv.io/commit/a143de5). Both bug chips (3: `gdpr.Art.17` / `ccpa.1798.105` / `iso-27701.A.7.4.5`) and companion feature chips (3: `gdpr.Art.17` / `ccpa.1798.105` / `hipaa-security.164.316(b)(2)(i)`) discharged on this commit. GH#75 closed. macroPryv backlog file archived to `_plans/_archives/`.

---

**(historical proposal preserved below)**

**Status (when open):** **bug fix queued** + future setting. Mirror of the upstream
backlog item (filed 2026-05-20 from the compliance-matrix
implementer-perspective gap-probing session — Q8 on right-to-erasure
end-to-end including the audit log itself).

## Today's posture (engine-dependent — undocumented gap)

The `auth.delete` API method (the GDPR Art.17 erasure primitive)
should produce a consistent end-state regardless of audit storage
engine. Today it does not.

The `auth.delete` pipeline runs:

```
checkIfAuthorized → validateUserExists → validateUserFilepaths
→ deleteUserFiles → deleteHFData → deleteAuditData → deleteUser
```

The `deleteAuditData` step calls `userLocalDirectory.deleteUserDirectory`
which removes the per-user filesystem directory wholesale. That happens
to wipe SQLite audit (the per-user `.sqlite` file lives there), but
does **nothing** for PostgreSQL audit (rows in the shared `audit_events`
table keyed by `user_id`).

| Audit engine | Storage layout | Outcome of `auth.delete` |
|---|---|---|
| SQLite | per-user file under user directory | wiped ✅ |
| PostgreSQL | shared `audit_events` table | **not touched** ⚠️ |

`AuditStoragePG.deleteUser(userId)` exists (it runs
`DELETE FROM audit_events WHERE user_id = $1`) but is only wired into
the backup-restore preflight, not the user-delete pipeline. The
implementer sees this row claim "configurable end-to-end erasure"; on
a PG deployment, audit rows referencing the deleted subject silently
survive.

## Direction when shipped

Two parts, shipped together:

### 1. Consistency fix (the bug)

Add `deleteAuditDataStorage` as its own explicit middleware in
`auth.delete`, calling `auditStorage.deleteUser(userId)`. Removes the
implicit "wipe via filesystem directory" coupling that papered over
the PG gap. Both engines now converge.

### 2. Operator setting `audit.onUserDelete`

```yaml
audit:
  onUserDelete: erase | keep | pseudonymise   # default: erase
```

- **`erase`** (default) — runs `auditStorage.deleteUser(userId)`.
  Matches today's effective SQLite behaviour + the GDPR/CCPA/PIPEDA
  default. The implementer-friendly default.

- **`keep`** — skips the call. Retains every audit row referencing
  the deleted user. Use case: HIPAA §164.316(b)(2)(i) (6-year audit
  retention regardless of subject erasure), MDR Art.10(8) (10-year
  device-history record retention), or any regime where the audit
  is kept under a separate lawful basis (GDPR Art.17(3)(b) —
  "compliance with a legal obligation"). The implementer must
  document the retention in their DPIA.

- **`pseudonymise`** — null/hash the personal identifiers in audit
  rows (`accessId`, `userId`, params containing personal data),
  keeping the access-pattern + timestamps + action verbs. The
  audit row no longer qualifies as personal data under GDPR; the
  operator retains forensic value. **Composes with the
  `randomAlias` primitive** (see
  `proposals/aliases-as-pseudonymization-primitive.md`): an alias-
  issuing deployment never stores the canonical identifier in the
  audit row, so erasure of the user removes the only PII handle
  with no audit rewriting required.

## Affected matrix rows (today's framing → after shipping)

| Scope | Row | Today | After shipping |
|---|---|---|---|
| gdpr | Art.17 | Configurable \| Medium (engine-dependent, undocumented gap) | Configurable \| High (one consistent knob across engines) |
| gdpr | Art.5(1)(c) data minimisation | F: Storage \| Medium | F: Storage \| Medium (better post-erasure residual-data story) |
| ccpa | §1798.105 | Configurable \| Medium | Configurable \| High |
| swiss-nlpd | Art.32 | Implemented \| High | unchanged (note the consistency fix) |
| pipeda | Principle.4.5 | Configurable \| Medium | Configurable \| High |
| hipaa-security | §164.316(b)(2)(i) 6-year audit retention | F: Storage \| Low | F: Storage \| Medium (the `keep` mode is the HIPAA-friendly path) |

## Rows updated alongside this proposal

The engine-dependent gap should be surfaced today in the `detail` of
the GDPR Art.17 row + the rows that `derives_from gdpr.Art.17` (CCPA
§1798.105, Swiss nLPD Art.32, PIPEDA Principle 4.5) — so an
implementer reading the matrix learns about it without having to read
the source.

- `gdpr.Art.17` — `detail` extended with the per-engine truth-table
  + planned consistency fix + operator setting.
- `hipaa-security.164.316(b)(2)(i)` — `detail` extended to flag
  that the planned `audit.onUserDelete: keep` mode is the
  HIPAA-friendly path.

## Related

- Upstream backlog: `_plans/XXX-Backlog/AUDIT-ON-USER-DELETE.md`
- Sibling proposal:
  `proposals/aliases-as-pseudonymization-primitive.md`
  (the `randomAlias` primitive is the natural building block for
  the `pseudonymise` mode).
- Sibling proposal: `proposals/audit-log-chaining.md` (different
  concern — tamper-resistance vs erasure — but the chain design
  must accommodate post-hoc row deletion / pseudonymisation; e.g.,
  "tombstone" rows that preserve chain continuity while removing
  personal data).
