# Proposal: breach-scope tool (`bin/breach-scope.js`)

**Status:** **feature queued — small dev across three phases.**
Mirror of the upstream backlog item (filed 2026-05-20 from the
gap-probing session — Q17 on GDPR Art.33 / Swiss nLPD Art.24 /
PIPEDA s.10.1 / HIPAA-Breach §164.404 72-hour scoping).

## Today's posture

The matrix's breach-notification rows cite `audit` +
`access`-version-chain as the technical evidence layer. Every
audit row carries the action + URL query + access reference +
integrity hash on mutating operations (Q9 audit no-content
guarantee). Per-access query is available via `audit.getLogs`
with stream filter `access-<id>`. Time-range filter is
available.

But there's a gap between "audit data exists" and "incident-
response team has a usable scoping report in under 72 hours":

- **Hard gap** — no global `accessId → userId` lookup. With only
  the compromised accessId, the responder either walks all users
  O(N) or relies on external SIEM correlation.
- **Medium gap** — `events.get` audit rows record the input
  query but not the **number of records returned**. Re-running
  the historical query is fragile (events may have changed
  since the breach).
- **Medium gap** — `affectedStreamIds[]` not persisted; complex
  stream queries (`*`, `.children`, etc.) resolve at request
  time but only the input expression is stored.
- **Soft gap** — no bundled `bin/breach-scope.js` tool. Each
  incident, the responder writes a custom audit walk +
  categorization + report.

## Direction when shipped

Three phases (full detail in the upstream backlog):

1. **`GET /system/accesses/<accessId>` admin API** backed by a
   PlatformDB reverse-index `access/<accessId> → username` (or
   equivalent). Makes accessId → userId an O(1) operator
   lookup.

2. **Audit row extensions**:
   - `content.recordCount` — number of records returned for
     read methods (`events.get`, `streams.get`,
     `audit.getLogs`).
   - `content.affectedStreamIds[]` — resolved stream list (or
     stream roots for tree-shaped queries).

3. **`bin/breach-scope.js`** — CLI consuming the above to emit
   Art.33-input artefact (Markdown or JSON):

```
bin/breach-scope.js --access <accessId> --since <iso8601-ts>
                    [--until <iso8601-ts>]
                    [--output report.json | report.md]
```

Output structure:

- Subject identity (single user — `accessId` is core-affine
  per `context/core-affinity-architecture.md`).
- Methods invoked (histogram by `content.action`).
- Streams touched (union of `affectedStreamIds`).
- Records affected: `read` count (from `recordCount`),
  `mutated` count, `destroyed` count.
- Data categories (derived from event-type lookup on affected
  streams).
- Time window of activity.
- Integrity hashes for mutated/destroyed events (non-
  repudiable evidence under HIPAA-Breach §164.414 burden of
  proof).
- Operator-supplied narrative slots (likely consequences,
  measures taken).

## Affected matrix rows (today's framing → after shipping)

| Scope | Row | Today | After shipping |
|---|---|---|---|
| gdpr | Art.33 | F: Evidence \| Medium | F: Evidence \| High |
| swiss-nlpd | Art.24 | derives_from gdpr.Art.33 | inherits |
| pipeda | s.10.1 | F: Evidence \| Medium | F: Evidence \| High |
| hipaa-breach | 164.404(b) | F: Awareness \| Low | F: Evidence \| Medium |
| hipaa-breach | 164.404(c) | F: Storage \| Medium | F: Evidence \| Medium |
| hipaa-breach | 164.414 | F: Evidence \| Med | F: Evidence \| High |

Rows tagged with `planned: kind: feature` chips pointing at
this proposal.

## Why this is a real gap, not just operator-tooling

The matrix routinely classifies "produce audit data" as
`Implemented | High` (Pryv ships the audit primitive) and
"derive a scoping report from audit data" as `F: Evidence | Med`
or lower (operator analytical work). That's right today — but
the §33 72-hour clock makes "ship a usable scoping artefact
quickly" a regulator-relevant capability, not just operational
sugar. An operator who can produce the Art.33 inputs in minutes
defends compliance better than one who takes days to write the
audit walk by hand. The audit-row extensions in particular are
not DX-only — they fill information that's regulator-required
(§33(1)(b) "approximate number of records affected") and not
recoverable post-hoc without them.

## Related

- Upstream backlog:
  `_plans/XXX-Backlog/BREACH-SCOPE-TOOL.md`
- Sibling proposal: `proposals/audit-log-chaining.md` — when
  chained audit ships, the breach-scope report can cite the
  chain-hash range covering the breach window as non-repudiable
  evidence.
- Q9 audit no-content guarantee
  (`docs/pryv-primitives.md` audit entry) — supports
  "no event-body content leaked into audit; record content
  reconstruction requires event storage".
- Q11 core-affinity architecture
  (`context/core-affinity-architecture.md`) — accessId is
  single-subject + single-core, no cross-core scoping needed.
- Q8 audit-on-user-delete `keep` mode
  (`proposals/audit-on-user-delete.md`) — ensures the audit
  survives subject erasure long enough to scope a late-
  discovered breach (§164.404 60-day individual notification
  window may extend past account closure).
