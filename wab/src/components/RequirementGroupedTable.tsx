import { Link } from 'react-router-dom';
import { DraftBadge, RequirementBadge } from './CoverageBadge';
import type { PrimitiveCoverageRow, Scope } from '../db';

/**
 * Reusable scope-grouped requirements table. Used by every "what
 * does X cover?" detail view (PrimitiveDetail, BacklogDetail,
 * ModeDetail, GlobalCoverage, ContextNoteDetail) so the rendering
 * stays consistent.
 *
 * Rows must include scope_id + scope_short + ref + title + the
 * coverage triple. Optional extras (e.g. backlog kind / impact /
 * summary) can be appended via `extraColumn`.
 */
export function RequirementGroupedTable ({
  rows,
  scopes,
  extraColumnHeader,
  extraColumnRender,
  emptyMessage = 'No requirements match the current filter.'
}: {
  rows: PrimitiveCoverageRow[];
  scopes: Scope[];
  extraColumnHeader?: string;
  extraColumnRender?: (row: PrimitiveCoverageRow) => React.ReactNode;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <div className='mt-6 text-slate-500'>{emptyMessage}</div>;
  }

  const grouped = new Map<string, PrimitiveCoverageRow[]>();
  for (const r of rows) {
    const arr = grouped.get(r.scope_id) ?? [];
    arr.push(r);
    grouped.set(r.scope_id, arr);
  }

  return (
    <div className='mt-6 space-y-6'>
      {Array.from(grouped.entries()).map(([scopeId, scopeRows]) => {
        const scope = scopes.find((s) => s.id === scopeId);
        const heading = scope ? (scope.short ?? scope.title) : scopeId;
        return (
          <section key={scopeId}>
            <div className='flex items-baseline gap-2 mb-2'>
              <Link
                to={`/scope/${scopeId}`}
                className='text-sm font-semibold text-slate-700 hover:text-slate-900 hover:underline'
              >
                {heading}
              </Link>
              <span className='text-xs text-slate-500'>· {scopeRows.length} requirement(s)</span>
            </div>
            <table className='w-full text-sm border border-slate-200'>
              <thead>
                <tr className='bg-slate-100 text-left'>
                  <th className='p-2 font-medium w-32'>Ref</th>
                  <th className='p-2 font-medium'>Title</th>
                  <th className='p-2 font-medium w-56'>Coverage</th>
                  {extraColumnHeader && <th className='p-2 font-medium w-40'>{extraColumnHeader}</th>}
                </tr>
              </thead>
              <tbody>
                {scopeRows.map((r) => (
                  <tr key={`${r.scope_id}-${r.ref}`} className='border-t border-slate-200 hover:bg-slate-50'>
                    <td className='p-2 font-mono text-xs'>
                      <Link to={`/scope/${r.scope_id}`} className='text-slate-700 hover:text-slate-900'>
                        {r.ref}
                      </Link>
                    </td>
                    <td className='p-2'>
                      {r.title}
                      {r.draft && <DraftBadge />}
                    </td>
                    <td className='p-2'>
                      <RequirementBadge
                        coverage={r.coverage}
                        mode={r.facilitation_mode}
                        effort={r.pryv_effort_saved}
                      />
                    </td>
                    {extraColumnRender && <td className='p-2'>{extraColumnRender(r)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

/**
 * Reusable "Focus on scope(s)" multi-select. Used by every reverse-
 * browse detail view to let the operator narrow the matrix output
 * to 1-3 scopes (configurable cap).
 */
export function ScopeFocusPicker ({
  scopes,
  scopeCounts,
  selected,
  onToggle,
  onClear,
  maxScopes = 3
}: {
  scopes: Scope[];
  scopeCounts: Record<string, number>;
  selected: string[];
  onToggle: (sid: string) => void;
  onClear: () => void;
  maxScopes?: number;
}) {
  return (
    <div className='mt-5'>
      <div className='flex items-baseline gap-2 mb-2'>
        <span className='text-xs text-slate-500 uppercase tracking-wide font-medium'>
          Focus on scope(s)
        </span>
        <span className='text-xs text-slate-400'>
          · pick up to {maxScopes} — empty = all
        </span>
        {selected.length > 0 && (
          <button
            type='button'
            onClick={onClear}
            className='text-xs text-slate-500 hover:text-slate-700 underline ml-auto'
          >
            clear
          </button>
        )}
      </div>
      <div className='flex flex-wrap gap-1.5'>
        {scopes.map((s) => {
          const isActive = selected.includes(s.id);
          const atCap = !isActive && selected.length >= maxScopes;
          const count = scopeCounts[s.id] ?? 0;
          return (
            <button
              key={s.id}
              type='button'
              onClick={() => onToggle(s.id)}
              disabled={atCap}
              className={`px-2 py-1 rounded-full border text-xs transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white border-slate-800'
                  : atCap
                    ? 'bg-white text-slate-300 border-slate-200 cursor-not-allowed'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
              }`}
              title={atCap ? `Max ${maxScopes} scopes — deselect one first` : s.title}
            >
              {s.short ?? s.title}
              <span className='ml-1 opacity-75 tabular-nums'>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
