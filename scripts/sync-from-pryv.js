#!/usr/bin/env node
/**
 * sync-from-pryv.js — refresh the vendored Pryv platform-layer snapshot.
 *
 *   npm run sync:pryv            # fetch upstream tip, report changes, APPLY
 *   npm run sync:pryv -- --check # report only, do NOT modify vendor/pryv
 *
 * Clones pryv/compliance-matrix at its current tip into a temp dir, diffs it
 * against vendor/pryv/ (file-level for references/context/proposals; row-level
 * for scopes), prints a report so the corresponding HDS rows can be revisited,
 * then (unless --check) replaces the snapshot and updates PINNED-COMMIT.txt.
 *
 * Decided in plan 74 (OD1): vendored snapshot, not a submodule/live fetch.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';
import { glob } from 'glob';
import { ROOT } from './lib/load.js';

const UPSTREAM = 'https://github.com/pryv/compliance-matrix.git';
const VENDOR = path.join(ROOT, 'vendor', 'pryv');
const PINNED = path.join(VENDOR, 'PINNED-COMMIT.txt');
const SYNCED = ['scopes', 'references', 'context', 'proposals'];
const checkOnly = process.argv.includes('--check');

const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

// ---------- 1. Clone upstream tip ----------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pryv-cm-sync-'));
console.log(`[INFO] cloning ${UPSTREAM} …`);
sh(`git clone --depth 1 ${UPSTREAM} "${tmp}"`);
const newCommit = sh('git rev-parse HEAD', tmp);
const oldCommit = fs.existsSync(PINNED) ? fs.readFileSync(PINNED, 'utf8').trim() : '(none)';

console.log(`[INFO] pinned : ${oldCommit}`);
console.log(`[INFO] upstream: ${newCommit}`);
if (newCommit === oldCommit) {
  console.log('\n[OK]   already up to date — nothing to sync.');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
}

// ---------- 2. Diff ----------

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const fileList = (base) =>
  fs.existsSync(base)
    ? glob.sync('**/*', { cwd: base, nodir: true }).sort()
    : [];

let changes = 0;

// 2a. file-level for non-scope dirs
for (const dir of SYNCED.filter((d) => d !== 'scopes')) {
  const oldFiles = new Set(fileList(path.join(VENDOR, dir)));
  const newFiles = new Set(fileList(path.join(tmp, dir)));
  for (const f of newFiles) {
    const rel = `${dir}/${f}`;
    if (!oldFiles.has(f)) { console.log(`[NEW ] ${rel}`); changes++; continue; }
    const a = fs.readFileSync(path.join(VENDOR, dir, f), 'utf8');
    const b = fs.readFileSync(path.join(tmp, dir, f), 'utf8');
    if (hash(a) !== hash(b)) { console.log(`[CHG ] ${rel}`); changes++; }
  }
  for (const f of oldFiles) if (!newFiles.has(f)) { console.log(`[DEL ] ${dir}/${f}`); changes++; }
}

// 2b. row-level for scopes
const rowMap = (dir) => {
  const out = new Map(); // scopeId -> Map(ref -> hash)
  for (const f of fileList(path.join(dir, 'scopes')).filter((x) => x.endsWith('.yml'))) {
    const scope = yaml.load(fs.readFileSync(path.join(dir, 'scopes', f), 'utf8'));
    const refs = new Map();
    for (const r of scope.requirements || []) refs.set(r.ref, hash(JSON.stringify(r)));
    out.set(scope.id, refs);
  }
  return out;
};
const oldRows = rowMap(VENDOR);
const newRows = rowMap(tmp);
for (const [id, refs] of newRows) {
  const prev = oldRows.get(id) || new Map();
  if (!oldRows.has(id)) { console.log(`[NEW ] scope ${id}`); changes++; }
  for (const [ref, h] of refs) {
    if (!prev.has(ref)) { console.log(`[NEW ] ${id}.${ref}`); changes++; } else if (prev.get(ref) !== h) { console.log(`[CHG ] ${id}.${ref}`); changes++; }
  }
  for (const ref of prev.keys()) if (!refs.has(ref)) { console.log(`[DEL ] ${id}.${ref}`); changes++; }
}
for (const id of oldRows.keys()) if (!newRows.has(id)) { console.log(`[DEL ] scope ${id}`); changes++; }

console.log(`\n[INFO] ${changes} change(s) between pinned and upstream.`);

// ---------- 3. Apply ----------

if (checkOnly) {
  console.log('[OK]   --check: snapshot left unchanged.');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
}

for (const dir of SYNCED) {
  const dst = path.join(VENDOR, dir);
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(path.join(tmp, dir), dst, { recursive: true });
}
fs.writeFileSync(PINNED, newCommit + '\n');
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`[OK]   vendor/pryv updated to ${newCommit}.`);
console.log('[NEXT] revisit the HDS rows whose pryv_ref appears above, then run: npm run build:all');
