import { useEffect, useMemo, useState } from 'react';
import {
  globalCoverageHistogram,
  listGlobalCoverage,
  listScopes,
  type Coverage,
  type GlobalRow,
  type Scope
} from '../db';
import { RequirementGroupedTable, ScopeFocusPicker } from './RequirementGroupedTable';

const COVERAGE_ORDER: Coverage[] = [
  'implemented', 'configurable', 'facilitated', 'documented', 'out-of-scope'
];

const COVERAGE_LABELS_SHORT: Record<Coverage, string> = {
  implemented: 'Implements',
  configurable: 'Configurable',
  facilitated: 'Facilitates',
  documented: 'Documents',
  'out-of-scope': 'Out of scope'
};

/**
 * Global coverage view — cuts across every scope. Default question:
 * "across all regulations + standards, what does Pryv implement
 * (or facilitate, or leave out-of-scope, …)?"
 *
 * Tier tile selects a single coverage tier; scope focus picker
 * narrows to 1-3 scopes. Empty selectors = "show everything".
 */
export function GlobalCoverage () {
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [histogram, setHistogram] = useState<Record<Coverage, number>>({} as any);
  const [tier, setTier] = useState<Coverage | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [rows, setRows] = useState<GlobalRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listScopes(), globalCoverageHistogram()])
      .then(([s, h]) => { setScopes(s); setHistogram(h); })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    listGlobalCoverage(tier, selectedScopes).then(setRows).catch(() => setRows([]));
  }, [tier, selectedScopes]);

  const scopeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of scopes) m[s.id] = s.requirement_count;
    return m;
  }, [scopes]);

  const present = COVERAGE_ORDER.filter((c) => (histogram[c] ?? 0) > 0);
  const total = present.reduce((n, c) => n + (histogram[c] ?? 0), 0);

  const toggleScope = (sid: string) => {
    if (selectedScopes.includes(sid)) setSelectedScopes(selectedScopes.filter((s) => s !== sid));
    else if (selectedScopes.length < 3) setSelectedScopes([...selectedScopes, sid]);
  };

  if (error) return <div className='p-6 text-red-600'>Failed to load global coverage: {error}</div>;

  return (
    <div className='p-6 max-w-6xl mx-auto'>
      <h1 className='text-2xl font-bold'>Coverage — across all scopes</h1>
      <p className='text-sm text-slate-500 mt-1 max-w-3xl'>
        Cross-cut of every requirement in the matrix. Click a tier to filter to that tier
        globally; narrow further via the scope picker. Tile counts are matrix-row counts
        (not progress percentages — see the tile reframe note in the per-scope view).
      </p>

      <div className='mt-5'>
        <div className='flex items-baseline gap-2 mb-2'>
          <span className='text-xs text-slate-500 uppercase tracking-wide font-medium'>Coverage tiers</span>
          <span className='text-xs text-slate-400'>· {total} requirements total</span>
        </div>
        <div className='flex flex-wrap gap-2'>
          {present.map((c) => {
            const count = histogram[c] ?? 0;
            const isActive = tier === c;
            const isMuted = tier !== null && !isActive;
            return (
              <button
                key={c}
                type='button'
                onClick={() => setTier(isActive ? null : c)}
                className={`flex-1 min-w-[6.5rem] px-3 py-2 rounded-md border text-left transition-all ${
                  isActive
                    ? 'bg-slate-50 border-slate-700 shadow-sm'
                    : isMuted
                      ? 'bg-white border-slate-200 opacity-50 hover:opacity-80'
                      : 'bg-white border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className='flex items-baseline gap-1.5'>
                  <span className={`cov-${c} w-1.5 h-1.5 rounded-full inline-block`} />
                  <span className='text-2xl font-semibold text-slate-800 tabular-nums leading-none'>{count}</span>
                </div>
                <div className='mt-1 text-xs text-slate-600'>{COVERAGE_LABELS_SHORT[c]}</div>
              </button>
            );
          })}
        </div>
      </div>

      <ScopeFocusPicker
        scopes={scopes}
        scopeCounts={scopeCounts}
        selected={selectedScopes}
        onToggle={toggleScope}
        onClear={() => setSelectedScopes([])}
      />

      <RequirementGroupedTable rows={rows} scopes={scopes} />
    </div>
  );
}
