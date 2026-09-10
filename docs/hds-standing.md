# How HDS itself stands

Audience: whoever maintains this matrix. If you are an implementer, the page you
want is <https://compliance.datasafe.dev/standing.html>, not this file.

## The two axes, and why they must never be mixed

Every scope file carries two independent measurements. Conflating them has
already produced two wrong public claims, so the separation is enforced rather
than merely recommended.

| | Field | Question it answers |
|---|---|---|
| **Coverage** | `requirements[].hds.coverage` | What does HDS carry *for an implementer* on this requirement? |
| **Standing** | `hds_posture` | Does HDS *as an organisation* meet this regulation? |

Neither is derivable from the other. A requirement can be `implemented` for an
implementer while HDS holds no role under the regulation at all, which is exactly
the HIPAA situation: HDS supplies the whole technical control and is nobody's
business associate in the vault.

A third signal is often mistaken for a fourth axis and is not one:

- `requirements[].draft` records whether a **second reader has checked the matrix
  wording**. It says nothing about whether HDS holds the control. Leading the
  standing page with it once read HIPAA as 18 of 91 where the documentation
  backing was 88 of 91.

## Arrangements: standing differs by role, so a role must be named

`hds_posture.roles[]` is a list, not a scalar, because HDS's position is not the
same in every arrangement it might enter. Each entry names an `arrangement`, the
`role` HDS holds in it, and one line saying which processing that covers.

Two arrangements exist in the schema:

- **`vault`** is this matrix's subject. Individuals hold their own accounts, data
  enters only with their explicit consent, and they decide who may access it.
- **`covered-entity-relationship`** is the HIPAA case where a Covered Entity is
  party to the relationship. That is a different statutory test and it does not
  import a GDPR processor role.

**`processor` is deliberately absent from the `role` enum.** For the vault
product HDS cannot satisfy Art.28(3): it processes on the individual's
permissions rather than a controller's documented instructions, the individual
exercises their rights directly, and HDS cannot delete or return an individual's
vault at a third party's direction. An organisation that receives data an
individual chose to share is an **independent controller** of what it then holds.
Any future engagement where HDS genuinely does process on instructions falls
outside this matrix and carries its own documentation.

`no_role_note` is where a scope explains why HDS does **not** hold the role a
reader would expect. It exists so that "no role" reads as a considered position
rather than an omission.

## The gates that make an unearned assurance claim impossible

These run in `npm run validate`, which is the merge gate. They exist because
every one of them corresponds to a claim someone actually tried to make.

1. **Every scope must carry `hds_posture`.** A scope with no stated standing
   fails the build. Silence is not an option, because silence reads as adequacy.
2. **A claim of independent assurance must name the thing that grants it.** If
   `external_assurance.level` is `independent-readiness-review`,
   `third-party-attested` or `certified`, the `detail` must name a certificate,
   an issuer or a date. A level without a nameable artefact is rejected.
3. **A hosting provider's certificate is not HDS assurance.** Those go in
   `external_assurance.inherited_provider_assurance[]`, are rendered on the site
   as explicitly *not* HDS's own, and an entry naming HDS fails validation. This
   gate exists because Exoscale attestations were once listed as assurance HDS
   inherits when nothing was on file for the Swiss region at all.
4. **Every known gap must be anchored.** A `known_gaps[]` entry requires a
   `summary` and a `severity`, plus at least one of `refs`, `internal_doc` or
   `tracking_url`. Any `refs` entry must resolve to a real requirement in that
   scope. An unanchored gap is a gesture at candour rather than candour.
5. **`evidence_backing` is derived, never authored.** Validation recomputes
   `rows_total` and `rows_evidenced` from the file itself and fails on a
   mismatch, rejects `rows_approved > rows_evidenced`, and warns when the block
   is stale. You cannot type a better number in.

## The evidence-backing numbers

`hds_posture.evidence_backing` answers: of this scope's requirements, how many
rest **entirely** on internal documents that have completed approval? Four
counts, `rows_total`, `rows_evidenced`, `rows_approved` and `as_of`, and nothing
else.

Regenerate with a `compliance-internal` checkout alongside:

```sh
npm run evidence:status              # report only
node scripts/evidence-status.js --write   # update scopes/*.yml
INTERNAL_REPO=/path/to/compliance-internal npm run evidence:status
```

This is **local and dev only**. The matrix repo is public and must not depend on
the private one, so this is not part of CI, for the same reason as
`check-internal-links.js`. Re-run it whenever a cited document changes state, and
whenever you add or remove a citation: adding an honest citation to a document
still in review will correctly *lower* the approved count.

### The per-row marker, and why it is one-sided

The same script writes `requirements[].hds.evidence_approved` on rows where every
cited internal document has completed approval. The site renders that as "backed
by approved documentation".

It is written **only as `true`, never as `false`**, and the schema pins it to
`const: true`. That is not decoration. The document codes are already public, and
140 of the 214 evidenced rows cite exactly one document, so a two-state marker
would publish a per-document approval status list. One-sided, the negative case
discloses nothing, because the absence of the marker has three different causes:
the row cites no internal document, it cites one still in review, or it is a row
HDS does not answer from documentation at all.

Consequences for anyone editing:

- **Never hand-write `evidence_approved`.** It is generated. Nothing in CI can
  catch a hand-written one, because CI cannot see the private repo.
- **Never render it negatively**, on a page or in `llms.txt`. An agent that
  reported "backed: no" would be stating a claim the data does not support.
- The honest aggregate remains the per-scope `evidence_backing` counts.

## Reviewing a row against compliance-internal

`draft: false` means a second reader checked the wording. The useful test is
whether the row still matches the approved document it cites. Two failure shapes
recur, both found in September 2026:

- **The document names an open gap and the row omits it.** The internal documents
  are candid about what is not yet in place, naming risk-analysis items,
  undefined cadences, manual rather than automated detection, and controls
  attested rather than evidenced. A row that describes the designed control
  without the named gap overstates.
- **The row assigns to the implementer a decision HDS has already taken.** The
  multi-factor position was the instance: an approved, dated HDS decision that
  the row described as the implementer's to make.

The schema carries `reviewed_by` and `reviewed_at` for recording who cleared a
row and when. Use them: a `draft: false` with neither is an unattributed claim
that a review happened.

### The 2026-09-10 pass, and what its attribution means

The 28 rows then at `draft: false` carried neither field, so they asserted a
second reading with nothing saying who did it. They were re-reviewed on
2026-09-10 and now carry `reviewed_by: perki`, `reviewed_at: 2026-09-10`.

**The method, recorded once here rather than implied by the field.** Each row was
cross-read against the approved internal documents it cites. Where the two
diverged, the divergence was put to perki and the correction was his decision;
where they agreed, the clearance was delegated. So `reviewed_by` names the person
accountable for the outcome, not necessarily the reader of every line. Nine rows
were corrected in that pass, three of them wrong in ways checkable without any
internal document at all: a row that told the reader which sibling rows exist and
was wrong about it, a standing statement crediting HDS with a populated Art.30(2)
processor register that is empty by design, and a SOC 2 row saying no risk
assessment had been conducted when an approved one exists.

The lesson for the next pass is that the mechanical scans miss things. A
heuristic looking for hedging language cleared a row because it contained the
phrase "remains accountable". Read the row.

## Related

- [`../schemas/hds-scope.schema.json`](../schemas/hds-scope.schema.json), where
  each field's description carries its reasoning.
- [`implementer-profiles.md`](implementer-profiles.md) for the other half of the
  model, what an implementer has to do.
- [`../scopes/README.md`](../scopes/README.md) for the scope files themselves.
