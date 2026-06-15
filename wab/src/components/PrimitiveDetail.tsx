import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getPrimitive,
  listPrimitiveCoverage,
  listScopes,
  type Primitive,
  type PrimitiveCoverageRow,
  type Scope
} from '../db';
import { RequirementGroupedTable, ScopeFocusPicker } from './RequirementGroupedTable';

export function PrimitiveDetail () {
  const { id } = useParams<{ id: string }>();
  const [primitive, setPrimitive] = useState<Primitive | null>(null);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [rows, setRows] = useState<PrimitiveCoverageRow[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([getPrimitive(id), listScopes()])
      .then(([p, s]) => { setPrimitive(p); setScopes(s); })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    listPrimitiveCoverage(id, selectedScopes).then(setRows).catch(() => setRows([]));
  }, [id, selectedScopes]);

  if (error) return <div className='p-6 text-red-600'>Failed to load primitive: {error}</div>;
  if (!primitive) return <div className='p-6 text-slate-500'>Loading…</div>;

  const toggleScope = (sid: string) => {
    if (selectedScopes.includes(sid)) {
      setSelectedScopes(selectedScopes.filter((s) => s !== sid));
    } else if (selectedScopes.length < 3) {
      setSelectedScopes([...selectedScopes, sid]);
    }
  };

  const citingScopeIds = Object.keys(primitive.scope_counts).sort();
  const citingScopes = scopes.filter((s) => citingScopeIds.includes(s.id));

  return (
    <div className='p-6 max-w-6xl mx-auto'>
      <Link to='/primitives' className='text-sm text-slate-500 hover:text-slate-700'>
        ← all primitives
      </Link>
      <div className='mt-2 flex items-baseline gap-3'>
        <h1 className='text-2xl font-bold font-mono'>{primitive.id}</h1>
        <span className='text-sm text-slate-500'>
          {primitive.requirement_count} requirement(s) across {citingScopeIds.length} scope(s)
        </span>
      </div>
      <p className='text-base text-slate-700 mt-2 leading-relaxed max-w-3xl'>{primitive.summary}</p>

      <ScopeFocusPicker
        scopes={citingScopes}
        scopeCounts={primitive.scope_counts}
        selected={selectedScopes}
        onToggle={toggleScope}
        onClear={() => setSelectedScopes([])}
      />

      <RequirementGroupedTable rows={rows} scopes={scopes} />
    </div>
  );
}
