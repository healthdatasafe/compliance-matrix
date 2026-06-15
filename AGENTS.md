# AGENTS.md

Welcome, agent. Fast orientation. Read this, then `README.md` for depth.

## What this repo is

`compliance-matrix` maps **regulations and standards** (HIPAA first; then SOC 2,
GDPR, ISO 27001/27701, Swiss nLPD, …) onto **Health Data Safe**: the deployed
platform + operations built on [open-pryv.io](https://github.com/pryv/open-pryv.io)
plus the HDS stack.

It is **data + proof, not prose**: the matrix lives in YAML (`scopes/*.yml`),
validates against JSON Schemas, and builds into SQLite browsed by the web app
(`wab/`).

## The three-layer model — read this first

HDS sits **between** Pryv and the implementer. Every requirement is answered across:

1. **Pryv platform layer** — what open-pryv.io does. *Inherited*, not re-authored:
   it lives in `vendor/pryv/` (a pinned snapshot of `pryv/compliance-matrix`).
2. **HDS layer** — what HDS-as-operator + the HDS app stack adds (bridges,
   hds-webapp, hds-lib-js, data-model, hosting, monitoring, backups). Authored here.
3. **Implementer layer** — what's still on the plate of whoever builds on HDS,
   **tagged by persona** (partner / Covered Entity / BA vs. individual user), with
   pointers to the agreement template(s) in `templates/` they must sign.

## Quick repo map

```
scopes/         THE HDS MATRIX — one YAML per scope (HDS + implementer layers)
templates/      Agreement templates (BAA, subcontractor/subprocessor, DPA …)
vendor/pryv/    Pinned snapshot of pryv/compliance-matrix (platform layer input)
schemas/        JSON Schemas — the row format contract
docs/           Methodology: coverage taxonomy, effort axis, glossary, how-to
scripts/        build.js (YAML → dist/compliance.sqlite), validate.js (CI gate)
wab/            Web app (React + Vite) — inherited from Pryv, HDS adaptation pending
```

## Commands

```bash
npm install
npm run validate      # schema + cross-reference checks (before any commit)
npm run build         # → dist/compliance.sqlite
npm run build:all     # validate + build
npm run sync:pryv     # refresh vendor/pryv snapshot (Phase 1 — not yet implemented)
```

## Editing rules

- Coverage levels (`implemented | configurable | facilitated | documented |
  out-of-scope`) and the effort/facilitation axes are defined in `docs/` — don't
  invent enum values (the schema rejects them).
- A claim without a citation is a regression: `implemented`/`configurable` cite
  evidence; `documented` cite the doc.
- Don't edit `vendor/pryv/` by hand — it's a generated snapshot. Propose platform
  changes upstream at [`pryv/open-pryv.io` issues](https://github.com/pryv/open-pryv.io/issues).
- `npm run validate` is the merge gate.

## Status

Bootstrapped under HDS **plan 74** (`compliance-bootstrap`). HIPAA content,
templates, the Pryv-sync script, and the HDS-specific schema layering are being
authored across that plan's phases.
