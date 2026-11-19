# CMC + `consent/*` event types: what the primary consent record is

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

Ten formats on the cross-account consent state machine (event-type
catalogue 1.3.0, bundled with open-pryv.io 2.0.0-rc.53):

| Format | State transition | Who writes it |
|---|---|---|
| `consent/request-cmc` | Issue a request | Requester app (carries title/description/consent text + requested permissions + features + expiry) |
| `consent/accept-cmc` | Accept a request | Accepter app (local trigger) → Accepter plugin (peer-delivered) |
| `consent/refuse-cmc` | Refuse a request | Accepter app |
| `consent/back-channel-cmc` | Post-acceptance handshake | Requester plugin |
| `consent/revoke-cmc` | Tear down established consent | Either party's app |
| `consent/scope-request-cmc` | Propose scope change | Collector app |
| `consent/scope-update-cmc` | Apply scope change | User-side app or plugin |
| `consent/invalidate-link-cmc` | Invalidate an open-link capability, or (since 2.0.0-rc.56) a single-use invite nobody accepted yet | Requester app (on the invite's own scope or an ancestor, since 2.0.0-rc.53) |
| `consent/member-access-cmc` | A group member asks the group's core for an access of their own on a patient's account | Member app, through its membership access (group accounts, 2.0.0-rc.53) |
| `consent/member-revoke-cmc` | Record of the sweep that deletes a departing member's accesses | Group's plugin only; a client write is refused (group accounts, 2.0.0-rc.53) |

These are **typed events validated server-side by the CMC plugin**.
Group accounts (open-pryv.io 2.0.0-rc.53) also add a
`request.membership` flag on `consent/request-cmc`. See "Group
accounts" below.

## Where the consent text actually lives

`consent/request-cmc` `.request` field:

```yaml
request:
  title:        { en: "...", fr: "..." }    # localized text
  description:  { en: "...", fr: "..." }    # localized text
  consent:      { en: "...", fr: "..." }    # THE consent assertion shown to user
  permissions:  [{streamId, level}, ...]    # what's being granted
  features:     { chat, systemMessaging }   # each true unless set to false
  expiresAt:    <unix-seconds>
```

This event lives on the requester's own account. It records what was
*asked*. Pryv does not lock it: if the requester's app updates it, the
previous version is kept only on a deployment with
`versioning.forceKeepHistory: true` (off by default, see
`event-history.md`), so treat a sent request as write-once. The copy a
capability serves to accepters is server-stamped into the capability's
internal offer stream (`components/cmc/README.md`). Open-link invites may carry
`expiresAt: null` (no expiry); the link is then ended by
`consent/invalidate-link-cmc`, and the consent record of each participant is
unaffected by the link's lifetime.

Since open-pryv.io 2.0.0-rc.56 (https://github.com/pryv/open-pryv.io/issues/160)
the same event also withdraws a **single-use** invite nobody accepted yet: the
capability flips to `invalidated`, the `consent/request-cmc` trigger's
`content.status` becomes `invalidated` (with `invalidatedAt`, `reason`), and a
later accept fails with `cmc-capability-invalidated` `[CN100]`, `[IS13]`,
`[CMCIL-C]`. A withdrawal that races an accept wins: the accept is refused and
no relationship is left `[CN102]`. On an accepted single-use invite it stays a
no-op success `[CN101]`, `[CMCIL-C2]`; withdrawing an invite is not withdrawing
a consent already given (that is `consent/revoke-cmc`). The offer text stays
readable through a withdrawn link until it expires `[CN103]`, so give
sensitive invites a short `expiresAt`. Earlier releases accepted the event on a
single-use invite as a no-op, so a link sent to the wrong person stayed usable
until it expired.

On `accept-cmc`, the plugin transactionally:
1. Creates the bidirectional shared access pair (one access on each side).
2. Each access's `permissions` enforce the granted scope (technical control).
3. The access's `clientData` carries metadata about the relationship
   (counterparty identity, app code, originating request ref).

The access pair is the **durable contract**. The events are the **messages
that established it**.

## Relationship features: which channels the consent covers

Since open-pryv.io 2.0.0-rc.38 (merge `7aab1e85`, tag commit `37819f45`,
https://github.com/pryv/open-pryv.io/issues/149; code
`components/cmc/src/features.ts`, `handleAccept.ts`,
`handleIncomingAccept.ts`) a relationship's `features` (`chat`,
`systemMessaging`) are part of what the consent records and enforces, not a
client-side hint:

- **Your offer sets the ceiling; Pryv resolves it.** Each feature is granted unless
  the offer's `content.request.features` sets it to `false`; the accept's
  `content.features` may only narrow that (a `false` turns a feature off, a
  `true` against an offer that turned it off is ignored, no error)
  `[FE01]`..`[FE06]`, `[HA43]`, `[HA44]`, `[HA45]`. Each side resolves
  against its own copy of the offer, so a delivered accept claiming more than
  the requester offered is cut back on the requester's side `[IA18]`,
  `[IA19]`, `[IA21]`; an accept that does not arrive through the capability
  (posted on the inbox with a back-channel token) can only narrow the
  relationship the requester already holds, never widen it `[IA22]`,
  `[IA23]`, `[CN68]`. If the requester's copy of the offer cannot be read,
  the delivered value is used, which can still only narrow, and a warning is
  logged `[IA20]`. Malformed `features` on an accept are refused (`400`,
  `cmc-invalid-event-content`) `[VA04]`, `[VA05]`.
- **Recorded on both sides.** The resolved pair is stamped on the person's
  `consent/accept-cmc` trigger when it completes, on both relationship
  accesses (`clientData.cmc.features`) and on the requester's inbox mirror
  `[CD28]`, `[IA02F]`, `[HA01G]`; an `events.update` of the accept keeps the
  stored value `[APB16]`. Before rc.38 the value was taken from the accept as
  written, so an accept without `features` recorded `null` and an accepter
  could record chat against an offer that excluded it.
- **No channel the consent did not cover.** With `chat` resolved false,
  neither side gets a per-peer chat stream (`<scope>:chats:<peer>`) nor a chat
  permission on the relationship access; the `<scope>:chats` parent and the
  collectors stream still exist `[CN62]`, `[CN63]`, `[AN05]`, and an app
  writing a chat there gets `unknown-referenced-resource` `[CN66]`. Alerts
  still travel when `systemMessaging` is on `[CN64]`.
- **Inbound guard.** A counterparty writing `message/chat-cmc` directly with
  its relationship token (create, edit, or retyping another event to it) is
  refused with `403 forbidden`, `error.data.id: 'cmc-chat-disabled'`, when the
  relationship's `features.chat` is false; likewise `notification/alert-cmc`
  / `notification/ack-cmc` with `systemMessaging: false`
  (`cmc-system-messaging-disabled`). Scope requests and scope updates are
  never gated `[CH07]`..`[CH11]`, `[CN65]`.
- **Relationships accepted before rc.38 are not re-provisioned.** They keep
  their chat stream and chat permission; the inbound guard still refuses a
  counterparty's chat write when their recorded `features.chat` is false, and
  a relationship recording no features at all stays permissive `[CH09]`. An
  app deciding whether to offer chat must read `features` (on the accept
  event, or `listAcceptedRelationships` in `@pryv/cmc`), not the existence of
  the chat stream.

What this gives the implementer: the communication channels between the two
parties are bounded by what the person accepted, and recorded where the
consent is recorded. Whether to offer chat or system messaging in a given
offer (and what your consent text says about it) stays your decision.

## An account cannot consent to itself

Since open-pryv.io 2.0.0-rc.38 (merge `7aab1e85`,
https://github.com/pryv/open-pryv.io/issues/150) a `consent/accept-cmc`
whose offer was made by the accepting account itself (an open link opened
while signed in as the requester) fails with `failure.reason:
'cmc-self-accept-forbidden'` before any stream or access is created. The
check runs twice: the capability token is one of the account's own accesses
(checked before the offer is read), or the offer's requester identity is the
accepting account `[HA46]`, `[HA48]`, `[CN67]`; the same username on another
platform is another account `[HA47]`. Before rc.38 such an accept produced a
relationship of the account with itself. A self-relationship created earlier
is a single relationship access; deleting it with `accesses.delete` records
`content.withdrawal` on the accept event that created it and attempts no
delivery to a peer `[CN69]`, `[DH23]`; an ordinary relationship is not
mistaken for one `[DH24]`. The `@pryv/cmc` client
(3.19.0) exposes the id as `errorIds.SELF_ACCEPT_FORBIDDEN`.

## What the access carries (as consent record)

Per [`access-versioning.md`](./access-versioning.md), fully snapshotted on
every update, including `clientData`. So:

- `permissions` = legally enforced scope at each version
- `clientData` = relationship metadata (counterparty, app, originating
  `consent/request-cmc` event id, optionally a copy of the consent text
  shown, by convention)
- `serial` chain = full audit of scope changes

`accesses.update` via composite-id (per `access-versioning.md`) is what
`consent/scope-update-cmc` triggers under the hood, the access's history
chain mirrors the negotiation history.

## Same-account / non-cross-account consent

For single-platform deployments where consent is given by the user to the
operator's app (not to a third party), the same primitive applies but
simpler: the user creates an access for the app through the auth flow
(the `/auth` page of the account app, app-web-user-account);
clientData can carry the consent text shown; permissions encode the scope.
No `consent/*` events needed (the negotiation IS the local auth flow).

## OAuth2 authorization consent screen (delegated-app grants)

Since `open-pryv.io 2.0.0-rc.8` (`components/oauth2/`), a delegated app can
obtain access through a standards-based OAuth2 authorization-code + PKCE flow
whose consent step is a **granular consent screen**. `GET /oauth2/authorize`
requires `scope` to be exactly one `cmc:<offer-name>` reference, resolves the
client's registered consent offer, and hands the offer's per-permission set +
consent texts to the authorization UI inside a signed state parameter
(`components/oauth2/src/routes/authorize.ts`). The user can untick individual
permissions to downgrade the grant; on accept, the kept subset
(`grantedPermissions`) is validated ⊆ the signed offer and Pryv mints the app
access from it (`components/oauth2/src/routes/accept.ts`). The **durable
consent record is the same primitive as CMC**, a cross-account data-grant
access, versioned and revocable (revoking it collapses the app's refresh
chain), so demonstrability and withdrawability rest on the access + its
history exactly as for the flows above.

**Operator-registered (registry) clients, since open-pryv.io 2.0.0-rc.68.**
A client the operator registers with `bin/oauth-client.js create-registry`
reads its scope through an installed OAuth extension's grammar, not through a
`cmc:` offer. Its durable consent record is an app access named
`oauth-grant:<clientId>` on the user's own account (no counterparty account):
versioned and revocable like any access, holding the granted permissions and
the restrictions the owner sets. Whatever the grammar says, the core refuses
account and system streams, `*`, level `manage` and two permissions on one
stream, and forbids `webhooks`, `secretSharing` and (since rc.70)
`accessCreation` unless the operator allows them per client. A re-consent
shows what the app already holds and sets the grant to exactly what the user
ticks; a change of subject (username to pseudonym or back) must be
acknowledged. Withdrawal and narrowing reach the app at once: deleting the
grant deletes its live sessions and the accesses they created (rc.64), a
narrowed grant re-cuts every live session (rc.68) and the accesses sessions
created (rc.70). The session minted at consent is written by the system
(`createdBy: system`), so the consent is recorded by `oauth.consent.granted`
plus the grant's own create or update row, not by an `accesses.create` row.
A client identified by a client metadata document (rc.74, opt-in) gets its
reach from the operator's template, never from the document. The record
names the app: the grant and every session carry `clientData.oauth.client`,
`{ name?, origin: "operator" }` for a client the operator registered (since
rc.80; the registered name, never one from a request) and `{ name?, host,
url, origin: "metadata-document" }` for a metadata-document client (since
rc.74, `origin` since rc.80). The stamp is written by the server and refused
by `accesses.update`; a grant made before rc.80 gains it at its next consent,
its sessions at their next refresh. See `UPDATE-TRIGGERS.md` B.9 (walks of
2026-11-09 and 2026-11-12).

Evidence surface: OAuth2 authorization activity is in the audit trail since
open-pryv.io `07b6d3b6` (`oauth.*` events: consent shown / granted / refused
with a reason, code exchange, token issued / refreshed / revoked /
reuse-detected / exchanged, introspection; user-less events go to syslog).
*(Correction 2026-11-09: this note said the emission was a no-op stub; that
was true before `07b6d3b6`, July 2026.)* The access and its version history
remain the durable record; the audit trail shows who decided what, and when.

## Per-permission annotations on a consent request

Since 2026-09 an offer or request can state what each permission means to the
user, not only which permissions are wanted. Two display-layer annotations,
carried in the consent layer and stripped before an access is minted
(`components/business/src/accesses/permissionSet.ts`):

| Annotation | Meaning for the consent screen |
|---|---|
| `mandatory: true` | required: the entry is ticked and cannot be unticked |
| neither flag | optional, offered pre-selected (the user opts out) |
| `optIn: true` | optional, offered NOT pre-selected (the user opts in) |

`optIn` is the Recital 32-aligned choice for an optional permission where
consent is the lawful basis, since a pre-ticked box is not consent. The two
annotations cannot be combined on one entry. `optIn` never changes what may be
granted, only how the screen opens, so the grant rule (`checkConsentGrant`)
returns the same verdict with or without it.

⚑ **The same granularity now covers the ORIGINAL auth-request path**, which
previously had no consent layer at all and, more importantly, **no server-side
check**: the accept stored whatever token the authentication page posted. An
auth request may now carry a `consent` object, and when it does, the accept
(`components/api-server/src/routes/reg/consentCheck.ts`) reads the access that
was actually created and validates it against the offer with the same
`checkConsentGrant` the CMC and OAuth2 paths use. One rule, three call sites.
A check that cannot be performed (the user's core unreachable, storage down)
is refused with `503 consent-check-unavailable` rather than accepted, so an
unverifiable grant is never waved through. Requests without a `consent` object
keep their previous behaviour exactly, including the opaque-token contract.

**CMC consent invites inside the auth request** (open-pryv.io 2.0.0-rc.32,
`6496ffbb`). The same auth request may carry `cmcInvites`: 1 to 8 entries
`{ capabilityUrl, mandatory?, for? }` (`for: 'self'` by default, or
`'target'` for an account the user manages through delegation), validated at
creation (`400 invalid-parameters` otherwise), stored normalised and echoed on
the 201 answer and the NEED_SIGNIN poll `[RCI1]`, `[RCI2]`, `[RCI6]`. From
open-pryv.io 2.0.0-rc.36 (`1420fe72`,
https://github.com/pryv/open-pryv.io/issues/147) an entry may also carry
`accessName` (1 to 256 characters): the name of the data grant the person
mints by accepting that invite, so the requester chooses how the consent is
named among the person's accesses. It is stored as sent, echoed with its entry
only, and passed by the authentication page to the accept; the core never uses
it, and a request with a malformed one is refused before anything is stored
`[RCI10]`, `[RCI11]`. The
authentication page answers each invite on its own, never implied by
approving the app access: it decides, accepts the approved invites, then
grants the app access, and answers declined invites with
`consent/refuse-cmc`. A declined mandatory invite ends the request `REFUSED`
with `reasonId: 'REFUSED_MANDATORY_CONSENT'`; a mandatory invite that could
not be accepted, with `reasonId: 'MANDATORY_CONSENT_FAILED'` (the reference
account app, app-web-user-account 0.11.0, tests `[ACI2]`, `[ACI14]`). With
`ACCEPTED` the page posts one outcome per invite under `cmcInvites`; the core
checks number and shape before any write, refuses them on any other status or
on a request that carried no invites, stores them as `cmcInviteOutcomes`
(never read from the posted body, so a poster cannot write the stored field
directly) and serves them back as `cmcInvites` in every ACCEPTED answer
`[RCI3]`, `[RCI4]`, `[RCI5]`, `[RCI7]`, `[RCI8]`, `[RCI9]`. The outcomes are a
hint: the consent record is the accept event (and the requester's own inbox),
exactly as for an invite accepted on its own page, and `mandatory` is enforced
by the authentication page, not re-checked by the core. The capability URLs
stay in the request, which lives in the core's memory only (at most one hour)
and is readable by the poll-key holder, as the rest of the request is.

## Gates on access-state-mutating consent triggers

CMC's access-state-mutating lifecycle triggers are gated server-side. Two
distinct gate shapes, chosen per trigger by what's at stake:

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
  access on the user's account from a colluding requester's offer, without
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
    pages, matching the natural access-management model;
  - app tokens that created the target can revoke it;
  - anything else fails with
    `error.data.id === 'cmc-revoke-forbidden'`.

  Revoke is a contraction, not an escalation, the access being deleted
  bounds the impact, so user-presence at the moment of revocation is not
  needed for the security property to hold. Operators who set
  `selfRevoke: forbidden` on counterparty accesses at mint time keep the
  explicit deny path; the existing feature-permission contract carries
  over unchanged.

- **Tokens obtained through account delegation: accept allowed with
  lineage, request and scope-update refused.** A delegate token is
  `personal`-class, so it passes the personal-token gate on
  `consent/accept-cmc`. Since open-pryv.io 2.0.0-rc.30 (`9ba9c78c`) that
  accept is no longer refused: the data grant it mints records the
  delegation lineage (`clientData.delegation = { kind: 'delegated-child',
  relId, delegate, viaAccessId }`, taken from the authenticated token,
  reported by `access-info`) `[DCH15]`, and the accept event carries
  `content.approvedBy = { delegate: { username, hostSlug }, relId }`,
  stamped by the server (a client-supplied value is dropped on create, an
  update keeps the stored one; an owner's accept has none) `[DCH16]`. The
  grant ends with the delegation: detach deletes it and the requester
  receives `consent/revoke-cmc` `[DCH18]`, unless the account holder keeps
  it in the detach review (open-pryv.io 2.0.0-rc.31, see
  `context/delegation-model.md`). Since rc.31 the same server-owned rule
  covers the two markers that review writes on the accept event,
  `ownerConfirmedAt` and `withdrawal`: by any token, dropped on create,
  kept as stored on update, never added by an update `[DCH24]`,
  `[APB08]`..`[APB12]`; `withdrawal` is now also written on the other
  teardown paths (see the Art.7 withdrawability paragraph below) and is
  protected the same way `[CN58]`. An app or shared access the delegate
  granted is still refused on accept by the personal-token gate above.
  Writing `consent/scope-update-cmc` or `consent/request-cmc` (publishing
  an offer, whose capability and back-channel accesses are written outside
  the lineage-stamping path) is still refused to a delegate token and to
  any access granted through a delegation: `400 invalid-operation` +
  `error.data.id === 'delegation-grant-requires-owner'`, before the content
  is validated `[DCH14]`, `[DCH17]`, `[DDG01-03]`. The same rule refuses
  OAuth2 consent (`POST /oauth2/authorize/accept` answers `403
  access_denied`) `[OE27]`. Only the account holder, signed in genuinely,
  publishes offers, widens grants and gives OAuth2 consent; revoke is not
  affected.

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
is consenting to. **Revoke needs no hand-off**, the access-permission
gate accepts the relationship's own data-grant access directly.

## Who can read the grants an account received (trust boundary, shipped)

When a person accepts your invite, the requester's account records the
accept in its `:_cmc:inbox` stream, and that record keeps the endpoint
of the data grant (`content.grantedAccess.apiEndpoint`, token included)
on purpose: it is how a requester app (`waitForAccept` in `@pryv/cmc`)
opens its connection to the person's data. So an access holding `read`
on `:_cmc:inbox` holds the token of every data grant the account has
received. Grant that permission only to apps you would trust with all
of them; a narrow `:_cmc:apps:<app>` permission does not reach the
inbox. (`components/cmc/src/handleIncomingAccept.ts` inbox mirror,
`credentialStashHook.ts`, which scrubs other credentials but
deliberately leaves this one.)

Since open-pryv.io 2.0.0-rc.53 an offer cannot ask for that inbox: a
`consent/request-cmc` whose `request.permissions` names the accepter's
`:_cmc:inbox`, the `:_cmc:_internal` subtree, a chats or collectors
stream or the `:_cmc:apps` root is refused at write
(`cmc-invalid-event-content`) and again by the accepter's core at
accept (`cmc-offer-stream-not-offerable`) `[CN71]`, `[MB35]`, `[VC09]`.
`*` and the accepter's own `:_cmc:apps:<app>[:<path>]` streams stay
offerable; `*` never reaches the inbox nor the internal subtree.

## Plugin-managed regions are closed by every spelling of an id (2.0.0-rc.56)

The plugin-managed regions of the `:_cmc:` namespace (`:_cmc:` itself,
`:_cmc:inbox`, the `:_cmc:_internal` subtree, the plugin-owned `chats` /
`collectors` segments) are closed to user writes for every token, the owner's
personal token included. Since open-pryv.io 2.0.0-rc.56:

- every guard judges the stream an id resolves to: the store-prefixed form
  (`:local:<id>`, which addresses the same stream as `<id>`) is canonicalised
  before the reserved and internal write / read guards, the reserved-parent
  check, the member-access permission check and the scope-update partition
  `[CNRP7]`, `[CNM2A]`, `[CNM2C]`;
- a `streams.create` or a move whose parent is inside a plugin-managed region
  is refused (`400 invalid-operation`, `cmc-reserved-stream`), a
  plugin-managed stream cannot be moved or trashed, while `:_cmc:apps` and the
  user-created streams under it keep taking children `[CNRP1]` to `[CNRP5]`,
  `[CRPP1]`, `[CRPP2]`, `[CSU02]`;
- the retry worker dispatches only records the server wrote (author, stream
  and type checked); any other record found in the retry stream is retired
  `failed-permanent` (`cmc-retry-foreign-record`) without being run
  `[RQ32]`, `[CNM2B]`, and a retried accept the server authored is refused
  (`cmc-retry-system-authored`) `[RQ30]`, `[RQ31]`.

Before rc.56 a store-prefixed spelling was not recognised by these guards and
the parent of a new or moved stream was not checked, so the closure held only
for requests using canonical ids. The same canonicalisation covers the account
fields (see the `gdpr.Art.32` access-control bullet) and the `:_delegation:*`
namespace (`context/delegation-model.md`).

## Calls to a counterparty: destination guard (2.0.0-rc.56)

Consent deliveries, chat, revocations, scope updates, the capability read of
an accept, delegation notices and OAuth revocation notices go to URLs the other
side supplies. Since open-pryv.io 2.0.0-rc.56 such a call is refused, before
any connection, when the host is or resolves to a loopback, private,
link-local or otherwise reserved address (the address rules of webhooks,
checked again at connect time), when it uses `http:` (unless
`cluster.allowInsecurePeerUrl`) or carries credentials, and when the answer is
a redirect or larger than 1 MiB `[PFR1]`..`[PFR7]`, `[CO22]`. The platform's
own host names (the host of `core.url`, `dns.domain` and below, the
`service.api` host) are always allowed, never an IP literal by that rule
`[PFR8]`; private peers, and a private `core.url` literal, are listed in
`cmc.allowedPrivateHosts` (host names, IPs or CIDR ranges, the grammar of
`webhooks.allowedPrivateHosts`; unusable entries reported at boot) `[PFR3]`,
`[PFR9]`.

A refused delivery is permanent and never queued: the trigger reports
`cmc-handler-destination-refused` (or `cmc-capability-destination-refused`
when an accept's offer read is refused), and an accept whose delivery is
refused removes the data grant it had created, as for a rejected one
`[CO20]`, `[CO21]`, `[CO23]`, `[HA08b]`, `[HA08c]`, `[HC13]`, `[HR41]`,
`[RQ33]`, `[HMA16b]`, `[MR44b]`. Consequence for the withdrawal claims: a
revoke notice to a refused destination is not re-sent by the retry loop (see
"Delivery of the notification" below). Code:
`open-pryv.io/components/business/src/outbound/peerFetch.ts`.

## Group accounts: members acting under a patient's grant

Shipped in open-pryv.io 2.0.0-rc.53 (release commit `61fb28dd`);
tracked at https://github.com/pryv/open-pryv.io/issues/158. The
workforce side (membership, mint, sweep, trust model, versions) is
described in
[`workforce-access-patterns.md`](./workforce-access-patterns.md),
Pattern 3. What it means for the consent record:

- **The patient consents to the group, and the grant is delegable.**
  The invite sets `request.accessType: 'app'` (since open-pryv.io
  2.0.0-rc.9), so members of the group can each be given a
  short-lived access derived from the patient's grant. The reference
  account app's consent page says so in one line when an offer is
  delegable, from its first release after 0.21.0
  (app-web-user-account); a deployment with its own consent UI writes
  that notice itself. The patient's record stays the accept event and
  the grant, as for any CMC consent.
- **Each member access is visible on the patient's account.** It is a
  child of the grant (`createdBy` = the grant), named by the server,
  and its `clientData.cmc` names the member and the group: the
  group's core sends only the member, and the patient's core adds the
  group, the grant id, the scope and the app code from the
  authenticated grant `[GA10]`, `[MB10]`. No client can write any
  other `clientData.cmc` on an access (`cmc-member-stamp-invalid`,
  `cmc-clientdata-cmc-forbidden`), and no update can remove it
  (since 2.0.0-rc.53 `clientData: null` or a `cmc` key in an update
  is refused) `[MB11]`..`[MB13]`. Every call it makes is audited
  under its own id.
- **Withdrawal ends the member accesses.** A patient who withdraws, on
  any teardown path (`accesses.delete`, `consent/revoke-cmc`, the
  reference account app, the group's revoke), removes the grant and
  every access derived from it (the cascade of 2.0.0-rc.52, which the
  patient's core needs) `[GA24]`.
- **Membership is itself a consent relationship**, between the
  member's account (requester, `request.membership: true`) and the
  group's account (accepter, by the owner's or an administrator
  delegate's token; a delegate cannot approve their own membership).
  The membership access never carries a feature permission, is never
  delegable and never reaches the group's `:_cmc:inbox`, which the
  server enforces at write and at accept
  (`cmc-membership-permissions-invalid`) `[GA02]`, `[MB31]`. It
  records who approved it and what was asked
  (`clientData.cmc.membership = { approvedBy, requestedScopes }`)
  `[GA01]`, `[MB32]`.
- **Gate.** `consent/member-access-cmc` may be written through a
  membership access only (the group's personal and delegate tokens
  are refused too, `cmc-member-access-not-member`); the minted
  permissions must name data streams within the patient's offer, and
  the patient's core re-checks them against the grant `[GA12]`,
  `[GA15]`. A membership access is not exempt from the personal-token
  gate: it cannot accept patient invites nor widen grants on the
  group's behalf `[GA01]`. A membership a delegate approved is not a
  delegate token for the patient invites the member publishes
  `[DDG04]`.
- **The group's records are the owner's.** An app or shared access, a
  membership included, cannot update or delete a
  `consent/member-access-cmc` or `consent/member-revoke-cmc` event,
  nor delete an inbox or internal event (`cmc-protected-event-write`)
  `[GA42]`, `[CHD1]`.

On a core older than 2.0.0-rc.53, a requester that wants per-member
accesses on a patient account derives them from a delegable grant in
its own backend (workforce Pattern 2 across accounts); since
2.0.0-rc.52 every withdrawal path deletes those derived accesses with
the grant.

## Consequences for compliance claims (consent-related)

- **GDPR Art.7 (Conditions for consent, demonstrability + withdrawability)**
  - Demonstrability: `accesses.get` (with `includeHistory=true`) returns the
    full version chain; the original `consent/request-cmc` event preserves
    what was asked.
  - **User-presence at the moment of consent**: the personal-token gate on
    `consent/accept-cmc` proves the user was signed in when the trigger was
    written, not merely that an app authorized for stream-write performed
    the write. This strengthens the demonstrability claim: the access pair
    + history chain is backed by an auditable user-authentication event.
  - **Two distinct parties, and what the consent covers**: since
    open-pryv.io 2.0.0-rc.38 an account cannot accept its own offer
    (`cmc-self-accept-forbidden`, see "An account cannot consent to itself"
    above), and the accept event records the channels the relationship
    actually got (`features`, resolved from the offer, narrow-only, see
    "Relationship features" above).
  - Withdrawability: `accesses.delete` (full revoke) or `accesses.update`
    (scope-down), both versioned when called through the API route (the
    delete marks the access deleted and keeps it, the update snapshots the
    previous version). For cross-account: `consent/revoke-cmc`
    event triggers the access revocation transactionally on both sides.
    **Record shape of the CMC teardown paths:** since open-pryv.io
    2.0.0-rc.53 every CMC and delegation teardown (a `consent/revoke-cmc`
    revoke by either side, a revocation received from the counterparty,
    an accept rolled back by the CMC handler, a delegation detach, the
    teardown at account deletion, a capability collected, a member
    sweep) is the `accesses.delete` deletion
    (`components/api-server/src/methods/helpers/accessDeletion.ts`):
    the access is marked deleted and listed with `includeDeletions`
    (name kept, never the token), its webhooks are deleted, its alias
    released, the breach-scope index tombstoned, and the accesses it
    manages deleted in the same pass `[GA22]`, `[GA30]`; a re-accept
    mints a fresh access. The URL credentials a relationship access
    kept in `clientData` are removed from its deletion record and
    history rows (`[CMCHS-GUARD]` in
    `components/api-server/test/cmc-handshake.test.js`). Before
    2.0.0-rc.53 these paths
    removed the data grant outright (the access row removed, not
    marked deleted), so the access itself no longer showed the
    withdrawal and no version chain demonstrated it. For withdrawals
    made then the demonstrable record is the `consent/*`
    events: the accept event on the subject's account (with
    `dataGrantAccessId`, and `approvedBy` when a delegate gave the consent)
    and the `consent/request-cmc` event on the requester's account, the
    `consent/revoke-cmc` event where one was written or received, and the
    audit trail (for a detach, the audit row of
    `delegations.detachDelegate`).
    **The withdrawal on the person's own accept event.** Since open-pryv.io
    2.0.0-rc.31 (`b77320df`) a consent ended by a detach carries its end on
    the accept event itself: `content.withdrawal = { at, by:
    'delegation-detach', relId }` `[DCH22]`, `[DDK07]`. Since
    open-pryv.io 2.0.0-rc.36 (`1420fe72`,
    https://github.com/pryv/open-pryv.io/issues/146) every
    other teardown path records it too: the `consent/accept-cmc` event in
    the person's `:_cmc:apps:<app>` scope carries `content.withdrawal = {
    at, by, accessId, revokeEventId? }` (`at` in seconds), with `by:
    'accesses.delete'` when the data grant is deleted through the API
    `[CN58]`, `[DH16]`, `'revoke-cmc'` when the person writes a
    `consent/revoke-cmc` (`revokeEventId` is that trigger) `[CN59]`,
    `[HR32]`, and `'peer-revoke'` when the requester withdraws
    (`revokeEventId` is the revocation's arrival in the person's inbox)
    `[CN60]`. The marker sits on the person's side (the one who accepted);
    the requester's record stays its request event and the revocation it
    wrote or received. It is written only once the grant is actually gone,
    never overwritten once set (the first teardown to record it wins), and
    written as an ordinary event update (no history-skipping), so on a
    deployment with `versioning.forceKeepHistory: true` the accept event's
    history keeps the version before it ended (`events.getOne` with
    `includeHistory=true`); without that setting an event update keeps no
    history, and the audit trail is the record of when the consent was
    given. After `accesses.delete` it lands
    shortly after the delete answers, and the person's socket clients are
    notified when it does. Recording it is best-effort: a teardown never
    fails because the marker could not be written, so where a marker is
    missing the events and audit trail above remain the record. A
    `consent/revoke-cmc` whose delete of the relationship access (on the
    person's side, the data grant) fails no longer reads completed: the trigger ends `failed`
    (`cmc-revoke-delete-failed`, naming the accesses still in place) and
    is retried without delivering the revocation again to a peer the
    first attempt reached, and nothing is recorded as withdrawn until the
    delete succeeds `[HR34]`, `[CD26]`. Apps listing a person's consents
    should treat an accept event carrying `withdrawal` as ended: the
    `@pryv/cmc` client's `listAcceptedRelationships` leaves those out by
    default since 3.18.0 (`includeWithdrawn:
    true` lists them), and against a core without the marker an ended
    relationship still looks active there. A consent the
    account holder keeps at detach (`keepAccessIds`, nothing kept by
    default, refused whole with `delegation-invalid-keep-list` when an id
    is not a consent this delegation gave `[DCH23]`) is not withdrawn: its
    grant loses the delegation lineage and its accept event records
    `content.ownerConfirmedAt` `[DCH21]`. `approvedBy`,
    `ownerConfirmedAt` and `withdrawal` are server-owned: no token can
    write, change or erase them through the API `[DCH24]`,
    `[APB08]`..`[APB12]`, `[CN58]`.
    **Server-written fields survive a concurrent client update** (since
    open-pryv.io 2.0.0-rc.38, merge `461f3c4c`). Before, a field the server
    wrote on an event (the withdrawal marker, the owner's confirmation, a
    CMC dispatch status) could be lost when a client updated or trashed the
    same event at that moment, because the client's write was built from the
    copy it had read just before. `events.update`, `events.delete` (trash;
    an event in the shared-secrets namespace is trashed by compare-and-set
    instead, and is never a consent record) and `events.deleteAttachment`
    now apply the client's change onto the
    event as stored at write time: the fields the request changes win, a
    field sent back with the value the request read does not overwrite a
    newer stored value, and `clientData` keys merge onto the stored map
    `[ESR1]`..`[ESR8]`. The built-in PostgreSQL and SQLite stores do this
    read-merge-write atomically (a `SELECT ... FOR UPDATE` row lock on
    PostgreSQL; an immediate transaction on SQLite, whose lock-wait is
    tested `[UEA1]`..`[UEA3]`); a custom data store that does not implement it gets a
    read then an update, which narrows the window without closing it. The
    merge is per top-level field: a client that sends `content` replaces
    the content as a whole, except the server-owned fields below. On every
    CMC event type `content.status` and `content.failure` are now
    server-owned too (an update keeps the stored values and ignores
    client-sent ones), as are the resolved `features` on an accept, and an
    update sending non-object content on a CMC event is refused
    `[APB13]`..`[APB16]`. So a withdrawal stamped while the person's app is
    editing the accept event stays recorded, and a client cannot reset a
    dispatch outcome to make a failed delivery read completed.
    Revoke is access-permission-gated (`AccessLogic.canDeleteAccess`,
    honours `selfRevoke`), so the relationship's own data-grant access
    can self-revoke without an auth-page bounce, preserving the
    practical withdrawability guarantee while keeping the security
    property (the access being deleted bounds the impact).
  - **Coverage: `implemented`** for cross-account flows; **`implemented`**
    for same-account flows.

- **GDPR Art.30 (Records of processing)**: the access pair + its history
  + the originating `consent/request-cmc` event jointly IS the per-purpose
  processing record. Coverage: `implemented` (where CMC is in use) or
  `facilitated` (where implementer must carry consent text in clientData
  themselves).

- **GDPR Art.7(3) (Right to withdraw)**: `implemented` via
  `accesses.delete` + (cross-account) `consent/revoke-cmc`; CMC bidirectionality
  ensures the counterparty is notified. Since open-pryv.io
  2.0.0-rc.36 (`1420fe72`), the person's own accept
  event records each withdrawal, whichever party and path ended it
  (`content.withdrawal`, see the Art.7 withdrawability paragraph above)
  `[CN58]`, `[CN59]`, `[CN60]`, and a revoke whose local delete failed is
  retried instead of reading completed `[HR34]`.

  **Shipped in `open-pryv.io` 2.0.0-rc.20** (deployed 2026-09-16 to all three
  cores; client helpers in `@pryv/cmc` 3.13.0). Verified live on a deployed core:
  the withdrawing party's own grant answers 200 before the revocation and 403
  after it.

  **Scope of the enforcement, verified 2026-09-15.** A relationship is carried by
  two accesses, one on each account, each holding the other party's token. Both
  are now destroyed on a withdrawal, each by the server that hosts it: the
  withdrawing side deletes the access the peer was using against it, and the
  receiving side deletes the access the revoke arrived through when the
  `consent/revoke-cmc` lands (`handleIncomingRevoke`). Until that receiving-side
  teardown shipped, only the local half was enforced, so a party that withdrew
  kept a working token on the counterparty's account until their own app deleted
  it; the documentation instructed integrators to do so. The subject-withdrawal
  direction (the data subject withdraws, the requester loses read) was enforced
  throughout, since that is the local half on the subject's own account.

  **Delivery of the notification** (open-pryv.io 2.0.0-rc.53,
  https://github.com/pryv/open-pryv.io/issues/157). A revoke notice the
  counterparty could not take after the in-request attempts (network error,
  timeout, 5xx) is queued, endpoint and body, in the account's hidden retry
  stream and re-sent by the retry loop after 1, 5 and 25 minutes, about 2
  hours, then every 6 hours: eight re-sends over about 27 hours, then marked
  `failed-permanent` for the operator (the record keeps the host, never the
  token); the trigger reports `content.deliveryQueued: true` `[HR25]`,
  `[DH25]`, `[RQ20]`..`[RQ23]`. A raw `accesses.delete` of a relationship
  access and a delegation detach queue their notices the same way. A 4xx is
  the peer's answer and is not retried `[RQ24]`. A notice that lands after the
  parties re-established the relationship under the same scope tears nothing
  down: it names the accept it ends (`content.acceptEventId`, `revokedAt`) and
  is marked `content.superseded` on arrival `[CIR26]`, `[CIR27]`.
  Residual: the notices sent while an account is being deleted are not queued
  (no account is left to hold them), and nothing is queued while
  `cmc.retryLoop.enabled` is `false` `[HR26]`, `[DH26]`, nor, since
  open-pryv.io 2.0.0-rc.56, a notice to a destination the outbound guard
  refuses (marked failed at once, `[HR41]`, `[RQ33]`; see "Calls to a
  counterparty" above). A notice that never
  reaches the peer means the peer never runs its teardown, so the withdrawing
  party's access on that account outlives the relationship until it expires or
  is deleted there. The withdrawal is complete and effective on the withdrawing
  account regardless, which is where the subject's data lives in the
  subject-withdrawal case.

- **HIPAA-Privacy §164.508 (Authorizations)**: same primitive maps;
  authorization is an access with the appropriate scope; revocation is
  symmetric.

- **GDPR Art.26 (Joint controllers), does NOT apply to CMC by
  default** (Q18 finding, 2026-05-20). CMC requires subject
  validation: User A's `consent/accept-cmc` event is what
  authorises any cross-account flow to User B's operator. Each
  operator remains the SOLE controller for their respective
  user's data; the lawful basis for B's operator processing A's
  data is A's CMC consent record (Art.6(1)(a)), not a
  controller-to-controller agreement. This is controller-to-
  controller transmission *via subject consent* (Art.20(2)
  lineage). Real Art.26 only fires when two operators decide on
  joint processing independently of subject choices, outside
  the CMC primitive.

## Distinction the matrix must surface

- **Primary record**: the access (permissions, clientData, version chain).
- **Negotiation audit**: the `consent/*` events on the requester + accepter
  accounts.
- **Implementer requirement**: when using CMC, the implementer's app is
  responsible for writing the `consent/request-cmc` event with the full
  consent text in `.request.consent`. When NOT using CMC, the implementer
  must carry the consent text in `clientData` themselves (or in a custom
  event-type), the matrix's `documented` / `facilitated` distinction
  depends on which path they take.

## Code references (current master)

- `components/cmc/README.md`: canonical design document. CMC plugin is on
  master in `2.0.0-pre.3`.
- `components/cmc/IMPLEMENTERS-GUIDE.md`: customer-facing wire shape.
- `components/cmc/INTERNALS.md`: plugin-side flow diagrams.
- `components/cmc/src/accessesUpdateHook.ts`: post-hook that fires when
  `accesses.update` runs (links scope changes to outbound notification).
- `components/cmc/src/features.ts`: resolution of a relationship's
  `features` from the offer (narrow-only); `hooks.ts`
  `createCounterpartyFeatureGateHook`: the inbound chat / system-messaging
  guard.
- `components/cmc/src/acceptServerOwnedFieldsHook.ts`: server-owned content
  fields (`approvedBy`, `ownerConfirmedAt`, `withdrawal`, the resolved
  `features` on an accept; `status`, `failure` on every CMC type);
  `components/api-server/src/methods/events.ts` `mergeOntoStored`: the
  write-time merge of a client update onto the stored event.
- `components/cmc/src/handleMemberAccess.ts`, `memberAccessHooks.ts`,
  `memberMintRegistry.ts`, `memberLedger.ts` (the member access mint and
  its ledger), `memberSweep.ts`, `handleMemberRevoke.ts` (offboarding),
  `retryQueue.ts`, `bootRetryLoop.ts` (the retry loop: trigger retries,
  revoke-notice re-sends, the periodic ledger pass).
- `components/cmc/src/constants.ts` `canonicalLocalStreamId` and
  `components/mall/src/helpers/storeDataUtils.ts` `canonicalStreamId` (the
  canonical spelling every guard compares, 2.0.0-rc.56);
  `components/business/src/outbound/peerFetch.ts` (the counterparty
  destination guard, 2.0.0-rc.56).
- `data-types/src/consent.json`: the 10 `consent/*` formats (catalogue
  1.3.0).
- `data-types/dist/event-types.json`: built artefact consumed at runtime
  via `service.eventTypes` config.

## Reviewer follow-ups

- Find + cite CMC test codes (`components/cmc/test/`).
- Verify CMC plugin loading mechanism: is it shipped enabled by default in
  `2.0.0-pre.3`, or is operator-opt-in required?
- Confirm `clientData` convention for non-CMC consent capture, is there a
  documented schema, or is it implementer-defined?
