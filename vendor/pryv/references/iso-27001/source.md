---
scope_id: iso-27001
title: ISO/IEC 27001 — Information security, cybersecurity and privacy protection — Information security management systems — Requirements
short: ISO/IEC 27001:2022
type: standard
jurisdiction: International (ISO/IEC)
version: ISO/IEC 27001:2022
version_date: 2022-10-25
canonical_url: https://www.iso.org/standard/27001
license: PAYWALLED — text is © ISO/IEC. Do NOT redistribute. Cite by clause + control ID only.
purchase_url: https://www.iso.org/standard/27001
structure:
  clauses: 10 (4-10 are normative)
  annex_a_controls: 93 (4 themes: People 8, Organizational 37, Physical 14, Technological 34)
matrix_language: EN
---

# ISO/IEC 27001:2022 — canonical reference (PAYWALLED)

## Important — license

ISO/IEC standards are copyrighted. We do **not** redistribute the text. The
matrix maps to clause + Annex A control IDs (which are not protected) and
paraphrases requirements in our own words. Operators must purchase the
standard from ISO or a national standards body (ANSI, BSI, DIN, AFNOR, SNV).

## Use in matrix

- Map at **clause + Annex A control level**.
- Ref format:
  - Clauses 4-10: `iso-27001.<clause>` (e.g., `iso-27001.6.1.2`)
  - Annex A: `iso-27001.A.<theme>.<control>` (e.g., `iso-27001.A.8.24`)

## Clauses 4-10 (normative)

- 4 — Context of the organization
- 5 — Leadership
- 6 — Planning (risk assessment + treatment)
- 7 — Support (resources, competence, awareness, communication, documented info)
- 8 — Operation
- 9 — Performance evaluation (monitoring, internal audit, management review)
- 10 — Improvement (nonconformity + corrective action, continual improvement)

## Annex A themes (93 controls)

- **A.5** Organizational controls (37)
- **A.6** People controls (8)
- **A.7** Physical controls (14)
- **A.8** Technological controls (34) ← Pryv's main contribution surface

### A.8 controls likely to map to Pryv (excerpt)
- A.8.1 User end-point devices (out)
- A.8.2 Privileged access rights (configurable via systemStreams + admin tokens)
- A.8.3 Information access restriction (implemented — access permissions per stream)
- A.8.5 Secure authentication (implemented — MFA via `mfa.*` API methods)
- A.8.7 Protection against malware (out)
- A.8.8 Management of technical vulnerabilities (facilitated — dependency-audit baseline)
- A.8.10 Information deletion (configurable — engine-dependent: SQLite per-user folder vs PG/Mongo row-level + backup rotation)
- A.8.11 Data masking (configurable — systemStreams design + per-stream permissions)
- A.8.12 Data leakage prevention (out)
- A.8.15 Logging (implemented — audit logs via `components/audit/`)
- A.8.16 Monitoring activities (facilitated — pluggable observability provider, New Relic first)
- A.8.20 Networks security (configurable — TLS + mTLS cluster + DNS topology)
- A.8.23 Web filtering (out)
- A.8.24 Use of cryptography (implemented — TLS 1.3 via Let's Encrypt, AES-256-GCM at-rest secrets)
- A.8.25 Secure development life cycle (documented in QMS)
- A.8.26 Application security requirements (documented in QMS)
- A.8.28 Secure coding (documented in QMS)
- A.8.30 Outsourced development (out)
- A.8.31 Separation of development, test and production environments (documented)
- A.8.32 Change management (documented — version-controlled SDLC + release notes)
- A.8.33 Test information (documented)
- A.8.34 Protection of information systems during audit testing (documented)

## Notes

- 27001 is an **organization-side** standard. Most clauses (4-10) map to QMS
  (QMS workstream). Annex A controls are where Pryv contributes directly.
- 27001 is the basis for 27701 (PIMS) and informs HDS (which references ISO
  27001 + 27018 + 20000-1).

## Related

- [[references/iso-27701]] — PIMS extension to 27001
- [[references/hds]] — references 27001 + others
- [[references/iso-13485]] — separate QMS lineage; controls overlap is partial
