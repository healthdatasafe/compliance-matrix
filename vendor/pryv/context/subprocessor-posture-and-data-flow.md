# Subprocessor posture + data-flow guarantees

For an operator running Pryv as a processor (or as a controller's
own software, where "subprocessor" still applies to the third
parties their deployment talks to), the Art.28 / Art.30(1)(f)
question is: **which external services does my Pryv deployment
touch, and what data flows to each?**

Pryv-the-software's posture is unusually clean here: **zero
mandatory subprocessors**. Every external service the platform can
talk to is opt-in through configuration. The default deployment
talking to "the operator's cloud provider only" (which Pryv treats
as opaque, operator's choice) has no third-party subprocessors
from the platform's perspective.

## Optional integrations enumerated

Each is a real subprocessor relationship under Art.28(4) when
activated. The operator names them in their DPA register +
discloses them per Art.13(1)(f) where recipients exist.

### Let's Encrypt: TLS certificate issuance

- **Config gate**: `letsEncrypt.enabled: true` (default `false`).
  Operators opting in get automated ACME issuance, renewal,
  cluster-wide cert replication.
- **What flows out**: the deployment's hostnames (for the ACME
  DNS-01 / HTTP-01 challenge). **No user personal data.**
- **Posture**: Let's Encrypt ships as a **dev-platform
  facilitator**, the easy on-ramp for `*.pryv.me`-style
  development clusters where the certificate-issuance friction
  would otherwise dominate setup. **Production deployments
  should treat CA choice as an operator decision**, keep LE
  if its compliance posture matches yours, or swap to a
  commercial CA, internal CA, or air-gapped issuance pipeline.
  The platform's ACME orchestrator (`AcmeOrchestrator`) reads
  `letsEncrypt.directoryUrl` so any ACME-compatible CA can
  replace LE without code changes; the cert-management surface
  (`bin/cert.js`, manual upload via `/system/admin/certs`) is
  the same regardless of issuer.
- **Code anchor**: `components/business/src/acme/` module
  (8 files); `default-config.yml` `letsEncrypt:` block.

### SMTP: transactional mail (per-core configurable)

- **Config gate**: `services.email.smtp.*` (host, port, auth,
  from). Built into open-pryv.io v2 as an in-process module
  (the former standalone service-mail component is now part of
  the unified binary).
- **What flows out**: rendered templated bodies, typically
  user's email address + name + a one-time token (password
  reset, account verification, MFA setup mail). The body
  template is operator-owned (manageable via the planned admin
  panel), so the operator controls exactly which PII their SMTP
  relay sees.
- **Posture**: **operator must configure**. No default SMTP
  endpoint ships. The operator's relay choice IS the
  subprocessor relationship, naming it in the DPA + Art.30
  register is on them.
- **Pryv recommends per-core SMTP configuration** for
  residency-sensitive deployments: the `services.email.smtp.*`
  block is per-core, so an EU core routes its outbound mail
  through an EU SMTP relay independently of a US core's relay.
  Use this when "EU subjects' password-reset emails must not
  touch a US-jurisdiction relay" is a hard requirement. Same
  pattern applies to the SMS endpoints, the
  `services.mfa.sms.endpoints.*` config block is per-core too.
- **Code anchor**: `components/business/src/mail/` module;
  `default-config.yml` `services.email:` block.

### SMS endpoints: MFA delivery

- **Config gate**: `services.mfa.sms.endpoints.*` (URL,
  bearer-token-style auth, per-region routing). Built into
  open-pryv.io v2 as the in-process MFA module (the former
  standalone service-mfa component is now part of the unified
  binary).
- **What flows out**: user's phone number + MFA challenge code +
  template ID. Strictly PII.
- **Posture**: operator must configure; default `services.mfa.mode:
  disabled` ships from `default-config.yml`. Encrypted-at-rest
  via the PlatformDB-encrypted-secrets family (the observability
  + bootstrap-bundle pattern), so the credentials never live on
  disk in plaintext.
- **Code anchor**: `components/mfa/` module.

### Observability backend (operator chooses; telemetry is allow-listed)

