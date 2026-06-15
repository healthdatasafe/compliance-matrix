# Pryv access versioning — implementation findings

Source-of-truth for the matrix's claims about access immutability +
consent-contract preservation. Findings from reading the
`open-pryv.io` master branch implementation directly.

## TL;DR

An `accesses.update` mutation **snapshots the live head row in full** into a
history row (separate cuid, `headId: <base>`, frozen `serial`) BEFORE applying
the change. Snapshot includes **every field** of the head — explicitly
`permissions`, `name`, `deviceName`, `clientData`, `expireAfter`, `expires`,
plus all tracking + integrity fields.

`clientData` specifically is "treated with same gravity as permissions — often
carries consent message / contract-agreement text, so audit/version retention
matters." (per the access-update design notes).

History rows are immutable: `accesses.delete` does NOT touch them; only the
head row gets the soft-delete marker. Token-based auth queries filter
`headId: null` so history snapshots can never authenticate a request.

## Wire-format identity

| Access state | wire `id` | Meaning |
|---|---|---|
| Never updated | `"<base>"` (bare cuid, no `:`) | The original contract |
| After N updates | `"<base>:N"` (composite) | The N-th version |
| Historical row (snapshot of pre-update state) | resolvable by `(base, serial)` tuple | `serial: null` for the original snapshot; `1, 2, ... N-1` thereafter |

`accesses.get`:
- Bare id → current head.
- Composite matching current serial → current head.
- Composite with older serial → historical snapshot + `current: "<base>:<currentSerial>"` hint (GitHub-commit-by-sha-style).

`accesses.update` / `accesses.delete` — strict-conflict on stale composite id (409).

## What is snapshotted (storage layer)

From `storages/engines/postgresql/src/user/AccessesPG.ts` `snapshotHead()`:

```js
const snapshot = Object.assign({}, head);   // full row clone
snapshot.id = generateId();                  // fresh cuid for the history row
snapshot.headId = baseId;                    // points back to the base
delete snapshot.integrity;                   // recomputed against snapshot fields
delete snapshot.apiEndpoint;                 // derived; recomputed
that.insertOne(userOrUserId, snapshot, ...);
```

**Conclusion:** every mutable + every immutable field is preserved historically.
There is no diff-only storage and no field excluded from versioning.

## Mutable vs immutable fields

(From the access-update design — what `accesses.update` can change vs what's
immutable by API contract.)

| Mutable | Immutable |
|---|---|
| `permissions` | `id` (base), `type`, `token`, `createdBy`, `created` |
| `name`, `deviceName` |  |
| `clientData` |  |
| `expireAfter`, `expires` |  |

Every mutation bumps `serial` + writes a history snapshot — **no
"lightweight" updates that skip versioning** (uniform rule).

Telemetry-only fields (`lastUsed`, `calls.<method>`) mutate the head row in
place WITHOUT bumping `serial` or writing history. This is intentional: counts
are not contract terms.

## Composite-id surface (audit cross-reference)

Audit rows reference accesses by `(accessId, accessSerial)`:

| Audit ref shape | Means | Resolves to |
|---|---|---|
| `accessId: "<base>"`, `accessSerial: null` | "the original (never-updated) version" | head row if its `serial IS NULL`, else history row with `headId = <base>` AND `serial IS NULL` |
| `accessId: "<base>"`, `accessSerial: K` | "version K specifically" | head row if its `serial = K`, else history row with `headId = <base>` AND `serial = K` |

A bare audit reference written *before* the access was ever updated keeps
resolving correctly after the access is updated — points at the original
snapshot (now in history with `serial: null`).

## Consequences for compliance claims

This is the foundation for several matrix coverage upgrades:

- **GDPR Art.7 (Conditions for consent)** — `implemented`: access + clientData
  at a given `serial` IS the demonstrable consent record at that point in time.
  Withdrawal = subsequent `accesses.update` lowering scope or `accesses.delete`;
  the prior state remains queryable.
- **GDPR Art.5(1)(b) (Purpose limitation)** — `implemented`: permissions per
  stream enforce the purpose granted at consent; can't read outside the
  granted stream scope.
- **GDPR Art.5(2) (Accountability)** — `implemented`: every API call audited
  with the access ref (incl. serial) → access row carries the consent
  state at that serial.
- **GDPR Art.30 (Records of processing)** — `implemented`: accesses (with
  clientData carrying purposes/recipients/retention) + audit + system streams
  jointly form the register.
- **GDPR Art.15 (Right of access)** — `implemented`: `accesses.get` returns
  current + history (with `includeHistory=true`); subject can read the full
  contract chain.
- **GDPR Art.18 (Restriction)** — `configurable`: scope-down via
  `accesses.update` (narrow permissions) or revoke via `accesses.delete`.

## Code references (current master)

- `components/api-server/src/methods/accesses.ts` — public surface
  (`accesses.get`, `accesses.update`, `accesses.delete` with composite-id
  conflict checks; line ~447 onward).
- `components/api-server/src/schema/accessesMethods.ts` — request/response
  schemas including `includeHistory` flag.
- `components/business/src/accesses/refs.ts` — `parseAccessRef`,
  `serializeAccessRef`, `composeWireAccess` (composite-id wire format).
- `storages/engines/postgresql/src/user/AccessesPG.ts` `snapshotHead()` — PG
  implementation of the history snapshot.
- `components/audit/src/Audit.ts` — comment "when the caller's access has been
  versioned (serial..." documents how audit captures `accessSerial`.

## Reviewer follow-ups

- Find + cite test codes that exercise the access-update + history flow
  (likely under `components/api-server/test/access-update*.test.js`).
- Verify `expireAfter` / `expires` history semantics — relevant to GDPR
  storage-limitation claims.
- Confirm whether `accesses.create` writes the original row with `serial: null`
  (which is what the design specifies) so the "never-updated" wire-format id
  stays bare (no `:0`).
