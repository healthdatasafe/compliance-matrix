import initSqlJs, { type BindParams, type Database, type SqlJsStatic } from 'sql.js';

export type Coverage = 'implemented' | 'configurable' | 'facilitated' | 'documented' | 'out-of-scope';
export type EffortSaved = 'high' | 'medium' | 'low';
export type FacilitationMode = 'primitive' | 'evidence' | 'storage' | 'infrastructure' | 'awareness' | 'operations';
export type PlannedKind = 'feature' | 'doc' | 'procedure' | 'platform';
export type PlannedImpact = 'high' | 'medium' | 'low';

export interface PlannedChange {
  kind: PlannedKind;
  summary: string;
  impact: PlannedImpact;
  internal_doc: string | null;
  tracking_url: string | null;
  upstream_proposal: string | null;
  eta: string | null;
}

export interface Scope {
  id: string;
  title: string;
  short: string | null;
  type: 'regulation' | 'standard' | 'hosting-cert';
  jurisdiction: string;
  version: string;
  version_date: string;
  canonical_url: string | null;
  layered_on_pryv: string | null;
  regions: string[];
  requirement_count: number;
}

export interface ImplementerObligation {
  persona: string;
  coverage: Coverage;
  overview: string | null;
  templates: string[];
}

export interface Requirement {
  scope_id: string;
  ref: string;
  title: string;
  text: string | null;
  text_url: string | null;
  pryv_ref: string | null;
  coverage: Coverage;
  effort_saved: EffortSaved | null;
  facilitation_mode: FacilitationMode | null;
  overview: string | null;
  detail: string | null;
  technical: string | null;
  regions: string[];
  draft: boolean;
  planned: PlannedChange[];
  implementer: ImplementerObligation[];
}

let sqlPromise: Promise<SqlJsStatic> | null = null;
let dbPromise: Promise<Database> | null = null;

function loadSqlJs (): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file) => `${import.meta.env.BASE_URL}${file}`
    });
  }
  return sqlPromise;
}

export function loadDb (): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await loadSqlJs();
      const res = await fetch(`${import.meta.env.BASE_URL}compliance.sqlite`);
      if (!res.ok) throw new Error(`Failed to fetch compliance.sqlite: ${res.status}`);
      const buf = await res.arrayBuffer();
      return new SQL.Database(new Uint8Array(buf));
    })();
  }
  return dbPromise;
}

function rows<T> (db: Database, sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params as BindParams);
  const out: T[] = [];
  while (stmt.step()) out.push(stmt.getAsObject() as unknown as T);
  stmt.free();
  return out;
}

/** Raw sqlite row shapes (JSON columns as strings, booleans as 0/1). */
type ScopeRaw = Omit<Scope, 'regions'> & { regions: string };
type RequirementRaw = Omit<Requirement, 'regions' | 'draft' | 'planned' | 'implementer'> & {
  regions_json: string;
  draft: number;
};
type PlannedRaw = PlannedChange & { ref: string };
type ImplementerRaw = {
  ref: string;
  persona: string;
  coverage: Coverage;
  overview: string | null;
};
type ImplementerTemplateRaw = {
  ref: string;
  persona: string;
  template_id: string;
};

/** Column aliases mapping the sqlite hds_* columns onto the Requirement shape. */
const REQ_COLS = `scope_id, ref, title, text, text_url, pryv_ref, draft,
  hds_coverage AS coverage, hds_effort_saved AS effort_saved,
  hds_facilitation_mode AS facilitation_mode, hds_overview AS overview,
  hds_detail AS detail, hds_technical AS technical, hds_regions AS regions_json`;

export async function listScopes (): Promise<Scope[]> {
  const db = await loadDb();
  const raw = rows<ScopeRaw>(db, 'SELECT * FROM scopes ORDER BY type, id');
  return raw.map((r) => ({
    ...r,
    regions: JSON.parse(r.regions || '[]') as string[]
  }));
}

export async function getScope (id: string): Promise<Scope | null> {
  const all = await listScopes();
  return all.find((s) => s.id === id) ?? null;
}

