# How to add a new scope

A "scope" is one regulation, standard, or certification. See
[glossary.md](./glossary.md).

**Voice.** Every row in a scope YAML is read by the implementer (the
audience). Speak directly to them ("You decide…", "Pryv gives you…",
"Your deployment…"). Use "Pryv" when referring to the deployed running
platform; "open-pryv.io" only for code-paths and version references.

## 1. Reference document

Create `references/<scope-id>/source.md` with the canonical URL, version,
license note, and a list of the requirements you intend to map. Use an
existing one as template (e.g., [`references/gdpr/source.md`](../references/gdpr/source.md)).

## 2. Scope YAML

Create `scopes/<scope-id>.yml`. The structure is validated by
[`schemas/scope.schema.json`](../schemas/scope.schema.json). Example skeleton:

```yaml
id: my-scope
title: My Scope Long Name
short: My Scope
type: regulation        # or 'standard' or 'hosting-cert'
jurisdiction: EU
version: "1.0"
version_date: 2026-01-01
canonical_url: https://example.org/my-scope
curated: false          # set true to use excluded_items rather than authoring out-of-scope rows
layered_on: []          # e.g., [gdpr, mdr] for DiGA

requirements:
  - ref: Art.1
    title: First requirement
    text: |
      Paraphrased text of the requirement.
    coverage: implemented
    draft: true
    tests: [TEST01]
    docs: [reference.md#section]
    functional_specs: [EVENT.BASE]
    pryv_primitives: [access, audit]
    sample_apps: [get-a-copy-of-my-data]      # optional
    overview: |
      High-level position (2-3 sentences).
      Audience: auditor / compliance officer.
    detail: |
      Functional explanation (medium length).
      Audience: compliance officer + technical lead.
      Multi-aspect breakdowns, gotchas, configuration trade-offs.
    technical: |
      Implementation-level specifics.
      Audience: engineer.
      Code paths, primitive citations, exact API methods.

excluded_items: []      # for curated scopes only
```

## Authoring tiers

Every requirement row has three optional content fields read by different
audiences — all from the implementer's perspective:

| Field | Audience | Tone | Length |
|---|---|---|---|
| `overview` | auditor / compliance officer | accessible, jargon-free; answers "what does Pryv do for me here?" | 2-3 sentences |
| `detail` | compliance officer + technical lead | functional, may include lists / tables; covers multi-aspect breakdowns + gotchas | a few paragraphs |
| `technical` | engineer | code-grounded, specific; references open-pryv.io code paths + API methods + primitive citations | as long as needed |

The WAB renders all three when a row is expanded, with visual hierarchy
(overview prominent, technical in monospace). A reader stops at the level
they need.

Always write `overview` for any non-`out-of-scope` row — the validator
warns when it's missing.

## Coverage status — what to pick

Pick the status that answers the implementer's question "what does Pryv
do for me on this requirement?":

- `implemented` — works out of the box; no config needed; you can point an
  auditor at running behaviour + a test code.
- `configurable` — works when a specific config is set; cite the config
  keys (`config_keys:`) and a test that exercises that path.
- `facilitated` — Pryv reduces your work but you still do part of it;
  describe what's yours in `overview`/`detail`.
- `documented` — Pryv ships guidance only; cite the doc (`docs:` or
  `qms_docs:`).
- `out-of-scope` — RARE. Means: no software contribution AND no implementer
  obligation flows from this row alone. Do NOT use `out-of-scope` just
  because the article is declarative or because "Pryv doesn't do it" — most
  declarative articles still imply something for the implementer (e.g.,
  GDPR Art.2 puts your whole deployment in material scope; that's not
  "out-of-scope", it's `facilitated` with an overview explaining the
  in-scope nature).

## "Pryv" vs "open-pryv.io"

Apply consistently across all authored fields:

- Use **Pryv** in prose about what the deployed platform does
  ("Pryv stores events", "your Pryv deployment", "the Pryv API").
- Use **open-pryv.io** for code-paths and version references
  ("open-pryv.io/components/cmc/", "open-pryv.io 2.0.0-pre.3 ships…").

## 3. Validate locally

```sh
npm run validate
```

Strict-by-default rules — fails on:

- unknown `reqid` (referenced but missing from `dev-site`'s `requirements.yml`)
- broken test code (referenced but not found in any
  `open-pryv.io/components/*/test` file)
- missing doc file (referenced doc path doesn't exist in `dev-site/src/`)
- `coverage: implemented` or `configurable` with empty `tests:`

## 4. Build the SQLite

```sh
npm run build
```

Produces `dist/compliance.sqlite` consumed by the WAB and other tooling.

## 5. Iterate

- Mark every cell `draft: true` as you go.
- When user-reviewed: set `draft: false` + add `reviewed_by` + `reviewed_at`.
- Coverage status meaning:
  - `implemented` — works out of the box
  - `configurable` — works with specific config keys (cite them in `config_keys:`)
  - `facilitated` — reduces work but implementer does X
  - `documented` — guidance only (cite the doc in `docs:`)
  - `out-of-scope` — not for software

## 6. Linkages

- `functional_specs:` — IDs from `dev-site/src/_functional-specifications/requirements.yml`
- `tests:` — `[CODE]` identifiers from open-pryv.io test descriptions
- `docs:` — relative paths into `dev-site/src/`
- `qms_docs:` — relative paths into `compliance-matrix/qms/`
- `config_keys:` — dotted paths into open-pryv.io config (e.g.,
  `storages.engines.postgresql.database`)
