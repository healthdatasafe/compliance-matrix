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
 *                hds_overview, hds_detail, hds_technical, hds_regions,
 *                hds_evidence_approved)
 *   evidence(scope_id, ref, kind, value)            kind: test|doc|ops|internal_doc
 *   hds_planned(scope_id, ref, seq, kind, summary, impact, internal_doc,
 *               tracking_url, upstream_proposal, eta)
 *   implementer(scope_id, ref, persona, coverage, overview, nature, basis,
 *               applies_when, profiled)
 *   implementer_templates(scope_id, ref, persona, template_id)
 *   templates(id, title, kind, signer, counterparty, frameworks, status, version, summary)
 *   template_covers(template_id, target)
 *
 * HOW HDS ITSELF STANDS — a different axis from hds_coverage. Coverage says what
 * HDS carries FOR AN IMPLEMENTER; posture says whether HDS as an organisation
 * meets the scope. Never infer one from the other.
 *   hds_posture(scope_id, draft, assessed_at, assurance_level, assurance_detail,
 *               inherited_provider_assurance, statement, no_role_note)
 *   hds_posture_roles(scope_id, seq, arrangement, role, applies_to)
 *   hds_posture_gaps(scope_id, seq, summary, severity, refs, internal_doc, tracking_url)
 *   evidence_backing(scope_id, rows_total, rows_evidenced, rows_approved, as_of)
 *
 * THE IMPLEMENTER PROFILE MODEL (profiles.yml) — the vocabulary row tags are
 * drawn from, so a consumer can reproduce the implementer view's answer:
 *   profiles_meta(key, value)
 *   profile_features(id, group_name, label, note, exclusive)
 *   profile_derived(id, label, mode, features)
 *   profile_presets(id, label, summary, features, locked)
 *   profile_scope_applicability(scope_id, mode, features)
 *   profile_personas(scope_id, seq, kind, persona, cond_mode, cond_features)
 *   profile_uncovered(id, title, message, cond_mode, cond_features, unless_features)
 *
 * Array-valued columns are JSON text, matching scopes.regions and
 * templates.frameworks.
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

const PROFILES = path.join(ROOT, 'profiles.yml');

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
    hds_technical TEXT, hds_regions TEXT, hds_evidence_approved INTEGER,
    PRIMARY KEY (scope_id, ref)
  );
  CREATE TABLE evidence (scope_id TEXT, ref TEXT, kind TEXT, value TEXT);
  CREATE TABLE hds_planned (
    scope_id TEXT, ref TEXT, seq INTEGER, kind TEXT, summary TEXT, impact TEXT,
    internal_doc TEXT, tracking_url TEXT, upstream_proposal TEXT, eta TEXT
  );
  CREATE TABLE implementer (
    scope_id TEXT, ref TEXT, persona TEXT, coverage TEXT, overview TEXT,
    nature TEXT, basis TEXT, applies_when TEXT, profiled INTEGER
  );
  CREATE TABLE implementer_templates (scope_id TEXT, ref TEXT, persona TEXT, template_id TEXT);
  CREATE TABLE templates (
    id TEXT PRIMARY KEY, title TEXT, kind TEXT, signer TEXT, counterparty TEXT,
    frameworks TEXT, status TEXT, version TEXT, summary TEXT
  );
  CREATE TABLE template_covers (template_id TEXT, target TEXT);

  CREATE TABLE hds_posture (
    scope_id TEXT PRIMARY KEY, draft INTEGER, assessed_at TEXT,
    assurance_level TEXT, assurance_detail TEXT,
    inherited_provider_assurance TEXT, statement TEXT, no_role_note TEXT
  );
  CREATE TABLE hds_posture_roles (
    scope_id TEXT, seq INTEGER, arrangement TEXT, role TEXT, applies_to TEXT,
    PRIMARY KEY (scope_id, seq)
  );
  CREATE TABLE hds_posture_gaps (
    scope_id TEXT, seq INTEGER, summary TEXT, severity TEXT, refs TEXT,
    internal_doc TEXT, tracking_url TEXT,
    PRIMARY KEY (scope_id, seq)
  );
  CREATE TABLE evidence_backing (
    scope_id TEXT PRIMARY KEY, rows_total INTEGER, rows_evidenced INTEGER,
    rows_approved INTEGER, as_of TEXT
  );

  CREATE TABLE profiles_meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE profile_features (
    id TEXT PRIMARY KEY, group_name TEXT, label TEXT, note TEXT, exclusive TEXT
  );
  CREATE TABLE profile_derived (id TEXT PRIMARY KEY, label TEXT, mode TEXT, features TEXT);
  CREATE TABLE profile_presets (
    id TEXT PRIMARY KEY, label TEXT, summary TEXT, features TEXT, locked TEXT
  );
  CREATE TABLE profile_scope_applicability (scope_id TEXT, mode TEXT, features TEXT);
  CREATE TABLE profile_personas (
    scope_id TEXT, seq INTEGER, kind TEXT, persona TEXT,
    cond_mode TEXT, cond_features TEXT,
    PRIMARY KEY (scope_id, seq)
  );
  CREATE TABLE profile_uncovered (
    id TEXT PRIMARY KEY, title TEXT, message TEXT,
    cond_mode TEXT, cond_features TEXT, unless_features TEXT
  );
