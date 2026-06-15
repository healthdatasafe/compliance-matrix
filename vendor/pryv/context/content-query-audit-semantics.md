# Content-query values in the audit log

Status: design-rationale note — referenced by `gdpr.Art.30`,
`hipaa-security.164.312(b)`, `iso-27001.A.8.15` and the `audit`
primitive entry in `docs/pryv-primitives.md`.

## What changed

`events.get` accepts content-query conditions: the `content` and
`clientData` parameters each take an array of JSON conditions —
`{"path": "<dot.path>", "<operator>": <value>}` with one operator per
condition (`eq | neq | in | gt/gte/lt/lte | prefix | exists`) —
evaluated against the event's `content` / `clientData` JSON with
strict-type semantics. Shipped on open-pryv.io master (`1295c0b`); client support
in `pryv` 3.6.0 (`getLatestByContent`, typed query params). Index
acceleration is the operator-declared `storages.contentIndexes`
config key (PostgreSQL partial indexes); queryability itself is
always on.

## Audit behaviour — values are recorded as-is

Pryv's audit row captures the URL query string verbatim, with only
the `auth=` parameter stripped
(`open-pryv.io/components/middleware/src/setMinimalMethodContext.ts`
`originalQuery` → `open-pryv.io/components/audit/src/Audit.ts`
`content.query`). A content-query condition submitted over plain
HTTP GET is therefore preserved **including the values searched
for** — e.g. a condition matching a specific diagnosis code leaves
that code in the audit row.

This is deliberate, not an oversight:

- **The query is the action.** The audit log's purpose is to let you
  reconstruct *who did what* — and for a search, "what" includes the
  search criteria. Redacting values would leave an audit row that
  proves a search happened but not what was looked for, weakening the
  accountability chain exactly where targeted retrieval of sensitive
  data is involved.
- **The invariant is unchanged.** "Data-minimal by construction"
  means the audit log never stores the *subject's data*: request
  bodies — event content, attachments, profile fields — never enter
  an audit row. Content-query values are **caller-supplied search
  input**, not stored subject data. Parameters submitted in a request
  body (e.g. the same call routed through a batch `POST /`) follow
  the body-never-captured rule and do not appear in the audit row.

## What this means for your deployment

- **Sensitivity tiering**: if your apps search by values that are
  themselves sensitive (medical codes, identifiers), the audit log
  inherits that sensitivity on the GET path. Classify and protect it
  accordingly — same regime you apply to your application logs of
  outbound queries.
- **Erasure interplay**: erasing an event (GDPR Art.17) does not
  scrub query values from past audit rows. Those values are a record
  of the caller's request, not a copy of the erased event — the
  existing framing that audit rows survive erasure with no residual
  *subject* data attached still holds, but search values your apps
  chose to send remain.
- **You control the exposure**: nothing forces sensitive literals
  into queries. Apps can search by non-sensitive discriminants
  (stream scoping, time windows, `exists` probes) when the value
  itself is the secret.
