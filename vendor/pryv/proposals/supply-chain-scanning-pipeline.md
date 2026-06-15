# Supply-chain scanning pipeline

**Proposal mirror of**: `_plans/XXX-Backlog/SUPPLY-CHAIN-SCANNING-PIPELINE.md`
(macroPryv-side backlog file).
**Filed during:** Q24 implementer-perspective gap-probing session.
**Surfacing question:** *"Does Pryv emit any artefact about its
own dependency hygiene? Does the npm tree, the Docker image, the
rqlite tarball, all get scanned for CVEs in CI? Are images
digest-pinned or moving-tag?"*

## Today's state (verified in code)

| Control | Status | Code anchor |
|---|---|---|
| npm `package-lock.json` committed | ✅ | `open-pryv.io/package-lock.json` (`lockfileVersion: 3`) |
| CI `npm install --ignore-scripts` | ✅ | `.github/workflows/ci.yml` lines 44, 70, 84 |
| Per-commit Docker SHA tag | ✅ | `.github/workflows/ci.yml` last `tags:` block (`pryvio/open-pryv.io:2.0.0-pre-${{ github.sha }}`) |
| rqlite version pin | ✅ | `Dockerfile` `ARG RQLITE_VERSION=9.4.5` |
| Dependabot security alerts | ✅ | GitHub repo Security tab (Plan 56 close cleared 22→0 on 2026-04-30) |
| Manual `npm audit` triage | ✅ | (procedural, not automated) |
| CI gate on `npm audit` | ❌ | (not in workflow) |
| SCA tool in CI (Snyk / OWASP DC / etc.) | ❌ | (none integrated) |
| Container image scan (Trivy / Grype) | ❌ | (not in Docker job) |
| Base image digest-pinned | ❌ | `FROM node:24-bookworm` is a moving tag |
| rqlite tarball checksum verification | ❌ | `Dockerfile` line 17 `curl -fsSL` with no `sha256sum -c` |
| SBOM emission (CycloneDX / SPDX) | ❌ | (no manifest published per release) |
| Image signing (cosign / Docker Content Trust) | ❌ | (no signature on pushed images) |

## After shipping (3-phase pipeline per backlog)

| Scope | Ref | Kind | Impact | After shipping |
|---|---|---|---|---|
| iso-27001 | A.5.21 | enhancement | medium | overview prose drops the overstated "published dependency-audit pipeline" claim; row gains a `tests: [CIYAML]` citation; coverage shifts F:Awareness Low → F:Evidence Medium (SBOM + signed images + CI gate are the evidence) |
| iso-27001 | A.5.22 | enhancement | medium | (row may need to be ADDED — A.5.22 "Monitoring of supplier services" doesn't currently have a matrix row; the supply-chain-scanning pipeline gives the row content if added) |
| iso-27001 | A.8.30 | enhancement | low | overview tightens — when operator's "supplier" is Pryv, the SBOM + signed image + CHANGELOG combine into the supplier-monitoring artefact set |
| gdpr | Art.32 | enhancement | low | detail block gains a "supply-chain hygiene" sub-bullet; pseudonymisation / encryption / CIA aspects already covered, this strengthens the "ongoing CIA" axis |
| hipaa-security | 164.308(a)(8) | enhancement | low | periodic technical evaluation gains a concrete artefact (the SBOM + the latest scan output) |
| iso-27001 | A.5.23 | enhancement | low | strengthens cloud-services exit narrative — operator hands the SBOM + signed-image proof to the next CSP for migration |

## Phase 1 — In-CI gates (cheap, ~0.5 day)

- `npm audit --audit-level=high` step in CI fails the build on
  high / critical CVE.
- Pin base image: `FROM node:24-bookworm@sha256:<digest>`.
  Renewed via periodic dependabot PR.
- rqlite tarball: add `RQLITE_SHA256` `ARG` + `sha256sum -c`
  step before `tar xzf`.

## Phase 2 — Pipeline tooling (~1.5 days)

User-recommended candidates (Plan 71 Q24, 2026-05-21):
*"OWASP-ZAP, Snyk, Grype"*. Note OWASP-ZAP is a DAST proxy
scanner, not a dependency tool — could fit Phase 3 as separate
web-app security testing.

Recommended stack:

- **Syft** — CycloneDX SBOM emission for npm tree + Docker
  image.
- **Grype** — vulnerability scan against NVD; CI gate on
  Critical / High.
- SBOM published as GitHub Release artefact (CycloneDX JSON).

Alternative: Snyk (commercial; free for open-source) — curated
metadata + dashboard, at the cost of a vendor relationship.

## Phase 3 — Provenance + signing (~2 days)

- cosign image signing (key-based or keyless OIDC).
- SLSA Level 2+ provenance attestation attached via cosign.
- Release-notes SBOM link in every GitHub Release body.

## Cross-references

- macroPryv backlog file:
  `_plans/XXX-Backlog/SUPPLY-CHAIN-SCANNING-PIPELINE.md`.
- `compliance-matrix/UPDATE-TRIGGERS.md` Section A entry
  `SUPPLY-CHAIN-SCANNING-PIPELINE`.
- Q23 (Plan 71 FAQ) covered the runtime subprocessor posture —
  this proposal covers the BUILD-TIME / SOFTWARE-SUPPLY-CHAIN
  side of the same regulatory family.
