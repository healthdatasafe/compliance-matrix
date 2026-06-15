# What `pryv_effort_saved` actually measures

The `pryv_effort_saved` field on every non-out-of-scope matrix row
records **how much of the obligation Pryv carries**, on a `high`
/ `medium` / `low` scale.

Without further definition, that phrasing is ambiguous: effort to do
*what*? This document pins down the scope of "effort" the matrix
counts — and, just as importantly, what it does **not**.

## What's counted

`pryv_effort_saved` measures **engineering + operational effort**
the implementer would otherwise spend building or running the
technical side of the obligation if Pryv weren't there:

- **Engineering** — code to write, integrations to build, primitives
  to design, schemas to author, APIs to define + test.
- **Operational** — deployment, configuration, monitoring, incident
  response wiring, backup pipelines, key management, certificate
  rotation, log retention, scaling.
- **Technical demonstrability** — producing audit-trail artefacts,
  evidence chains, version-history records, structured queries that
  an auditor or DSAR-fulfilment workflow consumes.

This is the dimension where Pryv-the-software substantively
displaces implementer work. If you ripped Pryv out and rebuilt the
same compliance posture from scratch, the engineering + operational
delta is what `pryv_effort_saved` quantifies.

## What's not counted

The matrix deliberately **excludes** several effort categories
because they remain entirely on the implementer regardless of Pryv:

### Legal / policy effort

Drafting privacy notices, BAAs, DPAs, sub-processor agreements,
code-of-conduct submissions, DPIA prose, statement-of-applicability
documents, retention schedules, contractual safeguards (SCCs,
BCRs), incident-response runbooks.

**Pryv stores the text you write; it does not write the text.**

### Editorial / classification effort

Deciding what use qualifies as "treatment/payment/operations" under
HIPAA, which Art. 6 lawful basis applies, whether a transfer
counts as "sale" under CCPA, what counts as "sensitive PI", which
event-type catalogue to invoke per data domain, how to layer
streams for minimum-necessary scoping.

**Pryv records the classifications you make; it does not classify
data for you.**

### Process / programmatic effort

Running an ISMS, conducting periodic risk assessments, scheduling
internal audits, training workforce, conducting tabletop exercises,
running CAPA workflows, managing management-review meetings,
maintaining the records-of-processing register's narrative, building
the post-market surveillance plan.

**Pryv supplies the data those processes consume; it does not run
the processes.**

### Strategic compliance decisions

Designating a DPO, choosing whether to pursue an ISO 27001 / 27701
certification, picking a transfer-safeguard regime (adequacy vs
SCCs vs BCRs), determining whether HIPAA-Privacy applies, deciding
which sub-processors to use, scoping the company's compliance
programme.

**Pryv exposes the technical options; the operator picks the
strategy.**

## Reading `high` / `medium` / `low` correctly

### `high` — Pryv carries most of the engineering+operational work

The technical control is **shipped** or **enabled with a single
config**; the implementer's work is mostly enabling it and adding
evidence to compliance binders.

**Examples:**

- `gdpr.Art.32` (security of processing) → `high`. Pryv ships
  TLS, mTLS, HA, at-rest secret encryption, backup-restore, audit.
  Engineering work the implementer would otherwise do = months.
  *Does not mean* Pryv saves you from running an ISO 27001 ISMS
  programme — that's process work, separate axis.
- `gdpr.Art.15` (right of access) → `high`. The standard read API
  returns everything; you wrap it in a portal. Engineering work
  saved = building the read+export pipeline.
- `hipaa-security.164.312(d)` (authentication) → `high`. MFA via
  `mfa.*` API methods, system-streams for credential isolation.

### `medium` — Roughly shared engineering+operational work

Pryv ships the primitives but the implementer still composes
substantive technical work — multi-step config, app-side glue, UI
wrapping, layout design.

**Examples:**

- `gdpr.Art.13` (notice at collection) → `medium` for `storage`.
  Pryv preserves whatever notice you wrote, and the consent-UX
  wrapper is yours.
- `gdpr.Art.3` (territorial scope) → `medium`. Data-residency
  primitive is the technical control; routing logic + hosting
  topology design is your work.
- `hipaa-security.164.308(a)(7)(ii)(C)` (emergency-mode operation)
  → `medium`. Multi-core HA primitive exists; the
  emergency-runbook + tested-recovery cadence is yours.

### `low` — Pryv contributes a small technical substrate

The bulk of the engineering+operational work falls on the
implementer; Pryv's contribution is incidental (a small piece of
evidence, a structural pointer, or a designated stream to hold
the artefact the implementer creates).

**Examples:**

- `gdpr.Art.40` (codes of conduct) → `low`. Pryv provides audit
  evidence of code adherence; drafting, getting approval, sector
  engagement are all manual editorial work.
- `gdpr.Art.6` (lawfulness of processing) → `low`. Pryv stores the
  basis you record on `clientData.lawful_basis`; determining which
  basis applies is editorial.
- `gdpr.Art.34` (breach communication to subjects) → `low`. Pryv's
  audit log helps scope per-subject impact; drafting + sending +
  tracking the notification is operational + editorial.

## Why this scoping matters

An implementer reading "High" on `gdpr.Art.32` might overestimate
what Pryv has done for their overall GDPR posture — and skip
running the ISMS programme that GDPR actually expects on top of
the technical controls.

Explicitly excluding policy / editorial / process / strategic effort
from the axis keeps the matrix honest: it tells the implementer
**what Pryv does technically**, and lets the QMS / policy docs
(separate workstream — see `qms/`) cover the rest.

The badges in the WAB are about engineering + operational savings.
Compliance is broader than that; the matrix's role is to be precise
about the slice it covers.

## Related

- [[facilitation-typology.md]] — `facilitation_mode` axis (what
  kind of help Pryv provides on facilitated rows).
- [[../qms/]] — the policy / process / programmatic side of
  compliance the operator runs on top of the technical substrate.
