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

## Why vendored (not a submodule / live fetch)

A vendored snapshot is reproducible, diffable in PRs, and needs no network in CI.
The pinned commit records exactly which version of the platform layer the HDS
matrix was built against.

## Proposing changes upstream

Found a gap or improvement in the platform layer? Don't patch it here — open an
issue at [`pryv/open-pryv.io`](https://github.com/pryv/open-pryv.io/issues) (the
Pryv ecosystem's single tracker). Per HDS policy, drafts are prepared internally
and posted by the maintainer.
