# Facilitation typology & effort-saved scale

Every row in the matrix carries a coverage tier (`implemented` /
`configurable` / `facilitated` / `documented` / `out-of-scope`).
That single tag isn't enough — within each tier, rows vary in
how much of the obligation Pryv carries and (for `facilitated`)
in what kind of help Pryv provides.

Two structured fields decompose this:

- **`pryv_effort_saved`** *(required when `coverage != out-of-scope`)*
  How much of the obligation Pryv carries, as the implementer
  experiences it. `high | medium | low`.
- **`facilitation_mode`** *(required when `coverage == facilitated`,
  forbidden otherwise)* What kind of help Pryv provides on a
  facilitated row. `primitive | evidence | storage | infrastructure |
  awareness`.

## `pryv_effort_saved`

Reads as: "Pryv saves the implementer X effort."

**Important:** the "effort" axis is scoped specifically to
**engineering + operational** work — building, wiring, running the
technical side of the obligation. It does **not** count legal /
editorial / process / strategic compliance effort, which stays on
the implementer regardless of Pryv. See
[[effort-axis.md]] for the precise scope + examples per level.

| Value | Meaning |
|---|---|
| `high` | Pryv carries most of the engineering+operational work. |
| `medium` | Roughly shared engineering+operational effort. |
| `low` | Pryv contributes a small technical substrate; bulk on implementer. |

Per-coverage default expectations (not enforced — author's judgement):

| Coverage | Typical effort_saved | Notes |
|---|---|---|
| `implemented` | almost always `high` | Pryv ships the obligation; rare exceptions where the implementer still composes substantive UI/glue. |
| `configurable` | varies | Single config flip → `high`. Multi-step setup or custom integration → `medium` / `low`. |
| `facilitated` | varies (see below) | Use the `facilitation_mode` to clarify the kind of help. |
| `documented` | usually `low` | Doc-only means the implementer does the work; the doc just removes ambiguity. |
| `out-of-scope` | n/a | Field forbidden. Zero Pryv contribution by definition. |

## `facilitation_mode`

Reads as: "When Pryv facilitates this requirement, the help is of
type X."

### `primitive`

Pryv's permission / access-versioning / system-streams primitive
**technically enforces** the obligation. The implementer's part is
policy: choose the stream layout, choose the permission scope,
classify the data.

**Use when** the obligation's compliance check is satisfied by the
access / permission / stream design choices the implementer makes
once — not by an ongoing process.

**Examples:** `gdpr.Art.29` (workforce processes only on instructions
because permissions scope it), `gdpr.Art.9` (special-category
isolation on dedicated stream subtrees), `iso-27001.A.5.3`
(segregation of duties via distinct accesses).

### `evidence`

Pryv generates structured data (audit log, access version chain,
event version history) that the implementer **uses as proof** for a
regulatory artefact they produce — a Art.30 register, a breach
report, a §164.528 accounting of disclosures, an ISMS internal-audit
deliverable.

**Use when** the obligation's compliance burden is producing or
maintaining a written / reportable artefact, and Pryv's contribution
is the data the artefact cites.

**Examples:** `gdpr.Art.30`, `gdpr.Art.24`,
`hipaa-breach.164.402(1)`, `mdr.Art.83`.

### `storage`

Pryv durably stores artefacts the **implementer creates** — notice
text, consent records, policies-as-events, BAA references,
classification metadata. Pryv does not generate the content; it
makes the content recoverable per-subject and per-time.

**Use when** the obligation's compliance burden is "show the auditor
the exact text you presented", and Pryv's contribution is durable +
per-subject preservation of that text alongside the technical
authorization.

**Examples:** `gdpr.Art.13/14`, `ccpa.1798.130(a)(5)`,
`hipaa-privacy.164.530(i)`, `pipeda.Principle.4.8`.

### `infrastructure`

Pryv runs the **technical layer** the obligation depends on — TLS,
mTLS, encryption-at-rest, multi-core HA, data-residency,
backup-restore. The obligation is satisfied because the technical
layer exists, not because the implementer composed anything.

**Use when** the obligation's compliance burden is "demonstrate the
technical controls", and Pryv ships the controls themselves.

**Examples:** `gdpr.Art.32`, `gdpr.Art.44`, `iso-27001.A.5.30`,
`hipaa-security.164.308(a)(7)(ii)(C)`.

### `awareness`

Pryv has **minimal direct contribution**; the row exists so the
implementer doesn't forget the obligation. Often paired with a
`derives_from` cross-link pointing at the row in another scope that
*does* carry substantive Pryv contribution.

**Use when** the row is mostly framing or pointer; if Pryv were
removed from the equation, the obligation would still attach to the
implementer in nearly identical form.

**Examples:** `gdpr.Art.40`, `gdpr.Art.42`, `iso-27001.A.5.21`,
`pipeda.framing`.

## Decision flow

1. **Coverage** — pick from the five-tier taxonomy first (the
   existing rule, unchanged).

2. **`pryv_effort_saved`** — ask:
   - If you removed the implementer's part entirely, would Pryv
     satisfy the obligation alone? → `high`
   - Implementer does roughly half? → `medium`
   - Implementer does most, Pryv just makes it traceable? → `low`

3. **`facilitation_mode`** (only when coverage = `facilitated`) — ask
   the questions in order:
   - Does Pryv's permission / access primitive enforce it? →
     `primitive`
   - Is Pryv's audit / version data the evidence layer? → `evidence`
   - Does Pryv store text the implementer wrote? → `storage`
   - Does Pryv run TLS / HA / encryption the obligation needs? →
     `infrastructure`
   - Otherwise (row is framing or pointer)? → `awareness`

When multiple modes co-dominate, pick the strongest one and mention
the others in the prose. Avoid splitting rows just to fit one mode
each.

## Why two fields, not one

It would be tempting to collapse `effort_saved` into the
`facilitation_mode` (e.g., "primitive-high" as a single tag). We
keep them separate because:

- The effort axis applies across all coverage tiers (a `configurable`
  row can be `high` or `low` effort; a `documented` row can be
  `medium` if the doc is comprehensive). One uniform field for that
  axis is cleaner than per-tier variants.
- The mode is specific to `facilitated` — it answers "what kind of
  help" — which doesn't transfer well to other tiers.

## CSS / WAB rendering

The WAB renders three badges per row:

1. **Coverage badge** (`cov-*` CSS classes; existing) — the five-tier
   tag.
2. **Facilitation-mode badge** (`fac-*` CSS classes; only on
   facilitated rows) — outlined pill, distinct hue per mode.
3. **Effort badge** (`effort-*` CSS classes; on all non-out-of-scope
   rows) — teal scale: high filled, medium lighter, low outlined.

See `wab/src/components/CoverageBadge.tsx` + `wab/src/index.css`.

## History

- 2026-05-19 — typology introduced (prose-prefix convention, Path A
  in the original proposal).
- 2026-05-19 — promoted to schema fields (Path B); `facilitation_level`
  generalized into `pryv_effort_saved` to apply across all coverage
  tiers; `facilitation_mode` kept as facilitated-only. 197 facilitated
  rows migrated from the prose prefix; 86 non-facilitated rows
  backfilled (66 implemented → `high`; 19 configurable + 1 documented
  per editorial overrides in
  `scripts/backfill-pryv-effort-saved.js`).
