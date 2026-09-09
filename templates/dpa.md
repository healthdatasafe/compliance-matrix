---
id: dpa
title: Data Processing Agreement (template)
kind: dpa
signer: controller
counterparty: processor
frameworks: [gdpr, swiss-nlpd]
covers:
  - gdpr.Art.28
  - swiss-nlpd.Art.9
status: draft
version: "0.1.0"
summary: >
  Template Data Processing Agreement (GDPR Art.28 / Swiss nLPD) for an
  organisation building on HDS to sign with ITS OWN processors, for the copy of
  personal data it holds on its own systems. NOT for use with HDS: for the vault
  product HDS is the controller of the individual's vault and cannot be anyone's
  Art.28 processor.
---

> ⚠️ **Not legal advice.** Engineering/operational guidance; review and adapt
> with qualified counsel before execution. Bracketed `[…]` fields are placeholders.

# Data Processing Agreement

Between `[Your legal name]` ("Controller") and `[Processor legal name]`
("Processor"), forming part of the service agreement, effective `[date]`.

> **This template is not for use with HDS.** In the vault product an individual
> holds their own account, data enters only with their explicit consent, and the
> individual decides who may access it. HDS therefore acts on the individual's
> permissions rather than on your documented instructions, and cannot delete or
> return an individual's data at your direction, so it cannot satisfy Art.28(3).
> If you receive data an individual chose to share with you, you are an
> **independent controller** of what you then hold. Use this template with the
> vendors *you* engage to process that copy.

Governs processing under **GDPR Art. 28** and the **Swiss nLPD (revFADP)**.

## 1. Subject-matter, duration, nature and purpose
Processing of the personal data necessary to provide the service described in
`[service description]`,
for the duration of the service agreement, on the Controller's documented
instructions.

## 2. Categories of data and data subjects
`[Categories of personal data — incl. health data / special categories]`;
`[categories of data subjects]`.

## 3. Processor obligations (Art. 28(3))
The Processor will:
(a) process personal data only on the Controller's documented instructions,
including for international transfers, unless required by law;
(b) ensure persons authorised to process are bound by confidentiality;
(c) implement the technical and organisational measures of Art. 32 (access
control, audit logging, encryption in transit; data-residency placement per the
Controller's chosen region — `[EU/Switzerland | US]`); _at-rest encryption status
is described in the Processor's documentation;_
(d) respect the conditions for engaging sub-processors (§4);
(e) assist the Controller with data-subject requests (Art. 12–23);
(f) assist with security, breach notification and DPIAs (Art. 32–36);
(g) delete or return personal data at the end of provision (§6);
(h) make available information necessary to demonstrate compliance and allow
audits.

## 4. Sub-processors (Art. 28(2),(4))
The Controller authorises the sub-processors listed in `[the Processor's
sub-processor register]`. The Processor imposes equivalent obligations on each
sub-processor and informs the Controller of intended changes, allowing objection.

## 5. International transfers
Where the Controller selects a non-EU/Swiss region, transfers rely on an
appropriate Art. 46 mechanism (e.g. SCCs) — `[reference]`.

## 6. Return or deletion
On termination, the Processor deletes or returns all personal data and deletes
existing copies unless retention is required by law.

## 7. Audit
The Processor makes available the information necessary to demonstrate compliance
and contributes to audits, including inspections, by the Controller or its mandatee.

---

**Controller:** `[name, signatory, date]`
**Processor:** `[signatory, date]`
