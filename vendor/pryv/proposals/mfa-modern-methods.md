# Proposal: MFA — document the extension point + ship reference plugins

**Status:** future. Mirror of the macroPryv backlog item
`_plans/XXX-Backlog/MFA-MODERN-METHODS.md`, in the perspective of
`_plans/40-OAUTH2-Account-based-signatures-later/` (the broader
auth-modernisation plan).

## Today's posture (correct + currently understated)

The matrix's `Implemented | High` rows on authentication strength
(`hipaa-security.164.312(d)`, `iso-27001.A.8.5`, `diga.A1.2.4`,
`pipeda.Principle.4.7` multi-aspect) are **defensible against regulator
text** — HIPAA, ISO, DiGA don't prescribe specific MFA factors. The
shipped code base supports MFA via a pluggable abstraction:

- `components/business/src/mfa/Service.ts` — abstract base class with
  `challenge()` and `verify()` methods that subclasses override.
- `ChallengeVerifyService` + `SingleService` — two shipped subclasses
  targeting HTTP-based external MFA providers (SMS by convention but
  the abstraction is generic).
- Configuration in `services.mfa` plugs in any HTTP-callable provider
  (Twilio Authy, Auth0 MFA, Duo Web push, etc.) without code changes.

What's understated:

- The primitive catalogue (`docs/pryv-primitives.md` MFA section)
  describes MFA as "SMS-based by default", which reads as
  "Pryv supports SMS only". It's a default, not a scope.
- No dev-site page documents the extension point.
- No statement of which NIST AAL the shipped subclasses can achieve
  when configured with which providers.
- No reference plugin for in-process methods (server-side TOTP,
  WebAuthn) — those require either a third-party HTTP provider or
  an operator writing a `Service` subclass.

## Three-step modernisation

1. **Doc fix** (hours): update `docs/pryv-primitives.md` MFA section
   + add dev-site "writing an MFA provider" page + statement of
   per-provider AAL. No code change. Lifts the matrix posture without
   regulatory risk because the rows already claim `Implemented |
   High` legitimately.

2. **Reference TOTP subclass** (days): ship a `TotpService` subclass
   that stores the TOTP secret on a system-stream + verifies RFC 6238
   codes in-process. Operators don't need a third-party service for
   AAL2 MFA.

3. **WebAuthn abstraction + reference subclass** (weeks): the
   `Service` base class shape doesn't fit WebAuthn ceremonies
   (challenge/verify as HTTP roundtrip ≠ WebAuthn ceremony with
   server-issued challenges + per-credential public-key storage).
   Either broaden `Service` or add a sibling `LocalService` for
   in-process ceremonies. Reference `WebAuthnService` follows.

See upstream backlog for the full treatment.

## Matrix impact

Today's `Implemented | High` rows on authentication-strength are not
incorrect — they're under-explained. Adding a one-paragraph caveat
to the `detail` blocks of:

- `hipaa-security.164.312(d)`
- `iso-27001.A.8.5`
- `iso-27001.A.5.17`
- `diga.A1.2.4`
- `hipaa-security.164.308(a)(5)(ii)(D)`

…that says "MFA is pluggable via `components/business/src/mfa/
Service.ts`; SMS ships as default; operator plugs in TOTP / WebAuthn
/ push via HTTP-provider config or a `Service` subclass; see
`proposals/mfa-modern-methods.md` for the modernisation roadmap"
gives an auditor the right framing without flipping any coverage.

When step 1 (docs) ships, the caveat references the dev-site page
instead of this proposal.

When step 3 (WebAuthn) ships, the rows can claim AAL2 explicitly +
add per-method tests.

## Related

- Upstream backlog: `_plans/XXX-Backlog/MFA-MODERN-METHODS.md`.
- Plan 40 perspective: `_plans/40-OAUTH2-Account-based-signatures-later/PLAN.md`.
- MFA code (open-pryv.io): `components/business/src/mfa/Service.ts`
  + subclasses `ChallengeVerifyService.ts` + `SingleService.ts`.
