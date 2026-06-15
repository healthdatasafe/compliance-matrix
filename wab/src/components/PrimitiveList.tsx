import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPrimitives, type Primitive } from '../db';

const CARD_SUMMARY_MAX = 200;

/** Strip markdown bold + truncate so the index cards stay tidy regardless
 *  of how verbose the source paragraph in docs/pryv-primitives.md is. */
function cardSummary (raw: string): string {
  const stripped = raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
  if (stripped.length <= CARD_SUMMARY_MAX) return stripped;
  const cut = stripped.slice(0, CARD_SUMMARY_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut) + '…';
}

/**
 * Reverse-browse index. Lists every Pryv primitive (audit, access,
 * data-types, segmentation-via-streams, etc.) with the count of
 * regulator-rows that cite it across all scopes. Click a primitive
 * → see which requirements (in 1-3 selectable scopes) it covers.
 *
 * Companion to ScopeList (the by-regulation browse). The two views
 * answer different operator questions:
 *   ScopeList:      "for regulation X, what does Pryv cover?"
 *   PrimitiveList:  "what does Pryv ship, and what compliance work
 *                    does each piece do?"
 */
export function PrimitiveList () {
  const [primitives, setPrimitives] = useState<Primitive[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPrimitives()
      .then(setPrimitives)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className='p-6 text-red-600'>Failed to load primitives: {error}</div>;
  if (!primitives) return <div className='p-6 text-slate-500'>Loading primitives…</div>;
  if (primitives.length === 0) {
    return <div className='p-6 text-slate-500'>No primitives authored yet.</div>;
  }

  // Sort by descending citation count so the most load-bearing
  // primitives surface first.
  const sorted = [...primitives].sort((a, b) => b.requirement_count - a.requirement_count);

  return (
    <div className='p-6 max-w-5xl mx-auto'>
      <section className='mb-6'>
        <h2 className='text-lg font-semibold text-slate-700 mb-1'>Pryv primitives</h2>
        <p className='text-sm text-slate-500'>
          The compliance-relevant building blocks the platform ships. Each card shows how many
          regulator rows across the matrix cite that primitive — a measure of how much
          compliance work the piece is doing.
        </p>
      </section>

      <ul className='grid grid-cols-1 md:grid-cols-2 gap-3'>
        {sorted.map((p) => (
          <li key={p.id}>
            <Link
              to={`/primitive/${p.id}`}
              className='block p-4 bg-white border border-slate-200 rounded-lg hover:border-slate-400 hover:shadow-sm transition'
            >
              <div className='flex items-baseline justify-between gap-3'>
                <h3 className='font-mono text-sm font-semibold text-slate-800'>{p.id}</h3>
                <span className='text-xs text-slate-500 whitespace-nowrap tabular-nums'>
                  {p.requirement_count} req · {Object.keys(p.scope_counts).length} scope(s)
                </span>
              </div>
              <p className='text-sm text-slate-600 mt-2 leading-relaxed'>{cardSummary(p.summary)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
