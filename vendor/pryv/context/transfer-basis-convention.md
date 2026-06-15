# `access.clientData.transfer_basis` — convention for GDPR Art.46 / cross-border transfer recording

GDPR Art.46 requires "appropriate safeguards" for transfers outside
the EEA absent an adequacy decision (Art.45). The §2 catalogue —
SCCs, BCRs, approved codes / certifications, ad-hoc supervisory-
authority-approved clauses — defines six mechanisms. Implementers
must record which mechanism applies to each cross-border flow they
operate.

Pryv's data-residency model (`context/core-affinity-architecture.md`)
keeps events / streams / audit / attachments on home core only. The
cross-border transfer surfaces remaining in a Pryv-based deployment
are:

1. **CMC counterparty fetches** — when an EU subject's stream is
   shared with a US-based counterparty, the US client's reads
   cross borders even though the data does not replicate.
2. **Multi-region cluster replication** — PlatformDB rows (Tier 1
   identification + routing — see
   `context/cross-border-platformdb-implications.md`) replicate
   between region pairs via rqlite Raft.
3. **Subprocessor outbound traffic** — SMTP / SMS / observability
   integrations to vendors with cross-border data flows (per
   `context/subprocessor-posture-and-data-flow.md`).

This note covers surface 1 — the access-bound dimension. Surface 2
has its own context note (PlatformDB implications). Surface 3 is
covered in subprocessor-posture.

## Convention shape

Record the Art.46 mechanism on the relevant access's `clientData`
under the key `transfer_basis`. Same pattern as `clientData.
lawful_basis` (Q6 — Art.6) and `clientData.special_category_basis`
(Q22 — Art.9):

```json
{
  "permissions": [{"streamId": "health", "level": "read"}],
  "clientData": {
    "lawful_basis": "art.6.1.a explicit consent",
    "special_category_basis": "art.9.2.a",
    "transfer_basis": {
      "mechanism": "art.46.2.c",
      "scc_module": "C2C",
      "scc_version": "2021/914",
      "scc_signed_date": "2026-03-15",
      "scc_document_ref": "https://intranet.example.com/legal/scc-userB.pdf",
      "origin_country": "CH",
      "destination_country": "US",
      "adequacy_decision": null
    }
  }
}
```

Field reference:

| Field | Type | Notes |
|---|---|---|
| `mechanism` | string | Art.46(2) lit-letter — `"art.46.2.a"` (legally binding instrument between public authorities) … `"art.46.2.c"` (SCCs) … `"art.46.2.f"` (approved certification). Or `"art.45"` if relying on adequacy. Or `"art.49"` if a derogation applies (note Art.49 is for exceptional cases only). |
| `scc_module` | string (optional) | EU 2021/914 module: `C2C`, `C2P`, `P2P`, `P2C`. |
| `scc_version` | string (optional) | Decision reference (e.g., `"2021/914"`). |
| `scc_signed_date` | ISO-8601 date (optional) | When the contractual instrument took effect. |
| `scc_document_ref` | URI (optional) | Pointer to the operator's stored SCC PDF / contract. |
| `origin_country` | ISO-3166-1 alpha-2 | Subject's controller country. |
| `destination_country` | ISO-3166-1 alpha-2 | Recipient processor / controller country. |
| `adequacy_decision` | string-or-null (optional) | Reference if `mechanism: "art.45"` (e.g., `"EU-US DPF"`, `"CH-EU adequacy 2000"`). |

The convention is **operator-owned editorial metadata** — Pryv
persists it on the access via existing `clientData` machinery
(no platform code change). The validator does not enforce shape;
the operator's tooling reads it.

## Why this works — existing primitives carry the load

| Need | Existing primitive |
|---|---|
| Persistence | `access.clientData` already persists arbitrary JSON |
| Versioning (when did this basis become effective?) | Access-versioning (`context/access-versioning.md`) preserves the basis chain across `accesses.update`; queryable via `?includeHistory=true` |
| Audit trail (who set the basis when?) | `accesses.create` + `accesses.update` are in `AUDITED_METHODS`; audit row records the change |
| Per-access query | `GET /accesses` returns the array with `clientData`; one `jq` line yields the Art.30 register |
| CMC integration | `consent/request-cmc.clientData` + `accept-cmc.clientData` carry through end-to-end |
| Cross-reference to permissions | Already on the same object — basis + permissions + counterparty endpoint in a single record |

## The Art.30(1)(e) register query

The operator's records-of-processing answer to Art.30(1)(e)
"transfers to a third country" — one command, derivable on
demand:

```bash
curl https://core.example.com/accesses \
  -H "Authorization: <personal-token>" \
| jq '[.accesses[] | select(.clientData.transfer_basis != null) | {
    counterparty: .name,
    mechanism: .clientData.transfer_basis.mechanism,
    scc_module: .clientData.transfer_basis.scc_module,
    scc_version: .clientData.transfer_basis.scc_version,
    scc_signed: .clientData.transfer_basis.scc_signed_date,
    origin: .clientData.transfer_basis.origin_country,
    destination: .clientData.transfer_basis.destination_country,
    document: .clientData.transfer_basis.scc_document_ref,
    access_id: .id
  }]'
```

With `?includeHistory=true` the chain of basis-versions over time
is reachable — answering "what was the SCC reference recorded at
the time of the audit row dated 2026-03-12?".

## Honest limits (what the convention DOESN'T cover)

1. **Discovery / enforcement** — nothing alerts the operator if a
   cross-border access is minted without `transfer_basis`. The
   discipline lives in operator's app code / admin process. See
   the Tier 2 D brainstorm in Q25 for an opt-in cross-border
   detection hook.
2. **Cluster crossings (Tier 1 PlatformDB)** — not on an access
   object; covered in `context/cross-border-platformdb-implications.md`.
3. **Subprocessor flows** — not on an access object; covered in
   `context/subprocessor-posture-and-data-flow.md`.

The convention solves the **access-bound dimension** (~80% of the
operator's Art.46 surface in a typical deployment) with zero Pryv
code change. The remaining 20% is covered in the other two notes.

## Matrix encoding

- `gdpr.Art.46` overview + detail extended with the structured
  shape (was previously `clientData.transfer_safeguard` as a
  top-level string; `transfer_basis` is the richer canonical
  form going forward).
- `gdpr.Art.44` references this convention via cross-link.
- `gdpr.Art.30` register-field-mapping table cites the
  `transfer_basis` key in the "Transfers to third countries"
  cell.
- `swiss-nlpd.Art.34` cross-references via `derives_from`.
- No `planned:` chips — pure convention + existing primitive;
  filed by existing primitive.

## See also

- `context/cross-border-platformdb-implications.md` — Tier 1
  cluster-replication implications + the A/B/C mitigation options.
- `context/subprocessor-posture-and-data-flow.md` — the third
  cross-border surface (vendor integrations).
- `context/cmc-consent-primitives.md` — CMC counterparty
  framing; the natural pairing for cross-platform shares.
- `context/access-versioning.md` — version chain that makes
  the basis history queryable.
