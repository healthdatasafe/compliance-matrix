---
scope_id: hds
title: Hébergement de Données de Santé (Health Data Hosting Certification)
short: HDS
type: hosting-cert
jurisdiction: France
version: HDS Référentiel (référentiel de certification — current edition)
version_date: 2018 (initial certification regime); 2024 referentiel update planned
canonical_url: https://esante.gouv.fr/produits-services/hds
official_arrete_url: https://www.legifrance.gouv.fr/loda/id/JORFTEXT000037184011/
license: French government works — free reuse with source
structure:
  activities: 6 ("activités d'hébergement de données de santé")
  references: ISO 27001 + ISO 20000-1 + ISO 27018 + specific health-data requirements
matrix_language: EN (FR original)
---

# HDS (Hébergement de Données de Santé) — canonical reference

## What HDS is

HDS is a **certification of the host** (Pryv operator running infrastructure)
issued by a COFRAC-accredited body. It does NOT certify the software or the
data controller — it certifies the hosting infrastructure handling French
health data.

## Critical nuance — HDS ≠ GDPR compliance

Per Pryv's published position (article
`pourquoi-la-certification-hds-ne-garantit-pas-votre-conformite-au-rgpd.html`
in www): HDS covers hosting infrastructure security; the customer still must
implement GDPR for consent, data subject rights, breach notification, etc.
The matrix surfaces this on both `hds.*` and `gdpr.*` rows as cross-scope
gotchas.

## Use in matrix

- Map at **activity + reference-standard control level**.
- Ref format: `hds.<activity>` for the 6 activities; `hds.<ISO-ref>.<control>`
  for the referenced control mappings.

## The 6 HDS activities

1. Mise à disposition d'infrastructures matérielles (physical infra) — out
   (operator responsibility, not Pryv)
2. Mise à disposition d'infrastructures virtuelles (virtual infra) — out
3. Mise à disposition de plateforme logicielle (platform-as-a-service) —
   partial (Pryv as a backend can be this)
4. Administration et exploitation du système d'information (sysadmin) — out
5. Sauvegarde externalisée (offsite backup) — facilitated (Pryv's backup
   tooling supports)
6. Archivage de données de santé (archival of health data) — partial

## Referenced standards

- ISO/IEC 27001 — ISMS baseline
- ISO/IEC 20000-1 — IT service management
- ISO/IEC 27018 — protection of PII in public clouds acting as PII processors

Matrix references to ISO 27001 controls reuse the `iso-27001.A.*` IDs.

## Notes

- HDS rows are largely **operator-side** (the company hosting Pryv for French
  health data). Most rows: `documented` (we tell the operator what to do) or
  `out-of-scope` (purely organizational).
- Implementer-template QMS docs include an HDS-prep section linking to
  required policies + records.

## Related

- [[references/iso-27001]] — referenced by HDS
- [[references/gdpr]] — paired but distinct (see "Critical nuance" above)
