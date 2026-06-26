# Privacy by design + by default — the Pryv-architectural reference

GDPR Art.25 (and Swiss FADP Art.7 — same principle, broader Swiss
catalogue) requires controllers to **integrate data-protection
principles by design** at architecture time and to **enforce them
by default at runtime**. Auditors love this article because it's
both meta (gives them a reason to question any architectural
choice) AND concrete (the §2 "by default" test has teeth).

Pryv's whole architecture leans into this principle deliberately —
it's not retrofitted, it's the founding pattern. This note is the
catalogue of **Pryv defaults that satisfy Art.25(2)** plus the
**architectural commitments that satisfy Art.25(1)**, written so
an operator can point an auditor at it as the "single
regulator-defensible reference for the platform's PbD posture".

Source of truth: the customer-facing dev-site guide at
[`pryv.github.io/guides/privacy-by-design.html`](https://pryv.github.io/guides/privacy-by-design.html)
(`dev-site/src/guides/privacy-by-design.md`). This context note
mirrors that material into the matrix-internal format with
verified code citations + matrix-style cross-references.

## The architectural commitment (Art.25(1))

The Pryv architecture contrasts **standard** vs.
**privacy-by-design** topology:

**Standard topology** (PbD anti-pattern):

```
Processes ──direct access──► Personal Data
              │
              ▼
         Audit / Logs (after-the-fact, manual)
```

- Processes have direct access to personal data.
- Cannot track per-resource access — audit is opt-in,
  procedural, retroactive.
- Process registry is maintained manually (drifts; auditor
  asks "show me Art.30 register" → operator does a spreadsheet
  exercise).

**Privacy-by-design topology** (what Pryv is):

```
       Data Governance
              │
              ▼
Processes ─►Access Control ─►Personal Data
              │
              ▼
   Audit / Logs per-Data-Subject (invariant, automatic)
```

- Access control is a **separate layer** that every process
  call traverses (`components/api-server/src/methods/*.ts` →
  `components/business/src/accesses/AccessLogic.ts` →
  storage).
- Governance is applied **per-process / per-data-subject** —
  every access on every subject's account carries its own
  permission scope + audit trail + version chain.
- **Process registry is self-documented** — `GET /accesses`
  + audit log together IS the Art.30 records-of-processing
  register, derivable on demand (per Q26 +
  `context/client-data-conventions.md`).

This is not an aspiration; it's the architecture Pryv ships.
Every implementer who deploys Pryv inherits the topology.

## The data-model commitment (Art.25(1) + §5(c) data minimisation)

The dev-site guide contrasts **standard relational**
vs. **Pryv streams-and-events**:

**Standard relational data model** (PbD anti-pattern):

- One big schema organised for processing purposes ("customer
  table", "account table", "service-record table").
- Not related to the data-subject's understanding ("which row
  in the customer table is mine?").
- Access enforcement difficult to track per-record.
- Optimised for machine logic (joins across tables); subject
  consent is opaque ("by continuing to use this service you
  agree…").

**Pryv streams-and-events** (the architecture):

- Data segregated by **data-subject AND context** — every event
  belongs to one subject's account; events are organised in
  streams that represent context (`health/vitals/`,
  `diary/notes/`, etc.).
- **Granular consent**: each access permission targets a
  specific stream subtree; subject sees explicit grants like
  *"App X requests: Read 'Nutrition' / Edit 'Diary' / Read
  'Advices' — Accept / Refuse"* rather than a wall-of-text
  privacy policy.
- **Adapt data collection** per subject without schema
  migration — adding a new context = adding a new stream.
- **Still usable by machines** — events have structured
  `type: class/format` JSON Schema (Q21).

The data-subject-and-context segregation is the structural
substrate for granular consent (Art.7) + data minimisation
(Art.5(1)(c)) + portability (Art.20) + erasure (Art.17). All
those rights become per-stream-subtree operations rather than
per-table SQL gymnastics.

## Privacy-by-default UI pattern (Art.25(2))

The dev-site guide contrasts **standard cookie-banner UX** vs.
**privacy-by-default UX**:

**Standard "by continuing" pattern** (Art.25(2) anti-pattern):

> *"This site uses cookies to provide you with an optimal browsing
> experience. By continuing to visit this site, you agree to the
> use of these cookies."*

Privacy is opt-out; user must go to preferences to **deactivate**
processing they didn't actively choose.

**Privacy-by-default pattern** (what Pryv enables via
`app-web-auth3`):

> *"By default, non-necessary cookies are deactivated. You can help
> us improving our website by activating analytics cookies."*
>
> [ACTIVATE] [CONTINUE]

Privacy is opt-in; user must explicitly **activate** the
processing categories they want to enable. The reference notes
this "raises the level of trust" — material business advantage,
not just compliance theatre.

Pryv ships this pattern as the **default** for `app-web-auth3`:
the auth flow surfaces the requested permissions explicitly
(per-stream-subtree + per-level: read / write / contribute /
manage) with Accept / Refuse buttons. The operator can't
accidentally ship a "by continuing you agree" flow because the
auth UI primitive doesn't support that shape.

## Catalogue of Pryv defaults that satisfy Art.25(2)

This is the operator's defensible answer to "show me what's
privacy-protective out of the box":

### 1. Default-deny on permissions

Every access starts with empty `permissions: []`. The operator
EXPLICITLY grants scope; nothing is read by default. Verified
at `components/business/src/accesses/AccessLogic.ts:280-292`
(`canDeleteAccess`) + access creation pipeline. No "default
read all" anti-pattern available.

### 2. Audit-on by default (no opt-out)

The audit primitive is **invariant** — no config flag turns it
off; every API call (`AUDITED_METHODS` set at
`components/audit/src/ApiMethods.ts`) is captured at write-time.
Audit-by-construction (Q9) means the audit captures method +
access ref + URL query + integrity hash; **never the request
body**; `auth=` query params stripped. Both privacy-protective
(no *stored subject data* in the audit — caller-supplied search
values on the GET path are recorded as-is, see
`content-query-audit-semantics.md`) AND accountability-enforcing
(you can't hide what you did).

### 3. TLS enforced by default

The optional Let's Encrypt integration (`letsEncrypt.enabled:
true` opt-in in dev, default-on posture in production deployments)
makes
HTTPS the default. HTTP-only is a deliberate dev-mode opt-in
that gets flagged by `config-validation` warnings. The
`Dockerfile` + INSTALL.md surface point operators toward
HTTPS as the primary path.

### 4. Hosting region pinned per user (architectural data-residency)

Once a subject is assigned to a core (`user-core/<username>`
in PlatformDB), all their Tier-2 data lives on that core
exclusively (Q12 core-affinity, Q25 two-tier model). Residency
is **architectural**, not configurable per-event — operators
can't accidentally write an EU subject's events to a US core
because the routing layer enforces home-core direction.

### 5. Stream-permission granularity by default

Permissions are per-stream-subtree (Q22 8-lever toolkit lever
1). Operator can't accidentally write Art.9 health data to a
publicly-readable stream because permissions DON'T have a
"public" tier — every access requires explicit scope.

### 6. Data-minimal audit (Q9)

Audit captures method + access ref + integrity hash + URL
query (stripped of `auth=`); never the request body. Audit
storage is **safe to retain at long horizons** because it
contains no event content — auditability without
content-confidentiality risk.

### 7. Schema validation at ingest (Q21)

ajv-draft-04 via `components/utils/src/jsonValidator.ts`
rejects out-of-shape payloads by default (HTTP 400). Operators
can't accidentally store unstructured data that bypasses the
catalogue's accuracy enforcement.

### 8. Zero mandatory subprocessors (Q23)

Default deployment talks to zero third-party services beyond
the operator's chosen cloud provider. Every integration (LE /
SMTP / SMS / observability / upstream catalogue) is opt-in.
Operators can't accidentally leak PII to a vendor they didn't
configure.

### 9. Audit-minimal logger (Q23 Layer 2)

The Logger class wraps every log call with `inspectAndHide`
(`components/boiler/src/logging.ts:253-298`, tested by
`[BIH1-6]`). Credential redaction is invariant — operators
can't accidentally leak `auth=...` tokens or password fields
to log aggregators / observability vendors.

### 10. CMC requires explicit subject consent (Q18)

Cross-account sharing via CMC requires the subject's
`consent/accept-cmc` event before any data flows. Operators
can't accidentally share an EU subject's data with a US
counterparty without the subject's explicit consent.

### 11. PlatformDB encrypted secrets (LE + observability)

Sensitive operator credentials (LE account keys, observability
license keys, SMTP credentials once the planned admin-panel
template migration ships, etc.) are AES-256-GCM encrypted with
HKDF-derived keys from `letsEncrypt.atRestKey`. Operators can't
accidentally expose secrets in plaintext PlatformDB dumps.

### 12. Withdrawal API exists by default (Q19)

`DELETE /accesses/:id` is always available; subject with
personal token can revoke any access without third-party
participation. Withdrawal symmetry with grant is API-complete
even if UI is implementer-built (per Q19 backlog).

## The four PbD principles (regulatory framing)

Maps the dev-site guide's four-quadrant model to the
GDPR Art.25 axes:

| PbD principle | What Pryv ships |
|---|---|
| **Proactively consider privacy throughout the data lifecycle** | Conceptualise with privacy-by-design — the architecture above is the substrate. |
| **Automatically protect personal data without any action from the data subject** | Privacy-by-default — the 12-default catalogue above. |
| **Pair privacy AND security** | Audit + access + encryption + system-streams + LE + mTLS + observability filter — not separate layers, woven into the same architecture. |
| **Keep future in mind** | The plugin architecture (storage engines, observability providers, custom dataStores, event-type catalogue extension) lets the operator absorb new regulatory requirements without re-architecture. |

## Cryptographic technologies for privacy (deferred / brainstorm)

The dev-site guide catalogues four PETs (privacy-
enhancing technologies) the platform could absorb. Status:

| PET | Today | Backlog status |
|---|---|---|
| **Pseudonymisation** | partial — accesses + streams provide structural pseudonymisation; `auth.randomAlias` planned | `ALIASES` backlog |
| **Proxy re-encryption** (sharing segments of existing datasets safely; client-side keying during consent) | not shipped; PoC at github.com/perki/test-proxy-re-encrypt | `E2E-ENCRYPTION` backlog + `proposals/e2e-encryption.md` |
| **Homomorphic encryption** | not shipped; out-of-scope for the platform; implementer can layer it on top per use-case | (not backlogged) |
| **Differential privacy** | not shipped; out-of-scope; operator-side analytics layer | (not backlogged) |
| **Multiparty computation** (MPC / federated learning) | not shipped; out-of-scope at platform layer; cross-account CMC + access metadata could anchor such a layer | (not backlogged) |

The PET list is the operator's enrichment path — Pryv's
architecture doesn't preclude any of them; the implementer
layers them on as needed.

## How an operator cites this in their Art.25 evidence pack

Suggested DPIA Section (d) safeguards inventory + Art.25
narrative recipe:

> *"Our deployment is built on open-pryv.io, whose architecture is
> privacy-by-design (Pryv's published technical-implementation
> reference + the open-source codebase audit-trail) — data is
> segregated by data-subject and by context (streams + events);
> access control is independent of processes (separate enforcement
> layer); audit logs are per-subject and invariant; the
> process registry is self-documented via `GET /accesses` +
> audit log. The 12 platform defaults [list per the catalogue
> above] satisfy Art.25(2) by-default settings; our deployment's
> specific configuration [pointing at the planned effective-config
> endpoint per Q20] proves which defaults are
> in force."*

## Matrix encoding

- `gdpr.Art.25` detail extended with the 12-default catalogue
  + the architectural-commitment framing + cross-references
  to the PETs.
- `swiss-nlpd.Art.7` (corresponding Swiss FADP control) +
  `iso-27701` privacy-control rows reference this note via
  `derives_from`.
- No tier shift on `gdpr.Art.25` — the existing
  `facilitated/infrastructure/high` is correct; the detail
  block becomes much richer.
- No backlog or proposal — Pryv's architectural posture IS
  the answer; existing primitives carry it.
- The `E2E-ENCRYPTION` backlog (existing) covers the
  proxy-re-encryption PET; the dev-site guide's
  PoC at github.com/perki/test-proxy-re-encrypt should be
  cited in `proposals/e2e-encryption.md`.

## See also

- `context/client-data-conventions.md` — the consolidated
  `clientData.*` convention catalogue; complementary to the
  by-design architecture (per-access compliance metadata).
- `context/core-affinity-architecture.md` — the residency
  + architectural-data-isolation note.
- `context/special-categories-operator-facilitated.md` — the
  8-lever toolkit operators compose on top of the PbD
  substrate.
- `context/data-masking-projection-vs-transformation.md` —
  audit-by-construction (Q9) details.
- `context/data-accuracy-structural-vs-semantic.md` — ajv
  schema validation at ingest (Q21).
- `context/subprocessor-posture-and-data-flow.md` — zero
  mandatory subprocessors + data-flow guarantees.
- `proposals/e2e-encryption.md` + the
  github.com/perki/test-proxy-re-encrypt PoC.
- Customer-facing dev-site guide:
  [`pryv.github.io/guides/privacy-by-design.html`](https://pryv.github.io/guides/privacy-by-design.html)
  (`dev-site/src/guides/privacy-by-design.md`) — the citable
  public artefact this note mirrors.
