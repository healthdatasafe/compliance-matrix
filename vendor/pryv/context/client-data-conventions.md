# `access.clientData` conventions — consolidated reference

Pryv's `access.clientData` field accepts arbitrary operator-owned
JSON. Across the gap-probing session multiple GDPR / privacy
conventions have crystallised that re-use this single primitive
as the durable, audit-traceable, version-chained metadata store
for compliance-relevant claims attached to an access.

This note consolidates the conventions. **None of them require
Pryv code changes** — `clientData` is the existing primitive;
the conventions are operator-side editorial discipline.

## Why `clientData` carries this load

| Need | Existing primitive |
|---|---|
| Persistence | `access.clientData` already persists arbitrary JSON |
| Version chain (when did this claim become effective?) | Access-versioning (`context/access-versioning.md`) preserves the chain across `accesses.update`; queryable via `?includeHistory=true` |
| Audit trail (who set the claim when?) | `accesses.create` + `accesses.update` are in `AUDITED_METHODS`; audit row records the change |
| Per-access query | `GET /accesses` returns the array with `clientData`; one `jq` line yields the relevant register entries for Art.30 |
| Cross-reference to permissions + counterparty | All on the same object — claims + permissions + counterparty endpoint in a single record |
| CMC integration | `consent/request-cmc.clientData` + `accept-cmc.clientData` carry through end-to-end |

## Convention catalogue

### `clientData.lawful_basis` — GDPR Art.6 (Q6)

The Art.6(1) lit-letter relied on for the processing. Example
values: `"art.6.1.a explicit consent"`, `"art.6.1.b contract"`,
`"art.6.1.f legitimate interests"`. Records the controller's
basis claim alongside the technical authorisation — handy when
an auditor asks "under what basis was this access made?".

### `clientData.consent` + `clientData.consent_event_id` — Art.7

Consent text presented at grant time + pointer to the
`consent/*` event that captured the subject's "Accept" click.
Together they let an auditor reconstruct "what was the subject
told + when did they consent" without out-of-band correspondence.

### `clientData.special_category_basis` — Art.9 (Q22)

The Art.9(2) lit-letter relied on when the access touches a
special-category subtree (e.g., `health/*`). Example:
`"art.9.2.a"` (explicit consent), `"art.9.2.h"` (preventive /
occupational medicine). Pairs with the operator's deployment-
side stream-tree convention + custom event-type sensitivity
annotations (see
`context/special-categories-operator-facilitated.md`).

### `clientData.transfer_basis` — Art.46 (Q25)

Structured object capturing the §46 mechanism for cross-border
flows. Full shape in `context/transfer-basis-convention.md`:

```json
{
  "transfer_basis": {
    "mechanism": "art.46.2.c",
    "scc_module": "C2C",
    "scc_version": "2021/914",
    "scc_signed_date": "2026-03-15",
    "scc_document_ref": "https://intranet/legal/scc.pdf",
    "origin_country": "CH",
    "destination_country": "US",
    "adequacy_decision": null
  }
}
```

### `clientData.processing_purpose` + `clientData.art22_basis` — Art.22 (Q26)

When the access feeds automated decision-making / profiling.
`processing_purpose` flags the access as Art.22-relevant
(e.g., `"automated_decision_making"`, `"profiling"`).
`art22_basis` records the §2 lit-letter — `"(a) contract"`,
`"(b) law"`, `"(c) consent"`. Pairs with the
`decisions/*`-stream pattern documented in `gdpr.Art.22`'s
detail block — decision output events carry
`clientData.input_audit_ref` pointing back to the audit-row
range that fed the decision + `decision_logic_version` for
reproducibility.

### `account.clientData.age_verification_method` + `clientData.parental_holder_consent_event_id(s)` — Art.8 (Q29)

When the deployment targets children (under 16 EU / lower in
specific Member States — see Art.8(1)), the controller must
verify parental responsibility. Pryv is age-blind by design
(no `birthDate` / `minor` field in the default account schema);
the operator extends `customExtensions.systemStreams` to add an
age field + records the verification trail on `clientData`:

- `account.clientData.age_verification_method` — free-text or
  structured record of HOW age was verified (self-declaration /
  ID upload / parental-attestation / government-eID-flow).
- `clientData.parental_holder_consent_event_id` (singular,
  single-holder case) OR `clientData.parental_holder_consent_event_ids`
  (array, dual / multi-holder case — divorced parents,
  jurisdictions requiring both biological parents, foster care,
  etc.) — pointer(s) to the actual `consent/parental-*` event(s).

**The `consent/parental-cmc` event format does NOT ship** in
the built-in `data-types` catalogue (verified 2026-05-21). The
operator authors it themselves and publishes via
`service.eventTypes` URL (Q14 custom-catalogue extension
pattern). HDS-style data-model repos targeting paediatric /
adolescent use-cases are the natural home for this format.

Re-verification on age-of-majority transitions is operator-side
(Pryv has no scheduler primitive). Multi-holder revocation is
the operator's signal to revoke or scope-down the access per
Q19 / Q28 mechanisms.

### `clientData.objection_outcome` + `objection_rationale` + `objection_notice` — Art.21 (Q28)

When a subject invokes their Art.21 right to object (distinct
from Art.7(3) withdrawal — applies to legitimate-interests /
public-interest bases, plus the absolute-right §2 for direct
marketing), the technical mechanism is the **same as Art.7(3)
withdrawal**: `DELETE /accesses/:id` or `accesses.update` to
narrow permissions. What's recorded on the access is the
operator's review outcome:

- `clientData.objection_outcome` — one of `"honoured"` (access
  revoked / narrowed), `"overridden_compelling_grounds"` (Art.21(3)
  override applied), `"out_of_scope"` (the access didn't actually
  do the objected-to processing).
