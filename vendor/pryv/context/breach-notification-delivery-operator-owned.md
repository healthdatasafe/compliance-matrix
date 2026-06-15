# Breach notification delivery: voluntarily missing at the platform, operator-owned

GDPR Art.34 requires the controller to **communicate a personal data
breach to the data subject without undue delay** when the breach is
likely to result in a high risk to their rights and freedoms.
Equivalent obligations: HIPAA-Breach §164.404 (notification to
individuals, ≤60 calendar days), PIPEDA s.10.1 (notification to
affected individuals + records for 24 months), Swiss nLPD Art.24
(conditional subject notification — only when necessary for the
subject's protection or upon FDPIC request), Cal Civ Code §1798.82
(California breach-notification law, separate from CCPA proper).

For a multi-thousand-user deployment, this is a **bulk-notification
problem**: enumerate affected subjects → render per-recipient
localised templates → send (with retries + rate-limiting + receipt
tracking) → leave an audit trace, all "without undue delay".

## What Pryv ships

**No bulk-notification / breach-comm primitive on the platform
layer.** The platform splits cleanly into two surfaces, only one
of which has a Pryv contribution:

### Surface 1 — Identification (Pryv-shipped, with queued completeness work)

The affected-subject list is **derivable today** from the audit
log alone:

```sql
-- conceptual: actual is audit.get with appropriate filters
SELECT DISTINCT userId
FROM audit_events
WHERE accessId = <breachedAccessId>
  AND time BETWEEN <windowStart> AND <windowEnd>
```

The Q17 `BREACH-SCOPE-TOOL` backlog (GH
[`#76`](https://github.com/pryv/open-pryv.io/issues/76))
packages this into `bin/breach-scope.js` + adds the three
completeness gaps surfaced in Q17:

- **Hard gap (Phase 1)**: global `accessId → userId` lookup via
  PlatformDB reverse-index + `GET /system/accesses/<accessId>`.
- **Medium gap (Phase 2)**: `recordCount` field on audit rows
  for reads (`open-pryv.io/components/audit/`-side change) —
  satisfies §164.404(c)(1) "approximate number of records
  affected" element.
- **Medium gap (Phase 3)**: `affectedStreamIds[]` field on
  audit rows — satisfies the "types of unsecured PHI" element.

Once Phases 1-3 ship, identification produces an
audit-defensible **per-subject + per-stream + per-record-count**
roster ready for the delivery surface.

### Surface 2 — Delivery (voluntarily missing — operator-owned)

The platform's existing mail surface is **transactional, not
bulk**:

- `components/api-server/src/methods/helpers/mailing.ts`
  `sendmail()` — single-recipient, single-template, per-call.
  Designed for welcome / password-reset / MFA-code emails.
- `components/mail/src/Sender.ts` + `Template.ts` + `Template-
  Repository.ts` — Pug templates seeded into PlatformDB,
  refreshed via master broadcast. Per-template + per-language
  (welcome/reset/MFA support `lang` parameter).
- Three delivery methods (`emailSettings.method`): `in-process`
  (built-in SMTP), `microservice` (legacy external mail
  service), `mandrill` (third-party transactional SMTP).
- No bulk-send orchestration. No throttling / rate-limiting
  beyond the SMTP provider's own limits. No retry policy. No
  send-receipt tracking. No audit-log entry for the send (the
  mail API call is from internal API methods, not user-
  triggered, so it doesn't enter `AUDITED_METHODS`).

**This is deliberate.** Three reasons:

1. **Operators have established notification stacks.** Most
   regulated-market deployments already have a CRM-side bulk
   email pipeline (SendGrid / Mailgun / AWS SES), an SMS
   provider (Twilio / Vonage), an in-app push channel,
   sometimes a legal-comms-team escalation route. Building a
   Pryv-shipped breach-comm would be redundant.
2. **Operators without one would need legal/comms expertise to
   use it well anyway.** Art.34 §2 mandates specific content
   elements (nature of breach + DPO contact + likely
   consequences + measures taken). The phrasing + the timing +
   the regulator-defensibility narrative aren't something a
   Pryv-side template can pre-fab without operator-specific
   tailoring.
3. **The Art.34 §3 exemptions** (encryption made data
   unintelligible, subsequent measures eliminated high risk,
   disproportionate effort) are legal judgements the operator's
   counsel makes — a platform primitive can't determine them.

## The operator pattern (recommended)

Composes the identification primitive (Q17 BREACH-SCOPE-TOOL
once shipped) with the operator's existing comms stack:

```
# 1. Run identification.
$ bin/breach-scope.js \
    --access-id <breachedAccessId> \
    --window-start <ISO8601> \
    --window-end <ISO8601> \
    --output affected.json
# Produces: per-subject roster with userId + recordCount +
# affectedStreamIds + audit-row hashes.

# 2. Operator's CRM / mail pipeline ingests affected.json,
#    joins against subscriber-contact records (email + lang +
#    timezone + preferred channel), renders breach-notice
#    template with Art.34 §2 content elements, queues for
#    send through the operator's normal transactional pipeline.

# 3. Send-receipt logging happens in the operator's mail
#    provider (SendGrid Events API, SES Notifications, etc.).
#    Operator writes the per-recipient send-receipt record
#    into a Pryv compliance/breach-notification/* event on a
#    dedicated compliance system stream — that event chain
#    becomes the §164.414 burden-of-proof artefact.

# 4. Operator's incident-response record on
#    compliance/incidents/<id>/* references both the
#    affected.json artefact (input) + the send-receipt event
#    stream (delivery proof).
```

The `compliance/incidents/*` + `compliance/breach-notification/*`
stream conventions are operator editorial — Pryv carries
whatever schemas the implementer points
`service.eventTypes` URL at (Q14 extension pattern).

## Audit-trace gap (worth knowing about)

When the operator's external mail pipeline sends the breach
notification, the **send action itself is not in Pryv's audit
log** — Pryv knows the breach scope (audit log captured the
breached access's activity), but the operator's mail provider's
send-receipt is where "sent to subject X at time Y via channel
Z" lives.

Bridging the two surfaces:

- **Operator-side journal**: write a
  `compliance/breach-notification/sent-cmc` event per
  recipient (event format authored by operator's
  data-model repo per Q14) capturing:
  - `recipient.userId`
  - `recipient.email_hash` (HMAC-SHA256 of the email,
    avoids storing plaintext in the journal)
  - `channel` (`email` / `sms` / `in-app` / etc.)
  - `provider.message_id` (operator's mail-provider
    send-receipt ID)
  - `time` of send
  - `notice_version` (the Art.34 §2 template version that
    was sent)
- **Cross-link to the incident**: each
  `compliance/breach-notification/sent-cmc` event carries
  `parentStreamId: compliance/incidents/<incident-id>` so
  the per-incident roster of sent notifications is
  queryable as a tree.
- **Post-incident audit**: an external auditor / regulator
  asks "show me delivery proof to subject X" — operator runs
  `events.get streams=compliance/breach-notification/*
  recipient.userId=<X>` → the journal event → the operator's
  mail-provider send-receipt API (cross-referenced via
  `provider.message_id`).

This pattern keeps the actual send-machinery out of Pryv
(where it doesn't belong) while landing the audit-defensible
proof inside the Pryv audit + event chain (where it does).

## Cross-engine + multi-jurisdiction considerations

- **Multi-jurisdiction subjects**: subjects in different
  jurisdictions face different breach-notification regimes
  (GDPR Art.34 ≤72h-or-undue-delay + EU-language defensibility;
  HIPAA-Breach §164.404 ≤60 days; PIPEDA s.10.1 "as soon as
  feasible"; California §1798.82 ≤45 days; Swiss nLPD Art.24
  "as soon as possible" + FDPIC discretion on subject side).
  The operator's notification template + the timing decision
  needs jurisdiction-awareness — typically derived from the
  subject's `clientData.jurisdiction` claim recorded on the
  account or access.
- **Per-core breach scope** (Q11 / Q12 core-affinity): a
  breach affecting access X on Core A affects subjects whose
  data lives on Core A. Cross-core fanout is by-design
  impossible since PlatformDB only carries identification +
  routing, not event data. Operator's identification job runs
  per-core.
- **Cross-border subjects routed via the multi-region cluster**
  (Q25 PlatformDB two-tier model): the Tier 1 identification
  + routing data IS cross-border, but event data is residency-
  pinned. Breach of a Tier 1 leak is a separate (smaller) scope
  question than breach of a Tier 2 / event-data leak —
  operator's incident-response decision matrix should treat
  them differently.

## Implementer takeaway

If a regulator asks "how does your deployment satisfy Art.34
subject-notification":

1. **Cite the identification primitive** — Pryv's audit log
   gives per-subject scope of the breached access's reads /
   writes; the Q17 BREACH-SCOPE-TOOL once shipped packages
   this into a single-command artefact with the §164.404(c)
   content elements.
2. **Cite your delivery pipeline** — your CRM / mail / SMS
   provider, its rate-limiting, its retry policy, its send-
   receipt API integration. This isn't a Pryv contribution.
3. **Cite your audit-trace bridge** — the
   `compliance/breach-notification/sent-cmc` event pattern
   captures per-recipient send-receipt records inside Pryv's
   audit + event chain, satisfying the §164.414 burden-of-
   proof obligation.
4. **Address the timing claim** — your incident-response
   runbook should encode jurisdiction-aware send timing
   ("within X hours of confirmed high-risk determination per
   jurisdiction Y").

If a regulator asks "show me proof you notified subject X
about incident Y": `events.get streams=
compliance/breach-notification/* recipient.userId=<X>
parentStreamId=compliance/incidents/<Y>`.

## See also

- `proposals/breach-scope-tool.md` — Q17 identification
  primitive (the surface this delivery pattern composes with).
- `context/data-retention-operator-owned.md` — same
  "voluntarily missing + operator-owned" pattern from Q31
  retention; conceptual parallel.
- `context/cmc-consent-primitives.md` — the
  `compliance/breach-notification/sent-cmc` event family fits
  the `*-cmc` naming convention pattern (operator-authored
  formats via Q14 custom catalogue extension).
- `docs/pryv-primitives.md` — `audit-event-stream` + `audit`
  + `system-streams` entries (the primitives the delivery-
  trace bridge composes).
- HIPAA-Breach §164.404 / GDPR Art.33-34 / PIPEDA s.10.1 /
  Swiss nLPD Art.24 / Cal Civ Code §1798.82 — the
  regulator-side notification regimes this pattern serves.
