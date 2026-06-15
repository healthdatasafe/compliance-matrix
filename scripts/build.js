#!/usr/bin/env node
/**
 * build.js — compile scopes/*.yml into dist/compliance.sqlite.
 *
 * Tables (read-only artifact consumed by the WAB + tooling):
 *   scopes          (id, title, short, type, jurisdiction, version, version_date,
 *                    canonical_url, curated, layered_on_json, requirement_count)
 *   requirements    (scope_id, ref, title, text, text_url, coverage, notes,
 *                    draft, reviewed_by, reviewed_at, applies_to_versions)
 *   spec_links      (scope_id, ref, reqid)
 *   test_links      (scope_id, ref, test_code)
 *   doc_links       (scope_id, ref, path)
 *   qms_links       (scope_id, ref, path)
 *   config_links    (scope_id, ref, config_key)
 *   derives_links   (scope_id, ref, target_ref)
 *   excluded_items  (scope_id, ref, reason)
 *
 * Primary key on (scope_id, ref) for requirements.
 *
 * Run:  npm run build
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { glob } from 'glob';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'compliance.sqlite');

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

const db = new Database(OUT);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE scopes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    short TEXT,
    type TEXT NOT NULL,
    jurisdiction TEXT,
    version TEXT,
    version_date TEXT,
    canonical_url TEXT,
    curated INTEGER NOT NULL DEFAULT 0,
    layered_on_json TEXT NOT NULL DEFAULT '[]',
    requirement_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE requirements (
    scope_id TEXT NOT NULL,
    ref TEXT NOT NULL,
    title TEXT NOT NULL,
    text TEXT,
    text_url TEXT,
    coverage TEXT NOT NULL,
    pryv_effort_saved TEXT,
    facilitation_mode TEXT,
    overview TEXT,
    detail TEXT,
    technical TEXT,
    draft INTEGER NOT NULL DEFAULT 1,
    reviewed_by TEXT,
    reviewed_at TEXT,
    applies_to_versions TEXT NOT NULL DEFAULT '*',
    PRIMARY KEY (scope_id, ref),
    FOREIGN KEY (scope_id) REFERENCES scopes(id)
  );
  CREATE INDEX idx_req_coverage ON requirements(coverage);
  CREATE INDEX idx_req_effort   ON requirements(pryv_effort_saved);
  CREATE INDEX idx_req_facmode  ON requirements(facilitation_mode);
  CREATE INDEX idx_req_draft ON requirements(draft);

  CREATE TABLE spec_links     (scope_id TEXT, ref TEXT, reqid TEXT,
                               FOREIGN KEY (scope_id, ref) REFERENCES requirements(scope_id, ref));
  CREATE TABLE test_links     (scope_id TEXT, ref TEXT, test_code TEXT,
                               FOREIGN KEY (scope_id, ref) REFERENCES requirements(scope_id, ref));
  CREATE TABLE doc_links      (scope_id TEXT, ref TEXT, path TEXT,
                               FOREIGN KEY (scope_id, ref) REFERENCES requirements(scope_id, ref));
  CREATE TABLE qms_links      (scope_id TEXT, ref TEXT, path TEXT,
                               FOREIGN KEY (scope_id, ref) REFERENCES requirements(scope_id, ref));
  CREATE TABLE config_links   (scope_id TEXT, ref TEXT, config_key TEXT,
                               FOREIGN KEY (scope_id, ref) REFERENCES requirements(scope_id, ref));
  CREATE TABLE derives_links  (scope_id TEXT, ref TEXT, target_ref TEXT,
                               FOREIGN KEY (scope_id, ref) REFERENCES requirements(scope_id, ref));
  CREATE TABLE primitive_links (scope_id TEXT, ref TEXT, primitive TEXT,
                               FOREIGN KEY (scope_id, ref) REFERENCES requirements(scope_id, ref));
  CREATE TABLE sample_links    (scope_id TEXT, ref TEXT, sample TEXT,
                               FOREIGN KEY (scope_id, ref) REFERENCES requirements(scope_id, ref));

  CREATE TABLE excluded_items (scope_id TEXT, ref TEXT, reason TEXT,
                               FOREIGN KEY (scope_id) REFERENCES scopes(id));

  CREATE TABLE planned_changes (
    scope_id TEXT NOT NULL,
    ref TEXT NOT NULL,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    proposal TEXT NOT NULL,
    backlog TEXT,
    impact TEXT,
    tracking_url TEXT,
    eta_release TEXT,
    PRIMARY KEY (scope_id, ref, seq),
    FOREIGN KEY (scope_id, ref) REFERENCES requirements(scope_id, ref)
  );
  CREATE INDEX idx_planned_kind ON planned_changes(kind);

  CREATE TABLE pryv_primitives (
    id TEXT PRIMARY KEY,
    summary TEXT NOT NULL
  );

  CREATE TABLE context_notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT NOT NULL
  );

  CREATE TABLE context_links (
    scope_id TEXT NOT NULL,
    ref TEXT NOT NULL,
    context_id TEXT NOT NULL,
    FOREIGN KEY (scope_id, ref) REFERENCES requirements(scope_id, ref),
    FOREIGN KEY (context_id) REFERENCES context_notes(id)
  );

  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const insScope = db.prepare(`INSERT INTO scopes
  (id, title, short, type, jurisdiction, version, version_date, canonical_url, curated, layered_on_json, requirement_count)
  VALUES (@id, @title, @short, @type, @jurisdiction, @version, @version_date, @canonical_url, @curated, @layered_on_json, @requirement_count)`);

const insReq = db.prepare(`INSERT INTO requirements
  (scope_id, ref, title, text, text_url, coverage, pryv_effort_saved, facilitation_mode, overview, detail, technical, draft, reviewed_by, reviewed_at, applies_to_versions)
  VALUES (@scope_id, @ref, @title, @text, @text_url, @coverage, @pryv_effort_saved, @facilitation_mode, @overview, @detail, @technical, @draft, @reviewed_by, @reviewed_at, @applies_to_versions)`);

const insSpec = db.prepare('INSERT INTO spec_links    (scope_id, ref, reqid) VALUES (?, ?, ?)');
const insTest = db.prepare('INSERT INTO test_links    (scope_id, ref, test_code) VALUES (?, ?, ?)');
const insDoc = db.prepare('INSERT INTO doc_links     (scope_id, ref, path) VALUES (?, ?, ?)');
const insQms = db.prepare('INSERT INTO qms_links     (scope_id, ref, path) VALUES (?, ?, ?)');
const insCfg = db.prepare('INSERT INTO config_links  (scope_id, ref, config_key) VALUES (?, ?, ?)');
const insDerives = db.prepare('INSERT INTO derives_links (scope_id, ref, target_ref) VALUES (?, ?, ?)');
const insPrim = db.prepare('INSERT INTO primitive_links (scope_id, ref, primitive) VALUES (?, ?, ?)');
const insSample = db.prepare('INSERT INTO sample_links (scope_id, ref, sample) VALUES (?, ?, ?)');
const insExcl = db.prepare('INSERT INTO excluded_items (scope_id, ref, reason) VALUES (?, ?, ?)');
const insPlanned = db.prepare(`INSERT INTO planned_changes
  (scope_id, ref, seq, kind, summary, proposal, backlog, impact, tracking_url, eta_release)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insPrimRow = db.prepare('INSERT INTO pryv_primitives (id, summary) VALUES (?, ?)');
const insCtxNote = db.prepare('INSERT INTO context_notes (id, title, summary) VALUES (?, ?, ?)');
const insCtxLink = db.prepare('INSERT INTO context_links (scope_id, ref, context_id) VALUES (?, ?, ?)');
const insMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');

/**
 * Parse docs/pryv-primitives.md → [{id, summary}]. Convention per file:
 *   ### `<id>`
 *
 *   <one-line summary>
 *
 *   - **Field**: ...
 *   - **Field**: ...
 *
 * The single non-empty paragraph immediately after the heading is the
 * summary (used for the primitives index card). Detail bullets are
 * not stored — the WAB links to the rendered docs page for the deep dive.
 */