`);

const insScope = db.prepare(`INSERT INTO scopes VALUES
  (@id,@title,@short,@type,@jurisdiction,@version,@version_date,@canonical_url,@layered_on_pryv,@regions,@requirement_count)`);
const insReq = db.prepare(`INSERT INTO requirements VALUES
  (@scope_id,@ref,@title,@text,@text_url,@pryv_ref,@draft,@hds_coverage,@hds_effort_saved,@hds_facilitation_mode,@hds_overview,@hds_detail,@hds_technical,@hds_regions,@hds_evidence_approved)`);
const insEv = db.prepare('INSERT INTO evidence VALUES (?,?,?,?)');
const insPlanned = db.prepare('INSERT INTO hds_planned VALUES (?,?,?,?,?,?,?,?,?,?)');
const insImpl = db.prepare('INSERT INTO implementer VALUES (?,?,?,?,?,?,?,?,?)');
const insImplT = db.prepare('INSERT INTO implementer_templates VALUES (?,?,?,?)');
const insTpl = db.prepare(`INSERT INTO templates VALUES
  (@id,@title,@kind,@signer,@counterparty,@frameworks,@status,@version,@summary)`);
const insTplCov = db.prepare('INSERT INTO template_covers VALUES (?,?)');
const insPosture = db.prepare(`INSERT INTO hds_posture VALUES
  (@scope_id,@draft,@assessed_at,@assurance_level,@assurance_detail,@inherited_provider_assurance,@statement,@no_role_note)`);
const insPostureRole = db.prepare('INSERT INTO hds_posture_roles VALUES (?,?,?,?,?)');
const insPostureGap = db.prepare('INSERT INTO hds_posture_gaps VALUES (?,?,?,?,?,?,?)');
const insBacking = db.prepare('INSERT INTO evidence_backing VALUES (?,?,?,?,?)');
const insProfMeta = db.prepare('INSERT INTO profiles_meta VALUES (?,?)');
const insProfFeature = db.prepare('INSERT INTO profile_features VALUES (?,?,?,?,?)');
const insProfDerived = db.prepare('INSERT INTO profile_derived VALUES (?,?,?,?)');
const insProfPreset = db.prepare('INSERT INTO profile_presets VALUES (?,?,?,?,?)');
const insProfApplic = db.prepare('INSERT INTO profile_scope_applicability VALUES (?,?,?)');
const insProfPersona = db.prepare('INSERT INTO profile_personas VALUES (?,?,?,?,?,?)');
const insProfUncovered = db.prepare('INSERT INTO profile_uncovered VALUES (?,?,?,?,?,?)');

/** A profiles.yml condition is {any:[…]} or {all:[…]}; flatten to (mode, json). */
const cond = (c) => (c?.all
  ? { mode: 'all', features: JSON.stringify(c.all) }
  : { mode: 'any', features: JSON.stringify(c?.any ?? []) });

/**
 * implementer.applies_when keeps the source's three states, because collapsing
 * them loses the invariant the whole profile model rests on:
 *   NULL           absent — NOT YET PROFILED. Always shown, and marked as such.
 *   'always'       the literal. Always shown.
 *   '["a","b"]'    JSON any-of. Hidden ONLY when every listed feature is off.
 * Read `profiled` to tell the first case from the others without parsing.
 */
const appliesWhen = (v) => {
  if (v === undefined) return null;
  return v === 'always' ? 'always' : JSON.stringify(v);
};

let nReq = 0; let nDraft = 0; let nEv = 0; let nImpl = 0; let nPlanned = 0;
let nPosture = 0; let nGaps = 0; let nProfiled = 0;

const scopeFiles = await hdsScopeFiles();
const tplFiles = await templateFiles();
const profiles = fs.existsSync(PROFILES) ? loadYaml(PROFILES) : null;

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

    const p = s.hds_posture;
    if (p) {
      const ea = p.external_assurance || {};
      insPosture.run({
        scope_id: s.id,
        draft: p.draft === false ? 0 : 1,
        assessed_at: p.assessed_at ?? null,
        assurance_level: ea.level ?? null,
        assurance_detail: ea.detail ?? null,
        inherited_provider_assurance: JSON.stringify(ea.inherited_provider_assurance ?? []),
        statement: p.statement ?? null,
        no_role_note: p.no_role_note ?? null,
      });
      nPosture++;
      (p.roles || []).forEach((role, seq) => {
        insPostureRole.run(s.id, seq, role.arrangement, role.role, role.applies_to ?? null);
      });
      (p.known_gaps || []).forEach((g, seq) => {
        insPostureGap.run(s.id, seq, g.summary, g.severity,
          JSON.stringify(g.refs ?? []), g.internal_doc ?? null, g.tracking_url ?? null);
        nGaps++;
      });
      const eb = p.evidence_backing;
      if (eb) insBacking.run(s.id, eb.rows_total, eb.rows_evidenced, eb.rows_approved, eb.as_of);
    }

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
        // One-sided by design: 1 when every cited internal document is
        // approved, 0 otherwise. 0 covers both "cites nothing" and "cites
        // something still in review" — do not read it as a negative claim.
        hds_evidence_approved: hds.evidence_approved === true ? 1 : 0,
      });
      nReq++; if (r.draft !== false) nDraft++;
      const ev = hds.evidence || {};
      for (const [kind, key] of [['test', 'tests'], ['doc', 'docs'], ['internal_doc', 'internal_docs']]) {
        for (const v of ev[key] || []) { insEv.run(s.id, r.ref, kind, v); nEv++; }
      }
      (hds.planned || []).forEach((p, seq) => {
        insPlanned.run(s.id, r.ref, seq, p.kind, p.summary, p.impact,
          p.internal_doc ?? null, p.tracking_url ?? null,
          p.upstream_proposal ?? null, p.eta ?? null);
        nPlanned++;
      });
      for (const ob of r.implementer || []) {
        // `nature` carries a schema default, so materialise it: an untagged
        // entry really is an obligation. `basis` has no default — null means
        // nobody has classified it yet, which is not the same as 'integration'.
        insImpl.run(s.id, r.ref, ob.persona, ob.coverage, ob.overview ?? null,
          ob.nature ?? 'obligation', ob.basis ?? null,
          appliesWhen(ob.applies_when), ob.applies_when === undefined ? 0 : 1);
        nImpl++;
        if (ob.applies_when !== undefined) nProfiled++;
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

  if (profiles) {
    insProfMeta.run('version', String(profiles.version));
    for (const f of profiles.features || []) {
      insProfFeature.run(f.id, f.group, f.label, f.note ?? null, f.exclusive ?? null);
    }
    for (const d of profiles.derived || []) {
      const c = cond(d);
      insProfDerived.run(d.id, d.label ?? null, c.mode, c.features);
    }
    for (const pr of profiles.presets || []) {
      insProfPreset.run(pr.id, pr.label, pr.summary ?? null,
        JSON.stringify(pr.features ?? []), JSON.stringify(pr.locked ?? []));
    }
    for (const a of profiles.scope_applicability || []) {
      const c = cond(a.when);
      insProfApplic.run(a.scope, c.mode, c.features);
    }
    for (const [scopeId, spec] of Object.entries(profiles.personas || {})) {
      let seq = 0;
      if (spec.default) insProfPersona.run(scopeId, seq++, 'default', spec.default, null, null);
      for (const rule of spec.derive || []) {
        const c = cond(rule.when);
        insProfPersona.run(scopeId, seq++, 'derive', rule.persona, c.mode, c.features);
      }
      for (const persona of spec.ask || []) {
        insProfPersona.run(scopeId, seq++, 'ask', persona, null, null);
      }
    }
    for (const u of profiles.uncovered || []) {
      const c = cond(u.when);
      insProfUncovered.run(u.id, u.title, u.message, c.mode, c.features,
        JSON.stringify(u.unless ?? []));
    }
  }
});

buildAll();

const nScopes = db.prepare('SELECT count(*) n FROM scopes').get().n;
const nTpl = db.prepare('SELECT count(*) n FROM templates').get().n;
const nFeat = db.prepare('SELECT count(*) n FROM profile_features').get().n;
db.close();

console.log(`[OK]   built ${path.relative(ROOT, OUT)}`);
console.log(`[OK]   ${nScopes} scope(s), ${nReq} requirement(s) (${nDraft} draft)`);
console.log(`[OK]   ${nEv} evidence link(s), ${nImpl} implementer obligation(s), ${nPlanned} planned item(s)`);
console.log(`[OK]   ${nTpl} template(s)`);
console.log(`[OK]   ${nPosture} posture block(s), ${nGaps} known gap(s)`);
console.log(`[OK]   ${nFeat} profile feature(s), ${nProfiled}/${nImpl} obligation(s) profiled`);
