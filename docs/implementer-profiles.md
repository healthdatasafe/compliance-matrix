# Implementer profiles

Audience: whoever maintains this matrix. The implementer-facing page is
<https://compliance.datasafe.dev/implementer.html>, and the machine-readable form
an agent should use is <https://compliance.datasafe.dev/llms.txt>.

The model lives in [`../profiles.yml`](../profiles.yml), which is heavily
commented; this file is the orientation around it.

## The invariant everything else serves

> An obligation may be hidden from an implementer **only** when it carries an
> explicit `applies_when` list and **every** listed feature is off.

An obligation with no `applies_when` is **always shown**, marked "not yet
profiled". Untagged never means inapplicable. Silently concealing a real
obligation is the one failure here that actually harms the reader, and every
other rule in this file exists to make that failure hard to commit by accident.

`npm run validate` enforces the mechanical half: every feature id in an
`applies_when` must resolve in `profiles.yml`, so a typo fails the build instead
of quietly hiding a duty.

## Features, and the any-of rule

`features[]` is the vocabulary an implementer answers in. Each entry has an `id`,
a `group` (`population`, `us-role`, `residency`, `application`), a `label`, and
optionally a `note` and an `exclusive` radio-group name.

A row tags an obligation with a **flat any-of list**:

```yaml
- persona: controller
  applies_when: [connects, analytics, secondary-use]
```

The obligation shows if **any** listed feature is on. Lists are deliberately flat
and never nested, because composite logic in hundreds of rows is unreviewable.
The literal `applies_when: always` marks an obligation that is never filtered
out.

Composite logic lives in exactly one place, `derived[]`:

```yaml
derived:
  - id: processes-personal-data
    any: [connects, stores-phi-copy, own-records, third-parties, analytics, secondary-use]
  - id: transfer-eu-us
    all: [subjects-eu, region-us]
```

A derived id is used in `applies_when` exactly like a plain feature. If you find
yourself wanting an all-of condition on a row, add a derived id instead and give
it a name that says what it means.

## Presets

`presets[]` are the four archetypes. `features` is what the archetype turns on;
`locked` lists what it settles, on or off, and those render disabled. Unticking
"you keep your own copy" while the copy archetype is selected would describe
something that is not that archetype. Anything not listed stays free, because it
describes the organisation rather than the thing being built.

An archetype whose `features` list is empty is legitimate: the self-monitoring
app ticks nothing, and correctly lands almost no obligations.

## Which scopes apply, and as which persona

- `scope_applicability[]` decides whether a framework engages at all. GDPR needs
  `subjects-eu`; the three HIPAA rules need `subjects-us` **and** `hipaa-in-play`.
- `personas` decides whose obligations to show within an engaged scope. Either a
  `default` (GDPR and nLPD are always `controller`) or an ordered `derive` list
  where the first matching condition wins.
- **A `derive` list matching nothing is a real answer, not a bug.** An
  application that creates, receives, maintains and transmits nothing is neither
  a covered entity nor a business associate, and the page must be able to say so.
- `uncovered[]` surfaces selections this matrix does **not** cover, so a gap in
  our coverage never reads as an absence of obligations. The US consumer case is
  the live example: HIPAA does not reach them, and the FTC Health Breach
  Notification Rule and state law do, and we have no scope for either yet.

## Adding an area or a follow-up question

`step2` is one growing list of areas plus questions that appear only when an area
is selected, so a US-specific question never shows to a European implementer.
Adding a country is one entry:

```yaml
step2:
  areas:
    options:
      - feature: subjects-uk
        label: United Kingdom
        gives: UK GDPR
```

Then add the matching `features[]` entry, and a `scope_applicability[]` rule if a
scope engages. A follow-up question hangs off `when: <feature id>`, names a radio
group, and lists options that each map to a feature. The `us-health` follow-up is
the model: one question with four mutually exclusive answers, because the three
HIPAA facts form a hierarchy and asking them as three checkboxes let a reader
tick a combination that means nothing.

A feature no row uses produces a validation warning. A checkbox that changes
nothing is worse than no checkbox.

## Two fields that keep the action list honest

Both sit on an `implementer[]` entry and both exist because of a specific way the
page once lied to a reader.

**`nature`** is `obligation` (the default) or `orientation`. An orientation entry
is not a duty: it is a scope provision telling the reader whether the regime
engages at all, such as GDPR Art.2 and Art.3. Orientation entries are always
shown and **never counted** as obligations. Without this, scope articles inflate
the count for an implementer who has no obligations, and a page that should read
"nothing attaches to you" reads "4 obligations apply".

**`basis`** is `integration` or `entity`, and answers where the duty comes from:

- `integration`: it exists, or takes this shape, because of how you use HDS. The
  grants you mint, the agreement you sign with HDS, review of the HDS audit log.
- `entity`: it attaches to you because of the role you hold, and would exist
  unchanged if you had never heard of HDS. Security official, sanctions,
  workforce training, notice of privacy practices.

The author's test: *would this obligation vanish if you dropped HDS for another
platform?* If yes it is `integration`. Presenting entity duties as consequences
of building on HDS is what made an implementer who receives nothing read 49
actions. Validation requires `basis` on `covered-entity` and `business-associate`
obligations that are not `out-of-scope`; the GDPR, nLPD and SOC 2 personas are
not yet gated and remain largely untagged.

## Scope of the model, and what is not tagged yet

The matrix covers the **vault product**. Individuals hold their own accounts,
data enters only with their explicit consent, and they decide who may access it.
HDS is the controller of the vault and is nobody's Art.28 processor. An
organisation that receives shared data is an independent controller of what it
holds; it needs its own lawful basis, notice and security measures, and it cannot
have a DPA with HDS for the vault.

All 361 organisation-persona obligations are profiled. The remaining entries,
`individual` and `data-subject` personas, are shown unfiltered and marked as
such, which is the invariant working as intended rather than a backlog.

## Changing any of this

`llms.txt` writes out the matching rules an agent is expected to apply. If you
add a feature, a persona rule or a new `applies_when` value, extend the generator
in `scripts/site.js` in the **same commit** and re-run `npm run site`. If the
documented rules drift from `render()`, an agent will compute a confident wrong
compliance answer with nothing to flag it. See the directive in
[`../AGENTS.md`](../AGENTS.md).

## Related

- [`../profiles.yml`](../profiles.yml), the model itself, commented.
- [`../schemas/profiles.schema.json`](../schemas/profiles.schema.json) and the
  `implementerObligation` block in
  [`../schemas/hds-requirement.schema.json`](../schemas/hds-requirement.schema.json).
- [`hds-standing.md`](hds-standing.md) for the other half, how HDS itself stands.
