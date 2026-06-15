---
id: baa
title: Business Associate Agreement (template)
kind: baa
signer: covered-entity
counterparty: hds
frameworks: [hipaa]
covers:
  - hipaa-security.164.314(a)(1)
  - hipaa-privacy.164.502(e)(1)
status: draft
version: "0.1.0"
summary: >
  Template BAA between a Covered Entity (or upstream Business Associate) and HDS,
  governing HDS's handling of ePHI on the customer's behalf.
---

> ⚠️ **Not legal advice.** This template is engineering/operational guidance.
> Review and adapt with qualified counsel before execution. Bracketed `[…]`
> fields are placeholders.

# Business Associate Agreement

This Business Associate Agreement ("Agreement") is entered into by and between
`[Covered Entity / Business Associate legal name]` ("Covered Entity") and
**Health Data Safe** ("Business Associate"), effective `[date]`.

## 1. Definitions
Terms used but not otherwise defined have the meaning given in 45 CFR Parts 160
and 164. "PHI" means Protected Health Information; "ePHI" means PHI in electronic
form, created, received, maintained, or transmitted by Business Associate on
behalf of Covered Entity.

## 2. Permitted uses and disclosures
Business Associate may use or disclose PHI only:
(a) as necessary to perform the services described in the underlying service
agreement and on Covered Entity's documented instructions;
(b) as required by law; and
(c) for the proper management and administration of Business Associate.
Business Associate will not use or disclose PHI in any manner that would violate
Subpart E of 45 CFR Part 164 if done by Covered Entity.

## 3. Safeguards (45 CFR §164.314(a), §164.308–312)
Business Associate will implement administrative, physical, and technical
safeguards that reasonably and appropriately protect the confidentiality,
integrity, and availability of the ePHI it handles, including:
- access control and unique user identification;
- audit logging of access to ePHI;
- encryption of ePHI in transit;
- data-residency placement per the region selected by Covered Entity
  (`[EU/Switzerland | US]`);
- monitoring and alerting on its services.
_At-rest encryption status and other current control details are described in
HDS's internal documentation, available on request under this Agreement._

## 4. Subcontractors (§164.308(b), §164.314(a)(2)(ii))
Business Associate will ensure that any subcontractor that creates, receives,
maintains, or transmits ePHI on its behalf agrees in writing to restrictions and
conditions at least as stringent as those in this Agreement (see the companion
**subcontractor** / **subprocessor** templates).

## 5. Reporting and breach notification (§164.410)
Business Associate will report to Covered Entity, without unreasonable delay and
no later than `[60]` days after discovery, any use or disclosure not permitted by
this Agreement, any Security Incident, and any Breach of Unsecured PHI, with the
information required by §164.410(c).

## 6. Individual rights (access, amendment, accounting — §164.524/526/528)
Business Associate will make PHI available to Covered Entity (or, as directed, to
the individual) to enable Covered Entity to meet its obligations regarding access,
amendment, and accounting of disclosures.

## 7. Access to records
Business Associate will make its internal practices, books, and records relating
to the use and disclosure of PHI available to the Secretary for determining
Covered Entity's compliance.

## 8. Term and termination
This Agreement is effective as of the date above and terminates when all PHI is
returned or destroyed, or when protections are extended to PHI that cannot
feasibly be returned or destroyed. Covered Entity may terminate on material
breach that Business Associate fails to cure.

## 9. Return or destruction of PHI
On termination, Business Associate will return or destroy all PHI it holds, where
feasible, and retain no copies.

---

**Covered Entity:** `[name, signatory, title, date]`
**Business Associate (Health Data Safe):** `[signatory, title, date]`

_Execution is recorded via the controlled sign-off workflow; the executed copy is
filed in HDS's BAA register._
