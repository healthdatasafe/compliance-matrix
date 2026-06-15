---
scope_id: iso-13485
title: ISO 13485 — Medical devices — Quality management systems — Requirements for regulatory purposes
short: ISO 13485:2016 (with 2016/Amd 1:2021)
type: standard
jurisdiction: International (ISO)
version: ISO 13485:2016 (Amd 1:2021 adds EU MDR/IVDR-aligned content)
version_date: 2016-03; Amd 1: 2021-09
canonical_url: https://www.iso.org/standard/59752
license: PAYWALLED — text is © ISO. Do NOT redistribute. Map by clause IDs only.
purchase_url: https://www.iso.org/standard/59752
structure:
  clauses: 8 (4-8 are normative)
matrix_language: EN
curated: true   # see scopes.index.md — only clauses with non-out-of-scope coverage are authored
---

# ISO 13485:2016 — canonical reference (PAYWALLED, CURATED)

## Important — license

ISO standards are copyrighted. We do **not** redistribute the text. The matrix
maps by clause IDs and paraphrases.

## Why curated

13485 is overwhelmingly an **organizational QMS** standard. Pryv contributes
only on specific clauses — typically those touching electronic documentation,
software validation, traceability, and post-market data. The matrix authors
only the clauses where Pryv's coverage is `documented` or stronger; excluded
clauses are listed in the scope YAML's `excluded_items:` with a one-line
reason each (audit-traceability preserved).

## Use in matrix

- Map at **clause level** (down to 3 or 4 digits).
- Ref format: `iso-13485.<clause>` (e.g., `iso-13485.4.2.4`).

## Clauses likely to map to Pryv

### 4 — Quality management system
- 4.1.6 — Validation of software applications used in QMS
- 4.2.4 — Control of documents
- 4.2.5 — Control of records

### 7 — Product realization
- 7.3 — Design and development (incl. design files, design transfer)
- 7.3.7 — Design verification
- 7.3.8 — Design validation
- 7.5.6 — Validation of processes for production and service provision
  (software validation)
- 7.5.9 — Traceability

### 8 — Measurement, analysis, improvement
- 8.2.1 — Feedback (post-market)
- 8.2.3 — Reporting to regulatory authorities
- 8.4 — Analysis of data
- 8.5.2 — Corrective action (CAPA)
- 8.5.3 — Preventive action

## Clauses out of scope (will be listed in excluded_items:)

- 6 — Resource management (HR, infrastructure — implementer responsibility)
- 7.4 — Purchasing (implementer's supplier control)
- 7.5.7 — Sterile devices (N/A for software backend)
- 7.5.10 — Customer property (implementer-managed)
- 7.5.11 — Preservation of product (physical)
- 7.6 — Control of monitoring and measuring equipment (physical)

## Notes

- 13485 + ISO 14971 (risk mgmt) + IEC 62304 (software lifecycle) form the
  harmonized-standard triplet under EU MDR for software medical devices.
- This scope's documentation will overlap heavily with `qms/pryv/`. Matrix
  cells use `qms_docs:` to cite the corresponding QMS file.

## Related

- [[references/mdr]] — references 13485 as harmonized QMS standard
