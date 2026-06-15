import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

// HashRouter so GitHub Pages serves the static SPA at any deep path
// without a 404.html redirect dance — URLs become /#/scope/gdpr.
createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>
);