- **Architecture**: telemetry is **constructed by the platform**, not
  observed by a third party. No vendor or OpenTelemetry SDK runs in
  the process and nothing is auto-instrumented. A single emitter at
  `components/business/src/observability/` builds every datapoint
  from a compile-time allow-list
  (`components/business/src/observability/schema.ts`) and ships it
  over OTLP/HTTP. The consequence for a reviewer is that the
  question "could a URL, a username, a header or a message body
  reach the backend?" is answered by reading the schema, not by
  auditing an external agent's behaviour across versions: a field
  absent from the schema has no code path that can emit it.
- ⚑ **Correction of record (2026-07-27), retained deliberately.**
  Before that date this integration ran an in-process vendor agent,
  and its scrubbing configuration was placed in a file the agent
  does not look for, so the agent silently used its own defaults:
  no attribute exclusion, SQL obfuscated rather than suppressed,
  application log records forwarded. **Any deployment with
  observability enabled before 2026-07-27 sent request URLs, the
  `Host` header, route parameters carrying the username, and log
  message bodies to its vendor**, regardless of what this document
  claimed at the time. That defect was fixed on 2026-07-27 by
  correcting the filename and hardening the exclusions
  (`4fc63d87`, wire-validated). The architecture described above
  supersedes that fix: enumerating what must not escape from an
  agent that collects everything is a control whose correctness
  depends on the agent's defaults, so the agent was removed rather
  than reconfigured. The earlier text is corrected rather than
  quietly rewritten, because reviewers relied on it.
- **Config gate**: `observability.enabled` plus an OTLP endpoint
  (`otlp-endpoint`) and the backend's auth headers (`otlp-headers`,
  AES-256-GCM encrypted at rest in PlatformDB, never echoed by the
  CLI). Default: disabled, and enabled-without-an-endpoint emits
  nothing. Local `observability.enabled: false` always overrides
  PlatformDB, which is the operator's emergency kill switch.
