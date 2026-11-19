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

- **`user-core/<username> → <core URL>`**: the lookup table the
  registration / `/reg/:uid/server` flow uses to tell a client
  "user X lives on core Y, send your subsequent calls there".
- **`emailIndex/<email-hash> → <username>`**: uniqueness check
  enforced at registration so two users can't share an email.
- **DNS records** for `<coreId>.<domain>` + subject CNAMEs.
- **TLS materials** (`tls-cert/<hostname>`, `tls-acme-account`,
  bootstrap-bundle CA artefacts).
- **`access-state/<key>`**: short-lived OAuth2 code and refresh-token
  rows, keyed by the SHA-256 of the credential and carrying no access
  token (no credential is stored in PlatformDB since open-pryv.io
  `3e72be4f`).
- **External ids** (open-pryv.io 2.0.0-rc.58, `external-id-index`
  primitive): `ext-id-ns/<namespace>` rows (label, default mode, a
  server-generated salt never returned) and `ext-id/<nsToken>/<valueToken>
  → <core id>`. The value is a **core id, not an account**: the row says
  which core holds a caller-blinded record id
  (`HMAC(K_namespace, recordId)`, the key stays with the caller). The
  account is known only to the home core, in a local table (account,
  blinded value, claim date) that is never replicated; that table's
  unique index is the authoritative one-account-per-id check (two
  accounts of one core both pass the platform row). Tokens are keyed by
  the platform pepper in hashed PII mode (the default); in cleartext
  mode they are the salt and the blinded value as is.

  The boundary, as stated publicly in the developer-site guide
  ([External ids](https://pryv.github.io/customer-resources/external-ids/),
  "Privacy boundary"): a compromised core **without** `K_namespace`
  learns from the index how many ids each core holds per namespace and
  nothing about the record ids; **with** `K_namespace` it can test
  whether a record id is on the platform and on which core, and only the
  home core can tell which of its accounts holds it. The lookup
  (`POST /reg/ext-id/cores`, no credentials) answers a core, never an
  account; data still reaches an account only through an access its
  holder grants. Deleting an account releases its ids at once, on its
  home core.

  Core-to-core calls (still core affinity, no data-plane forwarding):
  since 2.0.0-rc.59, a forced-mode sign-in accepted on one core asks
  the account's home core whether that account holds the id
  (`POST /system/ext-id/holds`, admin key, the answer a boolean, not
  audited; https only unless `cluster.allowInsecurePeerUrl`). The
  answer is a yes or no, never an account or a value. From 2.0.0-rc.60, the admin release
  (`POST /system/admin/ext-id/release`) acts only on the core that
  holds the id: another core answers `307` with the holding core, and
  the holder's audit row and notice are written there. A core rename
  (`/reg/admin/servers/<old>/rename/<new>`) moves the core's
  `ext-id/` rows along with its accounts (only the rows that name the
  renamed core, `[ADRN2]`); run it with that core stopped, since a claim
  it commits after the rename would carry the old core id.

`cluster_kv` (MFA sessions, `/reg/access` sign-in request state) is
**not** PlatformDB: it is an in-memory store held by each core's master
process, shared by that core's workers only, never replicated.

PlatformDB does **not** carry events, streams, accesses (other
than the short-lived state above), profiles, audit, or attachments.
Those live in the home core's per-engine stores (SQLite per-user
file or PG rows keyed by `user_id`).

## What "core-affine" means

Once a user is registered + bound to a core:

- `accesses.get` returns only accesses on that core's storage.
- `events.get`, `streams.get` (audit logs included, via the `:_audit:`
  store), `GET /events/<id>/series` etc., all served from the home
  core's storage.
- Webhooks fire from the home core.
- `auth.delete` runs the pipeline on the home core; only that
  core's stores need updating.
- ACME challenge / cert validation happens on whatever core is
  configured as `letsEncrypt.certRenewer` (one per cluster); the
  resulting cert replicates to peers via rqlite.

Three exceptions where horizontal coordination happens (none of
them data-plane forwarding):

