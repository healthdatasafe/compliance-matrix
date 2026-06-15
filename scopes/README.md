# scopes — the HDS matrix

One YAML file per scope (regulation/standard), e.g. `hipaa-security.yml`,
`hipaa-privacy.yml`, `hipaa-breach.yml`.

Each file carries the **HDS layer** and **implementer layer** for that scope, and
references the corresponding **Pryv platform layer** rows in `../vendor/pryv/`
(via `layered_on` / `derives_from`).

> Empty for now. HIPAA scopes are authored in plan 74, Phase 2. The schema
> extension that formalises the per-layer coverage + persona tagging lands in
> Phase 1 (`../schemas/`).

See [`../docs/how-to-add-a-scope.md`](../docs/how-to-add-a-scope.md) and
[`../schemas/`](../schemas/) for the row format.