- **What flows out, the complete list.** Metrics: per-API-method
  call counts, duration histograms and error counts. Their only
  labels are `method.id` (an identifier from the platform's own API
  method registry, re-checked against that registry at emit time),
  `status.class` (`2xx`/`3xx`/`4xx`/`5xx`) and `error.code` (a value
  from the API's published error id list, or `unknown`). Resource
  identity: service name, service version, the core's own FQDN and a
  worker index. Error reports, for server-side faults only: the
  error code, the error class name, and a stack trace whose frames
  are rewritten repository-relative, with frames from outside the
  repository discarded. One operational counter, `telemetry.dropped`,
  reports how many datapoints the emitter refused, by reason.
- **What cannot flow out, by construction**: request URLs, query
  and route parameters, request and response bodies, HTTP headers of
  any kind, usernames, stream/event/attachment identifiers, log
  records, and error **message** text. None of these has a key in
  the schema. Error messages are excluded permanently and by
  design: on this platform they routinely interpolate file paths
  and client-supplied values, so the code travels and the message
  stays in the operator's own logs.
- **The refusal is enforced, not documented.** Every datapoint is
  validated at the choke point before it is buffered; a
  non-allow-listed metric name, attribute key, method id, status
  class or error code is dropped and counted rather than sent. The
  test suite asserts the validator's decision for accepted and
  refused inputs alike, including a fuzz pass over identifier-shaped
  keys and values, with a legitimate datapoint pinned in each block
  so the suite cannot pass by refusing everything.
- **Residual formerly caused by outbound spans is gone.** The agent
  reported `peer.hostname` / `peer.address` / `server.address` on
  every outbound call, which for webhooks is the endpoint hostname
  the receiving application registered, and no client-side setting
  suppressed it. Nothing observes outbound calls now, so this class
  of exposure no longer exists.
- **Anonymous by construction, with one volume-dependent residual.**
  The correlation handles were removed deliberately, not left as
  accepted residuals: error reports are **aggregated by fault and
  stamped at the reporting interval** rather than at the instant of
  failure (a precise timestamp singles out one action to anyone
  holding a second timestamped signal, the operator's own audit log
  included), and the instance identifier is the **machine
  hostname**, never derived from the service URL or DNS domain
  (user-facing hosts are `<username>.<domain>` in DNS-based
  deployments, so a URL-derived value was one config change away
  from carrying a username on every datapoint).
  **The residual**: on a very low-traffic instance, "one error in
  this interval" can still correlate to the only active user. That
  is a property of traffic volume, not of the schema, and the
  operator reduces it by widening the reporting interval. A
  reviewer should read the claim as *anonymous by construction,
  with a residual correlation risk at very low traffic volumes*,
  we do not assert an unqualified guarantee.
  Where the residual applies, treat the telemetry as personal data
  and keep the processor relationship in scope; pointing the
  endpoint at a self-hosted collector removes the third party from
  the question entirely.
- **Backend choice is the operator's, and can be self-hosted.**
  OTLP/HTTP is the wire format, so the destination is a URL plus
  whatever auth header that backend expects. Any OTLP-ingesting
  service works, and pointing the endpoint at an OpenTelemetry
  Collector inside the operator's own infrastructure keeps
  telemetry within their trust boundary, with no third-party
  processor to add to the DPA at all. Unlike the previous
  adapter model, the posture does not vary by backend: the same
  emitter builds the same payload whatever the destination.
- **Posture**: opt-in, disabled by default; the emitted surface is
  fixed in source and an operator cannot widen it without modifying
  and rebuilding the platform.
- **Code anchors**: `components/business/src/observability/schema.ts`
  (the allow-list), `emitter.ts` (the choke point), `sanitizeError.ts`
  (stack sanitizing), `errorRegistry.ts` (error codes), `otlp.ts`
  (payload builders).

### Upstream catalogue fetch (`service.eventTypes`)

- **Config gate**: `service.eventTypes` URL (default points at
  `https://raw.github.com/pryv/data-types/master/dist/event-
  types.json`).
- **What flows OUT**: nothing; this is a **read-only fetch of
  schemas INTO the core**. The catalogue payload is JSON Schema
  fragments, not personal data.
- **What flows IN**: the deployed catalogue from the URL the
  operator points at. If the operator pins to a custom URL
  (Q14 pattern) or hosts the file statically inside their own
  infra, they break the dependency on the upstream
  `pryv/data-types` repo entirely. Production deployments
  concerned about supply-chain coupling typically self-host.
- **Posture**: **fetch is dependency, not subprocessor**, no
  personal data crosses the boundary. Still worth disclosing in
  the operator's DPIA / Art.30 if upstream-pinning matters to
  the audit narrative.
- **Code anchor**: `components/business/src/types.ts:143-186`
  `TypeRepository.tryUpdate`; `default-config.yml` `service:`
  block.

## Data-flow guarantees that limit subprocessor exposure

Even when an integration IS configured, Pryv has three layers
that constrain what data crosses the boundary:

### 1. Audit-by-construction (Q9)

The audit log captures method + access reference + URL query +
integrity hash, **never the request body**, with `auth=` query
parameters stripped. So when audit ships to a tiered audit store
(per the Q16 custom-datastore pattern), the destination sees
metadata, not content. Nuance: content-query search values sent
over HTTP GET are part of the URL query and travel with it, see
`content-query-audit-semantics.md`.

Code anchor: `components/audit/src/Audit.ts:151-166`.

### 2. Logger sanitization (`inspectAndHide`)

Every `Logger.{info,warn,error,debug}` call passes its arguments
through `inspectAndHide` (defined at
`components/boiler/src/logging.ts:253-298`) before emission. Two
mechanisms:

- **Object-key redaction**: keys named `password`, `passwordHash`,
  `newPassword` are replaced with `'(hidden password)'`
  (line 289-290).
- **String-value regex strip** (`hideSensitiveValues`,
  line 301-312):
  - `auth=c[a-z0-9-]*` → `auth=(hidden)`, strips personal-token
    wire shape.
  - `"(password|passwordHash|newPassword)":"..."` →
    `$1=(hidden)`: strips password values in serialised JSON.

Applied at the Logger class layer (line 201-216): every
`logger.log()` call runs `message` through `hideSensitiveValues`
AND every additional `context` argument through `inspectAndHide`.
So logs reaching the operator's log aggregator, syslog,
filesystem, observability vendor, or stdout-capturing container
runtime get the sanitization treatment regardless of caller.

Tested by `[BIH1]`-`[BIH6]` in
`components/api-server/test/boiler-inspectAndHide.test.js`.
`[BIH6]` specifically asserts the password-redaction shape:
`{ user: 'alice', password: 'secret123' }` →
`{ user: 'alice', password: '(hidden password)' }`. Additional
end-to-end coverage at `components/api-server/test/system-seq.
test.js:533` asserts the `(hidden password)` substitution on
`passwordHash` log payloads.

**Honest scope**: `inspectAndHide` redacts **credentials**, not
PII broadly. Email addresses, usernames, phone numbers, names,
event payloads, these can still appear in log lines if a
caller explicitly logs them. The guarantee is "no credentials
leak via logs", not "no PII whatsoever leaks via logs". The
operator's log-aggregator destination + their broader PII-in-
logs policy fill the rest of the picture.

### 3. Observability allow-list

Telemetry is constructed from a compile-time allow-list rather than
filtered after collection (cited above). Because no third-party
agent observes the process, credentials, request bodies, URLs,
headers and SQL have no code path to the backend at all: they are
absent from the schema rather than removed from a payload. What
crosses to the observability backend is aggregated per-method
metrics plus sanitized error stack traces.

## How to assemble the subprocessor inventory for your DPA

Today (pre-admin-panel): read `override-config.yml` + per-host
overlays + identify which optional integrations are non-default:
- `letsEncrypt.enabled: true` → LE (or whichever
  `letsEncrypt.directoryUrl` you pointed at).
- `services.email.smtp.host: ...` → your SMTP relay.
- `services.mfa.mode: enabled` + `services.mfa.sms.endpoints[*]`
  → your SMS provider.
- `observability.enabled: true` with an `otlp-endpoint` → whichever
  backend that endpoint belongs to (none, if it points at a
  collector you host yourself).
- `service.eventTypes: https://...` → upstream catalogue host (if
  not self-hosted).

Once the planned `GET /system/admin/config/effective` admin
endpoint ships (effective-config exposure), it surfaces all of
this in one machine-readable JSON blob per core. The operator's
DPIA / DPA register / Art.30 records-of-processing pipeline can
consume it directly.

## Where Pryv-the-software is NOT the right Art.28 answer-source

- **Cloud provider** (AWS / Azure / Hetzner / on-prem hardware
  vendor / etc.). Pryv is opaque to the operator's hosting
  choice; their cloud provider's DPA is operator-to-provider, no
  Pryv-side artefact contributes.
- **CDN / reverse-proxy** sitting in front of the core
  (nginx / HAProxy / Cloudflare). Pryv doesn't ship one; the
  operator's deployment topology choice (per the
  `RATE-LIMITING-RECIPES` backlog Q6) determines whether a CDN
  vendor is in scope.
