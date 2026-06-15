#!/usr/bin/env node
/**
 * check-internal-links.js — verify the matrix's internal_doc codes resolve to
 * real documents in the private compliance-internal repo, and report internal
 * documents not (yet) cited by the matrix.
 *
 * Local/dev only — the matrix repo is PUBLIC and must not depend on the private
 * repo, so this is NOT part of CI. Run it where both repos are checked out.
 *
 *   node scripts/check-internal-links.js
 *   INTERNAL_REPO=/path/to/compliance-internal/compliance-internal node scripts/check-internal-links.js
 *
 * Exit 0 if every cited code resolves; 1 if any are missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadYaml, hdsScopeFiles } from './lib/load.js';

const INTERNAL = process.env.INTERNAL_REPO ||
  path.resolve(ROOT, '../../compliance-internal/compliance-internal');
const DOCS_DIR = path.join(INTERNAL, 'src/content/documents');

if (!fs.existsSync(DOCS_DIR)) {
  console.log(`[SKIP] compliance-internal not found at ${DOCS_DIR}`);
  console.log('       set INTERNAL_REPO to the compliance-internal/compliance-internal path.');
  process.exit(0);
}

// 1. Collect internal_doc codes cited by the matrix.
const cited = new Map(); // code -> [scope.ref ...]
for (const f of await hdsScopeFiles()) {
  const s = loadYaml(f);
  for (const r of s.requirements || []) {
    for (const code of (r.hds?.evidence?.internal_docs) || []) {
      if (!cited.has(code)) cited.set(code, []);
      cited.get(code).push(`${s.id}.${r.ref}`);
    }
  }
}

// 2. Collect docs that exist in the internal repo (by code = path without .md).
const existing = new Set();
const walk = (dir, base = '') => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), rel);
    else if (e.name.endsWith('.md')) existing.add(rel.replace(/\.md$/, ''));
  }
};
walk(DOCS_DIR);

// 3. Report.
const missing = [...cited.keys()].filter((c) => !existing.has(c)).sort();
const uncited = [...existing].filter((c) => !cited.has(c)).sort();

console.log(`[INFO] matrix cites ${cited.size} internal_doc code(s); internal repo has ${existing.size} document(s).`);
if (uncited.length) {
  console.log(`\n[NOTE] ${uncited.length} internal document(s) not cited by the matrix (ok — context/registers/tasks):`);
  for (const c of uncited) console.log(`  · ${c}`);
}
if (missing.length) {
  console.log(`\n[FAIL] ${missing.length} cited code(s) have NO document in compliance-internal:`);
  for (const c of missing) console.log(`  ✗ ${c}  (cited by ${cited.get(c).join(', ')})`);
  process.exit(1);
}
console.log('\n[OK]   every internal_doc code cited by the matrix resolves to a document.');