function parsePrimitives (md) {
  const out = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###\s+`([^`]+)`\s*$/);
    if (!m) continue;
    const id = m[1];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    const paragraphLines = [];
    while (j < lines.length && lines[j].trim() !== '' && !lines[j].startsWith('-')) {
      paragraphLines.push(lines[j].trim());
      j++;
    }
    out.push({ id, summary: paragraphLines.join(' ').trim() || '(no summary)' });
  }
  return out;
}

const PRIMITIVES_DOC = path.join(ROOT, 'docs/pryv-primitives.md');
const primitivesMd = fs.existsSync(PRIMITIVES_DOC) ? fs.readFileSync(PRIMITIVES_DOC, 'utf8') : '';
const primitives = parsePrimitives(primitivesMd);

/**
 * Parse a context note file → { id, title, summary }.
 * - id = filename without `.md`
 * - title = first `# Heading` line (stripped of leading '# ')
 * - summary = first non-heading, non-empty paragraph (joined into one line)
 */
function parseContextNote (filepath) {
  const id = path.basename(filepath, '.md');
  const md = fs.readFileSync(filepath, 'utf8');
  const lines = md.split('\n');
  let title = id;
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^#\s+(.+)$/);
    if (m) { title = m[1].trim(); i++; break; }
    i++;
  }
  while (i < lines.length && lines[i].trim() === '') i++;
  const paragraphLines = [];
  while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#')) {
    paragraphLines.push(lines[i].trim());
    i++;
  }
  const summary = paragraphLines.join(' ').trim() || '(no summary)';
  return { id, title, summary };
}

const CONTEXT_DIR = path.join(ROOT, 'context');
const contextNotes = fs.existsSync(CONTEXT_DIR)
  ? (await glob(path.join(CONTEXT_DIR, '*.md'))).map(parseContextNote).sort((a, b) => a.id.localeCompare(b.id))
  : [];
const contextIds = new Set(contextNotes.map((c) => c.id));

const scopeFiles = await glob(path.join(ROOT, 'scopes/*.yml'));

