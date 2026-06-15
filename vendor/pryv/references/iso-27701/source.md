---
scope_id: iso-27701
title: ISO/IEC 27701 — Extension to ISO/IEC 27001 and ISO/IEC 27002 for privacy information management — Requirements and guidelines
short: ISO/IEC 27701:2019
type: standard
jurisdiction: International (ISO/IEC)
version: ISO/IEC 27701:2019
version_date: 2019-08
canonical_url: https://www.iso.org/standard/71670
license: PAYWALLED — text is © ISO/IEC. Do NOT redistribute. Map by clause IDs only.
purchase_url: https://www.iso.org/standard/71670
structure:
  pims_specific_clauses: 5 + 6 (extending 27001 + 27002)
  controller_controls: ~31 (Annex A in 27701)
  processor_controls: ~18 (Annex B in 27701)
matrix_language: EN
---

# ISO/IEC 27701:2019 — canonical reference (PAYWALLED)

## Important — license

ISO/IEC standards are copyrighted. We do **not** redistribute the text. The
matrix maps by clause IDs and paraphrases requirements. 27701 cannot be
certified standalone — it extends 27001 (must hold an ISMS first).

## Use in matrix

- Map at **clause + Annex A/B control level**.
- Ref format:
  - `iso-27701.<clause>` (e.g., `iso-27701.7.2.1`)
  - `iso-27701.A.<n>` (PIMS controls for PII controllers)
  - `iso-27701.B.<n>` (PIMS controls for PII processors)

## PIMS structure

### Clauses 5 + 6 — extension to 27001/27002
Adds privacy-specific text to the ISMS clauses.

### Annex A — PII controller controls (Pryv operators acting as controllers)
Covers: consent, lawful basis, purpose, data subject rights, transparency,
records of processing, transfers, breach notification.

### Annex B — PII processor controls (Pryv operators acting as processors)
Covers: controller instructions, subprocessor mgmt, transfer, records,
breach notification to controller, deletion + return.

## Notes

- 27701 is a **certification target** (requires a 27001 ISMS first).
- Heavy overlap with GDPR — schema uses `cross_references: [gdpr.*]` to link
  PIMS controls to GDPR articles.
- Most Pryv operators are processors when running on behalf of an
  implementer-controller. Annex B is therefore the primary mapping surface.

## Related

- [[references/iso-27001]] — required base (PIMS extension)
- [[references/gdpr]] — heavy cross-reference (GDPR Annex A in 27701 maps
  almost article-by-article)
