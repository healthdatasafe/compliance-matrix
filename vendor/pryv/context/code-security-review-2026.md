# Code-level security review of open-pryv.io (2026-06 to 2026-10)

Source-of-truth for every matrix claim that cites the 2026 security review of
the open-pryv.io source as periodic-evaluation, security-testing or
vulnerability-management evidence. Everything said here about individual fixes
comes from the public release notes (`open-pryv.io/CHANGELOG-v2.md`,
sections `2.0.0-rc.40` to `2.0.0-rc.51`) and from the public report.

**Public report: published 2026-10-14.**
`SECURITY-AUDIT.md` in the open-pryv.io repository, next to `SECURITY.md`:
https://github.com/pryv/open-pryv.io/blob/master/SECURITY-AUDIT.md. Revision 1
covers open-pryv.io 2.0.0-rc.40 to 2.0.0-rc.51, all deployed on the platforms
Pryv operates (pryv.me included) by 2026-10-14. It gives the scope and method,
the surface inventory, the areas reviewed with no defect found, each finding
with its severity, the release that fixed it and the operator action, and the
known residual risks and planned work. The report states its own publication
rule: a defect with practical impact is described only once its fix is
released and deployed on those platforms; until then the release note carries
the operator instructions. It is revised with every release that carries a
security fix, so cite it by URL and note the revision you relied on.

At revision 1 the report records 47 findings rated Low or above (6 Critical,
19 High, 21 Medium, 1 Low), every one fixed, released and deployed, plus about
150 lower-severity observations triaged separately; a few lower-severity
defects remain open and are listed as tracked in its residual-risk section.

## What was reviewed, and how

- **Scope: the open-pryv.io source code itself.** Authentication, sessions and
  MFA; authorisation, access scoping and tenant isolation; input parsing and
  injection surfaces (request bodies, query strings, stream queries, file and
  path handling); cryptography and secret handling, including what reaches the
  server logs; the admin, system and multi-core plane (registration, bootstrap,
  core-to-core calls, the platform database); the network-facing daemons (API,
  high-frequency series, embedded DNS, previews, webhooks); resource limits and
  robustness; and the semantics of deletion and erasure.
- **Out of scope: third-party dependencies.** They are covered by the CI
  supply-chain pipeline (runtime dependency-audit gate, a CycloneDX SBOM of the
  npm dependencies scanned against published advisories, signed release
  images), not by this review. The operating-system packages of the container
  image are not scanned in CI yet.
- **Method.** A systematic, surface-by-surface code review run by the
  open-pryv.io maintainers. Every candidate finding was checked by a second,
  separate review before it was accepted; accepted findings were classified by
  severity and fixed with regression tests (critical and high ones first,
  through dedicated security releases). Each fix release was reviewed before it
  was merged and passed the full test matrix on PostgreSQL and SQLite.
- **Period.** Started June 2026; the bulk of the review and every fix release
  ran in October 2026.

## Where the fixes are

The fixes shipped in open-pryv.io 2.0.0-rc.40 to 2.0.0-rc.51 (2026-10-07 to
2026-10-14 by deployment date). Most of these releases open with "Security release: upgrade
promptly" or "Upgrade promptly", and list the operator steps each fix needs (a configuration check before restarting,
a one-off repair tool, a changed default). By area, as the release notes
describe them:

- **Authentication and sessions**: registration and `accesses.update` accept
  only the fields they document (rc.40); placeholder or short secrets refuse
  the boot (rc.40); login sessions bound to the account (rc.41); password reset
  throttled, single use and hashed, a reset revokes personal sessions (rc.43);
  MFA step-up on deactivate / replace, SMS codes and send limits hardened, MFA
  fails closed when an enrolled method is off (rc.44, rc.45); credential
  methods refused inside batch calls and over socket.io, failed passwords
  delayed per account and budgeted per client address across all cores,
  passwords hashed with a fresh salt each time (rc.47); a session extended only
  by a call that passed every check (rc.50); a login refused after its MFA
  session opened ends that session, and concurrent failed MFA activations keep
  the enrolment pending before them (rc.51).
- **Authorisation and isolation**: delegated and shared tokens kept within
  their grant (rc.41, rc.43); webhook targets restricted to public addresses by
  default and a `webhooks` feature permission (rc.44, rc.45); internal plugin streams never
  returned by `events.get` (rc.46); permission loading made atomic, excluded
  streams stay excluded when trashed (rc.47); deletion records only for an
  access reading the whole store, the account root stream not grantable for
  writing, notifications follow their access (rc.50).
- **Input handling**: event ids anchored, attachment paths contained (rc.40);
  upload parameters accepted only on the REST routes (rc.46); query strings,
  urlencoded overrides and stream queries parsed strictly, built-in object
  property names refused or ignored (rc.47, rc.50); hosted-site proxy paths
  refused when they hold encoded separators or dot segments (rc.50).
