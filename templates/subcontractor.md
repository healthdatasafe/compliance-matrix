---
id: subcontractor
title: Subcontractor Agreement (HIPAA flow-down, template)
kind: subcontractor
signer: business-associate
counterparty: subcontractor
frameworks: [hipaa]
covers:
  - hipaa-security.164.314(a)(2)(ii)(B)
  - hipaa-security.164.314(a)(1)
status: draft
version: "0.1.0"
summary: >
  Template back-to-back agreement by which a Business Associate flows its HIPAA
  obligations down to a subcontractor that handles ePHI on its behalf.
---

> ⚠️ **Not legal advice.** Engineering/operational guidance; review with counsel.
> Bracketed `[…]` fields are placeholders.

# Subcontractor Agreement (HIPAA flow-down)

Between `[Business Associate legal name]` ("Business Associate") and
`[Subcontractor legal name]` ("Subcontractor"), effective `[date]`.

Under 45 CFR §164.308(b)(2) and §164.314(a)(2)(ii), a Business Associate must
obtain satisfactory assurances that each subcontractor handling ePHI will apply
safeguards at least as stringent as those the Business Associate is bound to.

## 1. Definitions
Per 45 CFR Parts 160 and 164.

## 2. Permitted uses and disclosures
Subcontractor may use/disclose ePHI only to perform the contracted services, as
required by law, or for its proper management — never in a way that would breach
the upstream Business Associate Agreement.

## 3. Safeguards
Subcontractor will implement administrative, physical, and technical safeguards
(access control, audit logging, encryption in transit, monitoring) protecting the
ePHI it handles, equivalent to or stronger than the upstream BAA.

## 4. Onward subcontracting
Subcontractor will bind any of its own subcontractors in writing to equivalent
terms (recursive flow-down).

## 5. Incident and breach reporting
Subcontractor will report any non-permitted use/disclosure, Security Incident, or
Breach of Unsecured PHI to Business Associate without unreasonable delay and no
later than `[number]` days after discovery.

## 6. Term, termination, return/destruction
Mirrors the upstream BAA; on termination, ePHI is returned or destroyed where
feasible.

---

**Business Associate:** `[name, signatory, date]`
**Subcontractor:** `[name, signatory, date]`
