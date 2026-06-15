---
scope_id: mdr
title: Medical Device Regulation
short: MDR / EU 2017/745
type: regulation
jurisdiction: EU + EEA
version: Regulation (EU) 2017/745 (consolidated, incl. 2023 amendments to transition periods)
version_date: 2017-04-05 (full application 2021-05-26)
canonical_url: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02017R0745-20230320
official_url: https://eur-lex.europa.eu/eli/reg/2017/745/oj
mdcg_guidance_url: https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en
license: EU institutional documents — free reuse (Decision 2011/833/EU)
structure:
  chapters: 10
  articles: 123
  annexes: 17
matrix_language: EN
---

# MDR — canonical reference

## Use in matrix

- Map at **article + annex-section level**.
- Ref format: `mdr.Art.<n>` for articles; `mdr.Ax.<section>` for annexes
  (e.g., `mdr.A1.17` for Annex I General Safety + Performance Requirement 17
  on software).
- MDR is **layered** on GDPR for any device that processes personal data.

## Key articles + annexes for the matrix (initial expected anchors)

### Software-anchor articles
- Art. 10 — General obligations of manufacturers (QMS — `qms_docs:` link)
- Art. 51-60 — Classification + conformity assessment
- Art. 61-82 — Clinical evaluation + investigation
- Art. 83-86 — Post-market surveillance
- Art. 87-92 — Vigilance + reporting
- Art. 93-100 — Market surveillance

### Annex I — General Safety + Performance Requirements (GSPR)
- §17 — Electronic programmable systems / software (most relevant)
- §18 — Active devices / devices connected to them
- §23 — Information to be supplied with the device

### Annex II + III — Technical documentation (incl. on post-market surveillance)
### Annex IX — Conformity assessment based on QMS
### Annex XIV — Clinical evaluation + post-market clinical follow-up
### Annex XVI — List of products without intended medical purpose

## MDR + Software (MDCG 2019-11, IEC 62304, ISO 14971)

- Software classification → MDCG 2019-11 (Rule 11 in MDR Annex VIII)
- Software lifecycle → IEC 62304 (referenced by harmonized standards)
- Risk management → ISO 14971 (referenced)

## Notes

- MDR rows expected: ~10-15 software-anchor articles get `documented`/`facilitated`.
- Many MDR rows fall under QMS — design controls, post-market data,
  CAPA. Matrix `coverage` for these will be `documented` linking to
  `qms/pryv/` docs.

## Related

- [[references/gdpr]] — base layer when device processes personal data
- [[references/iso-13485]] — implicitly required QMS standard (harmonized)
- [[references/diga]] — layered on MDR for German digital health apps
