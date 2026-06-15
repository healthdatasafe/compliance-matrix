# Custom event-type catalogues — the extension model

**Status:** Pryv's documented extension surface for implementers
needing event types beyond the upstream `pryv/data-types`
catalogue. Recorded from the gap-probing session (Q14, 2026-05-20)
after the implementer-perspective question on custom event-type
support.

## TL;DR

Implementers add custom event types **without forking
`pryv/data-types`**. They maintain a **sibling data-model repo**
(small, schema-only, no Pryv runtime), publish a merged catalogue
to a URL, and point each Pryv.io deployment's
`service.eventTypes` config at that URL. The server fetches the
catalogue at startup, validates it via JSON Schema meta-
validation, and **deep-merges** it on top of the baked-in
defaults — so custom types are **first-class**, validated by the
same z-schema pipeline as the standard catalogue, returned in
`events.get` with the same canonical shape, and portable in
`events.json` for GDPR Art.20.

## How it works in code

`components/business/src/types.ts:143-186` — `TypeRepository.tryUpdate(sourceURL)`:

1. Fetches `service.eventTypes` URL at startup (or `file://`
   for tests).
2. Validates the response against the JSON Schema
   meta-schema (`validator.validateSchema`).
3. `defaultTypes = deepMerge(defaultTypes, eventTypesDefinition)` —
   **additive merge** on top of `event-types.default.json` (the
   built-in legacy catalogue, ~4750 lines covering measurements,
   activities, body, medical, etc.).

`components/api-server/src/methods/events.ts:53` reads
`config.get('service:eventTypes')`. `components/hfs-server/src/
application.ts:63` does the same — both API + HFS use the same
catalogue.

If `service.eventTypes` is unset, the server falls back to the
baked-in default — the implementer gets legacy `pryv/data-types`
behaviour with no customisation.

## The HDS exemplar

`hds-macro/data-model` is a real-world implementer-side custom
catalogue. It demonstrates the pattern end-to-end:

```
hds-macro/data-model/
├── definitions/
│   ├── eventTypes/
│   │   ├── eventTypes-legacy.json    ← mirror of upstream
│   │   │                                pryv/data-types
│   │   └── eventTypes-hds.json       ← HDS-specific additions
│   │                                    (vulva-mucus-inspect/
│   │                                    9d-vector, etc.)
│   ├── items/                        ← health-data-point
│   │                                    definitions
│   ├── streams/                      ← stream hierarchy
│   └── converters/                   ← cross-method converters
├── src/eventTypes.js                 ← merge + duplicate-key
│                                       check
└── dist/eventTypes.json              ← published artefact
```

The build merges legacy + HDS into `dist/eventTypes.json` with
**duplicate-key detection** (catches accidental overrides of
upstream types). The published catalogue at `model.datasafe.dev`
is served via GitHub Pages.

A Pryv.io deployment serving HDS sets:

```yaml
service:
  eventTypes: https://model.datasafe.dev/eventTypes.json
```

## Two publication strategies

The implementer chooses between:

1. **Additive catalogue** — publish only the custom types (e.g.,
   `{ "types": { "measurement/vo2max": {...} } }`). The server
   merges them onto the baked-in default. **Simpler to
   maintain** — the implementer doesn't track upstream
   `pryv/data-types` updates; they ride free.

2. **Complete merged catalogue** (HDS choice) — vendor a full
   copy of upstream + add custom. **Deterministic control** —
   the operator pins the exact catalogue version + can
   selectively cherry-pick upstream updates instead of taking
   them automatically. Trade-off: the implementer takes
   ownership of staying current with upstream.

For most implementers the additive strategy is the right
default. The complete-merge strategy fits regulated deployments
(HDS, DiGA, MDR) where the operator wants explicit control over
which schema versions are in force at audit time.

## Compliance implications

| Obligation | Implication |
|---|---|
| GDPR Art.20 (portability) | Custom types serialise identically to legacy types; export bundles travel between deployments with the same JSON shape. Receiving Pryv.io deployments either ship the same catalogue (interoperable) or treat unknown types as opaque (rejected at write-time validation). |
| MDR Annex II §5 (device-record schemas) | Implementer custom schemas live alongside legacy `pryv/data-types`; MDR-specific device-record formats can be authored once + reused across deployments. |
| DiGA Annex 1.3.1 (FHIR-R4 requirement) | A FHIR-flavoured custom catalogue (mapping each FHIR resource to a Pryv event type) plugs into the extension model. The implementer maintains the FHIR-Pryv binding repo. |
| ISO 13485 7.3 (design-control documentation) | The data-model repo IS the design-control artefact for the data layer — versioned, reviewed, signed off per ISO 13485 §7.3.4. |
| HIPAA-Privacy §164.514 (de-identification) | Custom types can carry de-identification flags (e.g., `de_identified: true` field in the schema) that downstream rules engines consume. |

## Schema integrity guarantees

- **Catalogue must validate against JSON Schema meta-schema** at
  fetch time — invalid catalogues are rejected + the server
  refuses to start (or keeps the prior catalogue on a re-fetch).
- **Per-event validation at write time** — `events.create` calls
  `typeRepo.lookup(type).validate(content)`; an event with an
  unknown type or invalid content is rejected with `400`.
- **No silent fallback** — when validation fails, the API
  returns an error; the event is not silently downgraded to
  "unknown type" or stored without validation.

## What the extension model does NOT cover

- **Server-side computed fields** (e.g., "automatically calculate
  BMI from `height` + `weight`") — that's application-layer
  responsibility, not a custom type definition.
- **Custom converters / transformations** — the HDS data-model
  ships a `converters/` directory but those are
  application-layer artefacts; Pryv stores the input + output
  events and the conversion happens client-side or in a separate
  service.
- **Custom stream hierarchies** — the data-model can document
  stream conventions (HDS does this in `definitions/streams/`)
  but Pryv doesn't enforce them at the API layer. Stream IDs are
  free-form per-user; the catalogue is documentation +
  client-side hint, not server-side schema.

## Related

- `pryv/data-types` upstream:
  https://github.com/pryv/data-types — the baked-in default
  (`event-types.default.json` mirrors it at build time).
- `hds-macro/data-model` exemplar — a sibling project (external
  to the open-pryv.io workspace).
- `docs/pryv-primitives.md` `data-types` primitive entry —
  references this context note.
- Server code: `components/business/src/types.ts`,
  `components/business/src/types/event-types.default.json`
  (~4750-line built-in fallback).
