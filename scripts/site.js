#!/usr/bin/env node
/**
 * site.js — generate the public, browsable HDS compliance-matrix site into
 * dist/site/ (index + one filterable page per scope + templates page + CNAME).
 *
 * Static, dependency-free output (vanilla JS for client-side filtering), built
 * from the same YAML the validator/build read. Run: npm run site
 * Deployed to compliance.datasafe.dev via .github/workflows/pages.yml.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, loadYaml, parseFrontmatter,
  vendorScopeFiles, hdsScopeFiles, templateFiles,
} from './lib/load.js';
import { esc, badge, regions, COVERAGES, requirementCard } from './lib/render.js';

const OUT = path.join(ROOT, 'dist', 'site');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const DOMAIN = 'compliance.datasafe.dev';

// ---- load data ----
const pryvByScope = new Map();
for (const f of await vendorScopeFiles()) {
  const s = loadYaml(f);
  const m = new Map();
  for (const r of s.requirements || []) m.set(r.ref, r);
  pryvByScope.set(s.id, m);
}
const scopes = (await hdsScopeFiles()).map((f) => loadYaml(f));
const templates = [];
for (const f of await templateFiles()) {
  const { data } = parseFrontmatter(f);
  if (data) templates.push(data);
}

// ---- NEW RELIC browser monitoring placeholder ----
// Go-live prerequisite (HDS NR directive): paste the New Relic Browser snippet
// for the 'hds-prod-compliance-matrix' entity into public/newrelic-snippet.html.
// If present it is injected into every page; if absent, a comment marker is used.
const NR_SNIPPET_FILE = path.join(ROOT, 'public', 'newrelic-snippet.html');
const NR = fs.existsSync(NR_SNIPPET_FILE)
  ? fs.readFileSync(NR_SNIPPET_FILE, 'utf8')
  : '<!-- New Relic browser snippet goes here before go-live (NR directive) -->';

const layout = (title, body, { active } = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — HDS compliance-matrix</title>
<link rel="stylesheet" href="styles.css">
${NR}
</head><body>
<header class="top">
  <a class="brand" href="index.html">HDS <b>compliance-matrix</b></a>
  <nav>
    <a href="index.html"${active === 'home' ? ' class="on"' : ''}>Overview</a>
    <a href="templates.html"${active === 'templates' ? ' class="on"' : ''}>Templates</a>
    <a href="https://github.com/healthdatasafe/compliance-matrix">Source</a>
  </nav>
</header>
<main>${body}</main>
<footer>
  <p><strong>Not legal advice.</strong> Engineering &amp; operational guidance; confirm your
  obligations with qualified counsel. All rows are <em>draft</em> pending review.</p>
  <p>Internal evidence is shown by code only — the document itself is released on request
  under NDA / signed BAA / audit engagement. Platform layer inherited from
  <a href="https://github.com/pryv/compliance-matrix">pryv/compliance-matrix</a>.</p>
</footer>
</body></html>`;

// ---- coverage bar ----
const covBar = (reqs) => {
  const counts = COVERAGES.map((c) => ({ c, n: reqs.filter((r) => (r.hds?.coverage) === c).length }));
  const total = reqs.length || 1;
  const seg = counts.filter((x) => x.n).map((x) =>
    `<span class="seg ${x.c}" style="width:${(x.n / total * 100).toFixed(1)}%" title="${x.c}: ${x.n}"></span>`).join('');
  return `<div class="covbar">${seg}</div>`;
};

// ---- index ----
const scopeCards = scopes.map((s) => {
  const reqs = s.requirements || [];
  return `<a class="scopecard" href="${esc(s.id)}.html">
    <h3>${esc(s.title)} <span class="short">${esc(s.short || s.id)}</span></h3>
    <p class="meta">${esc(s.type)} · ${esc(s.jurisdiction)} ${regions(s.regions)} · ${reqs.length} requirements</p>
    ${covBar(reqs)}
  </a>`;
}).join('');

const totalReqs = scopes.reduce((n, s) => n + (s.requirements || []).length, 0);

fs.writeFileSync(path.join(OUT, 'index.html'), layout('Overview', `
<section class="hero">
  <h1>Health Data Safe — compliance matrix</h1>
  <p class="lede">How HDS is compliant, and what an organisation building on HDS must still
  do themselves. Each requirement is read across three layers.</p>
  <div class="threelayer">
    <div class="ll pryv"><b>Pryv platform</b><span>what the open-pryv.io software does (inherited)</span></div>
    <div class="arrow">→</div>
    <div class="ll hds"><b>HDS</b><span>what HDS-as-operator + the app stack adds</span></div>
    <div class="arrow">→</div>
    <div class="ll impl"><b>Implementer</b><span>what's on your plate, per persona (+ agreements to sign)</span></div>
  </div>
  <p class="count">${scopes.length} scopes · ${totalReqs} requirements · ${templates.length} agreement templates</p>
</section>
<section class="scopes">${scopeCards}</section>
`, { active: 'home' }));

// ---- per-scope pages (with client-side filter) ----
const filterBar = `
<div class="filters">
  <input type="search" id="q" placeholder="Search requirements…" aria-label="search">
  <span class="fgroup" id="cov">
    ${COVERAGES.map((c) => `<label><input type="checkbox" value="${c}" checked> <span class="b ${c}">${c}</span></label>`).join('')}
  </span>
  <span class="fgroup" id="persona">
    ${['partner', 'covered-entity', 'business-associate', 'individual'].map((p) =>
      `<label><input type="checkbox" value="${p}" checked> ${p}</label>`).join('')}
  </span>
  <span class="fcount" id="fcount"></span>
</div>`;

const filterJS = `<script>
(function(){
  const q=document.getElementById('q'),cards=[...document.querySelectorAll('.req')],fc=document.getElementById('fcount');
  const covs=()=>[...document.querySelectorAll('#cov input:checked')].map(i=>i.value);
  const pers=()=>[...document.querySelectorAll('#persona input:checked')].map(i=>i.value);
  function apply(){const t=q.value.toLowerCase(),cv=covs(),pr=pers();let n=0;
    cards.forEach(c=>{const okc=cv.includes(c.dataset.coverage||'');
      const cp=(c.dataset.personas||'').split(' ').filter(Boolean);
      const okp=cp.length===0||cp.some(p=>pr.includes(p));
      const okt=!t||(c.dataset.text||'').includes(t);
      const show=okc&&okp&&okt;c.style.display=show?'':'none';if(show)n++;});
    fc.textContent=n+' / '+cards.length;}
  document.querySelector('.filters').addEventListener('input',apply);apply();
})();
</script>`;

for (const s of scopes) {
  const pryv = pryvByScope.get(s.layered_on_pryv) || new Map();
  const cards = (s.requirements || []).map((r) => requirementCard(r, pryv.get(r.pryv_ref) || {})).join('');
  fs.writeFileSync(path.join(OUT, `${s.id}.html`), layout(s.short || s.title, `
    <a class="back" href="index.html">← All scopes</a>
    <h1>${esc(s.title)} <span class="short">${esc(s.short || s.id)}</span></h1>
    <p class="meta">${esc(s.type)} · ${esc(s.jurisdiction)} · ${esc(s.version)} ${regions(s.regions)}
      ${s.layered_on_pryv ? `· layered on Pryv <code>${esc(s.layered_on_pryv)}</code>` : ''}</p>
    ${covBar(s.requirements || [])}
    ${filterBar}
    <div class="reqs">${cards}</div>
    ${filterJS}
  `));
}

// ---- templates ----
const tplCards = templates.map((t) => `<article class="req" id="tpl-${esc(t.id)}">
  <h3>📄 ${esc(t.title)} ${badge(t.status)}</h3>
  <p class="meta">kind: ${esc(t.kind || 'other')} · signer: <strong>${esc(t.signer)}</strong>
    ${t.counterparty ? `· with: ${esc(t.counterparty)}` : ''}</p>
  <p>${esc(t.summary) || ''}</p>
  <p class="covers">satisfies: ${(t.covers || []).map((c) => `<code>${esc(c)}</code>`).join(' ')}</p>
</article>`).join('');

fs.writeFileSync(path.join(OUT, 'templates.html'), layout('Templates', `
  <a class="back" href="index.html">← All scopes</a>
  <h1>Agreement templates</h1>
  <p class="lede">Fill-in templates implementers use to meet their obligations.
  Review with counsel before use.</p>
  <div class="reqs">${tplCards}</div>
`, { active: 'templates' }));

// ---- styles + CNAME ----
fs.writeFileSync(path.join(OUT, 'styles.css'), STYLES());
fs.writeFileSync(path.join(OUT, 'CNAME'), DOMAIN + '\n');

console.log(`[OK]   site → dist/site/ (${scopes.length} scope pages + index + templates)`);

function STYLES () {
  return `:root{--ink:#1a2233;--muted:#6b7280;--line:#e5e7eb;--bg:#f6f7f9}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5}
a{color:#1d4ed8}
.top{display:flex;align-items:center;gap:1.5rem;background:var(--ink);color:#fff;padding:.8rem 1.5rem;position:sticky;top:0;z-index:5}
.top .brand{color:#fff;text-decoration:none;font-weight:400}.top .brand b{font-weight:700}
.top nav{display:flex;gap:1.2rem;margin-left:auto}.top nav a{color:#cbd5e1;text-decoration:none;font-size:.9rem}
.top nav a.on,.top nav a:hover{color:#fff}
main{max-width:84rem;margin:1.5rem auto;padding:0 1.5rem}
footer{max-width:84rem;margin:2rem auto;padding:1rem 1.5rem;border-top:1px solid var(--line);color:var(--muted);font-size:.8rem}
h1{font-size:1.5rem}.short{font-weight:400;color:var(--muted);font-size:.9rem}
.meta{color:var(--muted);font-size:.82rem}
.back{font-size:.85rem;color:var(--muted);text-decoration:none}
.hero h1{margin:.2rem 0}.lede{color:#374151;max-width:46rem}
.threelayer{display:flex;align-items:stretch;gap:.6rem;margin:1.2rem 0;flex-wrap:wrap}
.ll{flex:1;min-width:13rem;border:1px solid var(--line);border-radius:.6rem;padding:.7rem .9rem;background:#fff}
.ll b{display:block}.ll span{font-size:.82rem;color:var(--muted)}
.ll.pryv{background:#f3f4f6}.ll.hds{background:#eff6ff}.ll.impl{background:#f0fdf4}
.arrow{align-self:center;color:var(--muted);font-size:1.3rem}
.count{color:var(--muted);font-size:.85rem}
.scopes{display:grid;grid-template-columns:repeat(auto-fill,minmax(20rem,1fr));gap:1rem;margin-top:1rem}
.scopecard{display:block;background:#fff;border:1px solid var(--line);border-radius:.6rem;padding:1rem;text-decoration:none;color:inherit}
.scopecard:hover{border-color:#1d4ed8;box-shadow:0 1px 6px rgba(0,0,0,.06)}
.scopecard h3{margin:.1rem 0}
.covbar{display:flex;height:8px;border-radius:999px;overflow:hidden;background:#eee;margin:.5rem 0}
.covbar .seg.implemented{background:#15803d}.covbar .seg.configurable{background:#1d4ed8}
.covbar .seg.facilitated{background:#ca8a04}.covbar .seg.documented{background:#7e22ce}.covbar .seg.out-of-scope{background:#9ca3af}
.filters{position:sticky;top:3.2rem;background:var(--bg);display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:center;padding:.7rem 0;z-index:4;border-bottom:1px solid var(--line)}
.filters #q{padding:.4rem .6rem;border:1px solid var(--line);border-radius:.4rem;min-width:14rem}
.fgroup{display:flex;flex-wrap:wrap;gap:.5rem;font-size:.78rem}.fgroup label{display:inline-flex;align-items:center;gap:.2rem}
.fcount{margin-left:auto;color:var(--muted);font-size:.8rem}
.reqs{margin-top:1rem}
.req{background:#fff;border:1px solid var(--line);border-radius:.6rem;padding:1rem;margin:1rem 0}
.req h3{margin:.1rem 0 .5rem;font-size:1rem}
.req code{background:#eef1f5;padding:.05rem .3rem;border-radius:.3rem;font-size:.85em}
.text{color:#374151;font-size:.88rem;background:#fafbfc;border-left:3px solid var(--line);padding:.4rem .7rem;margin:.4rem 0}
.draft{background:#fef3c7;color:#b45309;font-size:.62rem;text-transform:uppercase;padding:.1rem .4rem;border-radius:999px;vertical-align:middle}
.layers{display:grid;grid-template-columns:1fr 1.2fr 1.2fr;gap:.8rem;margin-top:.6rem}
@media(max-width:800px){.layers{grid-template-columns:1fr}}
.layer{border:1px solid var(--line);border-radius:.5rem;padding:.6rem .7rem;font-size:.84rem}
.layer.pryv{background:#f3f4f6}.layer.hds{background:#eff6ff}.layer.impl{background:#f0fdf4}
.lh{font-weight:700;font-size:.78rem;text-transform:uppercase;letter-spacing:.03em;margin-bottom:.35rem}
.layer p{margin:.3rem 0}.layer details{font-size:.82rem;color:#374151}.layer summary{cursor:pointer;color:var(--muted)}
.persona{border-top:1px dashed var(--line);padding-top:.35rem;margin-top:.35rem}
.persona:first-of-type{border-top:0;padding-top:0;margin-top:0}
.ev{margin:.3rem 0 0;padding-left:1.1rem;color:var(--muted);font-size:.78rem}
.b{display:inline-block;padding:.05rem .45rem;border-radius:999px;font-size:.7rem;font-weight:700;text-transform:uppercase}
.b.implemented{background:#dcfce7;color:#15803d}.b.configurable{background:#dbeafe;color:#1d4ed8}
.b.facilitated{background:#fef9c3;color:#a16207}.b.documented{background:#f3e8ff;color:#7e22ce}
.b.out-of-scope,.b.none{background:#f3f4f6;color:#6b7280}
.b.draft{background:#fef3c7;color:#b45309}.b.review{background:#fde68a;color:#92400e}.b.approved{background:#dcfce7;color:#15803d}
.rg{display:inline-block;background:var(--ink);color:#fff;font-size:.6rem;font-weight:700;padding:.05rem .35rem;border-radius:.25rem;margin-left:.2rem}
.tpl{font-size:.78rem;margin-left:.4rem;text-decoration:none}
.lock{font-weight:600;color:#374151}.onreq{font-size:.7rem;color:#a16207;background:#fef9c3;padding:.02rem .35rem;border-radius:999px}
.covers code{margin-right:.3rem}.muted{color:var(--muted)}`;
}
