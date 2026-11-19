# Operator backup vs subject DSAR backup: symmetry audit

**Status:** implementer reference + audit of the two backup paths Pryv ships, the operator-side `bin/backup.js` (server-side, raw-row disaster-recovery snapshot) and the subject-facing `@pryv/account-backup` (public-API DSAR / portability tool, currently v0.5.0). Companion to `account-backup-coverage.md`, which covers the subject side per-data-type. Last updated 2026-06-13 against `@pryv/account-backup` v0.5.0; operator-side series coverage re-checked against open-pryv.io 2.0.0-rc.34 (2026-10-03); operator incremental backups re-checked against open-pryv.io 2.0.0-rc.51 (2026-10-14); operator backup integrity and authenticity re-checked against open-pryv.io 2.0.0-rc.86 (2026-11-17).

---

## TL;DR

Pryv has shipped **three** backup tools with non-overlapping audiences. Two are current (operator + subject CLI); the third (a self-serve Web UI on top of the subject CLI) was operated historically and is currently dormant. An auditor evaluating Art.15 / Art.20 / §1798.110 / Principle 4.9 / nLPD Art.25 coverage should know all three exist and which one satisfies the article in question.

| | Operator backup (`open-pryv.io/bin/backup.js`) | Subject backup (`@pryv/account-backup`) |
|---|---|---|
| Audience | system operator | data subject (or implementer on behalf of subject) |
| Surface | server-side; runs inside the core process | end-user CLI; runs against the public API |
| Auth | direct storage access (no token); restricted by OS-level filesystem perms + admin process | personal token (`Service.login` with username + password + appId) |
| Output | raw storage rows (incl. internal IDs, integrity hashes), disaster-recovery snapshot | per-resource JSON files + sha256 manifest, subject-portable disclosure packet |
| Scope per user | streams, accesses, profile, webhooks, events, attachments, accountData, audit, HFS series | account, streams, accesses (+ revoked/expired), profile, audit-logs, events (chunked by month), per-app profile, HFS series per-event, per-access webhooks, integrity manifest |
| Restore semantics | full re-import via engine-level write paths (PG `INSERT`, SQLite `INSERT`) | re-create via standard public API (`events.create`, `streams.create`, `addPointsToHFEvent`); audit / webhooks / accesses deliberately NOT replayed (system-generated or token-bearing) |
| Compliance role | disaster recovery, migration, regulator-mandated record retention | GDPR Art.15 (access) / Art.20 (portability) / CCPA §1798.110 / PIPEDA Principle 4.9 / Swiss nLPD Art.25 |

## Third tier: operator-hosted subject Web UI (`pryv-account-backup-webapp`)

`pryv-account-backup-webapp` is the current sample web UI for subject-facing backups. Operator hosts the static bundle on their own domain; subjects log in via a web form, click **Start backup**, download a series of ZIP files. The webapp consumes the browser-isomorphic resource fetchers from `pryv-account-backup` v0.7.0+ (`api-resources`, `events-chunked`, `audit-as-events`, `accesses-history`, `attachments`, `hf-data`, `webhooks-export`), no server-side runtime, deploy via `npm run build && copy dist/ to your web server's docroot`.

| | `pryv-account-backup-webapp` (Web UI tier, v0.2.0 against library v0.7.0+) |
|---|---|
| Audience | end user (the subject), no Node / CLI knowledge required |
| Surface | static site bundled by esbuild; vanilla JS + vanilla CSS; ~350 LOC of orchestrator + UI; no backend |
| Auth | subject's Pryv credentials submitted via the web form (operator's TLS); direct `Service.login` (no MFA handling, webapp directs MFA-enabled subjects at the CLI) |
| Distribution | git-clone + `npm install && npm run build`; deploy `dist/` behind operator's HTTPS |
| Compliance role | same as the CLI tier, GDPR Art.15 / Art.20 / §1798.110 / PIPEDA Principle 4.9 / Swiss nLPD Art.25, with significantly lower subject-side friction (no clone / install / CLI run) |
| Coverage caveat | webapp omits **only** `manifest.json` (per-file sha256 tamper-evidence, auditor-facing, CLI-only by design). All read-side resources (attachments / HFS series / webhooks / events / audit / accesses + history / profile) are covered with feature parity from v0.7.0 / webapp v0.2.0. The webapp also produces a portable `sync-state.json` inside the final ZIP, the subject re-uploads it on the next visit for cross-browser / cross-device incremental |

