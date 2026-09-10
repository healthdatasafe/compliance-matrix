# compliance-matrix

The compliance & regulation matrix for **Health Data Safe (HDS)** — the deployed
platform and operations built on [open-pryv.io](https://github.com/pryv/open-pryv.io)
plus the HDS stack (bridges, web app, libraries, data model, hosting).

This repo answers three questions:

1. **How does HDS itself stand?** For each regulation, the role HDS holds, the
   independent assurance it does and does not have, its named gaps, and how much
   of its position rests on approved documentation. Per scope, in `hds_posture`.
2. **What does HDS carry for you?** Per requirement, what the platform and HDS
   operations handle on an implementer's behalf.
3. **What is still on your plate?** What an organisation building on HDS must do
   itself, filtered to what it is actually building, and **which agreement(s) it
   must sign** to do it.

The first question was added in September 2026 and is a **separate axis** from the
second: HDS can carry a requirement completely for an implementer while holding no
role at all under that regulation, which is exactly the HIPAA position. Never infer
one from the other. See [`docs/hds-standing.md`](docs/hds-standing.md).

> ⚠️ **Not legal advice.** This matrix and its templates are engineering and
> operational guidance. Confirm your obligations with qualified counsel.

## The three-layer model

HDS sits **between** the Pryv platform and the implementer. Every requirement row
is read across three layers:

| Layer | Source | What it tells you |
|-------|--------|-------------------|
| **Pryv platform** | inherited from [`pryv/compliance-matrix`](https://github.com/pryv/compliance-matrix) (see [`vendor/pryv/`](vendor/pryv/)) | what the open-pryv.io software does out of the box / configurable |
| **HDS** | authored here | what HDS-as-operator + the HDS app stack adds: the apps and libraries (hds-webapp, hds-lib-js, data-model, bridges), hosting & data-residency, monitoring, backups, key management |
| **Implementer** | authored here | what *you* must still do — tagged by persona (**partner / Covered Entity / Business Associate** vs. **individual user**) — and the agreement(s) to sign |

Coverage taxonomy (reused from Pryv) per layer: `implemented · configurable ·
facilitated · documented · out-of-scope`. A claim without proof is a regression:
`implemented`/`configurable` rows cite evidence; `documented` rows cite the doc.

## Scope of the matrix

**This matrix covers the vault product.** Individuals hold their own HDS accounts,
data enters only with their explicit consent, and they decide who may access it.
HDS is therefore the controller of the vault, is nobody's GDPR Art.28 processor,
and holds no HIPAA role there: consent is not delegation. An organisation that
receives data an individual chose to share is an **independent controller** of
what it then holds. Arrangements that would create a processor or business
associate role are documented separately and are out of this matrix's scope.

## Scopes covered

**HIPAA** (Security, Privacy, Breach Notification), **GDPR**, **Swiss nLPD** and
**SOC 2**: 229 requirements across six scope files. Designed so further scopes
(ISO 27001/27701, …) are added as *data*, not rebuilds. See
[`scopes/README.md`](scopes/README.md).

## Repository layout

```
schemas/        JSON Schema for scope + requirement records (the row format)
scopes/         THE HDS MATRIX — one YAML per scope (HDS + implementer layers)
templates/      Downloadable agreement templates (BAA, subcontractor, DPA, …)
vendor/pryv/    Vendored snapshot of pryv/compliance-matrix (the platform layer)
                — pinned commit in PINNED-COMMIT.txt; refreshed via npm run sync:pryv
references/      (under vendor/pryv) canonical regulation sources
profiles.yml    Implementer-profile vocabulary: features, archetypes, scope rules
families.yml    Display grouping (the three HIPAA rules present as one regulation)
docs/           Methodology: standing axis, implementer profiles, coverage
                taxonomy, effort axis, glossary, how-to-add-a-scope
scripts/        build.js (YAML → dist/compliance.sqlite), validate.js (CI gate)
wab/            The web app to browse the matrix (React + Vite) — adapted to the
                HDS three-layer sqlite (2026-07-28); local-only (npm run dev), no deploy yet
dist/           Build output (gitignored): compliance.sqlite + wab build
```

## Working with this repo

```sh
npm install
npm run validate      # schema + cross-reference checks (run before any commit)
npm run build         # → dist/compliance.sqlite
npm run build:all     # validate + build
npm run site          # → dist/site/, INCLUDING the generated llms*.txt
npm run evidence:status   # recompute evidence backing from compliance-internal
```

`npm run validate` is the merge gate. After changing any content
(`scopes/*.yml`, `profiles.yml`, `families.yml`, `templates/*.md`,
`official-refs.yml`) run `npm run site`, because the `llms*.txt` files are
generated from the same source and are the only form an AI agent can read. See
the directive in [`AGENTS.md`](AGENTS.md).

## Methodology docs

| Doc | What it covers |
|-----|----------------|
| [`docs/hds-standing.md`](docs/hds-standing.md) | The standing axis, arrangements and roles, the gates that make an unearned assurance claim impossible, the evidence-backing numbers |
| [`docs/implementer-profiles.md`](docs/implementer-profiles.md) | The feature vocabulary, the any-of rule, the untagged-is-shown invariant, how to add an area or a follow-up question |
| [`docs/how-to-add-a-scope.md`](docs/how-to-add-a-scope.md) | Adding a regulation |
| [`docs/effort-axis.md`](docs/effort-axis.md), [`docs/facilitation-typology.md`](docs/facilitation-typology.md), [`docs/glossary.md`](docs/glossary.md) | The coverage vocabulary |

## HTTPS for local development

The dev server runs over HTTPS on a `*.backloop.dev` hostname, which resolves to `127.0.0.1`.
Certificates come from the [`backloop.dev`](https://github.com/perki/backloop.dev-node) package,
installed directly from GitHub rather than npm.

**You need nothing to get started.** With no configuration the package downloads a shared,
self-signed certificate. Install it once per machine by following
<https://backloop.dev/public/>, and the browser warning goes away.

Two things worth knowing:

- **Firefox will not accept it**, because it ignores the system trust store. Use a Chromium-based
  browser, or supply your own certificate.
- **Bring your own certificate** from mkcert, Caddy, a company CA or openssl: point
  `BACKLOOP_DEV_CERT` and `BACKLOOP_DEV_KEY` at the PEM files and nothing is downloaded.

If you are updating an existing checkout, delete the stale copy first. npm does not replace a
package that moved from the registry to a git URL: it leaves the old directory in place while
`npm ls` reports the new version.

```sh
rm -rf node_modules/backloop.dev node_modules/vite-plugin-backloop.dev && npm install
```

## Relationship to Pryv's matrix

We **layer on top** of Pryv's matrix and **digest its updates**: `vendor/pryv/`
holds a pinned snapshot, refreshed by `npm run sync:pryv` (Phase 1) which reports
which platform rows changed since the last sync so HDS rows can be revisited.

Where we find gaps or improvements in Pryv's matrix, we open issues upstream at
[`pryv/open-pryv.io`](https://github.com/pryv/open-pryv.io/issues) (the Pryv
ecosystem's single tracker).

---

Maintained by Health Data Safe.
