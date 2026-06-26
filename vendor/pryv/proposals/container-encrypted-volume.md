# container-encrypted-volume — user-data encryption at rest

**Status: shipped** — `pryv/container-encrypted-volume` v0.1.0 (2026-06-23).
**Repo**: https://github.com/pryv/container-encrypted-volume
**Primitive**: `encryption-at-rest-user-data`
**Matrix rows**: `hipaa-security:164.312(a)(2)(iv)`, `gdpr:Art.32`

## What it delivers

A modular encryption-at-rest facility for the **full user-data surface**
(events, attachments, series, audit, platform DB) of a containerised
open-pryv.io deployment. It is **layered onto the stock image** at build time —
no fork, no application code change, opt-in via one switch (`CEV_ENABLED`).
On boot it provisions and mounts an encrypted volume inside the container and
points the data roots at it, so the application stores ciphertext at rest.

Two pluggable seams, each a documented manifest + verb contract with a
conformance harness:

- **Backend** (`CEV_BACKEND`): how bytes are encrypted on disk. Ships **LUKS**
  (reference; kernel dm-crypt, near-native with AES-NI; container file is
  ciphertext at all times) and **gocryptfs** (FUSE-stacked). Conformance proves
  idempotency, ciphertext-at-rest after close, and data persistence.
- **Key provider** (`CEV_KEY_PROVIDER`): where the unlock key comes from at boot.
  Ships `env`, `file`, `exec` (wrap any cloud secret CLI), `clevis`
  (TPM2 / Tang / PKCS#11 / Shamir threshold), and `aws-kms` (envelope: unwrap a
  KMS-wrapped data key via the container's identity — IAM role / IAM Roles
  Anywhere — so no copyable key is held).

## Threat model & regulatory fit

Protects data on the storage medium (stolen / decommissioned disks, off-host
backups, snapshots). It does not defend a *running* container — that is access
control's job, and it is the scope these controls cover:

- **HIPAA** §164.312(a)(2)(iv) "mechanism to encrypt and decrypt ePHI" — now a
  switch-on Pryv-delivered mechanism (was operator-implements). Volume
  encryption also grounds the breach-notification safe harbor (NIST SP 800-111).
- **GDPR** Art.32(1)(a) encryption-of-personal-data measure; Art.34(3)(a) relief.

Coverage rationale: `configurable` on the HIPAA encryption row — Pryv's software
performs the encryption once enabled; the operator only switches it on and
supplies a key source (a key is intrinsic to any at-rest control, so this is not
a Pryv gap). With `aws-kms` / `clevis`, key custody is identity/hardware-bound
and no copyable key is stored beside the data. Rotation uses LUKS key-slots (no
bulk re-encryption).

## Coverage caveats

- **External PostgreSQL** (separate container/host) writes to its own data dir
  outside the encrypted mount — encrypt that operator-side. SQLite-base
  deployments are fully covered.
- **Remote object storage** (S3) — use the bucket's server-side encryption.
- LUKS requires `--privileged` (or granular caps); restricted Kubernetes Pod
  Security profiles may forbid it — those targets fall back to host/operator FDE.

## Evidence

- Backend conformance harness (LUKS + gocryptfs) in CI.
- End-to-end functional verification on an open-pryv.io overlay: a user event
  written through the API is stored on the encrypted volume, persists across a
  restart, and is absent in plaintext from the stopped container file.
- Operator guide: `docs/OPERATING.md` in the companion repo.
