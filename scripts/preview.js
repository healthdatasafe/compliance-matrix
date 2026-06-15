#!/usr/bin/env node
/**
 * preview.js — render dist/preview.html: a human-readable, self-contained view
 * of the HDS matrix (three layers per requirement + agreement templates).
 *
 * Interim review artifact until the web app (wab/) is HDS-adapted (plan 74,
 * Phase 5). Run:  npm run preview   (then open dist/preview.html)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, loadYaml, parseFrontmatter,
  vendorScopeFiles, hdsScopeFiles, templateFiles,
} from './lib/load.js';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const badge = (cov) => cov ? `<span class="b ${cov}">${esc(cov)}</span>` : '<span class="b none">—</span>';
const regions = (arr) => (arr && arr.length) ? arr.map((r) => `<span class="rg">${esc(r.toUpperCase())}</span>`).join('') : '';

// Platform layer index from vendor/pryv (overview + coverage per ref).
const pryvByScope = new Map();
for (const f of await vendorScopeFiles()) {
  const s = loadYaml(f);
  const m = new Map();
  for (const r of s.requirements || []) m.set(r.ref, r);
  pryvByScope.set(s.id, m);
}

const templates = [];
for (const f of await templateFiles()) {
  const { data } = parseFrontmatter(f);
  if (data) templates.push(data);
}

let body = '';
for (const f of await hdsScopeFiles()) {
  const s = loadYaml(f);
  const pryv = pryvByScope.get(s.layered_on_pryv) || new Map();
  body += `<section class="scope"><h2>${esc(s.title)} <span class="short">${esc(s.short ?? s.id)}</span></h2>
    <p class="meta">${esc(s.type)} · ${esc(s.jurisdiction)} · ${esc(s.version)} ${regions(s.regions)}
    ${s.layered_on_pryv ? `· layered on Pryv <code>${esc(s.layered_on_pryv)}</code>` : ''}</p>`;

  for (const r of s.requirements || []) {
    const p = pryv.get(r.pryv_ref) || {};
    const hds = r.hds || {};
    const ev = hds.evidence || {};
    const evList = [
      ...(ev.tests || []).map((x) => `test: ${x}`),
      ...(ev.ops || []).map((x) => `ops: ${x}`),
      ...(ev.docs || []).map((x) => `doc: ${x}`),
      ...(ev.internal_docs || []).map((x) => `internal: ${x}`),
    ];
    body += `<article class="req">
      <h3><code>${esc(r.ref)}</code> ${esc(r.title)} ${r.draft !== false ? '<span class="draft">draft</span>' : ''}</h3>
      ${r.text ? `<p class="text">${esc(r.text)}</p>` : ''}
      <div class="layers">
        <div class="layer pryv">
          <div class="lh">Pryv platform ${badge(p.coverage)}</div>
          <p>${esc(p.overview) || '<span class="muted">— not covered by the platform layer —</span>'}</p>
        </div>
        <div class="layer hds">
          <div class="lh">HDS ${badge(hds.coverage)} ${regions(hds.regions)}</div>
          <p>${esc(hds.overview)}</p>
          ${evList.length ? `<ul class="ev">${evList.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="layer impl">
          <div class="lh">Implementer</div>
          ${(r.implementer || []).map((o) => `<div class="persona">
            <strong>${esc(o.persona)}</strong> ${badge(o.coverage)}
            ${(o.templates || []).map((t) => `<a class="tpl" href="#tpl-${esc(t)}">📄 ${esc(t)}</a>`).join('')}
            <p>${esc(o.overview) || ''}</p>
          </div>`).join('') || '<span class="muted">—</span>'}
        </div>
      </div>
    </article>`;
  }
  body += '</section>';
}

let tpls = '<section class="scope"><h2>Agreement templates</h2>';
for (const t of templates) {
  tpls += `<article class="req" id="tpl-${esc(t.id)}">
    <h3>📄 ${esc(t.title)} ${badge(t.status)}</h3>
    <p class="meta">kind: ${esc(t.kind ?? 'other')} · signer: <strong>${esc(t.signer)}</strong>
      ${t.counterparty ? `· counterparty: ${esc(t.counterparty)}` : ''}</p>
    <p>${esc(t.summary) || ''}</p>
    <p class="covers">covers: ${(t.covers || []).map((c) => `<code>${esc(c)}</code>`).join(' ')}</p>
  </article>`;
}
tpls += '</section>';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HDS compliance-matrix — preview</title><style>
:root{--ink:#1a2233;--muted:#6b7280;--line:#e5e7eb}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;color:var(--ink);background:#f6f7f9;line-height:1.5}
header{background:var(--ink);color:#fff;padding:1rem 1.5rem}
header h1{margin:0;font-size:1.1rem}header p{margin:.25rem 0 0;opacity:.7;font-size:.8rem}
main{max-width:80rem;margin:1.5rem auto;padding:0 1.5rem}
.scope{margin-bottom:2.5rem}.scope>h2{border-bottom:2px solid var(--ink);padding-bottom:.3rem}
.short{font-weight:400;color:var(--muted);font-size:.9rem}
.meta{color:var(--muted);font-size:.82rem}
.req{background:#fff;border:1px solid var(--line);border-radius:.6rem;padding:1rem;margin:1rem 0}
.req h3{margin:.1rem 0 .5rem;font-size:1rem}.req code{background:#eef1f5;padding:.05rem .3rem;border-radius:.3rem;font-size:.85em}
.text{color:#374151;font-size:.88rem;background:#fafbfc;border-left:3px solid var(--line);padding:.4rem .7rem;margin:.4rem 0}
.draft{background:#fef3c7;color:#b45309;font-size:.62rem;text-transform:uppercase;padding:.1rem .4rem;border-radius:999px;vertical-align:middle}
.layers{display:grid;grid-template-columns:1fr 1.2fr 1.2fr;gap:.8rem;margin-top:.6rem}
.layer{border:1px solid var(--line);border-radius:.5rem;padding:.6rem .7rem;font-size:.84rem}
.layer.pryv{background:#f3f4f6}.layer.hds{background:#eff6ff}.layer.impl{background:#f0fdf4}
.lh{font-weight:700;font-size:.78rem;text-transform:uppercase;letter-spacing:.03em;margin-bottom:.35rem}
.layer p{margin:.3rem 0}
.persona{border-top:1px dashed var(--line);padding-top:.35rem;margin-top:.35rem}
.persona:first-of-type{border-top:0;padding-top:0;margin-top:0}
.ev{margin:.3rem 0 0;padding-left:1.1rem;color:var(--muted);font-size:.78rem}
.b{display:inline-block;padding:.05rem .45rem;border-radius:999px;font-size:.7rem;font-weight:700;text-transform:uppercase}
.b.implemented{background:#dcfce7;color:#15803d}.b.configurable{background:#dbeafe;color:#1d4ed8}
.b.facilitated{background:#fef9c3;color:#a16207}.b.documented{background:#f3e8ff;color:#7e22ce}
.b.out-of-scope,.b.none{background:#f3f4f6;color:#6b7280}
.b.draft{background:#fef3c7;color:#b45309}.b.review{background:#fde68a;color:#92400e}.b.approved{background:#dcfce7;color:#15803d}
.rg{display:inline-block;background:var(--ink);color:#fff;font-size:.6rem;font-weight:700;padding:.05rem .35rem;border-radius:.25rem;margin-left:.2rem}
.tpl{font-size:.78rem;margin-left:.4rem;text-decoration:none;color:#1d4ed8}
.covers code{margin-right:.3rem}.muted{color:var(--muted)}
</style></head><body>
<header><h1>HDS compliance-matrix — preview</h1>
<p>Three-layer model: Pryv platform → HDS → implementer (per persona). Plan 74 Phase 1 — draft worked example.</p></header>
<main>${body}${tpls}</main></body></html>`;

const DIST = path.join(ROOT, 'dist');
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, 'preview.html');
fs.writeFileSync(out, html);
console.log(`[OK]   wrote ${path.relative(ROOT, out)}`);
