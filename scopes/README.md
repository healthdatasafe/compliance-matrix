# scopes — the HDS matrix

One YAML file per scope (regulation or standard). Each file carries the **HDS
layer** and the **implementer layer** for that scope, and references the
corresponding **Pryv platform layer** rows in [`../vendor/pryv/`](../vendor/pryv/)
through `layered_on_pryv` on the scope and `pryv_ref` on a requirement.

## Current scopes

| File | Requirements | Notes |
|------|--------------|-------|
| `hipaa-security.yml` | 43 | `family: hipaa` |
| `hipaa-privacy.yml` | 35 | `family: hipaa` |
| `hipaa-breach.yml` | 13 | `family: hipaa` |
| `gdpr.yml` | 47 | |
| `swiss-nlpd.yml` | 30 | |
| `soc2.yml` | 61 | 61 Trust Services criteria |

The three HIPAA files share `family: hipaa`, so the site presents them as one
regulation while each stays a separate file layered on its own vendor scope. The
family's display name comes from [`../families.yml`](../families.yml).

## What a scope file holds

- **Scope header**: `id`, `title`, `type`, `jurisdiction`, `version`,
  `version_date`, and optionally `short`, `canonical_url`, `regions`, `family`,
  `layered_on_pryv`.
- **`hds_posture`**: how HDS *itself* stands against this scope. A different axis
  from `hds.coverage`, and the build fails without it. See
  [`../docs/hds-standing.md`](../docs/hds-standing.md).
- **`requirements[]`**: one row per requirement, each carrying the HDS layer
  (`hds`) and the implementer layer (`implementer[]`).

## Editing rules

- Coverage is one of `implemented · configurable · facilitated · documented ·
  out-of-scope`. Do not invent enum values; the schema rejects them.
- A claim without a citation is a regression. `implemented` and `configurable`
  rows cite evidence; `documented` rows cite the doc.
- **This repo is public.** Cite public material or internal document *codes*
  only, never operational or infrastructure detail, never a private workspace
  path or plan number.
- `hds.evidence_approved` is **generated** by `scripts/evidence-status.js`. Never
  hand-write it.
- `draft: false` means a second reader checked the wording. Record `reviewed_by`
  and `reviewed_at` when you set it.
- Every `implementer[]` obligation should carry `applies_when`; an obligation
  without one is always shown and marked "not yet profiled". See
  [`../docs/implementer-profiles.md`](../docs/implementer-profiles.md).
- `npm run validate` is the merge gate. After any content change run
  `npm run site` so the generated `llms*.txt` files stay in step.

## Adding a scope

See [`../docs/how-to-add-a-scope.md`](../docs/how-to-add-a-scope.md). The row
format contract is [`../schemas/hds-scope.schema.json`](../schemas/hds-scope.schema.json)
and [`../schemas/hds-requirement.schema.json`](../schemas/hds-requirement.schema.json);
the field descriptions there carry the reasoning behind each one.