export async function listRequirements (scopeId: string): Promise<Requirement[]> {
  const db = await loadDb();
  const raw = rows<RequirementRaw>(
    db,
    `SELECT ${REQ_COLS} FROM requirements WHERE scope_id = ?`,
    [scopeId]
  );
  const planned = rows<PlannedRaw>(
    db,
    'SELECT ref, kind, summary, impact, internal_doc, tracking_url, upstream_proposal, eta FROM hds_planned WHERE scope_id = ? ORDER BY ref, seq',
    [scopeId]
  );
  const plannedByRef = new Map<string, PlannedChange[]>();
  for (const p of planned) {
    const arr = plannedByRef.get(p.ref) || [];
    arr.push({
      kind: p.kind,
      summary: p.summary,
      impact: p.impact,
      internal_doc: p.internal_doc,
      tracking_url: p.tracking_url,
      upstream_proposal: p.upstream_proposal,
      eta: p.eta
    });
    plannedByRef.set(p.ref, arr);
  }
  const impl = rows<ImplementerRaw>(
    db,
    'SELECT ref, persona, coverage, overview FROM implementer WHERE scope_id = ?',
    [scopeId]
  );
  const implTpl = rows<ImplementerTemplateRaw>(
    db,
    'SELECT ref, persona, template_id FROM implementer_templates WHERE scope_id = ?',
    [scopeId]
  );
  const implByRef = new Map<string, ImplementerObligation[]>();
  for (const o of impl) {
    const arr = implByRef.get(o.ref) || [];
    arr.push({
      persona: o.persona,
      coverage: o.coverage,
      overview: o.overview,
      templates: implTpl.filter((t) => t.ref === o.ref && t.persona === o.persona).map((t) => t.template_id)
    });
    implByRef.set(o.ref, arr);
  }
  return raw
    .map((r) => ({
      ...r,
      draft: !!r.draft,
      regions: JSON.parse(r.regions_json || '[]'),
      planned: plannedByRef.get(r.ref) || [],
      implementer: implByRef.get(r.ref) || []
    }))
    .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true, sensitivity: 'base' }));
}

/**
 * Returns a {scope_id: {planned, byKind}} map for surfacing planned-count
 * chips on the scope-list index page.
 */
export async function plannedCountsByScope (): Promise<Record<string, { planned: number; byKind: Record<PlannedKind, number> }>> {
  const db = await loadDb();
  const raw = rows<{ scope_id: string; kind: PlannedKind; c: number }>(
    db,
    'SELECT scope_id, kind, COUNT(*) c FROM hds_planned GROUP BY scope_id, kind'
  );
  const out: Record<string, { planned: number; byKind: Record<PlannedKind, number> }> = {};
  for (const r of raw) {
    const entry = out[r.scope_id] ?? { planned: 0, byKind: { feature: 0, doc: 0, procedure: 0, platform: 0 } };
    entry.planned += r.c;
    entry.byKind[r.kind] = (entry.byKind[r.kind] ?? 0) + r.c;
    out[r.scope_id] = entry;
  }
  return out;
}

export async function coverageHistogram (scopeId: string): Promise<Record<Coverage, number>> {
  const db = await loadDb();
  const raw = rows<{ coverage: Coverage; c: number }>(
    db,
    'SELECT hds_coverage AS coverage, COUNT(*) c FROM requirements WHERE scope_id = ? GROUP BY hds_coverage',
    [scopeId]
  );
  const out: Record<Coverage, number> = {
    implemented: 0, configurable: 0, facilitated: 0, documented: 0, 'out-of-scope': 0
  };
  for (const r of raw) out[r.coverage] = r.c;
  return out;
}

/** Evidence for one requirement, from the single HDS evidence table. */
export interface RequirementEvidence {
  tests: string[];
  docs: string[];
  internal_docs: string[];
}