- **Secrets and logs**: credentials masked in logs (rc.43), access-request keys
  and Basic-auth user names out of the logs, server-side faults answered with a
  reference instead of their text (rc.47), validation errors logged without the
  rejected value (rc.49), errors and debug output masked, log files created
  `0640` (rc.50); the admin key fingerprint in the boot log keyed (rc.50).
- **Admin, cluster and platform**: rqlite HTTP bound to loopback, core URLs and
  ids validated, mail templates validated, bootstrap bundles staged (rc.43);
  multi-core nodes without Raft TLS refuse to start (rc.45); embedded DNS
  request validation and bounded TCP (rc.46); `integrity.algorithm` limited to
  `sha256` / `sha512` (rc.50).
- **Resource limits**: batch size and result caps, `events.get` paging bounds,
  upload part / file limits, socket.io namespace and message limits, per-address
  and per-account caps on access requests and MFA sessions (rc.47); preview
  pixel cap and render concurrency, invitation-check budget, `webhooks.test`
  interval, a restart backoff for crashing workers (rc.50).
- **Backup and restore**: an unencrypted backup is no longer restored as such
  when a decryption secret was given (rc.47); restore refuses unsafe paths,
  symbolic links and reserved names (rc.49, rc.50), backups are written
  owner-only (rc.49); a plaintext backup is announced, and `--passphrase-file` keeps the
  passphrase out of the process list (rc.50); incremental backups no longer
  overwrite the full backup they continue but form a chain, a directory damaged
  by an earlier release is refused on restore, and a restore no longer
  re-creates an account deleted between runs (rc.51); on SQLite a running core
  follows an account file a restore replaced (rc.51). The second step of the
  rc.51 backup finding, planned in the report since revision 1, shipped in
  2.0.0-rc.86 (report revision 25, 2026-11-17, "Fixed in 2.0.0-rc.86"): every
  file of a backup run authenticated, optional signed runs; the report lists
  the backup residual risks that remain.
- **Deletion and erasure**: the SQLite audit `keep` setting honoured (rc.46);
  account deletion ends the account's delegation and cross-account (CMC)
  relationships and erases high-frequency series under every name of the
  account (rc.47); its webhooks stop at once and late series writes do not
  survive it (rc.50).
- **Configuration**: a config declaring `custom.systemStreams.other` streams,
  which had no storage, is refused at boot and by `bin/check-config.js`
  (rc.51).

## What this gives you, and what stays yours

**It gives you supplier-side evidence**: the platform code you run was put
through a structured security evaluation, its findings were fixed and tested,
and every fix is traceable to a release note. Cite it, with the release notes,
in the supplier part of your periodic evaluation (HIPAA §164.308(a)(8)), your
Art.32(1)(d) testing file, your ISO 27001 vulnerability-management and
security-testing records, and your SOC 2 evaluation evidence.

**It does not do your part**:

- **Run a release that carries the fixes** (2.0.0-rc.51 or later) and follow
  the operator steps of every release between your version and it. A fix you
  have not deployed protects nobody.
- **Your periodic evaluation remains yours.** The review looked at the code,
  not at your deployment: your configuration, the network exposure of your
  cores (the reverse proxy, open ports), the integrations and applications you
  add, and your operational procedures are outside it.
- **It is not an independent assessment.** It was performed by the
  maintainers of the code, not by an independent third party, and it is not a
  penetration test of a running deployment. Where a regulation or a certifier
  asks for an independent test (for example the DiGA penetration test, or an
  ISO 27001 independent review), commission it for your deployment; this
  review can narrow its scope, not replace it.

## Matrix rows that cite this note

| Scope | Row | What it cites |
|---|---|---|
| hipaa-security | 164.308(a)(8) | supplier-side technical evaluation input |
| gdpr | Art.32 | §1(d) regular testing evidence |
| gdpr | Art.17 | the erasure fixes of 2.0.0-rc.46 to 2.0.0-rc.50; erased accounts in backup chains (rc.51) |
| iso-27001 | A.8.26 | application-security examples (cache directives, proxy paths, query parsing) |
| iso-27001 | A.8.8 | vulnerability identification and remediation upstream |
| iso-27001 | A.8.28 | secure-coding practice: review findings fixed with regression tests |
| iso-27001 | A.8.29 | security testing in the development life cycle |
| iso-27001 | 9.2 | artefact an internal auditor can review |
| soc2 | CC4.1 | a separate evaluation of the platform's controls |
| soc2 | CC7.1 | susceptibility to newly discovered vulnerabilities |
| diga | A1.2.7 | why it does not replace the independent penetration test |
| hds | Activity.3 | vulnerability-management evidence |

Rows refreshed for the behaviour these releases changed (rate and resource
limits, logging, integrity values, backup and restore, erasure) are listed in
`UPDATE-TRIGGERS.md`, Section A entry `SECURITY-REVIEW-2026`.