- **External monitoring** beyond the observability-provider
  integration (e.g., Prometheus + Grafana the operator runs
  themselves, log aggregator like Loki / ELK / Splunk). Pryv
  emits logs; the operator routes them. Their log-aggregator
  vendor is their relationship, not Pryv's.

## Matrix encoding

- `gdpr.Art.28` detail extended with the zero-mandatory-
  subprocessor framing + per-integration enumeration + the
  LE-as-dev-facilitator distinction + the three data-flow
  guarantees + the future inventory pipeline.
- `gdpr.Art.30` row stays as-is, the existing register-field
  mapping table is already strong; the subprocessor question
  is sub-Art.30(1)(f) "categories of recipients" and the
  context note covers it.
- `pryv-primitives.md` `observability-provider` entry covers
  the PII filter detail; this note cross-references rather
  than duplicates.
- No backlog filed (the future improvement, machine-readable
  subprocessor inventory, is absorbed by the planned
  bootstrap-admin-panel work).
- No `planned:` chips, Q20's chips against
  `CONFIG-EFFECTIVE-EXPOSURE` already capture the future
  matrix updates.

## See also

- `docs/pryv-primitives.md`: `letsEncrypt-integration`,
  `observability-provider`, `audit-event-stream` primitive
  entries.
- `context/data-masking-projection-vs-transformation.md`,
  audit-by-construction (Q9 finding cross-referenced from
  layer 1 above).
- `compliance-matrix/UPDATE-TRIGGERS.md`: `CONFIG-EFFECTIVE-
  EXPOSURE` Section A entry (future subprocessor inventory
  pipeline).
