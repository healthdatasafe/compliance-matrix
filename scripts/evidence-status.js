#!/usr/bin/env node
/**
 * evidence-status.js — recompute, from the approval state of the documents
 * cited in compliance-internal:
 *   1. each scope's `hds_posture.evidence_backing` counts, and
 *   2. each requirement's `hds.evidence_approved` flag.
 *
 * These are the numbers the public standing page leads with, so they must be
 * derived, not remembered. The counts answer: of this scope's requirements, how
 * many rest ENTIRELY on internal documents that have completed approval.
 *
 * Deliberately NOT the row-level `draft` flag. That flag records whether a
 * second reader has checked the matrix WORDING; it says nothing about whether
 * HDS holds the control. Presenting it as coverage understates the programme
 * badly (on 2026-09-08 it read 18 of 91 HIPAA rows where the documentation
 * backing was 88 of 91).
 *
 * WHAT REACHES THE PUBLIC REPO, and why the row flag is one-sided.
 * Per-document approval status stays private; the document CODES are already
 * public in `hds.evidence.internal_docs`. The row flag is therefore written
 * only when EVERY cited document is approved, and is never written as `false`:
 * a row citing an unapproved document is indistinguishable from a row citing
 * nothing at all. That keeps the positive claim ("backed by approved
 * documentation") available to the site without publishing a per-document
 * status list. It is not perfect concealment — 140 of the 214 evidenced rows
 * cite exactly one document, so a reader who sees the flag on such a row knows
 * that document is approved — and it is not meant to be: the point is that the
 * NEGATIVE case discloses nothing, because absence has three causes.
 *
 * Local/dev only — the matrix repo is PUBLIC and must not depend on the private
 * repo, so this is NOT part of CI (same rule as check-internal-links.js).
 *
 *   node scripts/evidence-status.js            # report only
 *   node scripts/evidence-status.js --write    # update scopes/*.yml
 *   INTERNAL_REPO=/path/to/compliance-internal node scripts/evidence-status.js
 *
 * Exit 0 on success, 1 if a cited code has no document (the counts would lie)
 * or if a written file does not re-parse with exactly the intended flags.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
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

/**
 * Rewrite `hds.evidence_approved` across one scope file, in place, by editing
 * TEXT rather than round-tripping through the YAML dumper. Dumping would
 * reflow every `|` block scalar and drop every comment in the file, and those
 * comments carry the reasoning the matrix depends on.
 *
 * Indentation is not uniform across the scope files — hipaa-security and soc2
 * put `- ref:` in column 0, the others indent it by two — so the block is
 * located relative to each requirement's own indent rather than by a fixed
 * column. The caller re-parses the result and checks it before saving.
 */
function setRowFlags (text, approvedRefs) {
  const out = [];
  let itemIndent = null; let ref = null; let inHds = false;
  for (const line of text.split('\n')) {
    const item = line.match(/^(\s*)- ref:\s*(.+?)\s*$/);
    if (item) {
      itemIndent = item[1].length;
      ref = item[2].replace(/^["']|["']$/g, '');
      inHds = false;
      out.push(line);
      continue;
    }
    if (/^\s*evidence_approved:\s/.test(line)) continue; // always regenerated
    if (ref !== null) {
      const key = line.match(/^(\s*)([A-Za-z_][\w-]*):/);
      if (key) {
        const indent = key[1].length;
        if (indent === itemIndent + 2) inHds = key[2] === 'hds';
        if (inHds && indent === itemIndent + 4 && key[2] === 'evidence' && approvedRefs.has(ref)) {
          out.push(`${' '.repeat(indent)}evidence_approved: true`);
        }
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

const today = new Date().toISOString().slice(0, 10);
let unresolved = 0;
let changed = 0;
let mismatched = 0;
let nFlagged = 0;

for (const file of await hdsScopeFiles()) {
  const scope = loadYaml(file);
  const reqs = scope.requirements || [];

  let evidenced = 0;
  let approved = 0;
  const approvedRefs = new Set();
  for (const r of reqs) {
    const codes = (r.hds?.evidence?.internal_docs) || [];
    if (!codes.length) continue;
    evidenced++;
    const states = codes.map((c) => {
      const s = status.get(c);
      if (!s) { console.log(`  ✗ ${scope.id}.${r.ref}: no document for code '${c}'`); unresolved++; }
      return s || 'missing';
    });
    if (states.every((s) => s === 'approved')) { approved++; approvedRefs.add(r.ref); }
  }
  nFlagged += approvedRefs.size;

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
  next = setRowFlags(next, approvedRefs);

  // Text editing can silently mangle YAML, and this file is the public claim.
  // Re-parse and require the flags to land on exactly the intended rows, with
  // the rest of the document unchanged, before anything is saved.
  let reparsed;
  try {
    reparsed = yaml.load(next);
  } catch (e) {
    console.log(`  ✗ ${scope.id}: rewrite does not parse (${e.message}); NOT written`);
    mismatched++; continue;
  }
  const got = new Set((reparsed.requirements || [])
    .filter((r) => r.hds?.evidence_approved === true).map((r) => r.ref));
  const missing = [...approvedRefs].filter((r) => !got.has(r));
  const extra = [...got].filter((r) => !approvedRefs.has(r));
  if (missing.length || extra.length || (reparsed.requirements || []).length !== reqs.length) {
    console.log(`  ✗ ${scope.id}: flag verification failed ` +
      `(${missing.length} missing, ${extra.length} unexpected); NOT written`);
    mismatched++; continue;
  }

  if (next !== text) { fs.writeFileSync(file, next); changed++; console.log(`  → updated ${rel(file)} (${approvedRefs.size} row flag(s))`); }
}

if (unresolved) {
  console.log(`\n[FAIL] ${unresolved} cited code(s) resolve to no document; counts would be wrong.`);
  process.exit(1);
}
if (mismatched) {
  console.log(`\n[FAIL] ${mismatched} scope file(s) failed the re-parse check and were left untouched.`);
  process.exit(1);
}
console.log(WRITE
  ? `\n[OK]   evidence_backing + ${nFlagged} row flag(s) refreshed (${changed} file(s) changed, as_of ${today}).`
  : `\n[OK]   report only (${nFlagged} row(s) would be flagged). Re-run with --write to update scopes/*.yml.`);
