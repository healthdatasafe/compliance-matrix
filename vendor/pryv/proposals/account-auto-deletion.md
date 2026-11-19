# Account auto-deletion: at a date, or after a period without use, with reminders

**Status: deletion shipped in open-pryv.io 2.0.0-rc.66 (`8521c8d5`), 2026-10-30; transfer
planned.** Merged to open-pryv.io master as `8521c8d5` on 2026-10-29 (feature commits
`926dad8a` login records `lastUsed`, `1e138706` activity breakdown and delegate use, `81c8a9c6`
config block and per-account state, `d12b4c89` schedule engine, `ad8f4894` API +
`features.autoDeletion` + confirmation mail, `7c3497a0` the sweep, reminder and blocked mails,
guarded erasure), released in 2.0.0-rc.66 (release commit `18c60698`). Operator page:
`customer-resources/account-auto-deletion` (dev-site2). The 14 deletion chips were discharged
and the rows rewritten on 2026-10-30, the Art.32 chip narrowed to its transfer half; see
`UPDATE-TRIGGERS.md` Section A `ACCOUNT-AUTO-DELETION` for the per-row record. The second
action, **transfer to a beneficiary, is implemented (`f4c05d3c`, 2026-10-30) and merged to open-pryv.io
master (`2bd4778b`, 2026-11-01), NOT released**: its 5 chips stay until the
release that ships it (see "At release (transfer)" below). The text below is the proposal as filed (2026-10-29), kept as
history; where it says "as implemented on the branch", the rows, the context note and the
operator page are authoritative.
**Delivery vehicle:** macroPryv plan 139 (`_plans/139-account-auto-deletion-atwork/`), not a
backlog file, so the chips carry no `backlog:` key. Two releases: v1 deletion (the API, the
sweep, the reminder mails, the account-app card, docs), then transfer (`features.autoDeletion.
actions` gains `transfer`). Design reviewed twice (2026-10-29) and the operator decisions
recorded in the plan's rulings R1 to R12.
**Filed:** 2026-10-29, at the plan's compliance phase (P6).
**Slug:** `ACCOUNT-AUTO-DELETION` (Section A of `UPDATE-TRIGGERS.md`).
**Tracking:** v2 board draft card (no public issue yet).

**Surfacing question:** *"GDPR Art.5(1)(e) says I must not keep an account longer than
necessary. My users stop using the app and never close their account. Can the platform delete
an account after a period without use, or at a date the person picks, and warn them first?"*
(Q31 of `docs/implementer-faq.md` answered "no, your own retention job"; this changes the
answer for the account level.)

## State today (verified on open-pryv.io master, 2.0.0-rc.64)

| Control | Status | Anchor |
|---|---|---|
| Caller-triggered account erasure (`auth.delete`, `system.users.delete`) | ✅ | `components/business/src/auth/deletion.ts`, `[USAD]` |
| `lastUsed` per access, on every API call | ✅ (default on, `accessTracking.isActive`) | `api-server/src/methods/helpers/updateAccessUsageStats.ts` |
| A login recorded as use | ❌ `auth.login` does not move `lastUsed`; the next call does | `methods/auth/login.ts` |
| Account inactivity as a measure | ⚠️ derivable by the operator (audit log, `system.getUserInfo.lastAccess` over all access types, shared included) | `methods/system.ts` |
| Automatic deletion at a date or after inactivity | ❌ the operator's external retention job | `context/data-retention-operator-owned.md` |
| Reminders before such a deletion | ❌ the operator's job | none |
| A holder choosing their own deletion date / period | ❌ | none |

## After shipping (as implemented on the branch; wire shapes may change until release)

