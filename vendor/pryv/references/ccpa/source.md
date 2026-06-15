---
scope_id: ccpa
title: California Consumer Privacy Act (as amended by CPRA)
short: CCPA / CPRA
type: regulation
jurisdiction: US — California (extraterritorial via business-nexus thresholds)
version: Cal. Civ. Code §§ 1798.100 - 1798.199.100 (CPRA amendments effective)
version_date: 2023-01-01 (CPRA operative); enforcement 2023-07-01
canonical_url: https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?division=3.&part=4.&lawCode=CIV&title=1.81.5
oag_summary_url: https://oag.ca.gov/privacy/ccpa
cppa_regulations_url: https://cppa.ca.gov/regulations/
license: California public records
structure:
  sections: ~30 (consumer rights, business obligations, enforcement)
matrix_language: EN
---

# CCPA / CPRA — canonical reference

## Use in matrix

- Map at **section level**. Ref format: `ccpa.<section>`.

## Key sections (initial expected anchors)

- §1798.100 — Right to know what is collected
- §1798.105 — Right to delete
- §1798.106 — Right to correct (CPRA)
- §1798.110 — Right to know categories + specific pieces
- §1798.115 — Right to know about sales/sharing
- §1798.120 — Right to opt out of sale or sharing
- §1798.121 — Right to limit use of sensitive personal info (CPRA)
- §1798.125 — Non-discrimination
- §1798.130 — Notice + response timelines
- §1798.135 — Methods for opt-out
- §1798.140 — Definitions
- §1798.150 — Civil action for breach (statutory damages)

## Notes

- CPRA created the California Privacy Protection Agency (CPPA) as enforcement
  body — separate from California AG.
- "Sale" definition broader than commercial — includes transfers for cross-
  context behavioural advertising.
- Pryv contribution: data-export tooling (right-to-know), deletion
  (right-to-delete), audit logs (proof of compliance), consent flags
  (opt-out/limit use). Largely overlaps with GDPR rights → matrix uses
  `derives_from: gdpr.*` where applicable.

## Related

- [[references/gdpr]] — many rights have GDPR analogues
