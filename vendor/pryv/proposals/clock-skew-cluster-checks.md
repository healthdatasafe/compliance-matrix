# Proposal: cluster clock-skew checks (bootstrap + cert-load)

**Status:** **two small intra-core checks queued.** Mirror of the
upstream backlog item (filed 2026-05-20 from the gap-probing
session — Q11 on time synchronization across cores).

## Today's posture

Pryv uses machine wall-clock for every timestamp (audit row time,
access expiry, LE cert renewal trigger, TLS handshake validity).
Clock synchronization between machines is the operator's job —
`chronyd` / `ntpd` on the host. `iso-27001.A.8.17` (Clock
synchronization) is currently classified `out-of-scope` because
Pryv contributes nothing.

But two silent failure modes exist:

1. **Boot-time clock skew** — a core joining a cluster via
   `bin/master.js --bootstrap` (Plan 34) does not validate its
   local clock against any peer / external reference. NTP-not-yet-
   converged + hardware-clock-only boot + container drift can
   all produce a core that immediately starts serving with
   incoherent timestamps.

2. **Cert-load clock skew** — when a freshly-rotated cert lands
   in rqlite + an `acme:rotate` IPC fanout (Plan 35) makes each
   core hot-swap via `setSecureContext`, the swap does not first
   check that the new cert's `notBefore..notAfter` window contains
   the local clock. A backward-skewed core will start serving a
   cert it considers not-yet-valid → handshake failures.

## Architecture context (why these are intra-core only)

Pryv users are **core-affine** — every data-plane call hits the
user's home core; cores never proxy each other. PlatformDB is an
index + uniqueness service, not a routing layer or data store.
See `context/core-affinity-architecture.md` for the full
architectural treatment recorded in the same Q11 session.

Consequence: cores never need to **agree** on clock value or on
cert validity. The dangerous scenarios are all **intra-core** —
one core whose own clock is broken relative to its own loaded
cert or relative to the audit rows it writes.

## Direction when shipped

Two small additions in `components/business/src/`:

1. **Bootstrap-join skew check** — in the `--bootstrap` path,
   after Raft connectivity but before the joining core acks ready,
   compare the joining core's `Date.now()` to the issuer's
   `serverTime`. If `|delta| > cluster.clockSkewThresholdSec`
   (default `30s`), refuse to ack + log + exit 1. Operator fixes
   NTP, retries.

2. **Pre-cert-load validity check** — in the worker-side
   `acme:rotate` handler, parse the new cert with
   `x509.X509Certificate(pem)` + validate `validFromDate` and
   `validToDate` against the local clock with the same
   `clockSkewThresholdSec`. Refuse the swap on failure; keep the
   previous cert loaded; log the misalignment for operator alert.

Both are gated by `cluster.clockSkewThresholdSec`. Operator can
tighten (`10s` for strict-audit deployments) or disable (`0`).

## Pryv's existing contribution to skew detection

`meta.serverTime` is returned in every API response (Unix
timestamp seconds; see
`components/api-server/src/methods/helpers/setCommonMeta.ts:49`).
Clients use this to detect their own clock skew vs the server.
Webhook payloads also carry `serverTime`. This is the existing
**client-side** primitive; the proposal here adds the
**server-side** counterpart at two checkpoints (bootstrap +
cert-load).

## Affected matrix rows (today's framing → after shipping)

| Scope | Row | Today | After shipping |
|---|---|---|---|
| iso-27001 | A.8.17 Clock synchronization | Out of scope | F: Awareness \| Low — Pryv contributes skew detection at two checkpoints + `serverTime` API helper |
| hipaa-security | 164.312(c)(1) Integrity | F: Primitive \| Med | unchanged tier; cert-load check tightens the integrity story per row detail |

## Rows updated alongside this proposal

- `iso-27001.A.8.17` overview + detail extended to surface the
  `serverTime` client helper + the core-affine architecture + this
  proposal as the future direction. Coverage stays `out-of-scope`
  today (Pryv contributes nothing yet); planned chip points at
  the eventual `F: Awareness | Low` tier.
- `docs/pryv-primitives.md` audit entry expanded with the
  `serverTime` cross-reference (client-side skew detection helper).
- `proposals/audit-log-chaining.md` constraints section adds the
  per-core-monotonic-time precondition (the chain depends on it;
  cross-core ordering is not meaningful per the core-affinity
  architecture).

## Why this is small dev

- Two specific code touchpoints, both well-isolated:
  - `components/business/src/bootstrap/applyBundle.ts` or its
    sibling step in `bin/bootstrap.js --bootstrap`.
  - The worker-side `acme:rotate` handler in
    `components/business/src/acme/` (or `CertRenewer`'s materialize
    path on non-renewer cores).
- Both checks use only the `x509` Node built-in + a config read.
- Unit-testable in isolation: synthesize a cert with skewed
  `validFromDate`, run the check, expect refusal + log.
- No schema change, no new storage, no IPC change.

## Related

- Upstream backlog:
  `_plans/XXX-Backlog/CLOCK-SKEW-CLUSTER-CHECKS.md`
- Architecture note: `context/core-affinity-architecture.md`
- Sibling proposal: `proposals/audit-log-chaining.md` (cite this
  in the chain backlog as a precondition).
