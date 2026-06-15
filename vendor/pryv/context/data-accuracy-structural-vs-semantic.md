# Data accuracy at ingest: structural vs. semantic

GDPR Art.5(1)(d) requires personal data to be **accurate and, where
necessary, kept up to date**, with reasonable steps to ensure
inaccurate data is **erased or rectified without delay**. For a
health-data platform, this is a natural regulator-priority question:
"how does the platform prevent garbage data from polluting the
record?"

Pryv splits the accuracy problem into two layers — and only the
first is a platform contribution. The second is implementer-owned
**by design**.

## Layer 1 — Structural validation (Pryv-scope, enforced)

Every `events.create` and `events.update` runs the payload through
JSON Schema validation against the declared event-type before the
event is persisted. Implementation:

- **Validator:** `ajv-draft-04` (with `ajv-formats`), wrapped by
  the façade at `open-pryv.io/components/utils/src/jsonValidator.ts`
  (the wire-shape of validation errors emulates the legacy
  `z-schema` API for backwards compatibility — historical;
  consumers don't need to care).
- **Where invoked in the ingest path:** the
  `validateEventContentAndCoerce` middleware in
  `open-pryv.io/components/api-server/src/methods/events.ts:755-774`
  is bolted onto both `events.create` (line 273) and
  `events.update` (line 564). Validation runs server-side, before
  the storage adapter sees the event.
- **What the validator enforces:** everything expressible in JSON
  Schema draft-04 — `type`, `required`, `enum`, `pattern`,
  `properties`, `additionalProperties`, **`minimum` / `maximum` /
  `exclusiveMinimum` / `exclusiveMaximum`**, `minLength` /
  `maxLength`, format strings (`date-time`, `email`, `uri`, …).
- **Rejection behaviour:** a payload that fails validation is
  rejected with HTTP 400 + a structured error citing the failing
  field path. There is no silent coercion or downgrade — `value:
  9999` for a `temperature/c` event-type with `maximum: 50` does
  not get truncated, it fails.
- **Type-aware coercion** (small caveat): the coercion step at
  `business/src/types/basic_type.ts:60-65` (`valueTypes`) runs
  *before* schema validation, normalising primitive types
  (e.g., string `"42"` → number `42` for a `number`-typed
  field). This is a convenience for clients that submit JSON
  strings from form posts; it does not relax range constraints.

## Layer 2 — Range/sanity bounds (Pryv-scope: primitive supplied; defaults sparse)

Pryv ships a built-in event-type catalogue at
`components/business/src/types/event-types.default.json` (~4750
lines mirroring upstream `pryv/data-types`). It exists so the
server has something to validate against even when the operator
hasn't pointed `service.eventTypes` at a custom URL.

**The built-in catalogue uses `minimum` / `maximum` sparingly:**

```
$ grep -cE "minimum|maximum|minLength|maxLength" event-types.default.json
# 5 occurrences total — only:
#   mood/rating         min: 0,  max: 1
#   note/html           maxLength: 4 194 304 (4 MB)
#   note/txt            maxLength: 4 194 304
#   note/webclip.html   maxLength: 4 194 304
```

The vast majority of physical-measurement event types
(`mass/kg`, `temperature/c`, `pressure/mmhg`, `frequency/bpm`,
`length/m`, …) declare `"type": "number"` and **stop there**.
A buggy client writing `temperature/c: 9999` or `frequency/bpm:
-50` is structurally valid against the built-in catalogue and
will be accepted.

This is **deliberate**, not a bug. Pryv is content-agnostic at
the platform layer; it carries whatever schemas the implementer
points it at. Sensible default bounds would be impossible to
choose across the range of valid use-cases (an industrial sensor,
a wellness wearable, and a clinical-trial sphygmomanometer
disagree on what a "plausible" `pressure/mmhg` value is).

## Layer 2 (continued) — Range/sanity bounds are the implementer's lever

The Q14 custom-catalogue extension model is the supported path for
implementers who DO want strict bounds. The HDS data-model at
[`hds.com/data-model`](https://hds.com/data-model)
(source: a sibling repo to open-pryv.io's `data-types`) is the
working exemplar:

```
$ grep -cE "minimum|maximum|minLength|maxLength|pattern" \
        hds-data-model/dist/eventTypes.json
# 28 minimums, 23 maximums, 6 maxLength, 7 pattern constraints
```

Examples from the HDS catalogue:
- `ratio/proportion`: `minimum: 0, maximum: 1` (0 = none,
  1 = maximum — used for subjective scales like bleeding
  intensity).
- Mucus-quality sub-fields (`threadiness`, `stretchability`,
  `lubricative`, …): all bounded `0..1`.
- `pattern`s for URL fields (`^(https?)://.+$`).

When the implementer publishes their catalogue at a URL and points
`service.eventTypes` at it, the server fetches at startup,
validates the catalogue against the JSON Schema meta-schema, and
`deepMerge`s on top of the built-in defaults
(`components/business/src/types.ts:143-186`
`TypeRepository.tryUpdate`). The bounded types become first-class:
`events.create` rejects out-of-range payloads with HTTP 400 from
that point forward.

## Layer 3 — Semantic accuracy (out of scope by design)

The kind of accuracy regulators *also* care about — and where
Pryv structurally cannot help — is **semantic**:

- "Is this medication the right one for THIS patient?"
- "Does this lab value make sense given this patient's recent
  procedures?"
- "Is this blood-pressure reading from the patient's left arm or
  right arm, and does that matter for the clinical workflow?"
- "Was this measurement taken with a calibrated device?"
- "Has the patient consented to having this specific data type
  in their record?"

These checks require knowledge Pryv does not have and should not
have: the patient's broader clinical record, drug-interaction
databases, device calibration state, clinical protocols, current
treatment plan. They are **app-layer concerns** — the implementer
has the context to enforce them. Pryv's data-minimisation posture
(it doesn't see consent flow content, doesn't index clinical
context, doesn't aggregate across patients without explicit CMC)
is part of why it can't.

## Layer 4 — Rectification trail (Art.16 / Art.5(1)(d) "without losing audit")

When inaccurate data IS detected and corrected, `events.update`
preserves the prior version. Implementation:

- `mall.events.getHistory(userId, eventId)` returns the version
  chain (`open-pryv.io/components/api-server/src/methods/events.ts:185`).
- `GET /events/:id?includeHistory=true` (route definition same
  file) exposes the history to the implementer.
- Every update is recorded in the audit log (audit captures the
  method call + access ref + timestamp, NOT the request body —
  see `context/data-masking-projection-vs-transformation.md` for
  the audit-minimality note).

Combined effect: an Art.5(1)(d) "rectified without delay" claim is
defensible — the corrected event is queryable, the rectification
event is auditable, and the prior (inaccurate) value is preserved
for traceability. This satisfies Art.16 + Art.5(1)(d) on the
**evidence** axis; the implementer still has to operationalise
*detection* of inaccuracy (Layer 3 above).

## Implementer takeaway

If a regulator asks "how does your deployment ensure data
accuracy?":

1. **Schema validation is on** — point at the ajv-draft-04
   pipeline + cite `jsonValidator.ts` + the `events.create` /
   `events.update` middleware position.
2. **Range bounds are on** to the extent your catalogue declares
   them — if you're using the built-in defaults only, that's
   **shape but not bounds**; if you're using a custom catalogue
   (HDS-style), say so.
3. **Semantic accuracy is your app layer** — be explicit about
   which checks live where (drug-interaction service, device-
   calibration metadata, clinical-workflow rules, …).
4. **Rectification IS auditable** — `events.update` +
   `includeHistory=true` + audit log together preserve the
   "rectified without delay" trail.

## See also

- `docs/pryv-primitives.md` — `data-types` entry (the catalogue
  primitive + custom extension model).
- `context/custom-event-type-catalogues.md` — the Q14 extension
  pattern (sibling data-model repo, `service.eventTypes` URL,
  `deepMerge` semantics).
- `context/data-masking-projection-vs-transformation.md` —
  audit-minimality (audit captures action + source, not body).
