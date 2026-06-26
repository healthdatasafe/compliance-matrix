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

## Gates on access-state-mutating consent triggers

CMC's access-state-mutating lifecycle triggers are gated server-side. Two
distinct gate shapes — chosen per trigger by what's at stake:

- **`consent/accept-cmc` (mint a new data-grant access)** and
  **`consent/scope-update-cmc` (widen an existing data-grant)** require a
  **personal access token** (an access minted by the standard
  `/auth/login` sign-in flow). App- and shared-access tokens are rejected
  by the server with `400 invalid-operation` +
  `error.data.id === 'cmc-accept-requires-personal-token'`. Personal tokens
  are only issued via the login flow, so requiring one at the moment a
  mint/widen trigger is written means the user is, by construction, signed
  in and present. The previous design accepted the trigger from any access
  carrying stream-write permission, which opened a scope-escalation path
  where an app holding a narrow `:_cmc:apps:<app>:*` permission could
  drive the orchestration to mint an arbitrarily broader data-grant
  access on the user's account from a colluding requester's offer — without
  a consent UI ever being shown to the user.

- **`consent/revoke-cmc` (delete a data-grant access)** uses the standard
  Pryv access-permission gate, NOT a token-class check. `handleRevoke`
  runs `triggerAccess.canDeleteAccess(target)` (the same primitive
  `accesses.delete` enforces, which honours the `selfRevoke` feature
  permission on the target access). This means:
  - personal tokens always pass;
  - the relationship's data-grant access can self-revoke (default
    `selfRevoke: allow`), so an app holding only the relationship-access
    can terminate the relationship without bouncing through Pryv's auth
    pages — matching the natural access-management model;
  - app tokens that created the target can revoke it;
  - anything else fails with
    `error.data.id === 'cmc-revoke-forbidden'`.

  Revoke is a contraction, not an escalation — the access being deleted
  bounds the impact, so user-presence at the moment of revocation is not
  needed for the security property to hold. Operators who set
  `selfRevoke: forbidden` on counterparty accesses at mint time keep the
  explicit deny path; the existing feature-permission contract carries
  over unchanged.

Apps that hold only an app- or shared-access token (e.g. a third-party
patient app that received its access via `/auth/access`) delegate **accept**
+ **scope-update** to Pryv's authorization web pages via the `/cmc-accept`
and `/cmc-scope-update` hand-off routes (`pryv.cmc.requestAccept` +
`pryv.cmc.requestScopeUpdate` in `@pryv/cmc` ≥ 3.9): the user
authenticates with their own credentials on Pryv's trusted surface, the
trigger is written with the fresh personal token, and the result is
returned to the calling app. The authoritative consent UI lives on
`app-web-auth3` (the pages render the offer / scope-change details
client-side), so a compromised or malicious app cannot fake what the user
is consenting to. **Revoke needs no hand-off** — the access-permission
gate accepts the relationship's own data-grant access directly.

## Consequences for compliance claims (consent-related)

- **GDPR Art.7 (Conditions for consent — demonstrability + withdrawability)**
  - Demonstrability: `accesses.get` (with `includeHistory=true`) returns the
    full version chain; the original `consent/request-cmc` event preserves
    what was asked.
  - **User-presence at the moment of consent**: the personal-token gate on
    `consent/accept-cmc` proves the user was signed in when the trigger was
    written — not merely that an app authorized for stream-write performed
    the write. This strengthens the demonstrability claim: the access pair
    + history chain is backed by an auditable user-authentication event.
  - Withdrawability: `accesses.delete` (full revoke) or `accesses.update`
    (scope-down) — both versioned. For cross-account: `consent/revoke-cmc`
    event triggers the access revocation transactionally on both sides.
    Revoke is access-permission-gated (`AccessLogic.canDeleteAccess` —
    honours `selfRevoke`), so the relationship's own data-grant access
    can self-revoke without an auth-page bounce — preserving the
    practical withdrawability guarantee while keeping the security
    property (the access being deleted bounds the impact).
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
