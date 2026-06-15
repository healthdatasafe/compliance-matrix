# CMC + `consent/*` event types — what the primary consent record is

Source-of-truth for matrix claims about how Pryv carries consent across
accounts. Findings from reading `open-pryv.io/components/cmc/` and
`data-types/src/consent.json` directly.

## Release status (verified)

- `open-pryv.io`: CMC merged to master, shipped as **plugin** in 2.0.0-pre.3
  (`components/cmc/`). The plugin is the manifest-level on/off toggle (loaded
  or not).
- `data-types`: `consent/*` formats merged to master (`c76fc07`). Built
  artefacts at `https://raw.github.com/pryv/data-types/master/dist/{event-types,flat,extras}.json`.
- Client SDK: `@pryv/cmc` npm package (sibling to `@pryv/monitor`,
  `@pryv/socket.io`).

## The architecture in one sentence

**The access (with its versioned `permissions` + `clientData`) is the primary
durable consent record. The `consent/*` events are the wire-shape of the
state transitions that establish, modify, or tear down that record.**

## What `consent/*` formats are

Eight state-transition formats on the cross-account consent state machine:

| Format | State transition | Who writes it |
|---|---|---|
| `consent/request-cmc` | Issue a request | Requester app (carries title/description/consent text + requested permissions + features + expiry) |
| `consent/accept-cmc` | Accept a request | Accepter app (local trigger) → Accepter plugin (peer-delivered) |
| `consent/refuse-cmc` | Refuse a request | Accepter app |
| `consent/back-channel-cmc` | Post-acceptance handshake | Requester plugin |
| `consent/revoke-cmc` | Tear down established consent | Either party's app |
| `consent/scope-request-cmc` | Propose scope change | Collector app |
| `consent/scope-update-cmc` | Apply scope change | User-side app or plugin |
| `consent/invalidate-link-cmc` | Invalidate open-link capability | Requester app |

These are **typed events validated server-side by the CMC plugin**.

## Where the consent text actually lives

`consent/request-cmc` `.request` field:

```yaml
request:
  title:        { en: "...", fr: "..." }    # localized text
  description:  { en: "...", fr: "..." }    # localized text
  consent:      { en: "...", fr: "..." }    # THE consent assertion shown to user
  permissions:  [{streamId, level}, ...]    # what's being granted
  features:     { chat, systemMessaging }
  expiresAt:    <unix-seconds>
```

This event lives on the requester's own account, immutable per Pryv event
semantics. It records what was *asked*.

On `accept-cmc`, the plugin transactionally:
1. Creates the bidirectional shared access pair (one access on each side).
2. Each access's `permissions` enforce the granted scope (technical control).
3. The access's `clientData` carries metadata about the relationship
   (counterparty identity, app code, originating request ref).

The access pair is the **durable contract**. The events are the **messages
that established it**.

## What the access carries (as consent record)

Per [`access-versioning.md`](./access-versioning.md) — fully snapshotted on
every update, including `clientData`. So:

- `permissions` = legally enforced scope at each version
- `clientData` = relationship metadata (counterparty, app, originating
  `consent/request-cmc` event id, optionally a copy of the consent text
  shown — by convention)
- `serial` chain = full audit of scope changes

`accesses.update` via composite-id (per `access-versioning.md`) is what
`consent/scope-update-cmc` triggers under the hood — the access's history
chain mirrors the negotiation history.

## Same-account / non-cross-account consent

For single-platform deployments where consent is given by the user to the
operator's app (not to a third party), the same primitive applies but
simpler: the user creates an access for the app via `app-web-auth3` flow;
clientData can carry the consent text shown; permissions encode the scope.
No `consent/*` events needed (the negotiation IS the local auth flow).

## Consequences for compliance claims (consent-related)

- **GDPR Art.7 (Conditions for consent — demonstrability + withdrawability)**
  - Demonstrability: `accesses.get` (with `includeHistory=true`) returns the
    full version chain; the original `consent/request-cmc` event preserves
    what was asked.
  - Withdrawability: `accesses.delete` (full revoke) or `accesses.update`
    (scope-down) — both versioned. For cross-account: `consent/revoke-cmc`
    event triggers the access revocation transactionally on both sides.
  - **Coverage: `implemented`** for cross-account flows; **`implemented`**
    for same-account flows.

- **GDPR Art.30 (Records of processing)** — the access pair + its history
  + the originating `consent/request-cmc` event jointly IS the per-purpose
  processing record. Coverage: `implemented` (where CMC is in use) or
  `facilitated` (where implementer must carry consent text in clientData
  themselves).

- **GDPR Art.7(3) (Right to withdraw)** — `implemented` via
  `accesses.delete` + (cross-account) `consent/revoke-cmc`; CMC bidirectionality
  ensures the counterparty is notified.

- **HIPAA-Privacy §164.508 (Authorizations)** — same primitive maps;
  authorization is an access with the appropriate scope; revocation is
  symmetric.

- **GDPR Art.26 (Joint controllers) — does NOT apply to CMC by
  default** (Q18 finding, 2026-05-20). CMC requires subject
  validation: User A's `consent/accept-cmc` event is what
  authorises any cross-account flow to User B's operator. Each
  operator remains the SOLE controller for their respective
  user's data; the lawful basis for B's operator processing A's
  data is A's CMC consent record (Art.6(1)(a)), not a
  controller-to-controller agreement. This is controller-to-
  controller transmission *via subject consent* (Art.20(2)
  lineage). Real Art.26 only fires when two operators decide on
  joint processing independently of subject choices — outside
  the CMC primitive.

## Distinction the matrix must surface

- **Primary record**: the access (permissions, clientData, version chain).
- **Negotiation audit**: the `consent/*` events on the requester + accepter
  accounts.
- **Implementer requirement**: when using CMC, the implementer's app is
  responsible for writing the `consent/request-cmc` event with the full
  consent text in `.request.consent`. When NOT using CMC, the implementer
  must carry the consent text in `clientData` themselves (or in a custom
  event-type) — the matrix's `documented` / `facilitated` distinction
  depends on which path they take.

## Code references (current master)

- `components/cmc/README.md` — canonical design document. CMC plugin is on
  master in `2.0.0-pre.3`.
- `components/cmc/IMPLEMENTERS-GUIDE.md` — customer-facing wire shape.
- `components/cmc/INTERNALS.md` — plugin-side flow diagrams.
- `components/cmc/src/accessesUpdateHook.ts` — post-hook that fires when
  `accesses.update` runs (links scope changes to outbound notification).
- `data-types/src/consent.json` — the 8 `consent/*` formats.
- `data-types/dist/event-types.json` — built artefact consumed at runtime
  via `service.eventTypes` config.

## Reviewer follow-ups

- Find + cite CMC test codes (`components/cmc/test/`).
- Verify CMC plugin loading mechanism: is it shipped enabled by default in
  `2.0.0-pre.3`, or is operator-opt-in required?
- Confirm `clientData` convention for non-CMC consent capture — is there a
  documented schema, or is it implementer-defined?
