// Shared rendering helpers for the static site + preview.
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const COVERAGES = ['implemented', 'configurable', 'facilitated', 'documented', 'out-of-scope'];

export const badge = (cov) =>
  cov ? `<span class="b ${cov}">${esc(cov)}</span>` : '<span class="b none">—</span>';

export const regions = (arr) =>
  (arr && arr.length) ? arr.map((r) => `<span class="rg">${esc(r.toUpperCase())}</span>`).join('') : '';

export function evidenceList (ev = {}) {
  return [
    ...(ev.tests || []).map((x) => `test: ${esc(x)}`),
    ...(ev.docs || []).map((x) => `doc: ${esc(x)}`),
    ...(ev.internal_docs || []).map((x) =>
      `<span class="lock">🔒 ${esc(x)}</span> <span class="onreq">available on request</span>`),
  ];
}

/** A requirement card with data-* attributes for client-side filtering. */
export function requirementCard (r, pryvRow = {}) {
  const hds = r.hds || {};
  const personas = (r.implementer || []).map((o) => o.persona);
  const text = `${r.ref} ${r.title} ${hds.overview || ''}`.toLowerCase();
  const ev = evidenceList(hds.evidence);
  return `<article class="req" data-coverage="${esc(hds.coverage || '')}" data-personas="${esc(personas.join(' '))}" data-text="${esc(text)}">
  <h3><code>${esc(r.ref)}</code> ${esc(r.title)} ${r.draft !== false ? '<span class="draft">draft</span>' : ''}</h3>
  ${r.text ? `<p class="text">${esc(r.text)}</p>` : ''}
  <div class="layers">
    <div class="layer pryv">
      <div class="lh">Pryv platform ${badge(pryvRow.coverage)}</div>
      <p>${esc(pryvRow.overview) || '<span class="muted">— not covered by the platform layer —</span>'}</p>
    </div>
    <div class="layer hds">
      <div class="lh">HDS ${badge(hds.coverage)} ${regions(hds.regions)}</div>
      <p>${esc(hds.overview)}</p>
      ${hds.detail ? `<details><summary>detail</summary><p>${esc(hds.detail)}</p></details>` : ''}
      ${ev.length ? `<ul class="ev">${ev.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="layer impl">
      <div class="lh">Implementer</div>
      ${(r.implementer || []).map((o) => `<div class="persona">
        <strong>${esc(o.persona)}</strong> ${badge(o.coverage)}
        ${(o.templates || []).map((t) => `<a class="tpl" href="templates.html#tpl-${esc(t)}">📄 ${esc(t)}</a>`).join('')}
        ${o.overview ? `<p>${esc(o.overview)}</p>` : ''}
      </div>`).join('') || '<span class="muted">—</span>'}
    </div>
  </div>
</article>`;
}
