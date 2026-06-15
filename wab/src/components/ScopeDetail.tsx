import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getScope,
  listRequirements,
  coverageHistogram,
  requirementLinks,
  type Scope,
  type Requirement,
  type Coverage,
  type RequirementLinks
} from '../db';
import { DraftBadge, PlannedBadge, RequirementBadge } from './CoverageBadge';

type PlannedFilter = 'all' | 'planned' | 'bugs';
type TierFilter = Coverage | 'all';

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

export function ScopeDetail () {
  const { id } = useParams<{ id: string }>();
  const [scope, setScope] = useState<Scope | null>(null);
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [histogram, setHistogram] = useState<Record<Coverage, number>>({} as any);
  const [error, setError] = useState<string | null>(null);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [links, setLinks] = useState<RequirementLinks | null>(null);
  const [plannedFilter, setPlannedFilter] = useState<PlannedFilter>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');

  useEffect(() => {
    if (!id) return;
    Promise.all([getScope(id), listRequirements(id), coverageHistogram(id)])
      .then(([s, r, h]) => {
        setScope(s);
        setReqs(r);
        setHistogram(h);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!id || !openRef) { setLinks(null); return; }
    requirementLinks(id, openRef).then(setLinks).catch(() => setLinks(null));
  }, [id, openRef]);

  if (error) return <div className='p-6 text-red-600'>Failed to load scope: {error}</div>;
  if (!scope) return <div className='p-6 text-slate-500'>Loading…</div>;

  return (
    <div className='p-6 max-w-6xl mx-auto'>
      <Link to='/' className='text-sm text-slate-500 hover:text-slate-700'>← all scopes</Link>
      <h1 className='text-2xl font-bold mt-2'>{scope.title}</h1>
      <div className='text-sm text-slate-500 mt-1'>
        {scope.jurisdiction} · {scope.version} ({scope.version_date})
        {scope.canonical_url && (
          <>
            {' · '}
            <a className='text-blue-600 hover:underline' href={scope.canonical_url} target='_blank' rel='noreferrer'>
              canonical text
            </a>
          </>
        )}
      </div>

      <CoverageDistribution
        histogram={histogram}
        total={reqs.length}
        active={tierFilter}
        onSelect={(t) => setTierFilter(tierFilter === t ? 'all' : t)}
      />

      {(() => {
        const plannedTotal = reqs.reduce((n, r) => n + r.planned.length, 0);
        const bugsTotal = reqs.reduce(
          (n, r) => n + r.planned.filter((p) => p.kind === 'bug').length, 0
        );
        const hasUtility = plannedTotal > 0;
        const hasTier = tierFilter !== 'all';
        if (!hasUtility && !hasTier) return null;
        return (
          <div className='mt-3 flex flex-wrap gap-1.5 items-center text-xs'>
            <span className='text-slate-500'>Filter:</span>
            {hasTier && (
              <UtilityFilterPill active onClick={() => setTierFilter('all')}>
                {COVERAGE_LABELS_SHORT[tierFilter as Coverage]} ✕
              </UtilityFilterPill>
            )}
            {hasUtility && (
              <>
                <UtilityFilterPill active={plannedFilter === 'all'} onClick={() => setPlannedFilter('all')}>
                  All ({reqs.length})
                </UtilityFilterPill>
                <UtilityFilterPill active={plannedFilter === 'planned'} onClick={() => setPlannedFilter('planned')}>
                  Planned ({plannedTotal})
                </UtilityFilterPill>
                {bugsTotal > 0 && (
                  <UtilityFilterPill active={plannedFilter === 'bugs'} onClick={() => setPlannedFilter('bugs')}>
                    Bug ({bugsTotal})
                  </UtilityFilterPill>
                )}
              </>
            )}
          </div>
        );
      })()}

      {reqs.length === 0 && (
        <div className='mt-6 text-slate-500'>
          No requirements authored yet. See [INPUT.md](https://github.com/pryv/compliance-matrix) for status.
        </div>
      )}

      {reqs.length > 0 && (
        <table className='w-full mt-6 text-sm border border-slate-200'>
          <thead>
            <tr className='bg-slate-100 text-left'>
              <th className='p-2 font-medium w-24'>Ref</th>
              <th className='p-2 font-medium'>Title</th>
              <th className='p-2 font-medium w-32'>Coverage</th>
            </tr>
          </thead>
          <tbody>
            {reqs
              .filter((r) => {
                if (tierFilter !== 'all' && r.coverage !== tierFilter) return false;
                if (plannedFilter === 'planned') return r.planned.length > 0;
                if (plannedFilter === 'bugs') return r.planned.some((p) => p.kind === 'bug');
                return true;
              })
              .map((r) => (
              <>
                <tr
                  key={`${r.ref}-row`}
                  className='border-t border-slate-200 hover:bg-slate-50 cursor-pointer'
                  onClick={() => setOpenRef(openRef === r.ref ? null : r.ref)}
                >
                  <td className='p-2 font-mono text-xs'>{r.ref}</td>
                  <td className='p-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span>{r.title}</span>
                      {r.draft && <DraftBadge />}
                      {r.planned.map((p, i) => (
                        <PlannedBadge key={`${r.ref}-pl-${i}`} change={p} />
                      ))}
                    </div>
                  </td>
                  <td className='p-2'>
                    <RequirementBadge
                      coverage={r.coverage}
                      mode={r.facilitation_mode}
                      effort={r.pryv_effort_saved}
                    />
                  </td>
                </tr>
                {openRef === r.ref && (
                  <tr key={`${r.ref}-det`} className='bg-slate-50'>
                    <td colSpan={3} className='p-4 text-sm space-y-4'>
                      {r.planned.length > 0 && (
                        <section>
                          <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1'>
                            Planned changes
                          </div>
                          <ul className='space-y-1'>
                            {r.planned.map((p, i) => (
                              <li key={`pl-${i}`} className='flex items-start gap-2'>
                                <PlannedBadge change={p} />
                                <div className='text-xs'>
                                  <div>{p.summary}</div>
                                  <div className='text-slate-500 mt-0.5 font-mono'>
                                    {p.proposal}
                                    {p.backlog && <> · backlog: {p.backlog}</>}
                                    {p.eta_release && <> · eta {p.eta_release}</>}
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      {r.overview && (
                        <section>
                          <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1'>
                            Overview
                          </div>
                          <div className='text-base leading-relaxed whitespace-pre-wrap'>{r.overview}</div>
                        </section>
                      )}
                      {r.detail && (
                        <section>
                          <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1'>
                            Detail
                          </div>
                          <div className='whitespace-pre-wrap'>{r.detail}</div>
                        </section>
                      )}
                      {r.technical && (
                        <section>
                          <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1'>
                            Technical
                          </div>
                          <div className='whitespace-pre-wrap font-mono text-xs text-slate-700 bg-white border border-slate-200 rounded p-2'>{r.technical}</div>
                        </section>
                      )}
                      {links && (
                        <section>
                          <div className='text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1'>
                            Evidence
                          </div>
                          <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                            <LinkSection title='Tests' items={links.tests} urlFor={testUrl} />
                            <LinkSection title='Docs' items={links.docs} />
                            <LinkSection title='QMS' items={links.qms} />
                            <LinkSection title='Config keys' items={links.configs} mono />
                            <LinkSection title='Functional specs' items={links.specs} mono urlFor={specUrl} />
                            <LinkSection title='Derives from' items={links.derives} mono />
                          </div>
                        </section>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * Coverage breakdown as equal-width count tiles per tier. Each tile
 * is a clickable filter button. No proportional bar — that visual
 * implies "Pryv covers X% of total project work", which misleads:
 * matrix rows aren't equal-weight units of compliance effort, and
 * the operator-side scope on each row (especially out-of-scope rows)
 * is unbounded. The tiles count rows present in the matrix, full
 * stop.
 *
 * Active state: filled tile with tier-color accent border; siblings
 * dim slightly so the filter direction is obvious. Empty tiers
 * (count = 0) are omitted.
 */
function CoverageDistribution ({
  histogram,
  total,
  active,
  onSelect
}: {
  histogram: Record<Coverage, number>;
  total: number;
  active: Coverage | 'all';
  onSelect: (tier: Coverage) => void;
}) {
  const present = COVERAGE_ORDER.filter((c) => (histogram[c] ?? 0) > 0);
  return (
    <div className='mt-5'>
      <div className='flex items-baseline gap-2 mb-2'>
        <span className='text-xs text-slate-500 uppercase tracking-wide font-medium'>
          Coverage breakdown
        </span>
        <span className='text-xs text-slate-400'>
          · {total} requirements in this matrix
        </span>
      </div>
      <div className='flex flex-wrap gap-2'>
        {present.map((c) => {
          const count = histogram[c] ?? 0;
          const isActive = active === c;
          const isMuted = active !== 'all' && !isActive;
          return (
            <button
              key={c}
              type='button'
              onClick={() => onSelect(c)}
              className={`flex-1 min-w-[6.5rem] px-3 py-2 rounded-md border text-left transition-all ${
                isActive
                  ? 'bg-slate-50 border-slate-700 shadow-sm'
                  : isMuted
                    ? 'bg-white border-slate-200 opacity-50 hover:opacity-80'
                    : 'bg-white border-slate-200 hover:border-slate-400'
              }`}
              title={`Click to filter to ${COVERAGE_LABELS_SHORT[c]} rows`}
              aria-label={`Filter to ${COVERAGE_LABELS_SHORT[c]} (${count})`}
            >
              <div className='flex items-baseline gap-1.5'>
                <span className={`cov-${c} w-1.5 h-1.5 rounded-full inline-block`} />
                <span className='text-2xl font-semibold text-slate-800 tabular-nums leading-none'>
                  {count}
                </span>
              </div>
              <div className='mt-1 text-xs text-slate-600'>
                {COVERAGE_LABELS_SHORT[c]}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function UtilityFilterPill ({
  active, onClick, children
}: { active: boolean; onClick: () => void; children: ReactNode }) {
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

const testUrl = (code: string) => `https://pryv.github.io/tests/#${code}`;
const specUrl = (code: string) => `https://pryv.github.io/functional-specifications/#REQ_${code.replace(/\./g, '_')}`;

function LinkSection ({
  title,
  items,
  mono = false,
  urlFor
}: {
  title: string;
  items: string[];
  mono?: boolean;
  urlFor?: (item: string) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className='text-xs font-medium text-slate-500 uppercase tracking-wide'>{title}</div>
      <ul className='mt-1 flex flex-wrap gap-1'>
        {items.map((i) => {
          const pillClass = `text-xs px-2 py-0.5 rounded bg-white border border-slate-200 ${mono ? 'font-mono' : ''}`;
          const url = urlFor?.(i);
          return (
            <li key={i} className={url ? `${pillClass} hover:border-slate-500 hover:bg-slate-50` : pillClass}>
              {url
                ? <a href={url} target='_blank' rel='noopener noreferrer' className='text-slate-700 no-underline hover:text-slate-900'>{i}</a>
                : i}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
