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

    // evidence completeness
    const hds = r.hds || {};
    if (['implemented', 'configurable'].includes(hds.coverage)) {
      const ev = hds.evidence || {};
      const hasProof = (ev.tests && ev.tests.length) || (ev.ops && ev.ops.length);
      if (!hasProof) e(`${cell}: hds.coverage=${hds.coverage} requires evidence.tests[] or evidence.ops[]`);
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

if (warnings.length) { console.log(''); for (const m of warnings) console.log(`[WARN] ${m}`); }
if (errors.length) {
  console.log('');
  for (const m of errors) console.log(`[FAIL] ${m}`);
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`\n[OK]   validate: ${hdsScopes.length} HDS scope(s) clean, ${templates.size} template(s), ${warnings.length} warning(s)`);
