# PlatformDB cross-border implications: the two-tier residency model

Pryv's residency story (`context/core-affinity-architecture.md`,
`context/account-backup-coverage.md`) is **two-tiered**, not
single-tiered. The simplified narrative "Pryv is core-affine" is
true for the data mass but incomplete for the identification +
routing layer. This note carries the verified picture.

## Tier 1 — Identification + routing layer (cluster-replicated)

PlatformDB is the rqlite-backed key-value store replicated
**cluster-wide** via Raft across every cluster member. In a
single-region cluster, replication stays inside one jurisdiction
and the cross-border question doesn't arise. In a multi-region
cluster (e.g., the production pryv.me topology with `core-use1`
in Virginia + `core-euc1` in Frankfurt), **every PlatformDB
row lives on both cores**.

Verified contents (read from `storages/interfaces/platformStorage/
PlatformDB.ts:120-244`):

| Keyspace | Contents | Personal-data class |
|---|---|---|
| `user-core/<username>` | username → coreId mapping (residency anchor — Q12) | **PII** (username identifies a person) |
| User unique fields (`setUserUniqueField`) | system-stream-driven uniqueness check: typically **username**, **email**, optionally phone / employee-id / SSN-equivalent per `customExtensions.systemStreams` config | **PII**, possibly sensitive |
| User indexed fields (`setUserIndexedField`) | deployment-configured non-unique fields (country code, language, etc.) | typically PII |
| `dns/<subdomain>` | per-user subdomain → core address mapping (subdomain == username in standard deployments) | **PII** |
| `access-state/<key>` | transient cross-worker access-flow state during `/reg/access` | PII (per-user, lifetime ~minutes) |
| `cluster_kv/*` | MFA SessionStore, other ephemeral cross-worker state | PII (lifetime ~hours) |
| `tls-cert/<hostname>`, `tls-acme-account` | LE certs + account (optional ACME integration) | operator metadata only |
| `observability/*` | encrypted observability secrets | operator secrets |
| `mail-template/<type>/<lang>/<part>` | (planned mail-template admin work) | operator-controlled (could leak example PII in templates) |
| `core-<id>`, bootstrap tokens | cluster topology + join state | operator metadata |

Per-user steady state: ~50-200 bytes (username + email + 1
user-core mapping + 1 DNS record). For 100k users, ~5-20 MB
cluster-wide. Small compared to event data (which can be GBs per
user); but **quantity doesn't change the legal analysis** — it's
still personal data crossing borders.

## Tier 2 — Content + audit layer (residency-pinned)

**NOT replicated** by PlatformDB; stays on home core only:

- Event content (the mass of personal data).
- Streams tree.
- Audit log (per-user SQLite file or per-engine table on home
  core).
- Attachments.
- Access permissions + `clientData` (including `transfer_basis`
  from `context/transfer-basis-convention.md`).
- HF series data points.

Q12 core-affinity holds for Tier 2 cleanly. A subject's Art.15
data export from a multi-region cluster sources entirely from
their home core's storage.

## Implication for GDPR Art.44 / Art.46

In a multi-region cluster, **Tier 1 IS a continuous cross-border
transfer of personal data**. Every Raft round-trip moves the
identification layer between jurisdictions. An Art.46 mechanism
(SCCs, BCRs, adequacy reliance) is **legally required** for the
replication, even though Tier 2 (the heavy content) stays
residency-pinned.

## Mitigation options

Three architectural levers, each with distinct legal status. Use
in combination, not as substitutes.

### A. At-rest encryption of PlatformDB

**What it changes**: protects against SSD-forfeiture, backup-tape
forfeiture, decommissioned-hardware exposure, filesystem-level
breach. Runtime + replication path unchanged.

**Legal status**: same as today — Art.46 mechanism still required
for the live replication of personal data. Doesn't change the
classification.

**Value**: real defence-in-depth against passive forfeiture
scenarios. Cheap (~1 day).

**Backlog**: internal slug `PLATFORMDB-AT-REST-ENCRYPTION`.

### B. HMAC-pseudonymisation of PII at PlatformDB layer

**What it changes**: persisted rows are HMAC-derived hashes; live
request paths unchanged; pepper shared cluster-wide. Operator
opts into `platform.piiMode: hashed` (or `minimised` — see below).

**Legal status under EDPB / WP29 Opinion 05/2014**: classified as
**pseudonymisation**, NOT anonymisation. Re-identification by
"reasonable means" is feasible because:

- Input domain is low-entropy (usernames + emails are constrained
  formats; brute-force grinding at ~10⁹ HMAC/sec is tractable).
- Auxiliary information is in scope: cluster-shared pepper +
  runtime request paths carrying cleartext (DNS queries,
  HTTP `Host:`, login bodies).
- Recital 26 keeps such pseudonymised data **in GDPR scope**.