export async function requirementEvidence (scopeId: string, ref: string): Promise<RequirementEvidence> {
  const db = await loadDb();
  const raw = rows<{ kind: string; value: string }>(
    db,
    'SELECT kind, value FROM evidence WHERE scope_id = ? AND ref = ?',
    [scopeId, ref]
  );
  return {
    tests: raw.filter((r) => r.kind === 'test').map((r) => r.value),
    docs: raw.filter((r) => r.kind === 'doc').map((r) => r.value),
    internal_docs: raw.filter((r) => r.kind === 'internal_doc').map((r) => r.value)
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Cross-scope coverage rows (Coverage + Modes perspectives)
// ─────────────────────────────────────────────────────────────────────────

export interface CoverageRow {
  scope_id: string;
  scope_short: string;
  ref: string;
  title: string;
  coverage: Coverage;
  facilitation_mode: FacilitationMode | null;
  effort_saved: EffortSaved | null;
  draft: boolean;
}

const COVERAGE_ROW_COLS = `r.scope_id, COALESCE(s.short, s.title) AS scope_short,
  r.ref, r.title, r.hds_coverage AS coverage,
  r.hds_facilitation_mode AS facilitation_mode,
  r.hds_effort_saved AS effort_saved, r.draft`;

type CoverageRowRaw = Omit<CoverageRow, 'draft'> & { draft: number };

export interface ModeSummary {
  mode: FacilitationMode;
  requirement_count: number;
  scope_count: number;
}

export async function listFacilitationModes (): Promise<ModeSummary[]> {
  const db = await loadDb();
  const raw = rows<{ mode: FacilitationMode; rc: number; sc: number }>(
    db,
    `SELECT hds_facilitation_mode AS mode,
            COUNT(*) AS rc,
            COUNT(DISTINCT scope_id) AS sc
     FROM requirements
     WHERE hds_facilitation_mode IS NOT NULL
     GROUP BY hds_facilitation_mode
     ORDER BY rc DESC`
  );
  return raw.map((r) => ({ mode: r.mode, requirement_count: r.rc, scope_count: r.sc }));
}

export async function listModeCoverage (
  mode: FacilitationMode,
  scopeIds: string[] = []
): Promise<CoverageRow[]> {
  const db = await loadDb();
  let sql = `
    SELECT ${COVERAGE_ROW_COLS}
    FROM requirements r
    JOIN scopes s ON s.id = r.scope_id
    WHERE r.hds_facilitation_mode = ?
  `;
  const params: unknown[] = [mode];
  if (scopeIds.length > 0) {
    sql += ` AND r.scope_id IN (${scopeIds.map(() => '?').join(',')})`;
    params.push(...scopeIds);
  }
  sql += ' ORDER BY r.scope_id, r.ref';
  const raw = rows<CoverageRowRaw>(db, sql, params);
  return raw.map((r) => ({ ...r, draft: !!r.draft }));
}

// ─────────────────────────────────────────────────────────────────────────
// Global coverage view (across all scopes)
// ─────────────────────────────────────────────────────────────────────────

export type GlobalRow = CoverageRow;

export async function listGlobalCoverage (
  coverage: Coverage | null = null,
  scopeIds: string[] = []
): Promise<GlobalRow[]> {
  const db = await loadDb();
  let sql = `
    SELECT ${COVERAGE_ROW_COLS}
    FROM requirements r
    JOIN scopes s ON s.id = r.scope_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (coverage) { sql += ' AND r.hds_coverage = ?'; params.push(coverage); }
  if (scopeIds.length > 0) {
    sql += ` AND r.scope_id IN (${scopeIds.map(() => '?').join(',')})`;
    params.push(...scopeIds);
  }
  sql += ' ORDER BY r.scope_id, r.ref';
  const raw = rows<CoverageRowRaw>(db, sql, params);
  return raw.map((r) => ({ ...r, draft: !!r.draft }));
}

export async function globalCoverageHistogram (): Promise<Record<Coverage, number>> {
  const db = await loadDb();
  const raw = rows<{ coverage: Coverage; c: number }>(
    db,
    'SELECT hds_coverage AS coverage, COUNT(*) c FROM requirements GROUP BY hds_coverage'
  );
  const out: Record<Coverage, number> = {
    implemented: 0, configurable: 0, facilitated: 0, documented: 0, 'out-of-scope': 0
  };
  for (const r of raw) out[r.coverage] = r.c;
  return out;
}
