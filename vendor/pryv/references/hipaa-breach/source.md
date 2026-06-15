---
scope_id: hipaa-breach
title: HIPAA Breach Notification Rule
short: HIPAA-Breach
type: regulation
jurisdiction: US
version: 45 CFR Part 164 Subpart D (HITECH 2013 Omnibus)
version_date: 2013-01-25
canonical_url: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-D
hhs_summary_url: https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html
license: US federal public domain
structure:
  sections: §§164.400-164.414
matrix_language: EN
---

# HIPAA Breach Notification Rule — canonical reference

## Use in matrix

- Map at **section level**. Ref format: `hipaa-breach.164.<section>`.

## Sections (full list — small scope)

- §164.400 — Applicability
- §164.402 — Definitions (incl. breach risk-assessment factors)
- §164.404 — Notification to individuals
- §164.406 — Notification to media
- §164.408 — Notification to HHS Secretary
- §164.410 — Notification by a business associate
- §164.412 — Law-enforcement delay
- §164.414 — Administrative requirements + burden of proof

## Notes

- Software contribution: audit-log evidence (proves no breach or scopes the
  breach), encryption-at-rest evidence (safe-harbor under §164.402(2) — only
  unsecured PHI triggers notification).
- Most rows: `documented` or `out-of-scope` (breach mgmt = org process); a few
  `facilitated` rows tied to audit + encryption.

## Related

- [[references/hipaa-security]] — §164.402(2) safe-harbor depends on Security
  Rule encryption guidance (NIST SP 800-111).
