# scopes — the HDS matrix

One YAML file per scope (regulation/standard), e.g. `hipaa-security.yml`,
`hipaa-privacy.yml`, `hipaa-breach.yml`.

Each file carries the **HDS layer** and **implementer layer** for that scope, and
references the corresponding **Pryv platform layer** rows in `../vendor/pryv/`
(via `layered_on` / `derives_from`).

Current scopes: `hipaa-security.yml`, `hipaa-privacy.yml`, `hipaa-breach.yml`
(all draft pending review). SOC 2 / GDPR / ISO follow as added files.

See [`../schemas/hds-scope.schema.json`](../schemas/hds-scope.schema.json) and
[`../schemas/hds-requirement.schema.json`](../schemas/hds-requirement.schema.json)
for the row format.
