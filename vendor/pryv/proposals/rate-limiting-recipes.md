# Reference rate-limiting / DoS-protection configurations

**Status: shipped (nginx + fail2ban) on 2026-10-05**, dev-site2 `53894f5`, live at
https://pryv.github.io/customer-resources/rate-limiting/ (published `pryv.github.io` `b80804b`).
Verified end to end against a running core: `nginx -t`, every limit firing with the documented
counts, fail2ban banning, the audit log recording the real client address. Chips discharged on
iso-27001 A.8.21 and hipaa-security 164.308(a)(5)(ii)(C); the page is also cited on iso-27001
A.8.6, hipaa-security 164.308(a)(6)(i) and diga A1.4.3. HAProxy, Cloudflare, Traefik and Caddy
snippets are not shipped (no chips; the nginx page states the same route table applies).

**Update 2026-10-13:** open-pryv.io 2.0.0-rc.47 and 2.0.0-rc.50 added targeted in-code budgets
(failed passwords per account and per client address across cores, live access requests per
address, pending MFA sessions per account, batch / paging / upload / socket.io bounds, an
invitation-check budget, preview limits). The edge recipes stay the front for general traffic
shaping; the per-address budgets read the client address through `http.trustedProxies` only, which
the page's "How Pryv reads the client IP" paragraph should now explain. See
`context/rate-limiting-and-dos-protection.md`.

**Proposal mirror of**: `_plans/XXX-Backlog/COMPLIANCE-RATE-LIMITING-RECIPES.md`
(macroPryv-side backlog file).
**Filed during:** Q6 implementer-perspective gap-probing session (follow-up).
**Tracking card:** https://github.com/orgs/pryv/projects/5?pane=issue&itemId=219705775&issue=pryv%7Copen-pryv.io%7C117
**Surfacing question:** *"Pryv doesn't rate-limit in-process. Fine, but then
what exactly should I put in front of it? Where are the reference configs?"*

## Today's state (verified)

| Control | Status | Anchor |
|---|---|---|
| In-process rate limiting | ❌ deliberate | `context/rate-limiting-and-dos-protection.md` |
| Architectural rationale documented | ✅ | `context/rate-limiting-and-dos-protection.md` |
| Reference reverse-proxy configuration shipped | ❌ | none in the deployment guides |
| Guidance on what must not be limited | ❌ | none |

Pryv deliberately pushes rate limiting to the reverse proxy / WAF / API gateway:
per-core counters mis-fire under multi-core load distribution, and DoS signatures
are deployment-specific. That rationale is sound, and the matrix already reflects
it. What is missing is the artefact that turns the rationale into something an
implementer can apply.

## After shipping

Reference configurations for nginx, HAProxy and Cloudflare, each verified against a
running deployment, covering per-IP limits on authentication endpoints, per-token
limits on the general API surface, burst-versus-sustained separation, and an
explicit do-not-limit list (health checks).

| Scope | Ref | Kind | Impact | After shipping |
|---|---|---|---|---|
| iso-27001 | A.8.21 | enhancement | low | row cites concrete reference configurations instead of resting on the architectural rationale alone |
| hipaa-security | 164.308(a)(5)(ii)(C) | enhancement | low | log-in monitoring row gains a companion enforcement artefact for the authentication endpoints |

Neither row changes coverage tier. Both stop depending on a design argument for the
part of the control that lives outside Pryv, which is the whole point of the chip.

## Why this is a chip and not a claim change

The enforcement layer stays the implementer's. Shipping recipes does not move the
boundary of what Pryv does; it removes the "figure it out yourself" step that
currently sits behind two facilitated rows.
