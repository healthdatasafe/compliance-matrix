import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listBacklogs, type BacklogSummary, type PlannedKind } from '../db';

const KIND_LABEL: Record<PlannedKind, string> = {
  bug: 'BUG',
  feature: 'PLANNED',
  enhancement: 'ENH'
};

type KindFilter = 'all' | PlannedKind;

/**
 * Backlog roadmap view. Each card aggregates the chips for one
 * backlog slug → 'shipping X would shift N rows across M scopes'.
 *
 * Query param ?kind=bug doubles as the 'Bug' perspective entry
 * point (linked from the nav).
 */
export function BacklogList () {
  const [backlogs, setBacklogs] = useState<BacklogSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const kindFilter = (searchParams.get('kind') ?? 'all') as KindFilter;

  useEffect(() => {
    listBacklogs().then(setBacklogs).catch((e: Error) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!backlogs) return null;
    if (kindFilter === 'all') return backlogs;
    return backlogs.filter((b) => (b.kinds[kindFilter] ?? 0) > 0);
  }, [backlogs, kindFilter]);

  if (error) return <div className='p-6 text-red-600'>Failed to load backlogs: {error}</div>;
  if (!filtered) return <div className='p-6 text-slate-500'>Loading…</div>;
  if (filtered.length === 0) return <div className='p-6 text-slate-500'>No backlogs match the current filter.</div>;

  const total = backlogs?.length ?? 0;
  const bugTotal = backlogs?.filter((b) => (b.kinds.bug ?? 0) > 0).length ?? 0;
  const featTotal = backlogs?.filter((b) => (b.kinds.feature ?? 0) > 0).length ?? 0;
  const enhTotal = backlogs?.filter((b) => (b.kinds.enhancement ?? 0) > 0).length ?? 0;

  const setKind = (k: KindFilter) => {
    if (k === 'all') searchParams.delete('kind');
    else searchParams.set('kind', k);
    setSearchParams(searchParams);
  };

  return (
    <div className='p-6 max-w-5xl mx-auto'>
      <section className='mb-6'>
        <h2 className='text-lg font-semibold text-slate-700 mb-1'>Roadmap — planned changes</h2>
        <p className='text-sm text-slate-500'>
          Backlog items queued to land in <code className='font-mono text-xs'>open-pryv.io</code>. Each
          card shows the matrix rows that would shift when the work ships — a forward look at how the
          coverage picture evolves.
        </p>
      </section>

      <div className='mb-4 flex flex-wrap gap-1.5 items-center text-xs'>
        <span className='text-slate-500'>Filter:</span>
        <KindPill active={kindFilter === 'all'} onClick={() => setKind('all')}>All ({total})</KindPill>
        {bugTotal > 0 && (
          <KindPill active={kindFilter === 'bug'} onClick={() => setKind('bug')}>
            Bug ({bugTotal})
          </KindPill>
        )}
        {featTotal > 0 && (
          <KindPill active={kindFilter === 'feature'} onClick={() => setKind('feature')}>
            Planned ({featTotal})
          </KindPill>
        )}
        {enhTotal > 0 && (
          <KindPill active={kindFilter === 'enhancement'} onClick={() => setKind('enhancement')}>
            Enhancement ({enhTotal})
          </KindPill>
        )}
      </div>

      <ul className='grid grid-cols-1 md:grid-cols-2 gap-3'>
        {filtered.map((b) => (
          <li key={b.slug}>
            <Link
              to={`/backlog/${b.slug}`}
              className='block p-4 bg-white border border-slate-200 rounded-lg hover:border-slate-400 hover:shadow-sm transition'
            >
              <div className='flex items-baseline justify-between gap-3'>
                <h3 className='font-mono text-sm font-semibold text-slate-800 break-words'>{b.slug}</h3>
                <span className='text-xs text-slate-500 whitespace-nowrap tabular-nums'>
                  {b.requirement_count} req · {b.scope_count} scope(s)
                </span>
              </div>
              <div className='mt-2 flex flex-wrap gap-1 text-xs'>
                {(['bug', 'feature', 'enhancement'] as PlannedKind[]).map((k) => {
                  const n = b.kinds[k];
                  if (!n) return null;
                  return (
                    <span key={k} className={`planned-${k} planned-impact-medium px-1.5 py-0.5 rounded font-semibold`}>
                      {KIND_LABEL[k]} · {n}
                    </span>
                  );
                })}
                {b.max_impact && (
                  <span className='text-slate-500 ml-1'>impact: {b.max_impact}</span>
                )}
              </div>
              {b.tracking_url && (
                <div className='mt-2 text-xs text-slate-400 truncate'>
                  → {b.tracking_url.replace(/^https?:\/\//, '')}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KindPill ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full border text-xs transition-colors ${
        active
          ? 'bg-slate-800 text-white border-slate-800'
          : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
      }`}
    >
      {children}
    </button>
  );
}
