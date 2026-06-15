# compliance-matrix

The compliance & regulation matrix for **Health Data Safe (HDS)** — the deployed
platform and operations built on [open-pryv.io](https://github.com/pryv/open-pryv.io)
plus the HDS stack (bridges, web app, libraries, data model, hosting).

This repo answers two questions for every regulatory requirement:

1. **How is HDS compliant?** — what the platform and HDS operations handle for you.
2. **What is still on your plate?** — what an organisation building on HDS must do
   themselves, and **which agreement(s) they must sign** to do it.

> ⚠️ **Not legal advice.** This matrix and its templates are engineering and
> operational guidance. Confirm your obligations with qualified counsel.

## The three-layer model

HDS sits **between** the Pryv platform and the implementer. Every requirement row
is read across three layers:

| Layer | Source | What it tells you |
|-------|--------|-------------------|
| **Pryv platform** | inherited from [`pryv/compliance-matrix`](https://github.com/pryv/compliance-matrix) (see [`vendor/pryv/`](vendor/pryv/)) | what the open-pryv.io software does out of the box / configurable |
| **HDS** | authored here | what HDS-as-operator + the HDS app stack adds: bridges, hds-webapp, hds-lib-js, data-model, hosting/Dokku, New Relic monitoring, backups, key management |
| **Implementer** | authored here | what *you* must still do — tagged by persona (**partner / Covered Entity / Business Associate** vs. **individual user**) — and the agreement(s) to sign |

Coverage taxonomy (reused from Pryv) per layer: `implemented · configurable ·
facilitated · documented · out-of-scope`. A claim without proof is a regression:
`implemented`/`configurable` rows cite evidence; `documented` rows cite the doc.

## Scopes

Starting with **HIPAA** (Security, Privacy, Breach Notification). Designed so
**SOC 2, GDPR, ISO 27001/27701, Swiss nLPD, …** are added as *data*, not rebuilds.

## Repository layout

```
schemas/        JSON Schema for scope + requirement records (the row format)
scopes/         THE HDS MATRIX — one YAML per scope (HDS + implementer layers)
templates/      Downloadable agreement templates (BAA, subcontractor, DPA, …)
vendor/pryv/    Vendored snapshot of pryv/compliance-matrix (the platform layer)
                — pinned commit in PINNED-COMMIT.txt; refreshed via npm run sync:pryv
references/      (under vendor/pryv) canonical regulation sources
schemas/, docs/ Methodology: coverage taxonomy, effort axis, glossary, how-to
scripts/        build.js (YAML → dist/compliance.sqlite), validate.js (CI gate)
wab/            The web app to browse the matrix (React + Vite) — inherited from
                Pryv, HDS adaptation tracked in plan 74 Phase 5
dist/           Build output (gitignored): compliance.sqlite + wab build
```

## Working with this repo

```sh
npm install
npm run validate      # schema + cross-reference checks (run before any commit)
npm run build         # → dist/compliance.sqlite
npm run build:all     # validate + build
```

## Relationship to Pryv's matrix

We **layer on top** of Pryv's matrix and **digest its updates**: `vendor/pryv/`
holds a pinned snapshot, refreshed by `npm run sync:pryv` (Phase 1) which reports
which platform rows changed since the last sync so HDS rows can be revisited.

Where we find gaps or improvements in Pryv's matrix, we open issues upstream at
[`pryv/open-pryv.io`](https://github.com/pryv/open-pryv.io/issues) (the Pryv
ecosystem's single tracker).

---

Bootstrapped under HDS plan 74 (`compliance-bootstrap`).
