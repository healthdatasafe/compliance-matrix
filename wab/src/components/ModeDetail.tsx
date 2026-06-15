import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  listScopes,
  listModeCoverage,
  type FacilitationMode,
  type PrimitiveCoverageRow,
  type Scope
} from '../db';
import { RequirementGroupedTable, ScopeFocusPicker } from './RequirementGroupedTable';

const MODE_DETAIL: Record<FacilitationMode, { label: string; description: string }> = {
  primitive: {
    label: 'Primitive',
    description: 'Pryv\'s access/permissions enforce the obligation at the API surface.'
  },
  evidence: {
    label: 'Evidence',
    description: 'Pryv\'s audit log + access-version chain feed the implementer\'s artefact.'
  },
  storage: {
    label: 'Storage',
    description: 'Pryv stores the text / records the implementer creates (notice, consent text, …).'
  },
  infrastructure: {
    label: 'Infrastructure',
    description: 'Pryv runs the technical layer (TLS, HA, encryption-at-rest, mTLS).'
  },
  awareness: {
    label: 'Awareness',
    description: 'Framing row — Pryv contributes minimally; the matrix is the surface.'
  }
};

export function ModeDetail () {
  const { mode } = useParams<{ mode: FacilitationMode }>();
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [rows, setRows] = useState<PrimitiveCoverageRow[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listScopes().then(setScopes).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!mode) return;
    listModeCoverage(mode, selectedScopes).then(setRows).catch(() => setRows([]));
  }, [mode, selectedScopes]);

  const scopeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.scope_id] = (m[r.scope_id] ?? 0) + 1;
    return m;
  }, [rows]);

  // For the scope picker, we need the full set of scopes that EVER cite
  // this mode, not just the currently-filtered subset.
  const [allCounts, setAllCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!mode) return;
    listModeCoverage(mode, []).then((all) => {
      const m: Record<string, number> = {};
      for (const r of all) m[r.scope_id] = (m[r.scope_id] ?? 0) + 1;
      setAllCounts(m);
    }).catch(() => setAllCounts({}));
  }, [mode]);

  if (error) return <div className='p-6 text-red-600'>Failed to load mode: {error}</div>;
  if (!mode || !MODE_DETAIL[mode]) return <div className='p-6 text-slate-500'>Unknown mode.</div>;

  const meta = MODE_DETAIL[mode];
  const citingScopeIds = Object.keys(allCounts).sort();
  const citingScopes = scopes.filter((s) => citingScopeIds.includes(s.id));
  const totalCount = Object.values(allCounts).reduce((a, b) => a + b, 0);

  const toggleScope = (sid: string) => {
    if (selectedScopes.includes(sid)) setSelectedScopes(selectedScopes.filter((s) => s !== sid));
    else if (selectedScopes.length < 3) setSelectedScopes([...selectedScopes, sid]);
  };

  return (
    <div className='p-6 max-w-6xl mx-auto'>
      <Link to='/modes' className='text-sm text-slate-500 hover:text-slate-700'>← all modes</Link>
      <div className='mt-2 flex items-baseline gap-3'>
        <h1 className='text-2xl font-bold'>Facilitates · {meta.label}</h1>
        <span className='text-sm text-slate-500'>
          {totalCount} requirement(s) across {citingScopeIds.length} scope(s)
        </span>
      </div>
      <p className='text-base text-slate-700 mt-2 leading-relaxed max-w-3xl'>{meta.description}</p>

      <ScopeFocusPicker
        scopes={citingScopes}
        scopeCounts={selectedScopes.length === 0 ? allCounts : scopeCounts}
        selected={selectedScopes}
        onToggle={toggleScope}
        onClear={() => setSelectedScopes([])}
      />

      <RequirementGroupedTable rows={rows} scopes={scopes} />
    </div>
  );
}
