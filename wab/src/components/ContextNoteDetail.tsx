import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getContextNote,
  listContextNoteCoverage,
  listScopes,
  type ContextNote,
  type PrimitiveCoverageRow,
  type Scope
} from '../db';
import { RequirementGroupedTable, ScopeFocusPicker } from './RequirementGroupedTable';

export function ContextNoteDetail () {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<ContextNote | null>(null);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [rows, setRows] = useState<PrimitiveCoverageRow[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([getContextNote(id), listScopes()])
      .then(([n, s]) => { setNote(n); setScopes(s); })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    listContextNoteCoverage(id, selectedScopes).then(setRows).catch(() => setRows([]));
  }, [id, selectedScopes]);

  if (error) return <div className='p-6 text-red-600'>Failed to load context note: {error}</div>;
  if (!note) return <div className='p-6 text-slate-500'>Loading…</div>;

  const toggleScope = (sid: string) => {
    if (selectedScopes.includes(sid)) setSelectedScopes(selectedScopes.filter((s) => s !== sid));
    else if (selectedScopes.length < 3) setSelectedScopes([...selectedScopes, sid]);
  };

  const citingScopeIds = Object.keys(note.scope_counts).sort();
  const citingScopes = scopes.filter((s) => citingScopeIds.includes(s.id));

  return (
    <div className='p-6 max-w-6xl mx-auto'>
      <Link to='/context-notes' className='text-sm text-slate-500 hover:text-slate-700'>
        ← all context notes
      </Link>
      <div className='mt-2'>
        <h1 className='text-2xl font-bold leading-snug'>{note.title}</h1>
        <div className='mt-1 flex items-baseline gap-3 text-sm text-slate-500'>
          <span className='font-mono text-xs'>{note.id}</span>
          <span>·</span>
          <span>{note.requirement_count} requirement(s) across {citingScopeIds.length} scope(s)</span>
          <a
            href={`https://github.com/pryv/compliance-matrix/blob/master/context/${note.id}.md`}
            target='_blank'
            rel='noopener noreferrer'
            className='ml-auto text-xs text-slate-500 hover:text-slate-700 underline'
          >
            view full note ↗
          </a>
        </div>
      </div>
      <p className='text-base text-slate-700 mt-3 leading-relaxed max-w-3xl whitespace-pre-wrap'>
        {note.summary}
      </p>

      {citingScopes.length > 0 ? (
        <>
          <ScopeFocusPicker
            scopes={citingScopes}
            scopeCounts={note.scope_counts}
            selected={selectedScopes}
            onToggle={toggleScope}
            onClear={() => setSelectedScopes([])}
          />
          <RequirementGroupedTable rows={rows} scopes={scopes} />
        </>
      ) : (
        <div className='mt-6 text-slate-500'>
          This note is not yet cited from any requirement prose.
        </div>
      )}
    </div>
  );
}
