#!/usr/bin/env node
/**
 * evidence-status.js — recompute each scope's `hds_posture.evidence_backing`
 * from the approval state of the documents it cites in compliance-internal.
 *
 * This is the number the public standing page leads with, so it must be
 * derived, not remembered. It answers: of this scope's requirements, how many
 * rest ENTIRELY on internal documents that have completed approval.
 *
 * Deliberately NOT the row-level `draft` flag. That flag records whether a
 * second reader has checked the matrix WORDING; it says nothing about whether
 * HDS holds the control. Presenting it as coverage understates the programme
 * badly (on 2026-09-08 it read 18 of 91 HIPAA rows where the documentation
 * backing was 88 of 91).
 *
 * Only COUNTS are written into the public repo. Per-document approval status
 * stays private; the document codes themselves are already public in
 * `hds.evidence.internal_docs`.
 *
 * Local/dev only — the matrix repo is PUBLIC and must not depend on the private
 * repo, so this is NOT part of CI (same rule as check-internal-links.js).
 *
 *   node scripts/evidence-status.js            # report only
 *   node scripts/evidence-status.js --write    # update scopes/*.yml
 *   INTERNAL_REPO=/path/to/compliance-internal node scripts/evidence-status.js
 *
 * Exit 0 on success, 1 if a cited code has no document (the counts would lie).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadYaml, hdsScopeFiles, rel } from './lib/load.js';

const WRITE = process.argv.includes('--write');
const INTERNAL = process.env.INTERNAL_REPO ||
  path.resolve(ROOT, '../compliance-internal');
const DOCS_DIR = path.join(INTERNAL, 'src/content/documents');

if (!fs.existsSync(DOCS_DIR)) {
  console.log(`[SKIP] compliance-internal not found at ${DOCS_DIR}`);
  console.log('       set INTERNAL_REPO to the compliance-internal path.');
  process.exit(0);
}

// ---- index document code -> approval status ----
const status = new Map();
const walk = (dir, base = '') => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) { walk(path.join(dir, e.name), r); continue; }
    if (!/\.mdx?$/.test(e.name)) continue;
    const m = fs.readFileSync(path.join(dir, e.name), 'utf8').match(/^status:\s*(\S+)/m);
    status.set(r.replace(/\.mdx?$/, ''), m ? m[1] : 'unknown');
  }
};
walk(DOCS_DIR);
console.log(`[INFO] indexed ${status.size} internal document(s) from ${DOCS_DIR}`);

const today = new Date().toISOString().slice(0, 10);
let unresolved = 0;
let changed = 0;

for (const file of await hdsScopeFiles()) {
  const scope = loadYaml(file);
  const reqs = scope.requirements || [];

  let evidenced = 0;
  let approved = 0;
  for (const r of reqs) {
    const codes = (r.hds?.evidence?.internal_docs) || [];
    if (!codes.length) continue;
    evidenced++;
    const states = codes.map((c) => {
      const s = status.get(c);
      if (!s) { console.log(`  ✗ ${scope.id}.${r.ref}: no document for code '${c}'`); unresolved++; }
      return s || 'missing';
    });
    if (states.every((s) => s === 'approved')) approved++;
  }

  const prev = scope.hds_posture?.evidence_backing;
  const drift = prev && (prev.rows_approved !== approved || prev.rows_evidenced !== evidenced ||
    prev.rows_total !== reqs.length);
  console.log(`${scope.id.padEnd(15)} ${String(approved).padStart(3)} approved / ` +
    `${String(evidenced).padStart(3)} evidenced / ${String(reqs.length).padStart(3)} total` +
    (prev ? (drift ? `   (was ${prev.rows_approved}/${prev.rows_evidenced}/${prev.rows_total}, as of ${prev.as_of})` : '   unchanged') : '   (no block yet)'));

  if (!WRITE) continue;
  const text = fs.readFileSync(file, 'utf8');
  const block = '  evidence_backing:\n' +
    `    rows_total: ${reqs.length}\n` +
    `    rows_evidenced: ${evidenced}\n` +
    `    rows_approved: ${approved}\n` +
    `    as_of: "${today}"\n`;
  let next;
  if (/^ {2}evidence_backing:\n(?: {4}.*\n)+/m.test(text)) {
    next = text.replace(/^ {2}evidence_backing:\n(?: {4}.*\n)+/m, block);
  } else if (/^ {2}assessed_at: .*\n/m.test(text)) {
    next = text.replace(/^( {2}assessed_at: .*\n)/m, `$1${block}`);
  } else {
    console.log(`  ! ${scope.id}: no hds_posture block to update, skipped`);
    continue;
  }
  if (next !== text) { fs.writeFileSync(file, next); changed++; console.log(`  → updated ${rel(file)}`); }
}

if (unresolved) {
  console.log(`\n[FAIL] ${unresolved} cited code(s) resolve to no document; counts would be wrong.`);
  process.exit(1);
}
console.log(WRITE
  ? `\n[OK]   evidence_backing refreshed (${changed} file(s) changed, as_of ${today}).`
  : '\n[OK]   report only. Re-run with --write to update scopes/*.yml.');