**Why it matters for the symmetry audit:**

- This is the **most ergonomic** path for an actual DSAR, a subject who can't be expected to install Node or run a CLI can still self-serve.
- It is **operator-hosted**, so it moves the "who runs the export" responsibility back to the operator while keeping the output bundle subject-portable.
- It consumes the **same library code** the CLI consumes (browser-isomorphic resource fetchers from v0.7.0), no drift category between flavors. The seven core fetchers all expose the same `(connection, writer, stateStore-or-array, options, cb, log)` shape; the orchestrator drives both flavors uniformly.

**Operational guidance for implementers:**

- If you need a self-serve DSAR for a non-technical subject population, the webapp repo is a production-ready scaffold, fork, rebrand CSS custom properties, redeploy.
- `profile_private.json` carries the subject's MFA enrolment (method, `content` such as the SMS phone number, TOTP parameters) but no usable MFA secret: since open-pryv.io 2.0.0-rc.27 (`7ce9ea6f`) the private-profile read leaves out the encrypted TOTP secret, the replay step and the recovery-code hashes. Treat the downloaded ZIPs as confidential personal data (secure transport, documented destruction); they are not MFA-bypass material and no recovery-code rotation is needed after disclosure.
- Subjects who need third-party-auditor tamper-evidence (e.g. handing the bundle to an external compliance auditor) should still use the CLI flavor, only the CLI emits the per-file sha256 `manifest.json`.

### Historical tier (archived 2026-06-15): `pryv/example-service-bluebutton`

Operator-hosted Express service that wrapped `@pryv/account-backup` 1.0.x behind a Web UI. Last substantive release v1.2.0 on 2022-10-11. The public Pryv-operated instance at `https://bluebutton.pryv.me/` was dormant by 2026-06; the repo was archived on 2026-06-15 as part of the v0.6.0 ship and replaced by `pryv-account-backup-webapp`. Listed here for historical context, operators with existing bluebutton deployments should plan a migration to the new webapp.

## Per-resource symmetry (v2 deployments; subject backup at v0.7.0)

