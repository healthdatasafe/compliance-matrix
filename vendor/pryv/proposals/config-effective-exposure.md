# Read-only effective-configuration endpoint

**Proposal mirror of**: no standalone backlog file, the work is absorbed by the
operator bootstrap + admin-panel effort (macroPryv-side plan), which owns the
delivery. This mirror exists so the affected rows can carry `planned:` chips.
**Filed during:** DPIA Section (d) safeguards-inventory gap-probing (2026-05-21).
**Tracking card:** https://github.com/orgs/pryv/projects/5?pane=issue&itemId=219705795&issue=pryv%7Copen-pryv.io%7C118
**Surfacing question:** *"My impact assessment has to inventory the safeguards
actually in force on each core. How do I read them without SSH-ing the box?"*

## Today's state (verified)

| Control | Status | Anchor |
|---|---|---|
| Configuration layering documented | ✅ | `default-config.yml` + `override-config.yml` + `host-config.yml` |
| Validation on start | ✅ | `config-validation` plugin at master start |
| Machine-readable effective config, per core | ❌ | no route; reconstructed by hand on the host |
| Secret redaction contract | ❌ | no explicit secret-key list or schema annotation |
| Cross-core configuration drift detection | ❌ | manual comparison |

The effective configuration of a running core is only readable by logging into the
machine and re-deriving the merge of the YAML layers. Every compliance artefact that
must describe deployed technical measures is therefore assembled by hand and goes
stale immediately.

## After shipping

A read-only, per-core admin route returning the merged effective configuration
(including YAML-only key families), with secrets redacted via an explicit secret-key
list plus a schema annotation, a digest mode for cheap cross-core drift comparison,
and a Configuration view in the admin panel over the same data.

| Scope | Ref | Kind | Impact | After shipping |
|---|---|---|---|---|
| gdpr | Art.30 | feature | medium | the §1(g) "description of technical security measures" becomes emitable evidence rather than a hand-written inventory |
| gdpr | Art.32 | feature | low | strengthens the evidence narrative around operator-visible safeguards |
| gdpr | Art.35 | feature | medium | DPIA safeguards inventory cites endpoint output; row could shift from awareness to evidence |
| iso-27001 | A.8.9 | feature | medium | direct match on configuration-management evidence; row could move toward configurable |
| hipaa-security | 164.308(a)(8) | feature | medium | the periodic evaluation gains a technical baseline snapshot to measure against, instead of reconstructing it per assessment cycle |

All five rows carry a chip. The chips carry no `backlog:` key: this work has no
standalone backlog file and is delivered by the operator bootstrap + admin-panel
effort. `planned.backlog` is optional in the schema and `scripts/validate.js` only
resolves it when set, so no stub file is needed.
