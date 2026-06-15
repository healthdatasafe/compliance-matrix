# Webhooks — signal-only by design

A note on Pryv's webhook semantics, recorded during the
implementer-perspective gap-probing session (Q7, 2026-05-19) because
the design choice is non-obvious + has substantive security
implications worth surfacing.

## The design

Pryv's `webhooks.*` API methods let an access subscribe to a
notification URL. When something changes for the subscribing
access — new event, modified stream, access mutation, etc. — Pryv
POSTs a small notification to the URL.

**The notification body does not contain the changed data.** It
contains the equivalent of a signal: "something changed for the
access you subscribed for; come fetch via authenticated GET if you
want the new state".

To consume the change, the receiver makes an authenticated GET
back to Pryv using the access token it already holds — exercising
the same `events.get` / `streams.get` paths a polling client would
use.

## Why this design

The implementer would expect — based on Stripe / GitHub / Slack
webhook conventions — that Pryv would POST the event payload to
the receiver, with HMAC-SHA256 signing + delivery id + replay-
window timestamping to make the push surface tamper-resistant
and replay-resistant.

Pryv took the opposite design choice: keep the data behind the
authenticated GET, use webhooks only as a wake-up signal. This
sidesteps almost all of the security questions that wrap classic
push-with-content webhooks:

| Concern with push-with-content | Pryv signal-only consequence |
|---|---|
| HMAC signing of body so receiver can authenticate the sender | Not required: no sensitive content in the body to authenticate. Forged signal → at worst an extra authenticated GET that returns the same data. |
| Per-delivery nonce + replay window | Not required for data integrity: replayed signal → idempotent GET. Receiver de-dupes by event state. |
| Token leakage in webhook body | Impossible by construction: tokens stay with the receiver, not in the wire payload. |
| Body-content tampering by attacker proxy | No sensitive content to tamper with. |
| Receiver-side body validation logic complexity | Eliminated: receiver code path is the same authenticated GET it uses for everything else. |

The authentication surface stays on the **read path** (the one
already secured by access + permissions + audit), instead of being
duplicated on a new **push path** (where it's a known to be
implemented wrong in the wild).

## What still matters operationally

The signal-only design does not eliminate every webhook concern.
The following still apply:

- **TLS on delivery.** Pryv should POST only to HTTPS URLs (or
  explicitly opt-out for local dev). Leaking the *existence* of a
  change can be a low-grade information leak (an oracle for change
  detection on a private account).
- **Delivery retries + back-off.** Best-effort delivery is fine
  for a wake-up signal, but the receiver should know when delivery
  is consistently failing so it can switch to polling fallback.
  Pryv's webhook lifecycle includes failure counters + a state
  flag the receiver / operator can monitor.
- **Receiver poison-pill protection.** A malicious receiver could
  return slow / hanging responses to consume Pryv worker
  resources. Standard fetch timeouts + per-receiver concurrency
  caps mitigate. This is an operator concern; Pryv-side defaults
  should be sane.
- **GET-side authentication.** The receiver's GET back to Pryv
  uses the access token + permission chain — the same path used
  for any other read. All the GDPR Art.15 / §164.524 / §1798.100
  protections apply.

## Matrix rows that benefit from this framing

| Scope | Row | Why this matters |
|---|---|---|
| gdpr | Art.32 security of processing | webhooks are part of the transmission surface; signal-only design narrows the attack surface |
| hipaa-security | 164.312(e)(1) transmission security | TLS-only delivery + no PHI in webhook body |
| hipaa-security | 164.312(e)(2)(i) integrity controls | webhook bodies carry no PHI to require integrity |
| hipaa-security | 164.312(e)(2)(ii) encryption | webhook bodies carry no ePHI; encryption requirement narrowed |
| iso-27001 | A.8.20 networks security | signal-only narrows the cross-network data surface |
| iso-27001 | A.8.21 network services security | same |
| pipeda | Principle.4.7 safeguards | transmission-surface narrowing for the multi-aspect safeguards row |

These rows should reference this note when an implementer is
likely to ask the webhook-security question explicitly.

## Sample reasoning for an implementer evaluating Pryv

If your receiver application logs everything it gets posted to it
(common in dev / observability setups), the worst case under
signal-only webhooks is **logging the fact that a change happened**
plus the access id that subscribed. No PHI / PII goes through the
log path; no tokens go through the log path. Logging hygiene
expectations on the receiver shrink accordingly.

Under push-with-content webhooks the receiver's log would have
captured the full event payload — a real data-leak surface that
needs the receiver to discriminate "log this header / don't log
this body" carefully.

## Related primitives

- `webhooks` — see `docs/pryv-primitives.md`.
- `access` — the GET path the receiver uses to fetch the changed
  data.
- `permissions` — scope the receiver's GET to only what the access
  token allows.
- `audit` — both the signal-send + the receiver's GET show up in
  the audit log (the latter under the receiver's access id).
