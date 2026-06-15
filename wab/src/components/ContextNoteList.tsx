import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listContextNotes, type ContextNote } from '../db';

const CARD_SUMMARY_MAX = 220;

function cardSummary (raw: string): string {
  const stripped = raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
  if (stripped.length <= CARD_SUMMARY_MAX) return stripped;
  const cut = stripped.slice(0, CARD_SUMMARY_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 100 ? cut.slice(0, lastSpace) : cut) + '…';
}

/**
 * Index of context notes — the design-rationale companion to the
 * matrix prose. Each note documents a recurring Pryv pattern
 * ("voluntarily missing + operator-owned", "two-surface split",
 * "clientData convention family", …) and is cited from one or
 * more matrix rows. This view groups by note so the architectural
 * threads become browsable.
 */
export function ContextNoteList () {
  const [notes, setNotes] = useState<ContextNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listContextNotes().then(setNotes).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className='p-6 text-red-600'>Failed to load context notes: {error}</div>;
  if (!notes) return <div className='p-6 text-slate-500'>Loading…</div>;

  // Sort by descending citation count so the most load-bearing
  // patterns surface first. Notes with 0 citations sink to the
  // bottom (e.g. a freshly-added note before any row cites it).
  const sorted = [...notes].sort((a, b) => b.requirement_count - a.requirement_count);

  return (
    <div className='p-6 max-w-5xl mx-auto'>
      <section className='mb-6'>
        <h2 className='text-lg font-semibold text-slate-700 mb-1'>Context notes</h2>
        <p className='text-sm text-slate-500'>
          Design-rationale notes referenced from the matrix prose. Each captures a recurring
          Pryv pattern (e.g. <em>voluntarily missing + operator-owned</em>,
          <em> two-surface split</em>, <em>clientData convention family</em>) and is cited from
          one or more requirements.
        </p>
      </section>

      <ul className='grid grid-cols-1 md:grid-cols-2 gap-3'>
        {sorted.map((n) => (
          <li key={n.id}>
            <Link
              to={`/context-note/${n.id}`}
              className='block p-4 bg-white border border-slate-200 rounded-lg hover:border-slate-400 hover:shadow-sm transition'
            >
              <div className='flex items-baseline justify-between gap-3'>
                <h3 className='font-semibold text-slate-800 leading-snug'>{n.title}</h3>
                <span className='text-xs text-slate-500 whitespace-nowrap tabular-nums'>
                  {n.requirement_count} req · {Object.keys(n.scope_counts).length} scope(s)
                </span>
              </div>
              <p className='text-sm text-slate-600 mt-2 leading-relaxed'>{cardSummary(n.summary)}</p>
              <div className='mt-2 text-xs text-slate-400 font-mono'>{n.id}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