So an Art.46 mechanism is STILL required for cross-border
replication of HMAC-pseudonymised rows.

**Value**:

- Material defence-in-depth — SSD-dump / backup-tape scenarios
  yield hashes (brute force is feasible but **detectable**);
  cleartext is silent to extract.
- Strengthens **Art.32(1)(a)** "pseudonymisation" security
  measure evidence — explicitly named in the regulation as a
  recognised technique.
- Strengthens the **combined Art.46 + Art.32 + Art.30**
  narrative: "SCCs in place AND PII pseudonymised at the
  platform layer AND audit log captures every cross-border
  access" is a strictly stronger posture than SCCs alone.

**Operator decision per Q25**: option to **strip email out
entirely** (posture "minimised"). Email lives only in home-core
local user-account storage; email-uniqueness becomes home-core-
local (no cluster-global guarantee). Lost feature: "find username
by email" recovery. Acceptable tradeoff for many deployments
where username-based recovery suffices.

Effort: ~3-5 days. **Backlog**: internal slug
`PLATFORMDB-PII-HASHING`.

### C. Tokenisation with per-region mapping table (the structural answer)

**What it changes**: at registration, the home core generates a
random opaque token (256-bit secret). The `username ↔ token`
mapping persists **only on the home core's local storage** —
NEVER replicated to PlatformDB. Cluster-replicated rows reference
the token, not the username:

- `user-core/<token>` → `<coreId>`.
- `dns/<token-subdomain>` → core URL.
- Uniqueness columns are HMAC-of-tokenised-input; mapping back
  requires the home core.

**Legal status**: closer to **true anonymisation from the foreign
core's perspective** — the cluster-shared identifier is a random
string with no derivable link to a natural person without
breaching the home core (which is a separate-jurisdiction's worth
of legal/technical control).

**Tradeoffs**:

- DNS subdomains are tokens (`tk_a8f9c2.pryv.me`). Either the
  operator's UI translates client-side (`alice.pryv.me` ↔
  token), or the operator accepts opaque subdomain UX.
- Account recovery "I forgot my username, here's my email" —
  needs the home core (right answer under data-minimisation
  anyway).
- Cross-region admin operations gain a federated lookup hop
  (small latency impact).
- Pepper rotation maps to token re-issuance per user — bigger
  operation but bounded by user count.

**Effort**: many weeks. Bigger architectural lift than A or B.
Pairs naturally with the `ALIASES` backlog — random-token IS
the alias from the user's perspective; their human-chosen
username need never enter PlatformDB.

**Not backlog-filed at this time** (Q25 brainstorm-tier;
operator decision pending whether the regulatory regime
justifies the investment).

## Posture recommendation

- **Single-region cluster**: A is worth doing (cheap baseline);
  B / C are unnecessary (no cross-border transfer to mitigate).
- **Multi-region cluster + SCCs in place**: A + B. The SCCs
  legally authorise the transfer; A + B strengthen the
  defence-in-depth narrative. ~5 days total.
- **Multi-region cluster + "no PII may leave EU" requirement**:
  A + C. The structural answer; B alone doesn't satisfy this
  requirement (still personal data under EU regulatory guidance).
- **Multi-region cluster + no Art.46 mechanism yet**: stop
  multi-region until the legal basis is established. Hashing
  doesn't substitute for the mechanism.

## Matrix encoding

- `gdpr.Art.44` detail block extended with the two-tier model
  framing.
- `gdpr.Art.46` detail block extended with the SCCs +
  pseudonymisation combined narrative.
- `gdpr.Art.32` `planned:` chip added for `PLATFORMDB-AT-REST-
  ENCRYPTION` (concrete encryption-at-rest evidence) +
  `PLATFORMDB-PII-HASHING` (concrete pseudonymisation evidence).
- `swiss-nlpd.Art.34` cross-references via `derives_from`.
- `iso-27001.A.8.11` (data masking) `planned:` chip for
  `PLATFORMDB-PII-HASHING`.
- `iso-27001.A.8.24` (use of cryptography) `planned:` chip for
  both `PLATFORMDB-AT-REST-ENCRYPTION` + `PLATFORMDB-PII-
  HASHING`.
- `compliance-matrix/UPDATE-TRIGGERS.md` Section A entries for
  both backlog slugs.

## See also

- `context/transfer-basis-convention.md` — access-bound
  `clientData.transfer_basis` convention; the access-level
  parallel to this PlatformDB-level note.
- `context/subprocessor-posture-and-data-flow.md` — the third
  cross-border surface (vendor integrations).
- `context/core-affinity-architecture.md` — the Tier 2 residency
  guarantee.
- Internal backlog slug `PLATFORMDB-AT-REST-ENCRYPTION` —
  option A backlog.
- Internal backlog slug `PLATFORMDB-PII-HASHING` — option B
  backlog.
- Internal backlog slug `ALIASES` — pairs with option C
  tokenisation path.
