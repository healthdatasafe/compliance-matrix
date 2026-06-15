#!/usr/bin/env node
/**
 * validate.js — strict-by-default validation of the compliance matrix.
 *
 * Run from repo root:  npm run validate
 *
 * Checks:
 *   1. Every scopes/*.yml parses + matches JSON Schema (scope + requirement).
 *   2. Every functional_specs reqid resolves in dev-site requirements.yml.
 *   3. Every test code appears in at least one open-pryv.io/components/{*}/test file.
 *   4. Every docs path exists in dev-site/src/ or compliance-matrix/docs/.
 *   5. Every qms_docs path exists in compliance-matrix/qms/.
 *   6. Evidence-completeness: coverage=implemented|configurable requires tests[].
 *   7. Curated scopes have at least one excluded_items entry.
 *   8. Layered_on refs resolve to existing scope ids.
 *
 * Exit 0 on success, 1 on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { glob } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(ROOT, '..');
// Workspace-relative backlog directory; configurable for non-default layouts.
const BACKLOG_DIR = process.env.BACKLOG_DIR || ['_plans', 'XXX-Backlog'].join(path.sep);

const DEV_SITE_REQUIREMENTS = path.join(
  WORKSPACE_ROOT,
  'dev-site/src/_functional-specifications/requirements.yml'
);
const OPEN_PRYV_TEST_GLOB = path.join(
  WORKSPACE_ROOT,
  'open-pryv.io/components/*/test/**/*.{js,ts}'
);
const DEV_SITE_SRC = path.join(WORKSPACE_ROOT, 'dev-site/src');

const errors = [];
const warnings = [];

const e = (msg) => errors.push(msg);
const w = (msg) => warnings.push(msg);

// ---------- 1. Load schemas ----------

const reqSchema = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'schemas/requirement.schema.json'), 'utf8')
);
const scopeSchema = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'schemas/scope.schema.json'), 'utf8')
);

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(reqSchema);
const validateScope = ajv.compile(scopeSchema);

// ---------- 2. Load dev-site reqids ----------

const knownReqids = new Set();
if (fs.existsSync(DEV_SITE_REQUIREMENTS)) {
  const root = yaml.load(fs.readFileSync(DEV_SITE_REQUIREMENTS, 'utf8'));
  // Walk sections[].requirements[] (and nested sections); reqid = '<SECTION>.<REQ>'
  const walk = (sections, prefix = '') => {
    if (!Array.isArray(sections)) return;
    for (const s of sections) {
      const sectionId = s.reqid || s.id;
      const sectionPrefix = sectionId ? (prefix ? `${prefix}.${sectionId}` : sectionId) : prefix;
      if (Array.isArray(s.requirements)) {
        for (const r of s.requirements) {
          if (r.reqid) {
            knownReqids.add(sectionPrefix ? `${sectionPrefix}.${r.reqid}` : r.reqid);
          }
        }
      }
      if (Array.isArray(s.sections)) walk(s.sections, sectionPrefix);
    }
  };
  walk(root.sections || []);
  console.log(`[OK]   dev-site reqids loaded: ${knownReqids.size}`);
} else {
  w(`dev-site requirements.yml not found at ${DEV_SITE_REQUIREMENTS} — reqid xref skipped`);
}

// ---------- 3. Load test codes from open-pryv.io ----------

const knownTestCodes = new Set();
try {
  const testFiles = await glob(OPEN_PRYV_TEST_GLOB);
  if (testFiles.length === 0) {
    w(`No open-pryv.io test files found via glob ${OPEN_PRYV_TEST_GLOB}`);
  } else {
    const codeRegex = /\[([A-Z][A-Z0-9]+)\]/g;
    for (const f of testFiles) {
      const txt = fs.readFileSync(f, 'utf8');
      let m;
      while ((m = codeRegex.exec(txt)) !== null) knownTestCodes.add(m[1]);
    }
    console.log(`[OK]   open-pryv.io test codes loaded: ${knownTestCodes.size} from ${testFiles.length} files`);
  }
} catch (err) {
  w(`Failed to scan open-pryv.io test files: ${err.message}`);
}

