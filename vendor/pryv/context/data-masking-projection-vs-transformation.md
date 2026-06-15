# Data masking — projection vs transformation (Pryv's deliberate scope)

**Status:** Pryv's design boundary. Recorded from the
implementer-perspective gap-probing session (Q9, 2026-05-20).

## TL;DR

Pryv enforces **masking by projection** — what an access token can
*see* — not **masking by transformation** — how a value is *rewritten*
before display. This is a deliberate boundary, not a missing feature.

| Masking flavour | Pryv? |
|---|---|
| Hide entire streams from a given access | ✅ Pryv (permissions) |
| Hide entire system-stream sub-tree from a given access | ✅ Pryv (system-streams + permissions) |
| Rewrite a value at read time (`email: "j***@example.com"`) | ❌ application layer |
| Per-role redaction of field substrings | ❌ application layer |
| Static masking of prod data for non-prod environments (faker / hash / perturb) | ❌ application layer |
| Format-preserving encryption (FPE) for stable downstream joins | ❌ application layer |
| Field-level encryption (key-per-field) | ❌ today (planned indirectly via E2E) |
| Audit log content masking | ✅ by construction (audit never captures request body) |

## Why projection-only

Pryv stores events as canonical JSON validated against the
`data-types` schemas. Rewriting one field for one access at read time
would require **runtime knowledge of which field is "sensitive" in
the context of that access** — a policy decision tied to the
deployment, the regulatory regime, and the consumer's role. Pryv's
position: that policy lives in the calling application, where the
business context is rich; the storage layer ships the substrate
(stream isolation + permission scoping) that makes the projection
mechanically enforceable.

This also keeps Pryv's surface deterministic for auditors: an `events.get`
returns the canonical event or it returns 403. A transformation
layer would introduce a third state ("partially-redacted") that
auditors must trust the storage layer's interpretation of.

## What projection covers

When implementers need a "masked" view, the Pryv-native pattern is:

1. **Split the data** — keep the high-sensitivity field on one stream
   (e.g., `personal/identity/email`) and the low-sensitivity context
   on another (e.g., `personal/activity/event`).
2. **Issue narrow access tokens** — the "support" role's access has
   permissions on the activity tree but not the identity tree. The
   support engineer reading the event tree sees activity timestamps,
   types, and any non-PII payload, but the email is unreadable
   because the relevant stream is filtered out at the API layer.
3. **Version the access** — `accessSerial` chains let an auditor
   prove the support role's scope at the moment of any historical
   read.

For username-side pseudonymisation specifically, the planned
`auth.randomAlias` primitive (see
`proposals/aliases-as-pseudonymization-primitive.md`) ships the
alias-issuance step at the access layer.

## What transformation use cases need (and what would help)

The two implementer-pain-points that projection doesn't address:

- **Static masking for non-prod environments** — cloning prod to
  staging for QA without re-identification risk. Today: application-
  layer concern; the operator writes a clone-and-transform script.
  **End-to-end encryption (see `proposals/e2e-encryption.md`) helps
  indirectly**: a key-per-user E2E scheme makes the non-prod clone
  cryptographically opaque without the original keys, removing the
  need to transform field-by-field — the clone is simply unreadable.

- **Field-level encryption at the schema layer** — a data-type schema
  could mark fields as `sensitivity: high` and the storage layer
  could encrypt those with a separate key. Today: not a Pryv concept;
  the operator solves it at the at-rest-encryption layer (LUKS, PG
  TDE, KMS-wrapped backup archives) or in the application before
  writing the event. **E2E encryption is the natural future
  primitive** here too — when shipped, it gives the field-level
  encryption story at the schema layer rather than requiring
  application-layer pre-encryption.

## Matrix implications

- `iso-27001.A.8.11` Data masking — Pryv's contribution is
  projection (stream-level), not transformation. Coverage stays
  `F: Primitive | Med`. Detail block extended to spell out the
  boundary so an A.8.11 auditor knows where the obligation splits.
- Audit-evidence rows (`gdpr.Art.30`, `hipaa-security.164.312(b)`,
  `iso-27001.A.8.15`, `hipaa-privacy.164.528`) gain a clarifying
  sentence: audit IS data-minimal by construction (no request body
  stored). Strengthens the consent-state + Art.5(1)(c) compatibility.
- `proposals/e2e-encryption.md` extended with two new affected use
  cases: static masking for non-prod + field-level encryption at
  the schema layer.

## Related

- `context/per-engine-isolation.md` (sibling context note — projection
  also runs at the per-user-storage layer for SQLite).
- `proposals/aliases-as-pseudonymization-primitive.md` (username-
  side projection primitive).
- `proposals/e2e-encryption.md` (the natural future home for the
  transformation use cases).
- `proposals/audit-on-user-delete.md` (the audit no-content guarantee
  reduces the residual-PII concern after erasure).
