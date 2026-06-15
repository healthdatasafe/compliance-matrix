import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { listBacklogCoverage, listScopes, type BacklogRow, type Scope } from '../db';
import { RequirementGroupedTable } from './RequirementGroupedTable';

const KIND_LABEL: Record<string, string> = {
  bug: 'BUG',
  feature: 'PLANNED',
  enhancement: 'ENH'
};

export function BacklogDetail () {
  const { slug } = useParams<{ slug: string }>();
  const [rows, setRows] = useState<BacklogRow[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    Promise.all([listBacklogCoverage(slug), listScopes()])
      .then(([r, s]) => { setRows(r); setScopes(s); })
      .catch((e: Error) => setError(e.message));
  }, [slug]);

  if (error) return <div className='p-6 text-red-600'>Failed to load backlog: {error}</div>;
  if (!slug) return null;

  const scopeCount = new Set(rows.map((r) => r.scope_id)).size;
  const trackingUrl = rows.find((r) => (r as any).tracking_url)?.['tracking_url' as keyof BacklogRow] as string | undefined;

  // We don't have direct backlog metadata once we drop to rows; reuse the
  // first chip's tracking_url + collect kind breakdown from rows.
  const kindCounts: Record<string, number> = {};
  for (const r of rows) kindCounts[r.kind] = (kindCounts[r.kind] ?? 0) + 1;

  return (
    <div className='p-6 max-w-6xl mx-auto'>
      <Link to='/backlogs' className='text-sm text-slate-500 hover:text-slate-700'>
        ← all backlogs
      </Link>
      <div className='mt-2 flex items-baseline gap-3 flex-wrap'>
        <h1 className='text-2xl font-bold font-mono break-words'>{slug}</h1>
        <span className='text-sm text-slate-500'>
          {rows.length} chip(s) across {scopeCount} scope(s)
        </span>
      </div>

      <div className='mt-2 flex flex-wrap gap-1.5 text-xs'>
        {Object.entries(kindCounts).map(([k, n]) => (
          <span key={k} className={`planned-${k} planned-impact-medium px-1.5 py-0.5 rounded font-semibold`}>
            {KIND_LABEL[k] ?? k.toUpperCase()} · {n}
          </span>
        ))}
        {trackingUrl && (
          <a
            href={trackingUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='text-xs text-slate-500 hover:text-slate-700 underline ml-2'
          >
            {trackingUrl.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>

      <p className='mt-3 text-sm text-slate-500 max-w-3xl'>
        Each row below would have its chip discharged when this backlog ships. Coverage tier may
        also shift per the proposal — see the per-row chip tooltip + the proposal mirror in
        <code className='font-mono text-xs ml-1'>compliance-matrix/proposals/</code>.
      </p>

      <RequirementGroupedTable
        rows={rows}
        scopes={scopes}
        extraColumnHeader='Chip'
        extraColumnRender={(r) => {
          const row = r as BacklogRow;
          return (
            <div className='text-xs'>
              <div className='flex items-center gap-1'>
                <span className={`planned-${row.kind} planned-impact-${row.impact ?? 'medium'} px-1.5 py-0.5 rounded font-semibold`}>
                  {KIND_LABEL[row.kind] ?? row.kind.toUpperCase()}
                </span>
                {row.impact && <span className='text-slate-400'>· {row.impact}</span>}
              </div>
              <div className='text-slate-600 mt-1 leading-snug'>{row.summary}</div>
            </div>
          );
        }}
        emptyMessage='No chips currently cite this backlog.'
      />
    </div>
  );
}