// ---------- 3b. Load pryv primitives (docs/pryv-primitives.md) ----------

const PRIMITIVES_DOC = path.join(ROOT, 'docs/pryv-primitives.md');
const knownPrimitives = new Set();
if (fs.existsSync(PRIMITIVES_DOC)) {
  const txt = fs.readFileSync(PRIMITIVES_DOC, 'utf8');
  // Headings under "## Primitive catalogue" of the form: ### `<id>`
  const re = /^###\s+`([^`]+)`/gm;
  let m;
  while ((m = re.exec(txt)) !== null) knownPrimitives.add(m[1]);
  console.log(`[OK]   pryv primitives loaded: ${knownPrimitives.size}`);
} else {
  w('docs/pryv-primitives.md not found — pryv_primitives xref skipped');
}

// ---------- 4. Load scope yamls ----------

const scopeFiles = await glob(path.join(ROOT, 'scopes/*.yml'));
console.log(`[INFO] scopes/ files found: ${scopeFiles.length}`);

const allScopeIds = new Set();
const allScopes = [];

for (const f of scopeFiles) {
  let scope;
  try {
    scope = yaml.load(fs.readFileSync(f, 'utf8'));
  } catch (err) {
    e(`${path.relative(ROOT, f)}: YAML parse error: ${err.message}`);
    continue;
  }
  if (!validateScope(scope)) {
    for (const err of validateScope.errors) {
      e(`${path.relative(ROOT, f)}: ${err.instancePath} ${err.message}`);
    }
    continue;
  }
  allScopeIds.add(scope.id);
  allScopes.push({ scope, file: f });
}

// ---------- 5. Per-scope semantic checks ----------