1. **Registration via `forwardIfCrossCore`**: a `POST /reg/users`
   call that lands on the wrong core gets a 303-style forward
   to the assigned core *for the registration handshake only*.
   Post-handshake, the user has their home core and never returns
   to the originally-contacted core.
2. **CMC counterparty sharing**: when user A on core-EU shares a
   stream with user B on core-US via the Cross-Modular Capability
   primitive, B's access points at A's `apiEndpoint`. B's client
   talks to **A's home core**, not B's. The data still doesn't move
   between cores; B's client just has two `apiEndpoint`s in its
   profile.
3. **System-stream rebuilds**: `register` flows + a few admin ops
   may issue platform queries via the local core's PlatformDB
   replica; reads come from the local replica, writes propagate
   via rqlite consensus.

## Consequences for the matrix

| Obligation family | Implication |
|---|---|
| Audit log timestamps (Art.30, ISO A.8.15) | Single-core scope. Per-core monotonic time suffices; cross-core ordering not meaningful. |
| Access expiry (Art.7, Art.13) | Single-core. An access valid on its home core cannot be replayed on a peer. |
| Right-to-erasure (Art.17) | Single-core run of `auth.delete`. The Q8 PG-audit gap is the same shape, engine-dependent, not cross-core-dependent. The account's external ids are released by its home core in the same deletion (local rows and the platform `ext-id/` rows that point at the core). |
| Right-of-access (Art.15) | Subject's `pryv-account-backup` run hits one `apiEndpoint`. CMC-shared data on a peer's core needs a separate run with the counterparty's credentials (the subject's name on the peer account is the counterparty's username, not theirs). |
| Data residency (Art.44 / Swiss nLPD Art.34) | Per-user `core.url` determines the jurisdiction. Choice happens at registration; "migrate user to another core" is not a Pryv-native primitive (would require a `backup → restore` to peer core). |
| TLS / cert (Art.32 §1(d) / iso A.8.24) | Each core terminates TLS on its own machine. Peers materialize the same cert from rqlite but the active handshake is core-local. |
| Clock sync (iso A.8.17) | No cross-core agreement needed; intra-core misalignment is the failure mode (cert validity window, audit ordering within a core). Operator NTP. |
| Multi-core data residency for compliance review | An auditor reviewing user X needs to identify X's home core via PlatformDB (`user-core/X`), then run their review against that one core. Same for a forensic investigation. |

## When this clarifies vs misleads

This is the right mental model for *runtime* data-plane questions.
It is **not** the right mental model for:

- **Cluster-wide secret rotation**: `auth.adminAccessKey`,
  `letsEncrypt.atRestKey` etc. are operator-supplied + must be
  identical across cores. Mismatched at-rest-encryption keys
  produce per-core decryption failures.
- **Cluster-wide config drift**: `override-config.yml` is per-
  host; operator hygiene applies. Pryv doesn't enforce config
  alignment between cores beyond the bootstrap-bundle inheritance.
- **DNS / discovery**: a `cluster.discoveryEnabled` opt-in
  enables rqlite DNS-based join; that needs cluster-wide agreement
  on `<coreId>.<domain>` names.

## Related

- `docs/pryv-primitives.md`: `data-residency` primitive entry
  cites the user-to-core binding mechanism.
- `proposals/clock-skew-cluster-checks.md`: Q11-outcome proposal
  (shipped) that depends on this architecture.
- `proposals/audit-log-chaining.md`: the chain is per-core because
  the data plane is per-core.
- `proposals/account-backup-dsar-completeness.md`: CMC-shared data
  on peer cores is the one "cross-core" concern for DSAR; resolved
  by the subject running the backup against the counterparty's
  endpoint separately.
- Internal architecture notes, `forwardIfCrossCore` is the
  registration-time exception; `access-state` (hashed OAuth2 rows)
  is the ephemeral cross-core state surface (the only
  non-registration coupling besides CMC). `cluster_kv` is
  core-local, not cross-core.
