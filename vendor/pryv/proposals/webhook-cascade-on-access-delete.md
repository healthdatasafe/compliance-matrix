# Proposal: webhook cascade on access delete

**Status: SHIPPED 2026-05-27** on `pryv/open-pryv.io` master at [`e009ac9`](https://github.com/pryv/open-pryv.io/commit/e009ac9) (Plan 72 Phase B). `accesses.delete` now cascades to `webhooksRepository.deleteByAccess` for the app access + all descendant shared accesses; `Webhook.send()` fire-time check self-deactivates orphan webhooks; `[WCAD]` 3 + `[WCAD-FIRE]` 3 tests pin the behaviour. Discharges 3 bug chips on `hipaa-security.164.308(a)(3)(ii)(C)`, `iso-27001.A.5.16`, `iso-27001.A.5.18`. GH#82 closed. macroPryv backlog file archived to `_plans/_archives/77-webhook-cascade-on-access-delete-done.md`.

---

**(historical proposal preserved below)**

**Status (when open):** **bug fix queued.** Small dev. Mirror of the upstream
backlog item (filed 2026-05-20 from the gap-probing session —
Q13 on webhook subscription lifecycle).

## Today's posture

`accesses.delete` does NOT cascade to webhooks created by that
access. Webhook rows survive with a dangling `accessId` reference
and **keep firing** on matching events until the responder
manually walks `webhooks.get` + `webhooks.delete`.

Code-verified:
- `deleteAccesses` in `components/api-server/src/methods/
  accesses.ts:723-738` clears cache + deletes from access
  storage; no webhook cleanup.
- `components/business/src/webhooks/repository.ts` ships
  `deleteOne` + `deleteForUser` but no `deleteByAccess`.
- `Webhook.send()` at `components/business/src/webhooks/
  Webhook.ts:106` has no fire-time access-validity check.

## Bounded by Q7's signal-only design

A dangling webhook continues POSTing to its target URL but the
recipient can't fetch the data (their access token is now
invalid; 401 on the GET back). So the data exposure is limited
to **leaking the existence of a change**. The target URL itself
remains an active outbound channel — non-zero severity in a
breach scenario where the original webhook URL was attacker-
controlled.

Sanity-check counter-path: full user-account erasure
(`auth.delete`) **does** delete webhooks via
`storageLayer.webhooks.removeAll` in
`components/business/src/auth/deletion.ts:113-119`. Only the
narrower `accesses.delete` path is the gap.

## Direction when shipped

Three small additions:

1. **Repository**: add `deleteByAccess(user, accessId)` next to
   the existing `deleteOne` / `deleteForUser`.
2. **`deleteAccesses` middleware**: walk `idsToDelete` and call
   `webhooksRepository.deleteByAccess(user, accessId)` for each
   — **before** the access-storage delete, so partial failure
   leaves a retryable state rather than orphaned webhooks.
3. **Belt-and-braces fire-time check**: `Webhook.send()` looks
   up the parent access via `cache.getAccessLogicForId`; on
   miss + storage miss, mark `state = 'inactive'` + persist.
   Self-heals any future dangling-webhook situation, not just
   access-revoke.

## Affected matrix rows (today's framing → after shipping)

| Scope | Row | Today | After shipping |
|---|---|---|---|
| hipaa-security | 164.308(a)(3)(ii)(C) | F: Primitive \| Med | unchanged tier; "termination procedures" story tightens |
| iso-27001 | A.5.16 Identity management | F: Primitive \| Med | unchanged tier; dangling-webhook gap closes |
| iso-27001 | A.5.18 Access rights | F: Primitive \| Med | same |
| gdpr | Art.18 Right to restriction | Configurable \| Medium | same |

Rows tagged with `planned: kind: bug` chips pointing at this
proposal.

## Related

- Upstream backlog:
  `_plans/XXX-Backlog/WEBHOOK-CASCADE-ON-ACCESS-DELETE.md`
- Q7 context: `context/webhooks-signal-only.md` (the
  signal-only design bounds the breach impact today).
- Q13 entry in `docs/implementer-faq.md`.
- Sibling bug-class: `proposals/audit-on-user-delete.md` —
  same family of incomplete-cascade-on-delete defects.
