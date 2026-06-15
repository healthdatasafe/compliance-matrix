# Rate limiting / API throttling / DoS protection

**Voluntarily missing at the Pryv layer.** Rate limiting and DoS
protection are deliberately handled at the reverse-proxy / WAF /
API-gateway layer, **not** inside open-pryv.io itself. Several
matrix rows surface this stance.

## Why this is deliberate

In-process rate limiting inside Pryv was considered + deliberately
rejected for two reasons:

1. **Multi-core load distribution makes in-process throttling
   mis-fire.** When a deployment spans N cores behind a load
   balancer, each core sees only its share of the traffic. A
   per-core counter sees `1/N` of the actual incoming rate; a
   "true" cross-core rate-limit needs shared state (Redis,
   PostgreSQL row, rqlite key — all of which add a hot-path
   dependency that itself becomes a DoS target). Cross-region
   multi-hosting (Pryv's data-residency feature) makes a shared
   counter even more pathological.

2. **DoS / abuse signatures are operator-specific.** What counts
   as "abusive" depends on the workload: a research consortium
   running batch imports has legitimate 10K-events/min bursts;
   a consumer health app should never see one user generate
   100 events/sec. Pryv-side defaults would mis-fire for both.

The right place for traffic shaping is **the layer that already
sees all traffic before sharding** — the reverse proxy / API
gateway / WAF. Those tools (Cloudflare, AWS WAF, nginx `limit_req`,
HAProxy, etc.) are purpose-built for this, already deployed by the
operator for other reasons (TLS termination, geo-routing,
WebSocket upgrades), and tunable per the operator's actual traffic
profile.

## What the operator handles

Standard operator-side protections that compose with Pryv:

- **Per-IP rate limits** — nginx `limit_req_zone`, HAProxy
  `stick-table`, Cloudflare Rate Limiting Rules.
- **Per-token rate limits** — same tools, keyed on the
  `Authorization` header value rather than the source IP.
- **Per-route rate limits** — heavier limits on
  `/auth/login`, `/reg/access`, `events.create` than on read
  endpoints.
- **WAF rules** — OWASP CRS, custom rules blocking known abuse
  signatures (e.g., paths Pryv doesn't expose; user-agent
  blocklist).
- **Account-lockout policies** — `fail2ban` watching audit logs +
  banning IPs that exceed N auth failures in T minutes. Pryv's
  audit log feeds this (every failed `auth.login` is a row);
  fail2ban is the trigger + banner.
- **DDoS scrubbing** — Cloudflare, AWS Shield, etc., at the edge
  CDN layer.
- **Burst / cost protection** — request size limits, max-events-
  per-batch caps, slow-loris timeouts. Already in nginx /
  Cloudflare defaults; operator tunes per workload.

Multi-core deployments behind a single edge layer (single Cloudflare
zone, single load balancer) handle the "where to keep the counter"
problem cleanly — the edge sees all traffic.

## What Pryv contributes

Pryv-side contribution to the operator's DoS / rate-limiting
posture is in the **detection layer**, not the enforcement layer:

- **Audit log of every API call.** Per-user SQLite audit row per
  API method invocation includes timestamp, access reference,
  method, key request fields. `fail2ban` and SIEM tools consume
  this to drive policy.
- **Observability adapter** (New Relic when configured). Per-core
  request rate + latency + error rate metrics feed
  capacity-management dashboards + anomaly-detection rules.
- **Access primitive for revocation.** When abuse is detected,
  `accesses.delete` cuts off the offending token immediately;
  audit log records the revocation.
- **Failed-auth visibility.** Failed `auth.login` / failed token
  validation surfaces in the audit log so the operator's rate-
  limit policy has a feed.

## Matrix rows that lean on this

Rows whose `detail` should call out the operator-side responsibility
+ the Pryv-side detection contribution:

| Scope | Row | Today | After update |
|---|---|---|---|
| iso-27001 | A.8.6 capacity management | F: Infrastructure \| Medium | unchanged; clarify "reactive scaling, not protective throttling" |
| iso-27001 | A.8.21 network services security | F: Infrastructure \| Medium | unchanged; spell out operator-side rate-limit responsibility |
| iso-27001 | A.5.7 threat intelligence | F: Evidence \| Low | unchanged; cite audit feed for operator's threat-intel programme |
| hipaa-security | 164.308(a)(5)(ii)(C) login monitoring | F: Evidence \| Medium | unchanged; clarify "Pryv surfaces the events; operator chooses lockout policy" |
| hipaa-security | 164.308(a)(6)(i) incident procedures | F: Evidence \| Medium | unchanged; same framing |
| hipaa-security | 164.312(d) authentication | Implemented \| High | unchanged; mention failed-auth visibility + fail2ban pattern |

## What is in Pryv-side scope today

- HTTPS body size limits (Express body-parser defaults).
- Connection timeouts at the Node.js HTTP server layer.
- The Lets-Encrypt + bootstrap-bundle layers don't expose
  unauthenticated mutation endpoints; the public surface is small.

These are baseline; they don't substitute for an edge-layer
protection.

## When this stance might change

If a Pryv deployment use case emerges where:

- The operator has no reverse proxy in front (rare; even on Docker
  Compose dev setups, nginx-proxy is usual);
- AND the load is high enough to need shaping;
- AND the operator can't easily add an edge layer;

...then an opt-in per-core rate-limit middleware could be
considered. Backlog candidate; not currently filed.

## Reference configs (planned)

While in-process rate-limiting stays out of scope, **shipping
reference reverse-proxy configurations** as part of the deployment
docs is on the backlog: nginx / HAProxy / Cloudflare / Traefik /
Caddy snippets that an operator can drop in + tweak. Per-route +
per-workload-profile (consumer-app, B2B research, hospital) +
fail2ban jail recipes that consume Pryv's audit feed. Tracked
under internal backlog slug `RATE-LIMITING-RECIPES`.

## Related primitives

- `audit` — feeds operator-side rate-limit + fail2ban tooling.
- `observability-provider` — surfaces request-rate metrics for the
  operator's monitoring.
- `access` — the revocation primitive when abuse is detected.