const tx = db.transaction(() => {
  // Insert context_notes BEFORE the scope loop so that per-requirement
  // context_links inserts can satisfy their FK constraint against
  // context_notes(id) immediately.
  for (const c of contextNotes) {
    insCtxNote.run(c.id, c.title, c.summary);
  }

  for (const f of scopeFiles) {
    const scope = yaml.load(fs.readFileSync(f, 'utf8'));
    insScope.run({
      id: scope.id,
      title: scope.title,
      short: scope.short || null,
      type: scope.type,
      jurisdiction: scope.jurisdiction || null,
      version: scope.version || null,
      version_date: scope.version_date || null,
      canonical_url: scope.canonical_url || null,
      curated: scope.curated ? 1 : 0,
      layered_on_json: JSON.stringify(scope.layered_on || []),
      requirement_count: (scope.requirements || []).length
    });

    for (const r of scope.requirements || []) {
      insReq.run({
        scope_id: scope.id,
        ref: r.ref,
        title: r.title,
        text: r.text || null,
        text_url: r.text_url || null,
        coverage: r.coverage,
        pryv_effort_saved: r.pryv_effort_saved || null,
        facilitation_mode: r.facilitation_mode || null,
        overview: r.overview || null,
        detail: r.detail || null,
        technical: r.technical || null,
        draft: r.draft === false ? 0 : 1,
        reviewed_by: r.reviewed_by || null,
        reviewed_at: r.reviewed_at || null,
        applies_to_versions: r.applies_to_versions || '*'
      });
      for (const x of r.functional_specs || []) insSpec.run(scope.id, r.ref, x);
      for (const x of r.tests || []) insTest.run(scope.id, r.ref, x);
      for (const x of r.docs || []) insDoc.run(scope.id, r.ref, x);
      for (const x of r.qms_docs || []) insQms.run(scope.id, r.ref, x);
      for (const x of r.config_keys || []) insCfg.run(scope.id, r.ref, x);
      for (const x of r.derives_from || []) insDerives.run(scope.id, r.ref, x);
      for (const x of r.pryv_primitives || []) insPrim.run(scope.id, r.ref, x);
      for (const x of r.sample_apps || []) insSample.run(scope.id, r.ref, x);
      // Context-note refs harvested from prose. Pattern: `context/<id>.md`
      // appearing in any of overview / detail / technical / text.
      const proseBlob = [r.text, r.overview, r.detail, r.technical].filter(Boolean).join('\n');
      const ctxSeen = new Set();
      for (const m of proseBlob.matchAll(/context\/([a-z0-9-]+)\.md/g)) {
        if (contextIds.has(m[1]) && !ctxSeen.has(m[1])) {
          ctxSeen.add(m[1]);
          insCtxLink.run(scope.id, r.ref, m[1]);
        }
      }
      let plannedSeq = 0;
      for (const p of r.planned || []) {
        insPlanned.run(
          scope.id, r.ref, plannedSeq++,
          p.kind, p.summary, p.proposal,
          p.backlog || null, p.impact || null,
          p.tracking_url || null, p.eta_release || null
        );
      }
    }

    for (const x of scope.excluded_items || []) {
      insExcl.run(scope.id, x.ref, x.reason);
    }
  }

  for (const p of primitives) {
    insPrimRow.run(p.id, p.summary);
  }

  insMeta.run('built_at', new Date().toISOString());
  insMeta.run('scope_count', String(scopeFiles.length));
  insMeta.run('primitive_count', String(primitives.length));
  insMeta.run('context_note_count', String(contextNotes.length));
});

tx();

const stats = {
  scopes: db.prepare('SELECT COUNT(*) c FROM scopes').get().c,
  requirements: db.prepare('SELECT COUNT(*) c FROM requirements').get().c,
  test_links: db.prepare('SELECT COUNT(*) c FROM test_links').get().c,
  doc_links: db.prepare('SELECT COUNT(*) c FROM doc_links').get().c,
  primitives: db.prepare('SELECT COUNT(*) c FROM pryv_primitives').get().c,
  context_notes: db.prepare('SELECT COUNT(*) c FROM context_notes').get().c,
  context_links: db.prepare('SELECT COUNT(DISTINCT context_id) c FROM context_links').get().c,
  drafts: db.prepare('SELECT COUNT(*) c FROM requirements WHERE draft=1').get().c,
  planned: db.prepare('SELECT COUNT(*) c FROM planned_changes').get().c,
  planned_bugs: db.prepare("SELECT COUNT(*) c FROM planned_changes WHERE kind='bug'").get().c
};

db.close();

console.log(`[OK]   built ${path.relative(ROOT, OUT)}`);
console.log(`[OK]   ${stats.scopes} scope(s), ${stats.requirements} requirement(s) (${stats.drafts} draft)`);
console.log(`[OK]   ${stats.test_links} test link(s), ${stats.doc_links} doc link(s)`);
console.log(`[OK]   ${stats.primitives} pryv primitive(s), ${stats.context_notes} context note(s) (${stats.context_links} cited)`);
console.log(`[OK]   ${stats.planned} planned change(s) (${stats.planned_bugs} queued bug fix(es))`);