| Resource | Operator `bin/backup.js` | Subject `@pryv/account-backup` v0.7.0 (CLI + webapp) | Notes |
|---|---|---|---|
| streams | ✅ raw rows (`storageLayer.streams.exportAll`) | ✅ `/streams[?state=all]` | symmetric coverage; subject sees wire shape, operator sees row shape |
| accesses (current) | ✅ raw rows | ✅ `/accesses` → `accesses.json` | wire format on subject side carries `clientData.cmc` for CMC counterparties (see CMC row) |
| accesses (deletions + expired) | ✅ raw rows (`exportAll` includes soft-deleted) | ✅ **0.5.0+** `/accesses?includeDeletions=true&includeExpired=true` → `accesses-all.json` | adds `accessDeletions[]` array |
| accesses (per-access history) | ✅ raw history rows | ✅ **0.5.0+** opt-in: `accesses-history/<accessId>.json` per access, fetched via `GET /accesses/<id>?includeHistory=true`. CLI prompts; off by default (O(N) calls) | symmetric coverage when the operator opts in |
| profile (private + public + per-app) | ✅ raw rows | ✅ `/profile/private` + `/profile/public` + per-app `/profile/app` | symmetric |
| webhooks | ✅ raw rows (no token replay risk on operator side) | ✅ **CLI + webapp** (v0.7.0+): per-access `/webhooks` aggregated to `webhooks.json` keyed by `accessId` | symmetric, both flavors; expired (401/403) tokens skipped silently and non-fatally |
| events | ✅ raw rows from events table (cross-user filter by `user_id`), streamed a batch at a time (`events.exportAllStreamed`, falling back to `exportAll` on an engine that does not offer it) | ✅ **0.5.0+** chunked monthly: `events-YYYY-MM.json` (one file per UTC month in the discovered range; probed via `limit=1` ascending + descending) | subject side avoids single-shot timeout at production scale |
| attachments | ✅ binary stream from `eventFiles.getAttachmentStream(userId, eventId, fileId)` | ✅ **CLI + webapp** (v0.7.0+): opt-in binary stream from `GET /events/<id>/<attId>?readToken=…` piped chunk-by-chunk through the `StorageWriter` | symmetric, both flavors |
| audit | ✅ per-user audit store (`auditStorage.forUser(userId).exportAllEventsStreamed()`, falling back to `exportAllEvents()`) | ✅ `GET /audit/logs?fromTime=…&toTime=…` → `audit_logs.json` | same data; audit-store is also exposed as streams under the `:_audit:` store prefix (e.g., `:_audit:access-<accessId>`), both backups capture it via different paths |
| HFS series data points | ✅ **since open-pryv.io 2.0.0-rc.34**: per-user series namespace (`seriesConnection.exportDatabase(seriesNamespace(username))`, helper in `components/business/src/series/namespace.ts`), restorable into any series engine. ❌ Backups taken with earlier releases carry **no** series data on any engine (backup and restore addressed the series under a different key than the one they are stored under, with no warning), and InfluxDB series backups could not be restored: take a new backup after upgrading | ✅ **CLI + webapp** (v0.7.0+): per-event `GET /events/<id>/series` → `hf-data/<eventId>.json` | symmetric, both flavors, for operator backups taken on 2.0.0-rc.34 or later; tested by `[BKSR]` |
| account / system-streams account-tree | ✅ raw rows from user-account storage | ✅ `/account` (the standard system-streams account tree) | symmetric for visible system streams |
| MFA enrolment metadata | ✅ raw private-profile row (`profile.exportAll`), so the full stored `mfa` record: method, `content`, the TOTP secret (AES-256-GCM envelope under the operator's TOTP key), the replay step, the recovery codes (SHA-256 digests for every code generated since open-pryv.io `ef66853e`; codes generated earlier keep their original stored form until the user regenerates them) and the `mfaThrottle` failed-attempt tally; a restore therefore brings MFA back working | ✅ `profile_private.json` carries the read view of `profile.mfa`: `{ method, content, totp: { confirmedAt, algorithm, digits, periodSeconds } }` (open-pryv.io `7ce9ea6f`, 2.0.0-rc.27) | **asymmetric by design**: the subject gets their own MFA enrolment (method, phone number and template values for SMS, TOTP parameters) but no usable MFA secret; the operator backup keeps the server-side state needed to restore. **Operator security note:** the subject bundle is confidential personal data (secure transport, documented destruction) but not MFA-bypass material. The operator backup holds the encrypted TOTP secrets, so keep the TOTP key (`services.mfa.methods.totp.secretsKey`, or the `auth.adminAccessKey` it is otherwise derived from) stored apart from the backups |
| CMC counterparty metadata | ✅ via `clientData.cmc.counterparty` + `clientData.cmc.apiEndpoint` on each shared access row | ✅ via `clientData.cmc.counterparty` + `clientData.cmc.apiEndpoint` on each shared access (passed through `composeWireAccess`) | **no gap**, federation counterparty `{username, host}` and back-channel `apiEndpoint` round-trip in both tools. Jurisdiction-per-host inference is the implementer's responsibility, no host-to-country registry in the API |
| External ids (open-pryv.io 2.0.0-rc.58) | ⚠️ **platform part only in 2.0.0-rc.58 and 2.0.0-rc.59**: the namespace rows with their salts travel in the platform data stream (a restore keeps a live namespace whose salt differs and reports it, `extIdNamespaceSaltMismatch`, `[XIDB1]`); the `ext-id/` index rows are rebuilt by `bin/reconcile-user-cores.js --ext-ids`. The account's own ids (home-core local table: blinded value, namespace, claim date) are **not** in the per-user backup of those releases; your database-level backup of the core holds them (the PostgreSQL `external_ids` table, or the SQLite `external-ids.db` file). ✅ **From 2.0.0-rc.60** the per-user backup carries them (`users/<userId>/external-ids.jsonl[.gz]`, incremental chains included) and a restore links them again after the platform rows; an id another account or core holds by then stays with its holder (`lost`), an id whose namespace is absent is `skipped` (restore report line `External ids: … restored, … lost, … skipped`) `[XIDB2]`..`[XIDB4]`, `[XIDBK1]`, `[XIDBK2]` | ❌ not exported (`account.externalIds.list` returns namespaces and claim dates only, never a value; the tool does not call it as of v0.8.2) | **asymmetric by design from 2.0.0-rc.60**: the subject can list which namespaces are linked and when through the API with a personal token, never the value; the operator backup holds the blinded values, each able to claim its id, so keep it encrypted like a credential store. Until that release, a gap on both sides. See the `external-id-index` primitive |
| Account aliases (access aliases, former usernames) | ⚠️ **not carried before open-pryv.io `4547b32a`** (2.0.0-rc.66): after a restore, aliased accesses and endpoints under a former username answered `404` and a former username was free for a new registration. ✅ **From that release** the per-user manifest lists the aliases (`aliases`) and the restore reserves them again; an alias another account or core holds by then stays with it and is reported `[BKAL1]`. The series still held under a former username are exported and restored under the username `[BKAL3]` | ❌ not exported as such (the subject sees each access's `alias` in `accesses.json`) | **asymmetric**: aliases are platform routing state the operator restores; take a new backup after upgrading, backups written before list none |
| Integrity manifest | ✅ **since open-pryv.io 2.0.0-rc.86**: each run's `manifest.json` lists every file of the run with its size and SHA-256 hash (`integrity.files`) and is bound to its run; a restore refuses a run with a file added, removed, resized or changed, and checks an account's files before writing anything of it `[BKSM1]`, `[BKSM2]`; `--inspect --verify-files` checks every file without restoring `[BKIS3]`; an optional Ed25519 `manifest.sig` per run (`--signing-key`, verified with `--signing-pubkey`) proves who wrote the run `[BKSM4]`, `[BKIS1]`. The manifest also records the format version, `coreVersion`, backup type and timestamps, and per-user item counts. ⚠️ **Up to 2.0.0-rc.85**: no per-file hash; corruption is caught on read by the gzip CRC-32 of each compressed file and, for an encrypted backup, by the AES-256-GCM tag of every chunk, which detects alteration of that backup but not a substituted, truncated-at-a-chunk-boundary or swapped file (with recipient-key encryption, whoever holds the public key and can write to the destination can produce a backup that restores). Such backups restore as before, reported as "file list not verified". Event records keep each attachment's `integrity` digest (`integrity.isActive.attachments`, on by default), but restore does not re-check attachments against it | ✅ `manifest.json` (sha256 per file, tool version, ISO timestamp, `manifest.verify(rootDir, cb)`) | **symmetric in kind from 2.0.0-rc.86**: both carry a per-file hash table; the operator's is checked by the restore itself and can be signed, but its runs are restored with Pryv (or the bundled `decrypt-backup.mjs`), not handed to a third party; the subject backup needs portable proof for a third-party auditor. A plaintext operator run's file table detects corruption, not tampering |

## Operator incremental backups (`bin/backup.js --incremental`)

Source: open-pryv.io `CHANGELOG-v2.md`, `## 2.0.0-rc.51`.

- **Before 2.0.0-rc.51, an incremental run destroyed the full backup it continued.** It wrote the changes since the previous run into the same files as the full backup, replacing them; with encryption each run also minted a new key, so files the delta did not rewrite were left under a key `encryption.json` no longer described. A restore of such a directory reported success while restoring only the last delta. Nothing in it can be repaired. Signs: no `chain.json`, and a `manifest.json` saying `"backupType": "incremental"`; `node bin/backup.js --inspect <dir>` prints `DAMAGED`, and `--restore` refuses it (`--allow-incomplete` restores the delta anyway). Operator step: take a new full backup into a new directory, then continue the incrementals from there. Full backups written by earlier releases are not affected.
- **Since 2.0.0-rc.51, incrementals form a chain.** Each run writes its own `incrementals/<runId>/` directory (own manifest, own `encryption.json` when encrypted) and `chain.json` at the root lists the runs; no file of an earlier run is opened for writing (`[BKC1]`). A restore applies the full backup then each run in order, a newer version of a stream, access, event or attachment replacing the older one, deletions included (`[BKC2]`, `[BKIC1]`); `--through-run <runId>` restores up to a given run, and a chain with a missing or reordered run is refused by name (`[BKC7]`).
- **Window and deletions.** A run's window starts at the previous run's snapshot time with a one-minute overlap the restore merges away, so items changed while the previous run was in progress are no longer missed (`[BKC3]`); the deletion of streams, accesses and webhooks counts as a change and is carried (`[BKC4]`). Series emptied after a run stay empty on restore (`[BKCE1]`, `[BKCE2]`).
- **Encrypted chains.** Each run has its own envelope and key under the chain's key model; the passphrase is checked against the previous run before anything is written, and a recipient-key chain is continued with the public key alone (`[BKC5]`, `[BKIC3]`). Each run carries the current `decrypt-backup.mjs` and `RESTORE-README.md` (`[BKCS1]`); on a chain, use the newest run's script.
- **Concurrency.** Two runs into the same directory at the same time: the second to finish is refused and its directory left aside (never restored); the chain keeps the first (`[BKCC1]`). Since 2.0.0-rc.86 the update of `chain.json` takes a lock file (`.chain.lock`), so two runs finishing together no longer race on it; a lock older than a minute is a leftover of a crashed run and is taken over (`[BKLK1]` to `[BKLK3]`).
- **Erased accounts.** A run made without `--user` records that it covers the whole core; a restore drops any account such a run does not list (logged by name), so an account deleted between two runs is not re-created (`[BKCU1]`, `[BKIC4]`). Its data stays in the earlier runs until you retire them: `--through-run` of a run that held it restores it as of then, and `--inspect` shows each run's scope and the accounts deleted along the chain. For Art.17 purposes, chain retention belongs in your backup-rotation policy.
- **Integrity bound.** Up to 2.0.0-rc.85, `chain.json` and the per-run manifests are checked for consistency on restore, but not signed. Since 2.0.0-rc.86 they are bound to each other and to the files (next section).
- **SQLite restore while the core runs.** Since 2.0.0-rc.51 a running core reads an account's `account-1.0.0.sqlite` that a restore replaced or deleted, instead of the old file through its open connection (`[UASF1]`, `[UASF2]`).

## Authenticated files and signed runs (open-pryv.io 2.0.0-rc.86)

Source: open-pryv.io `CHANGELOG-v2.md`, `## 2.0.0-rc.86`; operator page `customer-resources/backup` on the developer site; `SECURITY-AUDIT.md` revision 25, "Fixed in 2.0.0-rc.86".

- **File table.** Every file of a run is listed in the run's manifest with its size and hash, and the manifest is bound to its run. A restore refuses a run with a file added, removed, resized or changed, and a `chain.json` entry that disagrees with the run's manifest (users, scope, snapshot time) (`[BKSM1]`, `[BKSM2]`, `[BKSM3]`). An account's files are checked before anything of the account is written.
- **Bound blocks.** An encrypted file now ends with a marked final block, and each block is tied to its file, its position and its run, so a file truncated at a block boundary, an empty file left in place of a real one, or a file swapped between two accounts is refused instead of restoring as valid. Files of the first format still decrypt.
- **Signed runs.** `--signing-key <ed25519 pem>` at backup writes a `manifest.sig` per run; `--signing-pubkey <pem>` at restore and `--inspect` requires every run to be signed by that key (`[BKSM4]`, `[BKIS1]`). A chain is signed from its full backup on: to start signing, take a new full backup into a new directory. With a recipient public key and no signing key, a writer holding that public key can still replace a run, and the backup warns that it is not signed (`[BKSM5]`, `[BKIS2]`). Keep the private signing key on the backup host and the public key with the restore secret.
- **Verification without restoring.** `--inspect` shows each run's file count and whether it is signed; `--inspect --verify-files` (with the backup's secret) reads and checks every file (`[BKIS3]`). The bundled `decrypt-backup.mjs` applies the same checks, stops at the first damaged file naming it (`--ignore-damaged` writes everything else and lists what it skipped) and verifies signatures with `--signing-pubkey`.
- **Backup directory hygiene.** A file the backup did not write, found in a run's directory (the backup root included), is refused at restore; files that operating systems and storage appliances create by themselves (`.DS_Store`, `._*`, `Thumbs.db`, `desktop.ini`, `.nfs*`, `lost+found`, `@eaDir`, `.snapshot`, `.zfs`, ...) are ignored with a notice (`[BKSM7]`). A backup refuses to start in a directory that already holds other files, and refuses to complete a run when a file appeared in its directory while it was written (`[BKSM8]`). Keep the backup directory for the backup only.
- **Key derivation.** New passphrase backups use scrypt N = 2^17 (about 134 MiB of memory once per run at restore and inspect); existing backups are unaffected.
- **Compatibility.** Runs written by earlier releases restore as before, reported as "file list not verified"; a run written by an earlier release after a run of 2.0.0-rc.86 in the same chain is refused (`--through-run` restores up to the last verified run) (`[BKSM6]`). A backup written by 2.0.0-rc.86 or later restores with that release or later: after going back to an earlier release, start a new chain in a new directory.
- **Accounts erased or failing.** An account deleted while a full backup runs is left out of the run, instead of being backed up empty and having its directory and empty databases created again on disk (`[BKDU1]`). An account whose restore fails once its data is being written (a database error, a full disk) is no longer left half-restored: what was written is cleared and the account is removed from the core's index (its routing row released), so a new restore starts clean; an account that was on the core before an `--overwrite` restore is left empty (`[RSFC1]` to `[RSFC4]`).
- **Residual bounds.** An unsigned recipient-key run, and any run read without `--signing-pubkey`, is authenticated only against someone who does not hold the data key; a plaintext run's file table detects corruption, not tampering; files a restore does not read are not hashed (`--inspect --verify-files` does); the `chain.json` lock relies on an exclusive file create and on the destination's clock being close to the backup host's.

## Article coverage by tool

| Article / clause | Satisfied by | Notes |
|---|---|---|
| GDPR Art.15(1)(a), purposes of processing | Subject backup (`accesses-all.json` 0.5.0+ for consent-state-at-time-of-access provenance) | revoked + expired tokens carry the historical "what permission did this app have, when" view |
| GDPR Art.15(1)(c), recipients of data | Subject backup (`audit_logs.json` + `accesses-all.json` + `webhooks.json`) | audit log carries actual disclosures; accesses-all carries the recipient-token universe; webhooks carry outbound delivery configuration |
| GDPR Art.15(1)(f), third-country transfers | Subject backup (`clientData.cmc.counterparty.host` on each shared access; implementer infers jurisdiction from host) | no built-in jurisdiction-per-host registry, operator policy concern |
| GDPR Art.20, portability | Subject backup (read side complete; restore side experimental, audit/webhooks/accesses deliberately not replayed; HFS + multi-attachment round-trip work 0.4.0+) | operator backup not a portability tool; rows aren't subject-shape |
| GDPR Art.30, records of processing | Operator backup (raw row history for the operator's own Art.30 register) | not a subject-disclosure tool |
| CCPA §1798.110, right to know | Subject backup | same as Art.15 |
| CCPA §1798.115, right to know about sale/sharing | Subject backup (`accesses-all.json` includes shared-access history) | |
| PIPEDA Principle 4.9, access | Subject backup | |
| Swiss nLPD Art.25, right to information | Subject backup | |
| HIPAA-privacy §164.524, access to PHI | Subject backup | |
| Disaster recovery / regulator-mandated retention | Operator backup | restore-into-fresh-engine; cross-cluster migration |

## Where the asymmetries are intentional

- **Integrity manifest**: `bin/backup.js` reads through the storage layer (it does not use `pg_dump` or copy SQLite files). Since open-pryv.io 2.0.0-rc.86 each run's manifest carries a per-file size and hash table that the restore checks, and a run can be signed (Ed25519) so a restore proves who produced it; sign recipient-key backups, because recipient-key encryption alone provides confidentiality, not authenticity. Up to 2.0.0-rc.85 it wrote no per-file hash (item counts, gzip CRC-32, and for an encrypted backup the per-chunk AES-256-GCM tags only). In both cases protect write access to the backup destination and restore with `--require-encrypted`. The subject backup emits per-file sha256 because the subject's auditor needs portable proof.
- **Restore-side gaps on subject backup**: audit logs, webhooks, and accesses are explicitly excluded from restore in 0.5.0. Reason: audit is system-generated (injecting it would produce false audit history); webhooks are keyed by `accessId` which changes on a fresh destination; access tokens are server-minted and not replayable. Subject backup IS the historical record for these.
- **Wire shape vs row shape**: operator backup writes raw storage rows including internal serial columns (`createdBySerial`, `modifiedBySerial`, `headId`); subject backup uses `composeWireAccess`-equivalent shapes so the subject sees the same field names as the API documentation.

## Where the asymmetries are unintentional (known gaps)

**External ids (open-pryv.io 2.0.0-rc.58 and 2.0.0-rc.59):** neither tool carries the account's
own external ids (see the row above). After restoring an account from a `bin/backup.js` backup
alone, its links are gone; restore the core's local external-id table from your database-level
backup, then run `bin/reconcile-user-cores.js --ext-ids` on that core (it refuses, exit code 3, to
free the core's index rows while the local table is empty). Fixed on the operator side in 2.0.0-rc.60: the per-user backup
carries the ids, and a backup written by an earlier release still restores without them. After a
restore, `--verify-integrity` rolling an account back keeps its restored ids (the account stays):
release them with the admin release (`POST /system/admin/ext-id/release`) if the account is to be
dropped.

Otherwise none known after 0.5.0, per-access version history shipped behind an opt-in CLI flag; MFA enrolment metadata is covered (re-verified for open-pryv.io 2.0.0-rc.27: `profile.get` returns the enrolment without its secrets, see the MFA row above; the MFA asymmetry between the two backups is deliberate, not a gap).

**Operator-side scale (addressed 2026-09-17).** The subject-side tool has chunked its events
fetch since 0.5.0 specifically to survive production-scale accounts, while the operator tool
held each collection in memory in full. That was a practicability limit rather than a coverage
gap, but it pointed the same way: a right of access that the operator's own tool cannot run to
completion on a large account is not usefully fulfillable. Events and audit now stream through
the export a batch at a time on both engines, so operator-backup memory is bounded by the
writer's chunk size rather than by the size of the account. Measured on 200 000 audit rows:
peak RSS 603 MB streamed versus 786 MB buffered on SQLite, 505 MB versus 778 MB on PostgreSQL,
with byte-identical output. No coverage, format, or restore semantics changed.

The only items deliberately left out are the restore-side gaps documented in the intentional-asymmetries section (audit/webhooks/accesses can't be replayed safely).

## Reading order for an auditor

1. **Start with this note** to understand which tool to ask the operator to run for a given right-of-access / portability request.
2. **`account-backup-coverage.md`** for the subject-side per-data-type checklist + the if-you-must-answer-a-DSAR-before-the-backlog-ships fallback procedure.
3. **`proposals/account-backup-dsar-completeness.md`** for the shipped-vs-queued evidence trail.

## Related primitives

- `proposals/account-backup-dsar-completeness.md`: Status: SHIPPED through v0.5.0.
- `proposals/audit-on-user-delete.md`: audit-retention modes intersect with audit-in-DSAR (`keep` mode means more rows to export; `pseudonymise` mode is not implemented and is refused at boot).
- `docs/pryv-primitives.md`: audit entry confirms audit-in-DSAR is data-minimal by construction.
