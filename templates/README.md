# templates — agreement templates

Downloadable, fill-in-the-blank agreement templates that HDS implementers need to
become compliant. The matrix's **implementer layer** rows link to the template(s)
that satisfy each requirement, and each template declares which rows it covers and
its **intended signer/persona**.

> ⚠️ **Not legal advice.** Templates are starting points to review with qualified
> counsel before use.

Planned set (authored in plan 74, Phase 3 — HIPAA first):

| Template | Direction / signer | Purpose |
|----------|--------------------|---------|
| **BAA** (Business Associate Agreement) | HDS ↔ customer/partner (Covered Entity or upstream BA) | The core HIPAA contract when a partner processes PHI on HDS |
| **Subcontractor / subprocessor agreement** | implementer ↔ their downstream | Flow-down of BA obligations |
| **DPA** (stub) | controller ↔ processor | Reused later for GDPR / Swiss nLPD |

Each template ships with metadata (`covers:` requirement refs, `signer:` persona)
so the build can surface it in the web app and `validate.js` can check the
cross-references resolve both ways.
