#!/usr/bin/env node
/**
 * validate.js — strict-by-default validation of the HDS compliance matrix.
 *
 * Run from repo root:  npm run validate
 *
 * Checks:
 *   1. vendor/pryv/scopes/*.yml parse + match the Pryv scope schema (snapshot sanity).
 *   2. scopes/*.yml parse + match the HDS scope schema.
 *   3. templates/*.md frontmatter parse + match the template schema.
 *   4. Cross-refs:
 *      - hds scope.layered_on_pryv resolves to a vendored Pryv scope.
 *      - hds row.pryv_ref resolves to a ref in that Pryv scope.
 *      - hds row.implementer[].templates resolve to templates/<id>.
 *      - template.covers 'scopeId.ref' resolves to an HDS row.
 *      - template id matches its filename stem.
 *   5. Evidence completeness: hds.coverage implemented|configurable requires
 *      evidence.tests[] or evidence.ops[].
 *
 * Exit 0 on success, 1 on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  ROOT, loadYaml, parseFrontmatter, rel,
  vendorScopeFiles, hdsScopeFiles, templateFiles,
} from './lib/load.js';

const errors = [];
const warnings = [];
const e = (msg) => errors.push(msg);
const w = (msg) => warnings.push(msg);

const readSchema = (name) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', name), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Pryv (vendor) schemas
const pryvReq = readSchema('requirement.schema.json');
const pryvScope = readSchema('scope.schema.json');
ajv.addSchema(pryvReq);
const validatePryvScope = ajv.compile(pryvScope);

// HDS schemas
const hdsReq = readSchema('hds-requirement.schema.json');
const hdsScope = readSchema('hds-scope.schema.json');
ajv.addSchema(hdsReq);
const validateHdsScope = ajv.compile(hdsScope);

// Template schema
const validateTemplate = ajv.compile(readSchema('template.schema.json'));
const validateProfiles = ajv.compile(readSchema('profiles.schema.json'));

// ---------- 1. Vendor (Pryv) scopes ----------

const pryvIndex = new Map(); // scopeId -> Set(ref)
for (const f of await vendorScopeFiles()) {
  let scope;
  try { scope = loadYaml(f); } catch (err) { e(`${rel(f)}: YAML parse error: ${err.message}`); continue; }
  if (!validatePryvScope(scope)) {
    for (const err of validatePryvScope.errors) e(`${rel(f)}: ${err.instancePath} ${err.message}`);
    continue;
  }
  pryvIndex.set(scope.id, new Set((scope.requirements || []).map((r) => r.ref)));
}
console.log(`[OK]   vendor/pryv scopes: ${pryvIndex.size}`);

// ---------- 2. HDS scopes ----------

const hdsScopes = [];
const hdsRefs = new Set(); // 'scopeId.ref'
for (const f of await hdsScopeFiles()) {
  let scope;
  try { scope = loadYaml(f); } catch (err) { e(`${rel(f)}: YAML parse error: ${err.message}`); continue; }
  if (!validateHdsScope(scope)) {
    for (const err of validateHdsScope.errors) e(`${rel(f)}: ${err.instancePath} ${err.message}`);
    continue;
  }
  hdsScopes.push({ scope, file: f });
  for (const r of scope.requirements || []) hdsRefs.add(`${scope.id}.${r.ref}`);
}
console.log(`[INFO] HDS scopes: ${hdsScopes.length}`);

// ---------- 3. Templates ----------

const templates = new Map(); // id -> { data, file }
for (const f of await templateFiles()) {
  const { data } = parseFrontmatter(f);
  if (!data) { e(`${rel(f)}: missing YAML frontmatter`); continue; }
  if (!validateTemplate(data)) {
    for (const err of validateTemplate.errors) e(`${rel(f)}: ${err.instancePath} ${err.message}`);
    continue;
  }
  const stem = path.basename(f, '.md');
  if (data.id !== stem) e(`${rel(f)}: template id '${data.id}' != filename stem '${stem}'`);
  templates.set(data.id, { data, file: f });
}
console.log(`[INFO] templates: ${templates.size}`);

// ---------- 4 & 5. Cross-refs + evidence ----------

for (const { scope, file } of hdsScopes) {
  const r0 = rel(file);

  // ---- HDS's own standing (hds_posture) ----
  // The posture is what the public landing page asserts about HDS itself, so
  // the gates here exist to make an unearned claim impossible rather than
  // merely discouraged.
  const posture = scope.hds_posture;
  if (!posture) {
    e(`${r0}: no hds_posture block — every scope must state how HDS itself stands`);
  } else {
    const lvl = posture.external_assurance?.level;
    const detail = posture.external_assurance?.detail || '';

    // A claim of independent assurance must name the thing that grants it.
    if (lvl === 'certified' || lvl === 'third-party-attested') {
      if (!/\b(19|20)\d{2}\b/.test(detail)) {
        e(`${r0}: external_assurance.level '${lvl}' claims independent assurance but detail names no certificate, issuer or date`);
      }
      if (!(posture.known_gaps || []).length && !detail) {
        e(`${r0}: external_assurance.level '${lvl}' requires a detail naming the certificate and its scope`);
      }
    }

    // A hosting provider's certificate is not HDS assurance.
    for (const inh of posture.external_assurance?.inherited_provider_assurance || []) {
      if (/\bHDS\b/.test(inh)) {
        e(`${r0}: inherited_provider_assurance entry names HDS — these are the PROVIDER's certificates: '${inh}'`);
      }
    }

    // Gap anchors must point at real rows.
    const refsInScope = new Set((scope.requirements || []).map((r) => r.ref));
    for (const g of posture.known_gaps || []) {
      for (const ref of g.refs || []) {
        if (!refsInScope.has(ref)) e(`${r0}: hds_posture gap cites ref '${ref}' which is not a requirement in this scope`);
      }
    }

    // evidence_backing is derived data; a stale or invented count is worse than none.
    const eb = posture.evidence_backing;
    if (eb) {
      const total = (scope.requirements || []).length;
      if (eb.rows_total !== total) {
        e(`${r0}: evidence_backing.rows_total ${eb.rows_total} != ${total} actual requirements — re-run 'npm run evidence:status -- --write'`);
      }
      if (eb.rows_approved > eb.rows_evidenced) {
        e(`${r0}: evidence_backing.rows_approved (${eb.rows_approved}) exceeds rows_evidenced (${eb.rows_evidenced})`);
      }
      if (eb.rows_evidenced > eb.rows_total) {
        e(`${r0}: evidence_backing.rows_evidenced (${eb.rows_evidenced}) exceeds rows_total (${eb.rows_total})`);
      }
      // Cheap independent check: the count of rows citing internal evidence.
      const evidenced = (scope.requirements || [])
        .filter((r) => ((r.hds?.evidence?.internal_docs) || []).length).length;
      if (eb.rows_evidenced !== evidenced) {
        e(`${r0}: evidence_backing.rows_evidenced ${eb.rows_evidenced} != ${evidenced} rows actually citing internal evidence — re-run 'npm run evidence:status -- --write'`);
      }
      const ageDays = (Date.now() - Date.parse(eb.as_of)) / 86400000;
      if (Number.isFinite(ageDays) && ageDays > 90) {
        w(`${r0}: evidence_backing is ${Math.round(ageDays)} days old (as_of ${eb.as_of}) — re-run 'npm run evidence:status -- --write'`);
      }
    } else {
      w(`${r0}: hds_posture has no evidence_backing — the standing page will show no figure for this scope`);
    }
  }

  if (scope.layered_on_pryv && !pryvIndex.has(scope.layered_on_pryv)) {
    e(`${r0}: layered_on_pryv '${scope.layered_on_pryv}' not found in vendor/pryv/scopes/`);
  }

  const seen = new Set();
  for (const r of scope.requirements || []) {
    const cell = `${scope.id}.${r.ref}`;
    if (seen.has(r.ref)) e(`${cell}: duplicate ref within scope`);
    seen.add(r.ref);

    // pryv_ref resolves into the layered Pryv scope
    if (r.pryv_ref) {
      const refs = pryvIndex.get(scope.layered_on_pryv);
      if (!scope.layered_on_pryv) {
        e(`${cell}: pryv_ref set but scope has no layered_on_pryv`);
      } else if (refs && !refs.has(r.pryv_ref)) {
        e(`${cell}: pryv_ref '${r.pryv_ref}' not found in vendor/pryv scope '${scope.layered_on_pryv}'`);
      }
    }

    // planned-chip drift guard: an upstream_proposal must exist in the vendored
    // snapshot, so every sync:pryv flags uplinked chips whose upstream item
    // shipped or was dropped; kind:platform must carry the anchor.
    for (const p of (r.hds || {}).planned || []) {
      if (p.kind === 'platform' && !p.upstream_proposal) {
        e(`${cell}: hds.planned kind=platform requires upstream_proposal (the vendored proposal it is gated on)`);
      }
      if (p.upstream_proposal && !fs.existsSync(path.join(ROOT, p.upstream_proposal))) {
        e(`${cell}: hds.planned upstream_proposal '${p.upstream_proposal}' not found in the vendored snapshot — upstream item shipped/dropped? Revisit this chip.`);
      }
    }

    // evidence completeness
    const hds = r.hds || {};
    if (['implemented', 'configurable'].includes(hds.coverage)) {
      const ev = hds.evidence || {};
      const hasProof = (ev.docs && ev.docs.length) || (ev.internal_docs && ev.internal_docs.length) || (ev.tests && ev.tests.length);
      if (!hasProof) e(`${cell}: hds.coverage=${hds.coverage} requires evidence.docs[], evidence.internal_docs[] or evidence.tests[]`);
    }
    if (hds.coverage === 'facilitated' && !hds.facilitation_mode) {
      w(`${cell}: hds.coverage=facilitated but facilitation_mode is unset`);
    }
    if (hds.coverage && hds.coverage !== 'out-of-scope' && !hds.overview) {
      w(`${cell}: hds.coverage=${hds.coverage} but overview is empty`);
    }

    // implementer template refs
    for (const ob of r.implementer || []) {
      for (const t of ob.templates || []) {
        if (!templates.has(t)) e(`${cell}: implementer[${ob.persona}].templates '${t}' not found under templates/`);
      }
    }
  }
}

// template.covers resolves to HDS rows
for (const { data, file } of templates.values()) {
  for (const c of data.covers || []) {
    if (!hdsRefs.has(c)) e(`${rel(file)}: covers '${c}' does not resolve to an HDS scope.ref`);
  }
}

// ---------- Report ----------

// ---------- 6. Implementer profiles ----------
//
// The invariant being protected: an obligation is hidden from an implementer
// ONLY when it carries an explicit applies_when and every listed feature is
// off. A typo in a feature id would silently hide a real obligation, so every
// id must resolve here or the build fails.

const profilesFile = path.join(ROOT, 'profiles.yml');
let profiles = null;
if (!fs.existsSync(profilesFile)) {
  w('profiles.yml missing — the implementer view cannot filter, every obligation shows unprofiled');
} else {
  try { profiles = loadYaml(profilesFile); } catch (err) { e(`profiles.yml: YAML parse error: ${err.message}`); }
  if (profiles && !validateProfiles(profiles)) {
    for (const err of validateProfiles.errors) e(`profiles.yml: ${err.instancePath} ${err.message}`);
    profiles = null;
  }
}

if (profiles) {
  const baseIds = new Set(profiles.features.map((f) => f.id));
  const derivedIds = new Set((profiles.derived || []).map((d) => d.id));
  const knownIds = new Set([...baseIds, ...derivedIds]);

  for (const id of derivedIds) {
    if (baseIds.has(id)) e(`profiles.yml: derived id '${id}' collides with a feature id`);
  }
  for (const d of profiles.derived || []) {
    for (const ref of [...(d.all || []), ...(d.any || [])]) {
      if (!baseIds.has(ref)) e(`profiles.yml: derived '${d.id}' references '${ref}', which is not a base feature (derived may not chain)`);
    }
  }
  for (const pr of profiles.presets) {
    for (const id of [...pr.features, ...(pr.locked || [])]) {
      if (!knownIds.has(id)) e(`profiles.yml: preset '${pr.id}' references unknown feature '${id}'`);
    }
  }
  const scopeIds = new Set(hdsScopes.map(({ scope }) => scope.id));
  // Selecting a scope is a legitimate job for a feature, so record it as use.
  const usedByRules = new Set();
  for (const s2 of profiles.step2 || []) {
    const ids = [s2.feature, ...(s2.implies || []), ...(s2.clears || []),
      ...((s2.choice && s2.choice.options) || []).map((o) => o.feature)];
    for (const id of ids) {
      if (!knownIds.has(id)) e(`profiles.yml: step2 '${s2.id}' references unknown feature '${id}'`);
      else usedByRules.add(id);
    }
  }
  for (const rule of profiles.scope_applicability) {
    if (!scopeIds.has(rule.scope)) e(`profiles.yml: scope_applicability names unknown scope '${rule.scope}'`);
    for (const id of [...(rule.when.all || []), ...(rule.when.any || [])]) {
      if (!knownIds.has(id)) e(`profiles.yml: scope_applicability '${rule.scope}' references unknown feature '${id}'`);
      else usedByRules.add(id);
    }
  }
  for (const u of profiles.uncovered || []) {
    for (const id of [...(u.when.all || []), ...(u.when.any || []), ...(u.unless || [])]) {
      if (!knownIds.has(id)) e(`profiles.yml: uncovered '${u.id}' references unknown feature '${id}'`);
      else usedByRules.add(id);
    }
  }
  for (const sid of Object.keys(profiles.personas || {})) {
    if (!scopeIds.has(sid)) e(`profiles.yml: personas names unknown scope '${sid}'`);
  }

  // Row tags.
  const ORG_PERSONAS = new Set(['partner', 'covered-entity', 'business-associate', 'controller',
    'processor', 'service-organization', 'user-entity', 'subservice-organization']);

  // An implementer entry is either a duty (it says what to do) or it is not one
  // (coverage out-of-scope, and nothing to say). Those two coincided exactly on
  // all 92 out-of-scope entries; making it a rule stops a future entry drifting
  // into the gap, where the implementer page would render an action with no
  // action text in it.
  const ORG_CHECK = new Set(['covered-entity', 'business-associate']);
  for (const { scope, file } of hdsScopes) {
    const r0 = rel(file);
    for (const r of scope.requirements || []) {
      for (const o of r.implementer || []) {
        const hasText = !!(o.overview || '').trim();
        if (o.coverage === 'out-of-scope' && hasText) {
          e(`${r0}: ${r.ref} '${o.persona}' is out-of-scope but carries an overview — say it places no duty, or give it a coverage that matches the text`);
        }
        if (o.coverage !== 'out-of-scope' && ORG_CHECK.has(o.persona) && !o.basis) {
          e(`${r0}: ${r.ref} '${o.persona}' has no basis — say whether the duty arises from using HDS (integration) or attaches to you as an entity`);
        }
        if (/^\s*(same\b|as above|likewise|ditto)/i.test(o.overview || '')) {
          e(`${r0}: ${r.ref} '${o.persona}' text starts by referring to another persona's entry. The implementer page renders one persona at a time, so the antecedent is never on screen. Write it standalone.`);
        }
        if (o.coverage !== 'out-of-scope' && !hasText) {
          e(`${r0}: ${r.ref} '${o.persona}' has coverage '${o.coverage}' but no overview — an obligation with nothing to do is not an obligation`);
        }
      }
    }
  }
  const used = new Set();
  let orgObligations = 0;
  let profiled = 0;
  for (const { scope, file } of hdsScopes) {
    const r0 = rel(file);
    for (const r of scope.requirements || []) {
      const seen = new Map(); // persona -> {untagged, always}
      for (const o of r.implementer || []) {
        if (ORG_PERSONAS.has(o.persona) && o.coverage !== 'out-of-scope') orgObligations++;
        const aw = o.applies_when;
        if (aw === undefined) {
          const s = seen.get(o.persona) || {};
          if (s.untagged) e(`${r0}: ${r.ref} has two untagged '${o.persona}' obligations — the page cannot tell them apart`);
          seen.set(o.persona, { ...s, untagged: true });
          continue;
        }
        if (ORG_PERSONAS.has(o.persona) && o.coverage !== 'out-of-scope') profiled++;
        if (aw === 'always') {
          const s = seen.get(o.persona) || {};
          if (s.always) e(`${r0}: ${r.ref} has two 'always' '${o.persona}' obligations`);
          seen.set(o.persona, { ...s, always: true });
          continue;
        }
        for (const id of aw) {
          if (!knownIds.has(id)) e(`${r0}: ${r.ref} '${o.persona}' applies_when references unknown feature '${id}'`);
          else used.add(id);
        }
      }
    }
  }
  // A feature may also earn its place by deciding a persona rather than by
  // tagging a row.
  for (const cfg of Object.values(profiles.personas || {})) {
    for (const rule of cfg.derive || []) {
      for (const id of [...(rule.when.all || []), ...(rule.when.any || [])]) {
        if (!knownIds.has(id)) e(`profiles.yml: personas derive rule references unknown feature '${id}'`);
        else usedByRules.add(id);
      }
    }
  }
  for (const id of knownIds) {
    if (!used.has(id) && !usedByRules.has(id) &&
        !(profiles.derived || []).some((d) => (d.all || d.any || []).includes(id))) {
      const isPopulation = profiles.features.some((f) => f.id === id &&
        (f.group === 'population' || f.group === 'residency' || f.group === 'us-role'));
      // population/residency features select SCOPES and arrangement selects the
      // PERSONA, so these legitimately tag no rows.
      if (!isPopulation) w(`profiles.yml: feature '${id}' is not used by any obligation — a checkbox that changes nothing misleads`);
    }
  }
  console.log(`[INFO] implementer profiles: ${profiles.features.length} features, ${profiles.presets.length} presets; ` +
    `${profiled}/${orgObligations} organisation-persona obligations profiled ` +
    `(${Math.round(profiled / (orgObligations || 1) * 100)}%), the rest shown unfiltered`);
}

if (warnings.length) { console.log(''); for (const m of warnings) console.log(`[WARN] ${m}`); }
if (errors.length) {
  console.log('');
  for (const m of errors) console.log(`[FAIL] ${m}`);
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`\n[OK]   validate: ${hdsScopes.length} HDS scope(s) clean, ${templates.size} template(s), ${warnings.length} warning(s)`);