for (const { scope, file } of allScopes) {
  const rel = path.relative(ROOT, file);

  // 5.1 layered_on refs must exist
  for (const layer of scope.layered_on || []) {
    if (!allScopeIds.has(layer)) {
      e(`${rel}: layered_on references unknown scope '${layer}'`);
    }
  }

  // 5.2 curated implies excluded_items not empty (also encoded in schema if/then)
  if (scope.curated && (!scope.excluded_items || scope.excluded_items.length === 0)) {
    e(`${rel}: scope is curated:true but excluded_items is empty`);
  }

  // 5.3 per-requirement checks
  const seenRefs = new Set();
  for (const r of scope.requirements || []) {
    const cell = `${scope.id}.${r.ref}`;

    if (seenRefs.has(r.ref)) {
      e(`${cell}: duplicate ref within scope`);
    }
    seenRefs.add(r.ref);

    // Evidence completeness
    if (['implemented', 'configurable'].includes(r.coverage)) {
      if (!r.tests || r.tests.length === 0) {
        e(`${cell}: coverage=${r.coverage} requires at least one test code (got empty tests[])`);
      }
    }
    if (r.coverage === 'documented' && (!r.docs || r.docs.length === 0) && (!r.qms_docs || r.qms_docs.length === 0)) {
      w(`${cell}: coverage=documented but neither docs[] nor qms_docs[] is set`);
    }
    if (r.coverage === 'configurable' && (!r.config_keys || r.config_keys.length === 0)) {
      w(`${cell}: coverage=configurable but config_keys[] is empty`);
    }
    // overview is the primary skimmable summary; warn when missing for non-out-of-scope rows.
    if (r.coverage !== 'out-of-scope' && (!r.overview || r.overview.trim().length === 0)) {
      w(`${cell}: coverage=${r.coverage} but overview is empty (audiences: auditor / compliance officer rely on it)`);
    }

    // pryv_effort_saved: required when coverage != out-of-scope; forbidden when out-of-scope.
    if (r.coverage === 'out-of-scope') {
      if (r.pryv_effort_saved !== undefined) {
        e(`${cell}: coverage=out-of-scope MUST NOT carry pryv_effort_saved (out-of-scope = zero by definition)`);
      }
    } else {
      if (r.pryv_effort_saved === undefined) {
        e(`${cell}: coverage=${r.coverage} requires pryv_effort_saved (high|medium|low) -- see docs/facilitation-typology.md`);
      }
    }

    // facilitation_mode: required when coverage=facilitated; forbidden otherwise.
    if (r.coverage === 'facilitated') {
      if (r.facilitation_mode === undefined) {
        e(`${cell}: coverage=facilitated requires facilitation_mode (primitive|evidence|storage|infrastructure|awareness)`);
      }
    } else {
      if (r.facilitation_mode !== undefined) {
        e(`${cell}: facilitation_mode is only valid when coverage=facilitated (this row has coverage=${r.coverage})`);
      }
    }

    // reqid resolution
    for (const reqid of r.functional_specs || []) {
      if (knownReqids.size > 0 && !knownReqids.has(reqid)) {
        e(`${cell}: functional_specs '${reqid}' not found in dev-site requirements.yml`);
      }
    }

    // Test code resolution
    for (const t of r.tests || []) {
      if (knownTestCodes.size > 0 && !knownTestCodes.has(t)) {
        e(`${cell}: test code '${t}' not found in open-pryv.io tests`);
      }
    }

    // Docs path resolution
    for (const d of r.docs || []) {
      const [filePart] = d.split('#');
      const candidates = [
        path.join(DEV_SITE_SRC, filePart),
        path.join(ROOT, 'docs', filePart),
        path.join(ROOT, 'references', filePart),
      ];
      if (!candidates.some(fs.existsSync)) {
        e(`${cell}: docs path '${d}' not found (tried dev-site/src/, docs/, references/)`);
      }
    }

    // QMS path resolution
    for (const q of r.qms_docs || []) {
      const p = path.join(ROOT, 'qms', q.replace(/^qms\//, ''));
      if (!fs.existsSync(p) && !fs.existsSync(path.join(ROOT, q))) {
        e(`${cell}: qms_docs path '${q}' not found`);
      }
    }

    // pryv_primitives resolution
    for (const p of r.pryv_primitives || []) {
      if (knownPrimitives.size > 0 && !knownPrimitives.has(p)) {
        e(`${cell}: pryv_primitives '${p}' not found in docs/pryv-primitives.md`);
      }
    }

    // sample_apps resolution (local path) — external URLs are allowed without check
    for (const s of r.sample_apps || []) {
      if (s.startsWith('http://') || s.startsWith('https://')) continue;
      const p = path.join(ROOT, 'samples', s.replace(/^samples\//, ''));
      if (!fs.existsSync(p) && !fs.existsSync(path.join(ROOT, s))) {
        e(`${cell}: sample_apps path '${s}' not found under samples/`);
      }
    }

    // derives_from cross-scope refs
    for (const ref of r.derives_from || []) {
      const [otherScope] = ref.split('.', 1);
      if (!allScopeIds.has(otherScope)) {
        e(`${cell}: derives_from '${ref}' references unknown scope '${otherScope}'`);
      }
    }

    // planned[].proposal must exist under proposals/; planned[].backlog (when
    // set) must resolve to a backlog file in the workspace.
    for (const p of r.planned || []) {
      const propPath = path.join(ROOT, p.proposal);
      if (!fs.existsSync(propPath)) {
        e(`${cell}: planned.proposal '${p.proposal}' not found (expected under compliance-matrix/)`);
      }
      if (p.backlog) {
        const backlogPath = path.join(
          WORKSPACE_ROOT, BACKLOG_DIR, `${p.backlog}.md`
        );
        if (!fs.existsSync(backlogPath)) {
          e(`${cell}: planned.backlog '${p.backlog}' not found at ${path.relative(WORKSPACE_ROOT, backlogPath)}`);
        }
      }
    }
  }
}

// ---------- 6. Report ----------

if (warnings.length) {
  console.log('');
  for (const m of warnings) console.log(`[WARN] ${m}`);
}
if (errors.length) {
  console.log('');
  for (const m of errors) console.log(`[FAIL] ${m}`);
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`\n[OK]   validate: ${allScopes.length} scope(s) clean, ${warnings.length} warning(s)`);
