# Core-affinity architecture (data plane vs PlatformDB)

**Status:** architectural fact, recorded from the gap-probing
session (Q11, 2026-05-20) after the implementer-perspective
question on cross-core time-sync exposed a mental-model gap. This
note exists so future matrix authors don't repeat the same
miscalibration.

## TL;DR

A Pryv user is **assigned to exactly one core** and every data-
plane operation involving that user happens on that core. **Cores
never proxy a user's data calls to each other.** The only
horizontal data in a multi-core Pryv cluster is the **PlatformDB**
(rqlite-replicated), and it is an **indexing + uniqueness**
service, not a routing layer or a data store.

This shapes how several compliance obligations resolve.

## What PlatformDB carries

The platform database (rqlite, replicated across all cores) stores
operator-shared state that needs to be consistent + uniquely
keyed across the cluster:

- **`user-core/<username> → <core URL>`** — the lookup table the
  registration / `/reg/:uid/server` flow uses to tell a client
  "user X lives on core Y, send your subsequent calls there".
- **`emailIndex/<email-hash> → <username>`** — uniqueness check
  enforced at registration so two users can't share an email.
- **DNS records** for `<coreId>.<domain>` + subject CNAMEs.
- **TLS materials** (`tls-cert/<hostname>`, `tls-acme-account`,
  bootstrap-bundle CA artefacts).
- **`access-state/<key>`** — cross-core access state for
  short-lived per-flow tokens.
- **`cluster_kv/<key>`** — operator-shared ephemeral state.

PlatformDB does **not** carry events, streams, accesses (other
than the short-lived state above), profiles, audit, or attachments.
Those live in the home core's per-engine stores (SQLite per-user
file or PG rows keyed by `user_id`).

## What "core-affine" means

Once a user is registered + bound to a core:

- `accesses.get` returns only accesses on that core's storage.
- `events.get`, `streams.get` (audit logs included, via the `:_audit:`
  store), `GET /events/<id>/series` etc. — all served from the home
  core's storage.
- Webhooks fire from the home core.
- `auth.delete` runs the pipeline on the home core; only that
  core's stores need updating.
- ACME challenge / cert validation happens on whatever core is
  configured as `letsEncrypt.certRenewer` (one per cluster); the
  resulting cert replicates to peers via rqlite.

Three exceptions where horizontal coordination happens (none of
them data-plane forwarding):

1. **Registration via `forwardIfCrossCore`** — a `POST /reg/users`
   call that lands on the wrong core gets a 303-style forward
   to the assigned core *for the registration handshake only*.
   Post-handshake, the user has their home core and never returns
   to the originally-contacted core.
2. **CMC counterparty sharing** — when user A on core-EU shares a
   stream with user B on core-US via the Cross-Modular Capability
   primitive, B's access points at A's `apiEndpoint`. B's client
   talks to **A's home core**, not B's. The data still doesn't move
   between cores; B's client just has two `apiEndpoint`s in its
   profile.
3. **System-stream rebuilds** — `register` flows + a few admin ops
   may issue platform queries via the local core's PlatformDB
   replica; reads come from the local replica, writes propagate
   via rqlite consensus.

## Consequences for the matrix

| Obligation family | Implication |
|---|---|
| Audit log timestamps (Art.30, ISO A.8.15) | Single-core scope. Per-core monotonic time suffices; cross-core ordering not meaningful. |
| Access expiry (Art.7, Art.13) | Single-core. An access valid on its home core cannot be replayed on a peer. |
| Right-to-erasure (Art.17) | Single-core run of `auth.delete`. The Q8 PG-audit gap is the same shape — engine-dependent, not cross-core-dependent. |
| Right-of-access (Art.15) | Subject's `pryv-account-backup` run hits one `apiEndpoint`. CMC-shared data on a peer's core needs a separate run with the counterparty's credentials (the subject's name on the peer account is the counterparty's username, not theirs). |
| Data residency (Art.44 / Swiss nLPD Art.34) | Per-user `core.url` determines the jurisdiction. Choice happens at registration; "migrate user to another core" is not a Pryv-native primitive (would require a `backup → restore` to peer core). |
| TLS / cert (Art.32 §1(d) / iso A.8.24) | Each core terminates TLS on its own machine. Peers materialize the same cert from rqlite but the active handshake is core-local. |
| Clock sync (iso A.8.17) | No cross-core agreement needed; intra-core misalignment is the failure mode (cert validity window, audit ordering within a core). Operator NTP. |
| Multi-core data residency for compliance review | An auditor reviewing user X needs to identify X's home core via PlatformDB (`user-core/X`), then run their review against that one core. Same for a forensic investigation. |

## When this clarifies vs misleads

This is the right mental model for *runtime* data-plane questions.
It is **not** the right mental model for:

- **Cluster-wide secret rotation** — `auth.adminAccessKey`,
  `letsEncrypt.atRestKey` etc. are operator-supplied + must be
  identical across cores. Mismatched at-rest-encryption keys
  produce per-core decryption failures.
- **Cluster-wide config drift** — `override-config.yml` is per-
  host; operator hygiene applies. Pryv doesn't enforce config
  alignment between cores beyond the bootstrap-bundle inheritance.
- **DNS / discovery** — a `cluster.discoveryEnabled` opt-in
  enables rqlite DNS-based join; that needs cluster-wide agreement
  on `<coreId>.<domain>` names.

## Related

- `docs/pryv-primitives.md` — `data-residency` primitive entry
  cites the user-to-core binding mechanism.
- `proposals/clock-skew-cluster-checks.md` — Q11-outcome backlog
  proposal that depends on this architecture.
- `proposals/audit-log-chaining.md` — the chain is per-core because
  the data plane is per-core.
- `proposals/account-backup-dsar-completeness.md` — CMC-shared data
  on peer cores is the one "cross-core" concern for DSAR; resolved
  by the subject running the backup against the counterparty's
  endpoint separately.
- Internal architecture notes — `forwardIfCrossCore` is the
  registration-time exception; `cluster_kv` + `access-state`
  are the ephemeral cross-core state surfaces (the only
  non-registration coupling besides CMC).
