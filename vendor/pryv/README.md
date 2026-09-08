# vendor/pryv — Pryv platform layer (vendored snapshot)

This directory is a **pinned, read-only snapshot** of
[`pryv/compliance-matrix`](https://github.com/pryv/compliance-matrix) — the
"platform layer" of the HDS three-layer model (what open-pryv.io does out of the
box). HDS layers its own (HDS + implementer) rows on top.

- **Pinned commit:** see [`PINNED-COMMIT.txt`](PINNED-COMMIT.txt).
- **Do not edit by hand.** Changes here would be overwritten by the next sync.
- **Refresh:** `npm run sync:pryv` (re-fetches the upstream tip, updates the
  snapshot, and reports which rows changed so the corresponding HDS rows can be
  revisited). Use `npm run sync:pryv -- --check` for a report-only dry run.

## Snapshot documents the software, not the HDS deployment

The snapshot tracks the upstream **tip** and therefore describes what the
open-pryv.io software does at that commit, which can run **ahead of the build HDS
actually deploys**. **Deployment-anchored claims live in the HDS layer**
(`../../scopes/*.yml`): an HDS row only cites a platform primitive once the
deployed cores run a build carrying it. When the cores upgrade, revisit the HDS
rows the sync report flagged and update the delta recorded below.

**As of 2026-09-08 there is no delta.** Both HDS production cores run
open-pryv.io `2.0.0-rc.16`, deployed 2026-09-07 (deploy tags
`deploy/prod-ch1-20260907` and `deploy/prod-us1-20260907`), and the snapshot
describes the same line. The dev core runs `2.0.0-rc.14`. Every platform
primitive the snapshot documents is therefore citable by an HDS row on
deployment grounds.

> **Read the version from the deploy tags, not from a hand-written note.** This
> paragraph claimed a deployed `rc.4` against an `rc.8` snapshot from 2026-07-28
> until 2026-09-08, through twelve release candidates and four production
> roll-forwards. Because the rule above gates every citation on the deployed
> version, a stale figure here silently withholds primitives the cores have been
> running for months. The authoritative check is
> `git describe --tags --match '2.0.0-rc.*' deploy/prod-ch1-<newest>` in the
> `open-pryv.io` checkout; `dev-deploy/config/apps.yml` notes are prose and go
> stale the same way this did.

## Why vendored (not a submodule / live fetch)

A vendored snapshot is reproducible, diffable in PRs, and needs no network in CI.
The pinned commit records exactly which version of the platform layer the HDS
matrix was built against.

## Proposing changes upstream

Found a gap or improvement in the platform layer? Don't patch it here — open an
issue at [`pryv/open-pryv.io`](https://github.com/pryv/open-pryv.io/issues) (the
Pryv ecosystem's single tracker). Per HDS policy, drafts are prepared internally
and posted by the maintainer.
