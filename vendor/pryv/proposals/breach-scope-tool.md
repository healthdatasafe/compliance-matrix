# Proposal: breach-scope tool (`bin/breach-scope.js`)

**Status: shipped in open-pryv.io `0b2874e0`** (master merge of
the breach-scope operator tooling; follow-ups through
`a8957820`); deployed to the live reference hosts 2026-07-28.
Originally filed 2026-05-20 from the gap-probing session, Q17 on
GDPR Art.33 / Swiss nLPD Art.24 / PIPEDA s.10.1 / HIPAA-Breach
§164.404 72-hour scoping.

**Naming note:** the audit-row field proposed below as
`affectedStreamIds[]` shipped as **`content.scopedStreamIds`**
(with `scopedStreamCount` and `recordCountIncomplete`
companions). The rename is semantic: the field records the
query's resolved SCOPE, an upper bound on what the access could
have exposed, not the streams of the events actually returned.

## Posture at filing (2026-05, pre-shipping)

The matrix's breach-notification rows cite `audit` +
`access`-version-chain as the technical evidence layer. Every
audit row carries the action + URL query + access reference +
integrity hash on mutating operations (Q9 audit no-content
guarantee). Per-access query is available via `audit.getLogs`
with stream filter `access-<id>`. Time-range filter is
available.

But there's a gap between "audit data exists" and "incident-
response team has a usable scoping report in under 72 hours":

- **Hard gap**: no global `accessId → userId` lookup. With only
  the compromised accessId, the responder either walks all users
  O(N) or relies on external SIEM correlation.
- **Medium gap**: `events.get` audit rows record the input
  query but not the **number of records returned**. Re-running
  the historical query is fragile (events may have changed
  since the breach).
- **Medium gap**: `affectedStreamIds[]` not persisted; complex
  stream queries (`*`, `.children`, etc.) resolve at request
  time but only the input expression is stored.
- **Soft gap**: no bundled `bin/breach-scope.js` tool. Each
  incident, the responder writes a custom audit walk +
  categorization + report.

## Shipped implementation

Three parts, all in open-pryv.io `0b2874e0`:

1. **`GET /system/accesses/:accessId` admin API** backed by a
   PlatformDB reverse-index from accessId to its user cluster
   (`open-pryv.io/components/platform/src/accessIndex.ts`).
   Makes accessId → user an O(1) operator lookup; composite ids
   are normalized, revoked accesses are always returned, and
   identifying fields are PII-hashed in hashed mode. Existing
   deployments run `bin/backfill-access-index.js` once per core
   to index pre-existing accesses (`--resync` repairs
   divergence). The index is advisory: the home core's access
   storage stays authoritative.

2. **Audit row extensions** (read methods):
   - `content.recordCount`: number of records returned
     (`recordCountIncomplete` flags a floor value).
   - `content.scopedStreamIds` (with `scopedStreamCount`): the
     query's resolved stream scope at request time. Upper bound
     on exposure, not the streams of the events actually
     returned.

3. **`bin/breach-scope.js`**: credential-free operator CLI, run
   on the subject's home core (run elsewhere, it resolves and
   prints where to run). It resolves the access, walks the
   audit window, classifies by stream + method, and renders
   JSON or Markdown:

```
bin/breach-scope.js --access <accessId> --since <iso8601>
                    [--until <iso8601>] [--json]
                    [--output report.json] [--output report.md]
```

Shipped alongside: socket.io API calls now enter the audit log
(they previously bypassed it), closing a visibility gap the
scoping report would otherwise have inherited.

Output structure:

- Subject identity (single user, `accessId` is core-affine
  per `context/core-affinity-architecture.md`).
- Methods invoked (histogram by `content.action`).
- Streams in scope (union of `scopedStreamIds`, an upper bound
  on exposure, not actual yield).
- Records affected: `read` count (from `recordCount`),
  `mutated` count, `destroyed` count.
- Data categories are NOT derived (event bodies never enter
  the audit log); mapping streams to data categories stays
  operator-side editorial work.
- Time window of activity.
- Integrity hashes for mutated/destroyed events (non-
  repudiable evidence under HIPAA-Breach §164.414 burden of
  proof).
- Operator-supplied narrative slots (likely consequences,
  measures taken).

Known bounds: HF/series reads and methods excluded by the
audit filter are not visible to the report; the reverse-index
is advisory (home-core storage authoritative); the stream
scope is an upper bound, not the actual yield.

## Affected matrix rows (applied on shipping)

| Scope | Row | Before | After (applied) |
|---|---|---|---|
| gdpr | Art.33 | F: Evidence \| Medium | F: Evidence \| High |
| swiss-nlpd | Art.24 | F: Evidence \| Medium (derives_from gdpr.Art.33) | F: Evidence \| High |
| pipeda | s.10.1 | F: Evidence \| Medium | F: Evidence \| High |
| hipaa-breach | 164.404(b) | F: Evidence \| Low | F: Evidence \| Medium |
| hipaa-breach | 164.404(c) | Out-of-scope | F: Evidence \| Low |
| hipaa-breach | 164.414 | F: Evidence \| Medium | unchanged |
| soc2 | P6.6 | F: Evidence \| Medium | F: Evidence \| High |

The `planned:` chips that pointed at this proposal have been
removed from these rows; the claims now live in the rows' own
prose. Two deltas against the projection above at filing time:
164.404(c) lands at Low, not Medium, because the shipped report
feeds two of the five §404(c) content elements and does not
derive PHI data categories, so the bulk of the content work
stays editorial; 164.414 stays at Medium because the
Medium-to-High move there belongs to the still-queued chained
audit log (`proposals/audit-log-chaining.md`), while this tool
bundles integrity hashes the audit rows already carry.

## Why this is a real gap, not just operator-tooling

The matrix routinely classifies "produce audit data" as
`Implemented | High` (Pryv ships the audit primitive) and
"derive a scoping report from audit data" as `F: Evidence | Med`
or lower (operator analytical work). That's right today, but
the §33 72-hour clock makes "ship a usable scoping artefact
quickly" a regulator-relevant capability, not just operational
sugar. An operator who can produce the Art.33 inputs in minutes
defends compliance better than one who takes days to write the
audit walk by hand. The audit-row extensions in particular are
not DX-only; they fill information that's regulator-required
(§33(1)(b) "approximate number of records affected") and not
recoverable post-hoc without them.

## Related

- Upstream backlog: archived on shipping
  (`_plans/_archives/114-breach-scope-tool-done.md`).
- Sibling proposal: `proposals/audit-log-chaining.md`, when
  chained audit ships, the breach-scope report can cite the
  chain-hash range covering the breach window as non-repudiable
  evidence.
- Q9 audit no-content guarantee
  (`docs/pryv-primitives.md` audit entry), supports
  "no event-body content leaked into audit; record content
  reconstruction requires event storage".
- Q11 core-affinity architecture
  (`context/core-affinity-architecture.md`), accessId is
  single-subject + single-core, no cross-core scoping needed.
- Q8 audit-on-user-delete `keep` mode
  (`proposals/audit-on-user-delete.md`), ensures the audit
  survives subject erasure long enough to scope a late-
  discovered breach (§164.404 60-day individual notification
  window may extend past account closure).
