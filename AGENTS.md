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
wab/            Web app (React + Vite) — adapted to the HDS sqlite schema; local-only, no deploy yet
```

## Commands

```bash
npm install
npm run validate      # schema + cross-reference checks (before any commit)
npm run build         # → dist/compliance.sqlite
npm run build:all     # validate + build
npm run sync:pryv     # refresh vendor/pryv snapshot (Phase 1 — not yet implemented)
npm run site          # → dist/site/, INCLUDING llms.txt and llms-full.txt
npm run evidence:status  # recompute hds_posture.evidence_backing from compliance-internal
```

## ⚑ The llms*.txt files are GENERATED — never hand-write them

`dist/site/llms.txt`, `llms-full.txt` and the per-framework `llms-<scope>.txt` files are
emitted by `scripts/site.js` from the same YAML as the pages. **They are the machine-readable
face of this matrix**, and for an AI agent they are the only usable one: the implementer page
computes its answer in the browser, so an agent fetching that URL gets an empty result and a
JSON blob. Whatever these files say is what a language model will repeat.

**Therefore:**

- **Never edit an llms*.txt by hand.** They are build output and live only in `dist/site/`.
  Editing one is lost on the next build and, worse, produces a machine-readable file that
  disagrees with the pages.
- **After ANY change to `scopes/*.yml`, `profiles.yml`, `families.yml`, `templates/*.md` or
  `official-refs.yml`, re-run `npm run site`** so the generated text matches. `npm run deploy`
  does this for you; a local check does not.
- **When you add a field that changes an answer** (a new `applies_when` value, a new persona
  rule, a new posture field), extend the generator in `site.js` in the same commit. The
  "How the implementer view computes its answer" section of `llms.txt` documents the matching
  rules an agent must apply; if it drifts from `render()`, an agent will compute a confident
  wrong compliance answer with nothing to flag it.

Why this is a directive and not a nicety: the sibling site `healthdatasafe.org` carried a
**hand-written** `llms.txt` that told language models partner organisations act as HDS's data
processors and carry no data-protection liability. It was wrong, it was the most
machine-readable statement HDS published, and it stood for months because nothing kept it in
step with the source. Generation is what prevents that here.

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

HIPAA (Security, Privacy, Breach) is in draft across all three layers, with the
Pryv-sync script and agreement templates in place. Other scopes (SOC 2, GDPR,
ISO) are planned as added data. All rows are `draft` pending review.
