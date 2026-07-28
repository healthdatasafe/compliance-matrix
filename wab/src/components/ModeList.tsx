import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listFacilitationModes, type ModeSummary, type FacilitationMode } from '../db';

const MODE_DETAIL: Record<FacilitationMode, { label: string; description: string }> = {
  primitive: {
    label: 'Primitive',
    description: 'The platform\'s access/permissions enforce the obligation at the API surface.'
  },
  evidence: {
    label: 'Evidence',
    description: 'The audit log + access-version chain feed the implementer\'s artefact.'
  },
  storage: {
    label: 'Storage',
    description: 'HDS stores the text / records the implementer creates (notice, consent text, …).'
  },
  infrastructure: {
    label: 'Infrastructure',
    description: 'HDS runs the technical layer (TLS, HA, encryption-at-rest).'
  },
  awareness: {
    label: 'Awareness',
    description: 'Framing row — HDS contributes minimally; the matrix is the surface.'
  },
  operations: {
    label: 'Operations',
    description: 'HDS-as-operator runs the process (monitoring, backups, deploys, restores).'
  }
};

/**
 * Browse rows by how HDS contributes. The facilitation modes are the
 * second axis of the matrix (besides coverage tier) — they answer
 * "is this a real technical control or just an evidence trail?"
 */
export function ModeList () {
  const [modes, setModes] = useState<ModeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listFacilitationModes().then(setModes).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className='p-6 text-red-600'>Failed to load modes: {error}</div>;
  if (!modes) return <div className='p-6 text-slate-500'>Loading…</div>;

  return (
    <div className='p-6 max-w-5xl mx-auto'>
      <section className='mb-6'>
        <h2 className='text-lg font-semibold text-slate-700 mb-1'>Facilitation modes</h2>
        <p className='text-sm text-slate-500'>
          When HDS "facilitates" rather than "implements", the mode says <em>how</em> —
          pre-empting the "is it just docs?" question by surfacing where HDS is a technical
          control, where it's evidence emission, where it's storage, where it's
          infrastructure, where it's operator-run process, where it's framing-only.
        </p>
      </section>

      <ul className='grid grid-cols-1 md:grid-cols-2 gap-3'>
        {modes.map((m) => {
          const meta = MODE_DETAIL[m.mode];
          return (
            <li key={m.mode}>
              <Link
                to={`/mode/${m.mode}`}
                className='block p-4 bg-white border border-slate-200 rounded-lg hover:border-slate-400 hover:shadow-sm transition'
              >
                <div className='flex items-baseline justify-between gap-3'>
                  <h3 className='font-medium text-slate-800'>F · {meta.label}</h3>
                  <span className='text-xs text-slate-500 whitespace-nowrap tabular-nums'>
                    {m.requirement_count} req · {m.scope_count} scope(s)
                  </span>
                </div>
                <p className='text-sm text-slate-600 mt-2 leading-relaxed'>{meta.description}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