- **Holder's choice** (`account.getAutoDeletion` / `account.setAutoDeletion`, `GET` / `PUT
  /{username}/account/auto-deletion`, personal token): one mode at a time, `date` (an ISO-8601
  instant with an offset, at least `date.minLeadDays` away), `inactivity` (`inactivityDays`
  within the operator's bounds), `never`, or `default` (follow the operator preset). Arming a
  schedule or bringing the deletion nearer requires the account password; clearing or moving it
  later does not. A delegate can read but not set it. The `delete` action is offered only where
  `user-account.delete` lists `personalToken` (a holder cannot schedule what they could not do
  directly). An account without email needs `acknowledgeNoReminders: true`. Both methods are
  audited. Every change, clearing included, is confirmed by mail.
- **Operator preset** (`account.autoDeletion.inactivity.defaultDays`, default `null` = never):
  applies only to plain accounts with an email on a core that sends mail (never to group accounts
  or accounts under a delegation); its clock starts the first time it applies to an account, so
  dormant accounts get the full reminder schedule; lowering it restarts the clock.
  `userOverride` and `allowUserOptOut` (both default `true`) say whether holders may change it or
  opt out.
- **Activity** = latest `lastUsed` over the account's `personal` and `app` accesses, a delegate's
  included, reported as `lastActivity.by: owner | delegate` with a per-type breakdown; `shared`
  accesses never count; a completed login now records `lastUsed`. Inactivity requires
  `accessTracking.isActive` (a preset without it refuses the boot).
- **Reminders** at 60, 30, 7 and 1 days (`reminders.leadDays`), once per deadline; after downtime
  only the most imminent; **minimum notice**: no account deleted less than
  `reminders.minNoticeDays` (7) after the first notice actually sent (the confirmation counts).
  A reminder that cannot be sent holds the deletion back.
- **Sweep**: one per core, in the designated API worker, every `sweepIntervalMs` (6 h). At the
  deadline it re-reads activity, runs `auth.delete`'s deletion guards (a refusal is `blocked`,
  mailed once, retried), writes a `deleting` marker and erases exactly as `auth.delete` does
  (teardowns included). WARN log line before and after (no email address); with
  `audit.onUserDelete: keep` an audit row `account.autoDeletion.erase` is written in the
  account's trail before erasing. `maxDeletionsPerPass` (20) caps a pass; `dryRun` logs and
  does nothing; an interrupted erasure completes at the next pass.
- **Not in scope of v1:** event-level / stream-level retention (stays the operator's job),
  a grace or suspension state after the deadline, a per-account legal hold set by the operator
  (the only levers are the holder's own `never`, `allowUserOptOut`, or turning the preset off),
  an erasure ledger (backlog `COMPLIANCE-ERASURE-LEDGER`, open-pryv.io issue #154; the
  `trigger` is passed to `eraseAccount` for it).

### Second release: transfer to a beneficiary (implemented on a branch, not released)

`action: 'transfer'` with `{ email, name?, dateOfBirth?, notifyBeneficiary: 'atSetup' |
'atTrigger', fallback: 'delete' | 'keep' }`, user-chosen only (presets always delete). At the
deadline a claim window opens (`transfer.claimWindowDays`, 90); the beneficiary gets a claim
link and, by signing in to or creating an account on the platform, becomes the account's
**controller** through the existing delegation handshake. **As implemented** (2026-10-30,
`f4c05d3c`): the claim and decline links are HMAC-SHA256 values over (kind, account id, a
per-transfer salt) under a key derived from `transfer.identitySecretsKey` or the admin key;
only the salt is stored, so a database dump holds no usable link (the filed text said "random
token, only its hash stored"; the property claimed, no usable secret at rest, is the same or
stronger). The claim binds to the first claimant account; a wrong link counts on the address's
failed-secret budget (`auth.passwordAttempts.perIp`) and is reported to the owner
(`transfer.failedClaims`), but refuses nothing else: a per-transfer lock, as filed, would have let
anyone who knows the username lock the beneficiary out and learn that a transfer is open (removed
after the cross-model code review, `b98c81d3` on the same branch). Setting or changing a
transfer needs the account password. The beneficiary's mails never carry the name the owner gave. Tests `[ACTR]` (27),
`[ACTX]` (cross-core claim), `[ATRU]` (links, window), mails `account-transfer-named`,
`-claim`, `-started`, `-cancelled`, `-lapsed`, `-completed`. Name and date of birth are optional, used only by the operator to identify a
beneficiary the email cannot reach, stored AES-256-GCM encrypted in their own account field
(key `transfer.identitySecretsKey` or derived from the admin key), never readable in v1 (the
operator read method, its audit entry and the owner notification are deferred), erased with
every version on claim, cancellation, decline or account deletion. The storage accessors for
that field already exist on the branch (`[ADKS5]`, `[ADKR3]`); nothing writes them yet.

## Lawful-basis lines (what the rows will say)

- **A schedule the holder chose** is the data subject's own request: erasure on request
  (`gdpr.Art.17` §1(a) "no longer necessary" as judged by the subject, and §1(b) where the
  processing rests on consent, the schedule being a withdrawal that takes effect at a date).
  The operator keeps no discretion beyond the deletion guards.
- **An operator preset** is the operator's storage-limitation rule (`gdpr.Art.5` §1(e)). The
  operator states it in the privacy notice, with the inactivity definition, as the retention
  period or its criteria (`gdpr.Art.13` §2(a); `Art.14` §2(a) for data not obtained from the
  subject). Pryv's CHANGELOG and operator page carry this duty ("state it in your privacy
  notice").
- **Default never** keeps the platform neutral: nothing is deleted without either the holder's
  act or the operator's explicit preset.

## The Art. 14(5) analysis for `notifyBeneficiary: 'atTrigger'` (transfer release)

The operator decided (2026-10-29), against the first design review's recommendation, to keep
both notice options whatever the owner entered (email, and optionally name and date of birth).
Analysis as recorded for the matrix (**unconfirmed**: needs a DPO / counsel reading before the
transfer release; see "To confirm" below):

1. **Whose data, which controller.** The beneficiary's email (and optional name, date of birth)
   is personal data of the beneficiary, not obtained from them: Art.14 applies to the
   controller that processes it, i.e. the platform operator (or the implementer, if it is the
   controller of the account service). The owner's own entry may fall under the household
   exemption (Art.2(2)(c)); the operator's storage of it does not.
2. **Lawful basis for the operator** (`gdpr.Art.6`): Art.6(1)(f), the owner's legitimate
   interest in arranging a digital legacy of their own account, and the operator's interest
   in carrying out that instruction; balanced by minimisation (email required, name and date
   of birth optional), encryption at rest, no read path before the transfer triggers, erasure
   with the transfer. Art.6(1)(b) does not fit (the beneficiary is not party to the contract
   with the holder).
3. **`atSetup`** satisfies Art.14(3)(b) directly: the first communication to the beneficiary
   carries the Art.14 information (who named them, what it means, a decline link, and the
   name / date of birth conditions if given).
4. **`atTrigger`** defers that communication to the claim email, possibly years after the
   data was recorded. Art.14(3)(a) asks for information "within a reasonable period, at the
   latest within one month". The exemption relied on is **Art.14(5)(b)**: providing the
   information at setup would "render impossible or seriously impair the achievement of the
   objectives of that processing" where the owner wants the legacy kept private while alive
   (the stated product reason for the option), with the safeguards the same paragraph asks
   for ("appropriate measures to protect the data subject's rights ... including making the
   information publicly available"): data minimised and optional, encrypted, unreadable
   before the trigger, erased on cancellation; the operator's privacy notice describes the
   transfer feature publicly; the claim email carries the full Art.14 information at first
   contact (Art.14(3)(b)). **Weak point:** 5(b) is usually read narrowly (supervisory
   authorities and the EDPB transparency guidelines reject "the controller prefers not to");
   if a regulator does not accept the owner's privacy wish as an objective of the processing,
   `atTrigger` with a stored name and date of birth would be non-compliant for the operator.
   A narrower option was proposed in review (`atTrigger` only when nothing beyond the email is
   stored) and declined by the operator; it stays the fallback if counsel disagrees.
5. **Art.13 for the owner:** the app and the setup confirmation tell the owner when and how
   the operator may read the beneficiary's name and date of birth (after the transfer
   started, logged, reported to the owner's address); the deferred read method must honour
   that notice exactly.

**To confirm** (none settled here): (a) a DPO / counsel reading of point 4 per jurisdiction the
platform serves; (b) the controller role in point 1 for a platform operated on behalf of an
implementer; (c) national digital-legacy rules (e.g. French post-mortem data directives, Loi
pour une République numérique art. 63 / Loi Informatique et Libertés art. 85) as context for
operators: they concern the data subject's directives after death, which the `date` / `inactivity`
transfer may or may not represent; context only, not a matrix row.

## Affected matrix rows

Chips added 2026-10-29. No tier shift now; `tests:` and `config_keys:` not added (nothing is on
open-pryv.io master; the validator resolves test codes there).

| Scope | Ref | Today | Kind | Impact | After shipping |
|---|---|---|---|---|---|
| gdpr | Art.5 | Implemented, High | feature | medium | §1(e): account-level storage limitation configurable (preset, holder schedule, reminders); event-level stays operator-owned |
| gdpr | Art.5 | Implemented, High | feature | low | §1(c) (transfer release): beneficiary name / date of birth optional, encrypted, erased with the transfer |
| gdpr | Art.17 | Configurable, Medium | feature | medium | scheduled erasure at the subject's request (§1(a)/(b)); same erasure path, guards included |
| gdpr | Art.25 | Facilitated, High, infrastructure | feature | low | retention by default: default never, preset as an operator choice, dormant accounts never deleted by surprise |
| gdpr | Art.13 | Facilitated, Medium, storage | feature | low | §2(a): preset to be stated in the privacy notice; (transfer release) owner notice on beneficiary data |
| gdpr | Art.14 | Facilitated, Medium, storage | feature | low | (transfer release) beneficiary notice at setup or at trigger; Art.14(5)(b) analysis |
| gdpr | Art.6 | Facilitated, Low, storage | feature | low | (transfer release) basis for the operator's processing of beneficiary data |
| gdpr | Art.32 | Facilitated, High, infrastructure | feature | low | password step-up to arm a deletion; (transfer release) beneficiary identity encrypted at rest |
| ccpa | 1798.105 | Configurable, Medium | feature | low | consumer-scheduled deletion |
| pipeda | Principle.4.5 | Configurable, Medium | feature | medium | retention of inactive accounts enforceable by configuration |
| swiss-nlpd | Art.32 | Implemented, High | feature | low | erasure scheduled by the person |
| soc2 | CC6.5 | Configurable, Medium | feature | low | scheduled logical destruction through the same path |
| soc2 | P4.2 | Facilitated, Low, storage | feature | medium | account-level retention enforced by the platform; tier review at release (facilitated to configurable for the account level) |
| soc2 | P4.3 | Configurable, Medium | feature | low | scheduled disposal through the same path |
| soc2 | C1.2 | Configurable, Medium | feature | low | scheduled disposal through the same path |
| iso-27701 | A.7.4.5 | Configurable, Medium | feature | medium | "as soon as no longer necessary" enforceable for inactive accounts |
| iso-27001 | A.8.10 | Configurable, Medium | feature | low | deletion when no longer required, scheduled |
| hipaa-security | 164.316(b)(2)(i) | Facilitated, Low, storage | feature | low | an auto-deletion erases the audit with `erase`; with `keep` an erasure audit row is kept |

`iso-27001.A.7.14` (secure disposal or re-use of equipment) was on the plan's list and was
walked: it is about physical media, `out-of-scope`, and unaffected; the information-deletion
row is `A.8.10`, which carries the chip instead.

Rows to walk at the **transfer** release without a chip now: the access-control and delegation
rows the `ACCOUNT-DELEGATION` entry lists (a controller can now be set by a claim, server-run
on the owner's behalf, bound to the first claimant account, rate-limited):
`gdpr.Art.32` ("Delegate-account control" bullet), `hipaa-security.164.312(a)(1)`,
`164.312(d)`, `hipaa-privacy.164.502(g)`, `soc2.CC6.1`, `CC6.2`, `iso-27001.A.5.15`, `A.5.16`,
and `gdpr.Art.8` (as far as their delegation text names how a controller is set). Also
`gdpr.Art.30` if the operator must list the transfer as a processing activity (unconfirmed).

## At release (v1 deletion)

1. Discharge the deletion chips; rewrite each "Planned, not yet released" paragraph as shipped
   with the release name, commit and test codes: `[ACXP1-15]` (engine), `[ADSW1-18]` (sweep),
   `[ACRM1-5]` (mails), `[ACST1-16]`, `[ACST15A-C]` (API), `[ACAC1-10]` (activity), `[LGLU1-4]`
   (login), `[ACCF1-8]`, `[CVAD1-4]`, `[CKCF7]` (config), `[ADKS1-6]`, `[ADKR1-4]` (state).
2. Add `config_keys:` `account.autoDeletion.*` (and `accessTracking.isActive` where inactivity
   is cited), `services.email.enabled.accountDeletion*`.
3. Cite the operator page `customer-resources/account-auto-deletion.md` in `docs:` once
   dev-site2 publishes it.
4. Decide whether a new primitive (`account-auto-deletion`) enters `docs/pryv-primitives.md`.
5. Tier review: `soc2.P4.2`, `gdpr.Art.5` §1(e) label.
6. Turn the planned section of `context/data-retention-operator-owned.md` and FAQ Q31's planned
   note into shipped text; update `samples/scheduled-retention-job/README.md`.
7. Keep the transfer chips (Art.5 §1(c), Art.6, Art.13 owner notice, Art.14, Art.32 identity)
   until the transfer release.

## At release (transfer)

0. **Precondition, external:** a DPO / counsel reading of `gdpr.Art.14` §5(b) for
   `notifyBeneficiary: 'atTrigger'` (the analysis above is UNCONFIRMED). If it fails, the option
   is removed or the beneficiary is notified at setup whenever a name or a date of birth is
   given, before the release.
1. Discharge the 5 transfer chips (`gdpr.Art.5` §1(c), `Art.6`, `Art.13` owner notice,
   `Art.14`, `Art.32` identity); rewrite each as shipped with the release name, commit and test
   codes (`[ACTR1A]` to `[ACTR6E]`, `[ACTX1]`, `[ATRU1-5]`).
2. Walk the access-control and delegation rows listed above (a controller set by a claim): cite
   the claim path (`account.transferClaim`, server-run `requestAttach` on the owner's behalf,
   accepted with the claimant's own `delegations.acceptAttach`).
3. Add `config_keys:` `account.autoDeletion.transfer.*`, `services.email.enabled.accountTransfer*`,
   `delegation.active` where the transfer's availability is cited.
4. `docs:` the operator page's "Transfer to a beneficiary" section, once dev-site2 publishes it.
5. Note on `gdpr.Art.32`: the operator read path for the name and date of birth is NOT shipped;
   the row must say they are unreadable (encrypted, no method) until it is, and that rotating
   the admin key without `identitySecretsKey` makes them unreadable.

## History

- 2026-10-29: filed with the chips above, from plan 139 P6; v1 implemented on the branch, transfer
  designed only.
- 2026-10-30: v1 (deletion) released in open-pryv.io 2.0.0-rc.66 (`8521c8d5`). Checklist "At
  release (v1 deletion)": 1 done (codes cited per row; the config boot check is `CKCF8`, not
  `CKCF7`); 2 done; 3 done (`docs:` cites
  `customer-resources/account-auto-deletion.md`); 4 decided: new primitive
  `account-auto-deletion` in `docs/pryv-primitives.md`, cited on every discharged row; 5 tier
  review: `soc2.P4.2` kept `facilitated` / `low` (records inside an account stay the
  operator's job), `gdpr.Art.5` §1(e) label now "configurable for whole accounts"; 6 done
  (context note, FAQ Q31, sample README); 7 transfer chips kept (Art.5 §1(c), Art.6, Art.13
  owner notice, Art.14, Art.32 identity).
- 2026-10-30: the sweep tests renamed `ACSW` to `ADSW` in open-pryv.io (`2c7989c8`), `ACSW` being
  the account-streams write suite's code; rows cite the `ADSW` codes.
- 2026-10-30: transfer implemented on open-pryv.io `feat/account-transfer` (`f4c05d3c`), not
  released; links HMAC-derived (only a salt stored); "At release (transfer)" checklist added;
  the 5 transfer chips stay `planned`.
- 2026-11-01: transfer merged to open-pryv.io master (`2bd4778b`); still not released (the release
  waits for the Art.14(5)(b) reading); the 5 transfer chips stay `planned`.
