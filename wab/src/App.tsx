import { NavLink, Routes, Route, Link } from 'react-router-dom';
import { ScopeList } from './components/ScopeList';
import { ScopeDetail } from './components/ScopeDetail';
import { ModeList } from './components/ModeList';
import { ModeDetail } from './components/ModeDetail';
import { GlobalCoverage } from './components/GlobalCoverage';

const NAV_TABS = [
  { to: '/', label: 'Scopes', end: true },
  { to: '/coverage', label: 'Coverage', end: false },
  { to: '/modes', label: 'Modes', end: false }
];

export default function App () {
  return (
    <div className='min-h-screen bg-slate-50'>
      <header className='border-b border-slate-200 bg-white'>
        <div className='max-w-6xl mx-auto px-6 py-3 flex items-center justify-between flex-wrap gap-2'>
          <Link to='/' className='text-base font-semibold text-slate-800'>
            Health Data Safe · Compliance Matrix
          </Link>
          <nav className='flex items-center gap-0.5 flex-wrap'>
            {NAV_TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `px-2.5 py-1 rounded text-sm transition-colors ${
                    isActive
                      ? 'bg-slate-100 text-slate-900 font-medium'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
              >
                {t.label}
              </NavLink>
            ))}
            <a
              className='px-2.5 py-1 text-sm text-slate-500 hover:text-slate-700'
              href='https://github.com/healthdatasafe/compliance-matrix'
              target='_blank'
              rel='noreferrer'
            >
              source ↗
            </a>
          </nav>
        </div>
        <div className='bg-amber-50 border-t border-amber-200 text-xs text-amber-900'>
          <div className='max-w-6xl mx-auto px-6 py-1.5'>
            <span className='font-medium'>Work in progress</span> — the HDS layer of the
            three-layer matrix (platform → HDS → implementer), over the vendored{' '}
            <a
              className='underline hover:no-underline'
              href='https://github.com/pryv/compliance-matrix'
              target='_blank'
              rel='noreferrer'
            >
              pryv/compliance-matrix
            </a>{' '}
            platform layer. Static reference site:{' '}
            <a
              className='underline hover:no-underline'
              href='https://compliance.datasafe.dev'
              target='_blank'
              rel='noreferrer'
            >
              compliance.datasafe.dev
            </a>.
          </div>
        </div>
      </header>

      <main>
        <Routes>
          <Route path='/' element={<ScopeList />} />
          <Route path='/scope/:id' element={<ScopeDetail />} />
          <Route path='/modes' element={<ModeList />} />
          <Route path='/mode/:mode' element={<ModeDetail />} />
          <Route path='/coverage' element={<GlobalCoverage />} />
        </Routes>
      </main>

      <footer className='border-t border-slate-200 mt-12 py-6'>
        <div className='max-w-6xl mx-auto px-6 text-xs text-slate-500'>
          Coverage claims are evidence-backed (tests, public docs, internal document codes —
          internal documents are released on request under NDA / BAA / audit engagement).
          Items marked <span className='draft-badge'>draft</span> are authored but not yet
          reviewed. ⏳ planned chips flag rows whose claim depends on queued work, each backed
          by evidence of pending delivery. This matrix describes HDS's contribution to
          compliance; implementer organizations remain responsible for their own posture.
        </div>
      </footer>
    </div>
  );
}
