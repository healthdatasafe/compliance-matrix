# Proposal: chained / hashed / signed audit log

**Status:** future. Mirror of the macroPryv backlog item
`_plans/XXX-Backlog/AUDIT-LOG-CHAINING.md` (filed 2026-05-19 from the
compliance-matrix implementer-perspective gap-probing session).

## Today's posture (voluntarily missing for now)

The audit log is the matrix's evidence chain for many obligations
(GDPR Art.30, HIPAA-Privacy §164.528, HIPAA-Security §164.312(b)/(c),
HIPAA-Breach §164.414, ISO 27001 A.8.15, DiGA Annex 1.2.10,
PIPEDA Principle 4.1).

Per-user SQLite stores append-only-by-convention. There is no
software-side tamper-detection signal: an administrator with root
on the host can edit the SQLite file. **This is voluntarily missing
today** — audit-log integrity rests on the operator's filesystem-
hardening posture (immutable mounts / append-only flags / file-
integrity monitoring / out-of-band SIEM forwarding).

For HDS hosters + HIPAA business associates this is arguably
sufficient (the operator's ISMS covers host hygiene), but several
auditor patterns ask for a software-side tamper-resistance signal
in addition.

## Direction when shipped

Three composable layers (see the upstream backlog item for the full
treatment):

1. **Hash chain** — each audit row stores `prev_hash`; detects
   retroactive edit.
2. **Periodic signed checkpoint** — operator-held key signs the
   latest row_hash every N rows; defeats post-hoc rewriting.
3. **Per-row signature** (optional, heavier) — each row signed
   individually.

For Pryv: (1) + (2) is the right pairing.

## Precondition: per-core monotonic time

The chain reconstructs **per-core only** because Pryv's data plane
is core-affine — each user's audit lives on exactly one core
(see `context/core-affinity-architecture.md`). Cross-core
audit-row ordering is not meaningful by design, so the chain
requires *per-core* monotonic time, not cluster-wide clock
agreement. Operator NTP keeps each core's clock well-behaved;
the planned `CLOCK-SKEW-CLUSTER-CHECKS` proposal
(`proposals/clock-skew-cluster-checks.md`) adds bootstrap-time
+ pre-cert-load skew detection on top — useful pre-flight, not
a hard prerequisite for the chain to verify (the hash links carry
correctness; `time` is metadata).

## Affected matrix rows (today's framing → after shipping)

| Scope | Row | Today | After shipping |
|---|---|---|---|
| hipaa-security | 164.312(b) | Implemented \| High | unchanged; cite the chain primitive |
| hipaa-security | 164.312(c)(1) | F: Primitive \| Med | F: Primitive \| High |
| hipaa-security | 164.312(c)(2) | F: Evidence \| Low | F: Evidence \| Med |
| iso-27001 | A.8.15 | Implemented \| High | unchanged; cite chain |
| iso-27001 | A.5.24 | F: Evidence \| Med | F: Evidence \| High |
| gdpr | Art.30 | Implemented \| High | unchanged; register robustness improves |
| hipaa-breach | 164.414 | F: Evidence \| Med | F: Evidence \| High |
| pipeda | s.10.1 | F: Evidence \| Med | unchanged; chain improves RROSH evidence |

## Rows currently affected (matrix prose to update)

The "voluntarily missing" framing should appear today in the
`detail` of the strongest evidence-chain rows so an auditor reading
the matrix is not surprised. The current matrix is silent on the
tamper-resistance question; rows updated alongside this proposal:

- `hipaa-security.164.312(c)(2)` — already mentions
  "Tamper detection beyond this … is on the implementer or an
  extension" — extended to cite this backlog item.
- `iso-27001.A.8.15` — note operator's filesystem-hardening + this
  proposal as future direction.

## Related

- Upstream backlog: `_plans/XXX-Backlog/AUDIT-LOG-CHAINING.md`
- Sibling proposal: `proposals/e2e-encryption.md` (also a future
  primitive that strengthens the deliberate-infrastructure-only
  posture).
- Sibling proposal:
  `proposals/aliases-as-pseudonymization-primitive.md`.
