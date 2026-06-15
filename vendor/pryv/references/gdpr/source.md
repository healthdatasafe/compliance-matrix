---
scope_id: gdpr
title: General Data Protection Regulation
short: GDPR
type: regulation
jurisdiction: EU + EEA (extraterritorial via Art. 3)
version: Regulation (EU) 2016/679 (consolidated)
version_date: 2016-04-27 (entry into force: 2018-05-25)
canonical_url: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02016R0679-20160504
official_html_url: https://eur-lex.europa.eu/eli/reg/2016/679/oj
license: EU institutional documents — free reuse with attribution (Decision 2011/833/EU)
structure:
  chapters: 11
  articles: 99
  recitals: 173
languages_official: all 24 EU official languages
matrix_language: EN
---

# GDPR — canonical reference

## Use in matrix

- Map at **article level** (e.g., `gdpr.Art.5`, `gdpr.Art.17`).
- Where an article has lettered/numbered sub-paragraphs that materially differ
  in software contribution, split (e.g., `gdpr.Art.5.1.f` integrity &
  confidentiality vs `gdpr.Art.5.1.e` storage limitation).

## Key articles for the matrix (initial expected anchors)

- Art. 5 — Principles relating to processing
- Art. 6 — Lawfulness
- Art. 7 — Consent conditions
- Art. 12-22 — Data subject rights (access, rectification, erasure, portability)
- Art. 25 — Data protection by design and by default
- Art. 28 — Processor obligations
- Art. 30 — Records of processing
- Art. 32 — Security of processing
- Art. 33-34 — Breach notification
- Art. 35 — DPIA
- Art. 44-50 — International transfers (post-Schrems II)

## Notes

- Recitals are non-binding but cited for interpretation; matrix may reference
  them in `notes` but does not map them as requirements.
- Member-state derogations (Art. 6(2)/(3), Art. 9(4)) — out of scope; matrix
  maps Regulation text only.

## Related

- [[references/swiss-nlpd]] — derives_from gdpr for many articles
- [[references/diga]] — layered_on gdpr
- [[references/mdr]] — layered_on gdpr for medical devices
