#!/usr/bin/env node
/**
 * build.js — compile the HDS matrix into dist/compliance.sqlite.
 *
 * Reads scopes/*.yml (HDS layered format) + templates/*.md and emits a
 * read-only SQLite artifact consumed by the web app / preview.
 *
 * Tables:
 *   scopes(id, title, short, type, jurisdiction, version, version_date,
 *          canonical_url, layered_on_pryv, regions, requirement_count)
 *   requirements(scope_id, ref, title, text, text_url, pryv_ref, draft,
 *                hds_coverage, hds_effort_saved, hds_facilitation_mode,
 *                hds_overview, hds_detail, hds_technical, hds_regions)
 *   evidence(scope_id, ref, kind, value)            kind: test|doc|ops|internal_doc
 *   implementer(scope_id, ref, persona, coverage, overview)
 *   implementer_templates(scope_id, ref, persona, template_id)
 *   templates(id, title, kind, signer, counterparty, frameworks, status, version, summary)
 *   template_covers(template_id, target)
 *
 * Run:  npm run build
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  ROOT, loadYaml, parseFrontmatter,
  hdsScopeFiles, templateFiles,
} from './lib/load.js';

const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'compliance.sqlite');
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

const db = new Database(OUT);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE scopes (
    id TEXT PRIMARY KEY, title TEXT, short TEXT, type TEXT, jurisdiction TEXT,
    version TEXT, version_date TEXT, canonical_url TEXT, layered_on_pryv TEXT,
    regions TEXT, requirement_count INTEGER
  );
  CREATE TABLE requirements (
    scope_id TEXT, ref TEXT, title TEXT, text TEXT, text_url TEXT, pryv_ref TEXT,
    draft INTEGER, hds_coverage TEXT, hds_effort_saved TEXT,
    hds_facilitation_mode TEXT, hds_overview TEXT, hds_detail TEXT,
    hds_technical TEXT, hds_regions TEXT,
    PRIMARY KEY (scope_id, ref)
  );
  CREATE TABLE evidence (scope_id TEXT, ref TEXT, kind TEXT, value TEXT);
  CREATE TABLE implementer (scope_id TEXT, ref TEXT, persona TEXT, coverage TEXT, overview TEXT);
  CREATE TABLE implementer_templates (scope_id TEXT, ref TEXT, persona TEXT, template_id TEXT);
  CREATE TABLE templates (
    id TEXT PRIMARY KEY, title TEXT, kind TEXT, signer TEXT, counterparty TEXT,
    frameworks TEXT, status TEXT, version TEXT, summary TEXT
  );
  CREATE TABLE template_covers (template_id TEXT, target TEXT);
`);

const insScope = db.prepare(`INSERT INTO scopes VALUES
  (@id,@title,@short,@type,@jurisdiction,@version,@version_date,@canonical_url,@layered_on_pryv,@regions,@requirement_count)`);
const insReq = db.prepare(`INSERT INTO requirements VALUES
  (@scope_id,@ref,@title,@text,@text_url,@pryv_ref,@draft,@hds_coverage,@hds_effort_saved,@hds_facilitation_mode,@hds_overview,@hds_detail,@hds_technical,@hds_regions)`);
const insEv = db.prepare('INSERT INTO evidence VALUES (?,?,?,?)');
const insImpl = db.prepare('INSERT INTO implementer VALUES (?,?,?,?,?)');
const insImplT = db.prepare('INSERT INTO implementer_templates VALUES (?,?,?,?)');
const insTpl = db.prepare(`INSERT INTO templates VALUES
  (@id,@title,@kind,@signer,@counterparty,@frameworks,@status,@version,@summary)`);
const insTplCov = db.prepare('INSERT INTO template_covers VALUES (?,?)');

let nReq = 0; let nDraft = 0; let nEv = 0; let nImpl = 0;

const scopeFiles = await hdsScopeFiles();
const tplFiles = await templateFiles();

const buildAll = db.transaction(() => {
  for (const f of scopeFiles) {
    const s = loadYaml(f);
    const reqs = s.requirements || [];
    insScope.run({
      id: s.id,
      title: s.title,
      short: s.short ?? null,
      type: s.type,
      jurisdiction: s.jurisdiction,
      version: s.version,
      version_date: s.version_date,
      canonical_url: s.canonical_url ?? null,
      layered_on_pryv: s.layered_on_pryv ?? null,
      regions: JSON.stringify(s.regions ?? []),
      requirement_count: reqs.length,
    });
    for (const r of reqs) {
      const hds = r.hds || {};
      insReq.run({
        scope_id: s.id,
        ref: r.ref,
        title: r.title,
        text: r.text ?? null,
        text_url: r.text_url ?? null,
        pryv_ref: r.pryv_ref ?? null,
        draft: r.draft === false ? 0 : 1,
        hds_coverage: hds.coverage ?? null,
        hds_effort_saved: hds.effort_saved ?? null,
        hds_facilitation_mode: hds.facilitation_mode ?? null,
        hds_overview: hds.overview ?? null,
        hds_detail: hds.detail ?? null,
        hds_technical: hds.technical ?? null,
        hds_regions: JSON.stringify(hds.regions ?? []),
      });
      nReq++; if (r.draft !== false) nDraft++;
      const ev = hds.evidence || {};
      for (const [kind, key] of [['test', 'tests'], ['doc', 'docs'], ['internal_doc', 'internal_docs']]) {
        for (const v of ev[key] || []) { insEv.run(s.id, r.ref, kind, v); nEv++; }
      }
      for (const ob of r.implementer || []) {
        insImpl.run(s.id, r.ref, ob.persona, ob.coverage, ob.overview ?? null); nImpl++;
        for (const t of ob.templates || []) insImplT.run(s.id, r.ref, ob.persona, t);
      }
    }
  }

  for (const f of tplFiles) {
    const { data: t } = parseFrontmatter(f);
    insTpl.run({
      id: t.id,
      title: t.title,
      kind: t.kind ?? 'other',
      signer: t.signer,
      counterparty: t.counterparty ?? null,
      frameworks: JSON.stringify(t.frameworks ?? ['hipaa']),
      status: t.status ?? 'draft',
      version: t.version ?? null,
      summary: t.summary ?? null,
    });
    for (const c of t.covers || []) insTplCov.run(t.id, c);
  }
});

buildAll();

const nScopes = db.prepare('SELECT count(*) n FROM scopes').get().n;
const nTpl = db.prepare('SELECT count(*) n FROM templates').get().n;
db.close();

console.log(`[OK]   built ${path.relative(ROOT, OUT)}`);
console.log(`[OK]   ${nScopes} scope(s), ${nReq} requirement(s) (${nDraft} draft)`);
console.log(`[OK]   ${nEv} evidence link(s), ${nImpl} implementer obligation(s)`);
console.log(`[OK]   ${nTpl} template(s)`);
