---
scope_id: diga
title: Digital Healthcare Act (DVG) + DiGA Ordinance (DiGAV)
short: DiGA
type: regulation
jurisdiction: Germany
version: DiGAV (Digitale-Gesundheitsanwendungen-Verordnung) + DVG provisions in SGB V
version_date: DiGAV 2020-04-21 (with subsequent amendments); current consolidated ~2024
canonical_url_dvg: https://www.gesetze-im-internet.de/sgb_5/__33a.html
canonical_url_digav: https://www.gesetze-im-internet.de/digav/index.html
bfarm_guide_url: https://www.bfarm.de/EN/Medical-devices/Tasks/DiGA-and-DiPA/DiGA/_node.html
bfarm_diga_directory: https://diga.bfarm.de/de
license: Bundesrecht — § 5 UrhG (no copyright on official works)
structure:
  digav: ~22 sections + 3 annexes (Annex 1 = quality criteria checklist)
matrix_language: EN (DE original)
---

# DiGA (Digitale Gesundheitsanwendungen) — canonical reference

## Use in matrix

- Map at **DiGAV section + Annex-1-item level**.
- Ref format: `diga.<section>` for ordinance sections; `diga.A1.<n>` for
  Annex 1 (quality criteria) items.
- DiGA is **layered** on GDPR (data protection) + MDR (medical device
  classification). Schema uses `layered_on: [gdpr, mdr]`.

## Key requirements (initial expected anchors)

### DiGAV §§ 3-13 — application/listing procedure
- § 4 — Datenschutz (data protection) + Informationssicherheit
- § 5 — Interoperabilität (FHIR profiles, semantic standards)
- § 6 — Robustheit
- § 7 — Verbraucherschutz
- § 8 — Patientensicherheit
- § 14 — Positive Versorgungseffekte (proof of medical benefit)

### Annex 1 — quality criteria checklist (~140 items)
- 1.x Datenschutz (data protection)
- 2.x Informationssicherheit
- 3.x Interoperabilität
- 4.x Robustheit
- 5.x Verbraucherschutz
- 6.x Patientensicherheit

## Notes

- DiGA is an **app-side** regulation (the manufacturer's digital health
  application). Pryv contributes as a **backend** — implementers using Pryv
  must still pass DiGA review for the app itself.
- Pryv's published "Fast Track Kit" claim maps to: DiGAV § 4 (data protection
  via GDPR-by-design), § 5 (interoperability via FHIR endpoints), § 6
  (robustness via deployment hardening).
- TÜV / iTU certificate against BSI C5 Type 2 often required as supporting
  evidence — separate cert track, link via QMS.

## Related

- [[references/gdpr]] — base layer
- [[references/mdr]] — base layer (medical-device classification)