- `clientData.objection_rationale` — free-text or URI pointer to
  the operator's compelling-grounds memo / legal-basis document
  when overriding.
- `clientData.objection_notice` — the Art.21(5) "right to object
  presented clearly and separately from any other information" notice
  text shown to the subject at first communication; persisted at
  access mint time so the version chain proves what the subject was
  told when.

All three travel with the access version chain — auditable.

### `clientData.purpose` — Art.30 (general)

Free-text purpose-of-processing for the Art.30 records-of-
processing register. Less structured than the others; useful
when the operator wants a human-readable purpose statement
alongside the lit-letter claims above.

### `clientData.compatibility_assessment_event_id` + `purpose_change_basis` + `previous_purpose` — Art.6(4) (Q34)

For Art.6(4) further-processing pivots — the §4 "compatible
purpose OR fresh lawful basis" test. Three-field set:

- **`compatibility_assessment_event_id`** — pointer to the
  `compliance/compatibility-assessments/<id>` event recording
  the 5-factor (§6(4)(a)-(e)) reasoning + the affected data
  scope + the decision outcome. The assessment artefact is
  operator-authored (Q14 custom catalogue extension); the
  pointer lives on every access whose purpose was justified
  by it.
- **`purpose_change_basis`** — enum of
  `compatible_purpose` / `new_consent` / `new_legal_obligation`
  / `new_legitimate_interest`. Names the Art.6(4) pivot
  justification — compatibility test passed vs. fresh-basis
  applied.
- **`previous_purpose`** — free-text or structured record of
  the prior purpose claim (the pivot record). Trivially
  recoverable from the access-version history, but the
  redundant copy at the new-purpose moment makes
  "what changed and when" answerable from a single row
  rather than a chain walk.

Usage pattern depends on which of the four Art.6(4) operator
patterns applies (see `gdpr.Art.6` detail):

| Pattern | Where the three fields live |
|---|---|
| A (mint new access for new purpose) | On the **new** access's `clientData`; `previous_purpose` records the old purpose; old access's `clientData` unchanged. |
| B (update existing access) | On the updated access; access-version chain preserves the pre-mutation copy automatically. |
| C (separate assessment event) | `compatibility_assessment_event_id` is mandatory on the access; the other two fields ride alongside. |
| D (sub-access from app seed) | On the new sub-access; parent app access unchanged. `createdBy` on the sub-access traces back to the seed. |

Decision rule: when the new purpose is **outside** the original
AND not covered by a fresh override-by-law basis → Pattern A
mint-new-access + force fresh consent via app-web-auth3. See
`gdpr.Art.6` §4 detail for the full decision tree.

### `clientData.retention` + `access.expires` — Art.5(1)(e) / Art.30

The retention policy / expiry attached to the access — both
the storage-limitation claim and the technical enforcement
(access becomes inert after `expires` epoch). Operator's
schedule for actually deleting the data is a separate
operational concern.

## How to query the conventions for Art.30 register

One operator-side script (or admin-panel surface, post-Plan-60)
joins all of them into the operator's Art.30 register:

```bash
curl https://core.example.com/accesses \
  -H "Authorization: <personal-token>" \
| jq '[.accesses[] | {
    access_id: .id,
    counterparty: .name,
    purpose: .clientData.purpose,
    lawful_basis: .clientData.lawful_basis,
    special_category_basis: .clientData.special_category_basis,
    transfer_basis: .clientData.transfer_basis,
    processing_purpose: .clientData.processing_purpose,
    art22_basis: .clientData.art22_basis,
    consent_text: .clientData.consent,
    consent_event_id: .clientData.consent_event_id,
    retention: .clientData.retention,
    expires: .expires
  }]'
```

With `?includeHistory=true` the full version chain per access
is reachable — answering "what was the basis claim at the time
of the audit log entry dated X?" for any field.

## Why this works as a regulatory pattern

The conventions share three properties that make them
**regulator-defensible** without Pryv platform code:

1. **Durable persistence** — `clientData` survives access
   updates; the version chain is preserved; deletions are
   audit-logged.
2. **Single source of truth** — every basis claim is on the
   same object as the technical authorisation it justifies.
   Auditor can't claim "the controller said one thing in their
   notice and authorised something else technically" — both
   are linked.
3. **Per-access granularity** — different accesses against the
   same subject can carry different basis claims (e.g., one
   access for research under Art.6(1)(f) legitimate interests,
   another for billing under Art.6(1)(b) contract). The
   register reflects reality, not a global per-deployment
   assumption.

## Implementer adoption checklist

For each `clientData.*` convention above:

- [ ] Decide if your deployment uses this category of processing.
- [ ] If yes: document the convention's expected shape in your
      internal compliance manual.
- [ ] Wire your access-minting code (the `app-web-auth3` rebrand
      + admin tooling) to populate the field at grant time.
- [ ] Wire your Art.30 register pipeline to consume the field.
- [ ] (Optional, deferred to the planned admin panel) — surface
      the conventions in the admin panel's access editor so manual
      operator interventions don't break the convention.

## See also

- `context/access-versioning.md` — the version chain that makes
  basis history queryable.
- `context/transfer-basis-convention.md` — Q25 deep treatment of
  the `transfer_basis` shape.
- `context/special-categories-operator-facilitated.md` — Q22
  treatment of `special_category_basis` + the 8-lever toolkit.
- `gdpr.Art.6`, `gdpr.Art.7`, `gdpr.Art.9`, `gdpr.Art.22`,
  `gdpr.Art.30`, `gdpr.Art.46` matrix rows — each cite the
  relevant convention(s) in their detail blocks.
