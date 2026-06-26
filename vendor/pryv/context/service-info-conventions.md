# `serviceInfo` conventions — operator metadata propagation to client apps

`GET /service/info` is the platform's **operator-controlled
metadata surface** for client apps + SDKs + the auth UI. The
fields are declared by the operator in their core config and
served unchanged to any caller; the values propagate to every
`app-web-auth3` consent screen, every SDK that fetches service
info, every audit log entry that cites the URL.

Schema (verified at
`open-pryv.io/components/api-server/src/schema/service-info.ts`):

```js
{
  serial: string,
  api: string,         // base API URL
  access: string,      // auth UI URL
  register: string,    // registration server URL
  name: string,        // operator-chosen platform name
  home: string,        // operator home URL — controller identity surface
  support: string,     // operator support URL — DPO contact, support, contact-point
  terms: string,       // terms of service URL
  eventTypes: string,  // event-types catalogue URL (Q14 extension)
  assets: object,      // optional UI assets manifest
  features: object,    // optional feature flags surfaced to clients
  version: string      // platform version
}
```

`serial` + `api` + `access` + `register` + `name` + `home` +
`support` + `terms` + `eventTypes` are **required**;
`additionalProperties: false`.

## Compliance-relevant uses of the existing fields

### Art.13(1)(a) + Art.14(1)(a) — controller identity

The `home` URL is operator-controlled and propagates to every
client app. Operators put their **controller identity page**
behind `home` — legal entity name, postal address, registered
office, contact details. Client apps render the link without
operator-side coding.

### Art.13(1)(b) + Art.38(4) — DPO contact

The `support` URL is the natural anchor for the **DPO
contact-point obligation**. Per Art.38(4): *"Data subjects
may contact the data protection officer with regard to all
issues related to processing of their personal data and to the
exercise of their rights."* Per Art.13(1)(b): the data
subject must be informed of *"the contact details of the data
protection officer, where applicable"*.

Implementation patterns (operator's choice):

- **Easiest** — operator's support page (the page `support`
  points at) includes a "Data Protection Officer" section with
  the DPO name + email + postal address. Client apps display
  the standard "Support" link in their UI; subject clicks it
  and finds the DPO information. Zero extra Pryv surface
  required. Same posture as `serviceInfo.terms` for ToS.
- **Dedicated** — operator publishes a separate `dpo` URL
  (e.g., `https://operator.example.com/dpo`) and embeds it
  in their support page header. Still uses the existing
  `support` field as the anchor; the dedicated DPO page is
  one click away.
- **Future enhancement** (not currently needed) — extend
  `serviceInfo` schema with an optional `dpo` field. Would
  require open-pryv.io schema change + SDK + `app-web-auth3`
  to render. Filed as backlog only if a critical mass of
  operators want a dedicated field beyond the `support`-URL
  convention.

### Art.13(1)(d) + Art.14(2)(b) — legitimate-interests recipients

The `home` URL's privacy policy is the natural place to disclose
recipients. Pryv-side per-access metadata
(`access.clientData.transfer_basis` per Q25,
`clientData.purpose` per Q26 convention catalogue) carries the
machine-readable record; the human-readable disclosure lives on
the operator's home / privacy URL.

### Art.13(2)(f) — automated decision-making

If the deployment runs automated decisions (Q26), the operator
discloses the "logic involved, significance, envisaged
consequences" via the home / privacy URL; per-access machine-
readable basis lives on `clientData.processing_purpose` +
`art22_basis` (Q26).

### Art.7 transparency — consent context

The `terms` URL is the operator-controlled Terms of Service
anchor. Combined with `support` and `home`, the three URLs
constitute the **GDPR-compliant transparency surface** that
the auth UI surfaces by default.

## How `serviceInfo` propagates

- Set in operator config (currently YAML; a planned change migrates the
  `service.*` keys to PlatformDB so they're cluster-
  wide editable via admin panel).
- Returned by `GET /service/info` on every core — every client
  reads it.
- Cached on app-web-auth3 startup and rendered in the consent
  UI (footer / header link block).
- Cited in audit log when relevant (the audit row includes
  `source.ip` + method + access ref, not the serviceInfo
  itself; but the audit-traceable narrative threads back to
  `home` / `support` as the operator's public-facing surface).

## Comparison with `clientData` conventions

`serviceInfo` and `access.clientData` are **complementary**, not
overlapping:

| | `serviceInfo` (`GET /service/info`) | `access.clientData` |
|---|---|---|
| Scope | Deployment-wide | Per-access |
| Operator surface | Core config (YAML; PlatformDB once config moves out of YAML) | Per-access at mint time |
| Audience | All clients + SDKs | The specific app holding the access |
| Compliance role | Controller identity + DPO contact + ToS + privacy URLs | Per-processing-activity claims (lawful basis, special-category basis, transfer basis, etc.) |
| Versioning | Global; changes via config + deploy | Per-access version chain (`?includeHistory=true`) |
| Examples | `home`, `support`, `terms` | `lawful_basis`, `consent`, `transfer_basis`, `parental_holder_consent_event_id` |

Use both layers together: `serviceInfo` for "who is the
controller, where do I find the DPO, what are the ToS";
`access.clientData` for "under what basis is THIS access doing
THIS specific processing on THIS subject".

## Honest limits

- **No structured DPO contact field today** (only the `support`
  URL convention). Operators wanting machine-readable DPO
  details (name + email + phone + postal address) embed them
  in the support page; clients can scrape if needed; or wait
  for a future `serviceInfo.dpo` field.
- **No multi-DPO support** (one operator = one DPO is the
  regulatory default; multi-DPO is exotic enough to defer).
- **No localised serviceInfo** today. If the operator's home /
  support pages are language-keyed, the operator handles the
  language routing on the page itself (not at the serviceInfo
  layer). Future enhancement candidate.

## See also

- `context/client-data-conventions.md` — the complementary
  per-access convention layer.
- `context/privacy-by-design-and-default.md` — the
  privacy-by-default UI pattern in `app-web-auth3`.
- `gdpr.Art.13`, `gdpr.Art.14`, `gdpr.Art.38` — matrix rows
  citing this surface.
- `dev-site/src/guides/consent.md` — operator-facing consent
  implementation guide.
