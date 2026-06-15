---
scope_id: hipaa-security
title: HIPAA Security Rule
short: HIPAA-Security
type: regulation
jurisdiction: US
version: 45 CFR Part 164 Subparts A + C (as amended through HITECH 2013 Omnibus)
version_date: 2013-01-25 (Omnibus Final Rule effective)
canonical_url: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164
hhs_summary_url: https://www.hhs.gov/hipaa/for-professionals/security/index.html
license: US federal public domain
structure:
  subparts: 2 (A General, C Security Standards)
  standards: ~22 (with implementation specifications: ~50 total)
matrix_language: EN
---

# HIPAA Security Rule — canonical reference

## Use in matrix

- Map at **standard + implementation-specification level**.
- Ref format: `hipaa-security.164.<section>(<paragraph>)`
- Distinguish Required vs Addressable implementation specifications.

## Key sections for the matrix (initial expected anchors)

### Administrative Safeguards (§164.308)
- (a)(1) Security Management Process — risk analysis, risk management, sanction, info system activity review
- (a)(2) Assigned Security Responsibility
- (a)(3) Workforce Security
- (a)(4) Information Access Management
- (a)(5) Security Awareness and Training
- (a)(6) Security Incident Procedures
- (a)(7) Contingency Plan
- (a)(8) Evaluation
- (b) Business Associate Contracts

### Physical Safeguards (§164.310)
- (a) Facility Access Controls
- (b) Workstation Use
- (c) Workstation Security
- (d) Device and Media Controls

### Technical Safeguards (§164.312) — software's primary contribution
- (a) Access Control (unique user ID, emergency access, automatic logoff, encryption/decryption)
- (b) Audit Controls
- (c) Integrity (mechanism to authenticate ePHI)
- (d) Person or Entity Authentication
- (e) Transmission Security (integrity controls, encryption)

### Organizational + Documentation (§164.314, §164.316)

## Notes

- "ePHI" = electronic Protected Health Information.
- Implementation specifications are **Required** (R) or **Addressable** (A).
  Addressable does NOT mean optional — must implement, document why not, or
  implement an equivalent.

## Related

- [[references/hipaa-privacy]] — companion rule (use/disclosure of PHI)
- [[references/hipaa-breach]] — Breach Notification Rule (164.400-414)
