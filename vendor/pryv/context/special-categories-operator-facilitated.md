# Special-category data: voluntarily missing at platform layer, highly facilitated for vertically-integrated operators

GDPR Art.9 (and Swiss nLPD Art.5's broader "sensitive personal data"
definition, and HIPAA's "PHI" notion) requires enhanced protection
for health data, biometric data for ID, genetic data, etc. A
natural regulator question for a Pryv-based health deployment:
"how does the platform enforce Art.9 protection?"

The platform-layer answer is **voluntarily missing**:

- No `sensitivity:` flag on event-type schemas in the built-in
  catalogue.
- No `art9_category:` field on streams, accesses, or system
  metadata.
- No server-side hook that says "you're writing to a health stream;
  show me your Art.9(2) lit-letter before I accept this write."
- No special storage tier auto-selected for sensitive data; no
  audit-log extra-capture; no backup-encryption auto-bump.

This is deliberate. A platform that hard-codes "what counts as
special-category" would either over-classify (forcing wellness apps
into HIPAA-grade isolation overhead they don't need) or
under-classify (missing categories specific to a regulator or
jurisdiction Pryv didn't model). Content-agnostic at the platform
layer is the only sustainable posture for a substrate used by
deployments ranging from consumer wellness to clinical-trial
infrastructure.

**But the picture changes sharply** when the deployment is run by
an operator who controls *both ends*: the Pryv core itself AND the
clients writing to it AND the stream-tree design AND the
event-type catalogue. In that shape — typical for vertically-
integrated health platforms — Pryv exposes enough composable
primitives that the operator builds a strong Art.9 enforcement
layer **without Pryv shipping one for them**.

## The two deployment topologies

| | Vertically-integrated operator | Open Pryv platform |
|---|---|---|
| Who runs the core | The same org that ships the user-facing app | Operator runs the platform; third-party app developers register |
| Who designs the stream tree | Operator (often baked into `customExtensions.systemStreams`) | Operator + each third-party app contributes scopes |
| Who controls the clients writing data | Operator (`app-web-auth3` rebrand + their mobile/web apps) | Mix — operator's UI + third-party apps the operator doesn't author |
| Who curates the event-type catalogue | Operator (`service.eventTypes` URL → operator-maintained data-model repo) | Built-in catalogue + maybe operator-extended |
| Pryv-facilitation strength for Art.9 | **High** — operator composes every lever below | **Medium** — operator can enforce at the boundary, third-party app code is opaque |

The Q22 framing — "voluntarily missing + highly facilitated" — is
specifically about the **left column**. Most regulated health
deployments built on open-pryv.io live in the left column by
design.

## The operator's Art.9 toolkit (left-column deployment)

A vertically-integrated operator composes the following Pryv-side
primitives into a deployment-specific Art.9 enforcement layer.
None of these are "Art.9 features" individually; each is a
general-purpose lever that, combined with operator editorial
judgement, produces the enforcement.

### 1. Stream-tree design with reserved sensitive subtrees

The operator dedicates top-level (or near-top-level) subtrees per
Art.9(1) category: `health/`, `biometrics/`, `genetics/`,
`mental-health/`, `sexual-health/`, etc. Pryv's permissions are
**per-stream and inherited down the subtree** — granting an access
`{streamId: "health", level: "read"}` gives access to everything
under `health/*` and nothing else.

Operator-side enforcement: the operator's client code refuses to
write a `body/temperature` event to any non-`health/`-rooted
stream; mobile app code routes all temperature writes to
`health/vitals/temperature` regardless of UI flow. Pryv enforces
the per-stream permission; the operator enforces the
classification decision via their client code.

Code anchor: `components/api-server/src/methods/events.ts`
permission middleware; `components/business/src/accesses/
AccessLogic.ts` for permission-resolution semantics.

### 2. `clientData.special_category_basis` recording

Every access carries `clientData` — arbitrary operator-owned
metadata that travels with the access through its lifetime, is
audit-traceable, and survives version updates (per
`context/access-versioning.md`). The operator stores the relied-on
Art.9(2) lit-letter on every access that touches a sensitive
subtree:

```json
{
  "permissions": [{"streamId": "health", "level": "read"}],
  "clientData": {
    "lawful_basis": "art.6.1.a explicit consent",
    "special_category_basis": "art.9.2.a explicit consent for health",
    "consent_event_id": "ev_abc123",
    "consent_text_hash": "sha256:..."
  }
}
```

When a regulator asks "under what Art.9(2) basis did this access
process health data on day X?", the operator answers by quoting
the access's `clientData` at version-as-of-day-X — the access
history is the durable, queryable record.

### 3. Custom event-type catalogue with sensitivity annotations

The Q14 / Q21 custom-catalogue extension (`service.eventTypes` URL
→ `deepMerge` over baked-in defaults) is the operator's lever for
**encoding** the Art.9 classification in the event-type schemas
themselves. Pryv's catalogue meta-schema accepts JSON Schema
extension fields (`x-*` properties are passed through), so the
operator can author:

```json
{
  "body/temperature": {
    "type": "number",
    "minimum": 25,
    "maximum": 45,
    "x-art9-category": "health",
    "x-swiss-nlpd-sensitive": true,
    "x-hipaa-phi-class": "vitals"
  }
}
```

Pryv doesn't *enforce* these annotations server-side — but the
operator's client code reads them and gates writes accordingly;
their export tooling uses them to drive a "you're exporting Art.9
data, confirm exception applies" warning; their DPIA tooling
(the planned `GET /system/admin/config/effective` admin endpoint,
when shipped) surfaces them in the deployment summary.

The HDS data-model exemplar already does similar annotations for
HDS-specific FHIR-R4 bindings; the same authoring pattern carries
to Art.9 classification.

### 4. Custom dataStore for per-subtree storage tiering

The Q16 `@pryv/datastore` abstraction lets operators implement a
custom storage engine that handles a specific stream-tree subtree
differently. Concrete pattern: register a `custom.dataStores`
entry that owns the `health/*` subtree and:

- Writes to an encrypted-at-rest LUKS volume (vs. default
  PostgreSQL).
- Enforces stricter access controls (e.g., require a fresh MFA
  challenge for every access creation against the sensitive
  store).
- Routes audit events into a dedicated audit pipeline with
  longer retention.

Code anchor: `components/mall/src/Mall.ts` for the store
registration + dispatch; `pryv-datastore` repo for the SPI;
`context/audit-archival-via-custom-datastore.md` for the
audit-tiering variant of the same pattern.

### 5. Per-engine isolation at storage layer

Even without writing a custom dataStore, the operator can choose
the storage engine per stream tier via the engine-selection plumbing
(storages-as-plugins architecture). For example, a sensitive subtree
can be backed by a different PostgreSQL database (with `pg_dump`
encryption, separate WAL retention, separate replicas) than
ordinary data — same Pryv API, different physical isolation.

Code anchor: `storages/engines/<engine>/` SPI; `default-config.yml`
`storages.engines.*` config tree.

### 6. `customExtensions.customAuthStepFn` hook

The operator can plug a custom auth step into the access-grant
flow that REQUIRES the requesting app to submit an Art.9(2)
exception claim before the access is created. The hook receives
the access request, inspects `permissions[].streamId`, matches
against the operator's classification table, and either accepts
the request (with `clientData.special_category_basis` populated
from the claim) or rejects it (403).

Code anchor: `components/api-server/src/methods/auth.ts`
custom-auth-step extension point; `default-config.yml`
`customExtensions.customAuthStepFn`.

### 7. Audit log automatic capture

The audit primitive is invariant — every API call against every
stream is audited, regardless of sensitivity. The operator gets
the audit trail "for free" for sensitive streams; nothing extra to
configure. The audit-minimality posture (Q9: no request body
captured) is a feature here, not a limitation — audit captures
*which* event was written, not the field values, so the audit
itself is safer to retain than the events would be.

### 8. Backup encryption (operator-side, per Q15)

`bin/backup.js` is unencrypted by design (Q15) — operator wraps
the dump with their own encryption layer. For Art.9 data, this is
where the operator applies the stricter tier: separate
encryption key, separate off-site copy, separate retention policy.

### 9. CMC counter-party metadata (per Q18 + Q22)

When a sensitive stream is shared cross-account via CMC, the
`consent/accept-cmc` event on the subject's account is the Art.9(2)(a)
explicit-consent record for the cross-account flow. The
`request-cmc` offer event MUST include the consent text the
subject is asked to accept (clear plain language, distinguishable
per Art.7) — the operator drives this text in their `app-web-auth3`
rebrand. See `context/cmc-consent-primitives.md` for the lifecycle.

## How to compose the toolkit into a concrete deployment claim

When auditing your own deployment against Art.9 (or running a DPIA
per Q20), produce a concrete claim like:

> *"Sensitive-category data is classified at design time via our
> `data-model` repo's `x-art9-category` annotations (cite the repo
> URL); the operator's mobile + web clients route writes
> exclusively to `health/*` / `biometrics/*` subtrees; every
> access touching a sensitive subtree carries
> `clientData.special_category_basis` populated by the
> custom-auth-step hook; the `health/*` subtree is backed by a
> dedicated PostgreSQL instance with at-rest encryption; the
> audit log captures every read/write against sensitive streams
> with 10-year retention; backups of the sensitive tier are
> encrypted with a separate KMS key with quarterly rotation."*

Every clause cites a Pryv-side primitive the deployment composes;
none of the clauses is "Pryv enforces Art.9" — they are all
"the operator's deployment of Pryv enforces Art.9, using these
specific Pryv primitives".

## Honest limits — when the toolkit doesn't reach

The toolkit works when the operator controls both ends. It weakens
when:

- The deployment hosts **third-party apps** the operator doesn't
  author. Pryv enforces the stream-permission boundary, but the
  third-party app's client code is opaque — the operator can't
  guarantee the third-party respects the `x-art9-category`
  annotation. Mitigation: the access-permission scope IS the
  enforcement boundary; if a third-party app's access is scoped
  to non-sensitive streams, its client-side classification logic
  is moot.
- **Per-field sensitivity** within a single event. Pryv's
  permission model is per-stream, not per-field. If an event mixes
  ordinary and special-category fields, the operator must either
  split it into two events (one on a sensitive stream, one on an
  ordinary stream) or design the event type so the sensitive
  subset is its own event-type.
- **Free-form `note/txt` or `picture/attached` events**.
  Implementers writing free-form notes or attached images can
  embed Art.9 data without the platform knowing. Mitigation:
  client-side input validation + operator-side training; out of
  scope for platform enforcement.

## Matrix encoding

- `gdpr.Art.9` row keeps `coverage: facilitated` + `facilitation_
  mode: primitive` + `pryv_effort_saved: medium`. The
  deployment-topology distinction is in the `detail:` block — it
  explains *when* the facilitation is high and *when* it's
  medium. No tier shift; just enriched prose.
- `swiss-nlpd.Art.5` and `hipaa-privacy.164.502` (PHI uses +
  disclosures) point at this note as the canonical operator-
  toolkit treatment via `derives_from` and prose
  cross-references.
- No backlog, no proposal, no `planned:` chips — the platform
  posture is right; the matrix needed prose tightening to
  surface the deployment-topology nuance.

## See also

- `context/custom-event-type-catalogues.md` — the Q14 extension
  pattern that backs lever 3.
- `context/audit-archival-via-custom-datastore.md` — the Q16
  pattern that backs lever 4.
- `context/cmc-consent-primitives.md` — the cross-account-share
  cousin (lever 9).
- `context/data-accuracy-structural-vs-semantic.md` — the Q21
  pattern showing the same "platform agnostic / operator
  composes" architecture for accuracy.
- `docs/pryv-primitives.md` — every lever cited above is one of
  the 20 primitives in the catalogue.
