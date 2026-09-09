#!/usr/bin/env node
/**
 * site.js — generate the public, browsable HDS compliance-matrix site into
 * dist/site/ (index + one filterable page per scope + templates page + CNAME).
 *
 * Static, dependency-free output (vanilla JS for client-side filtering), built
 * from the same YAML the validator/build read. Run: npm run site
 * Deployed to compliance.datasafe.dev by scripts/deploy.sh (manual gh-pages
 * worktree push — NOT a GitHub Actions workflow; there is no pages.yml).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, loadYaml, parseFrontmatter,
  vendorScopeFiles, hdsScopeFiles, templateFiles,
} from './lib/load.js';
import { esc, badge, regions, COVERAGES, requirementCard, refAnchorId } from './lib/render.js';

const OUT = path.join(ROOT, 'dist', 'site');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const DOMAIN = 'compliance.datasafe.dev';

// One linear reading order. The framework pages are detail views reached from
// these, so they keep their own back links rather than joining the sequence.
const PAGES = [
  { file: 'index.html', key: 'home', label: 'HDS and compliance' },
  { file: 'standing.html', key: 'standing', label: 'Where HDS stands' },
  { file: 'implementer.html', key: 'implementer', label: 'What do I have to do?' },
  { file: 'templates.html', key: 'templates', label: 'Agreement templates' },
];

const pager = (activeKey) => {
  const i = PAGES.findIndex((p) => p.key === activeKey);
  if (i < 0) return '';
  const prev = PAGES[i - 1];
  const next = PAGES[i + 1];
  if (!prev && !next) return '';
  return `<nav class="pager">
    ${prev ? `<a class="pg prev" href="${esc(prev.file)}"><span>Previous</span><b>${esc(prev.label)}</b></a>` : '<span class="pgspacer"></span>'}
    ${next ? `<a class="pg next" href="${esc(next.file)}"><span>Next</span><b>${esc(next.label)}</b></a>` : '<span class="pgspacer"></span>'}
  </nav>`;
};

// ---- load data ----
const pryvByScope = new Map();
for (const f of await vendorScopeFiles()) {
  const s = loadYaml(f);
  const m = new Map();
  for (const r of s.requirements || []) m.set(r.ref, r);
  pryvByScope.set(s.id, m);
}
const scopes = (await hdsScopeFiles()).map((f) => loadYaml(f));
const byId = new Map(scopes.map((s) => [s.id, s]));

// Families group several scopes into one presented regulation (HIPAA's three
// rules). Presentation only: the YAML files, refs, ref/ redirect stubs and
// official-refs.yml keys are untouched.
const familiesFile = path.join(ROOT, 'families.yml');
const FAMILIES = (fs.existsSync(familiesFile) ? loadYaml(familiesFile).families : {}) || {};

const profilesFile = path.join(ROOT, 'profiles.yml');
const PROFILES = fs.existsSync(profilesFile) ? loadYaml(profilesFile) : null;

/**
 * One entry per regulation as the visitor sees it: either a family of scopes
 * or a standalone scope. `members` is always an array, so downstream code
 * never special-cases the grouped one.
 */
const groups = [];
const seen = new Set();
for (const s of scopes) {
  if (s.family && FAMILIES[s.family]) {
    if (seen.has(s.family)) continue;
    seen.add(s.family);
    const fam = FAMILIES[s.family];
    const members = (fam.order || [])
      .map((id) => byId.get(id))
      .filter(Boolean)
      .concat(scopes.filter((x) => x.family === s.family && !(fam.order || []).includes(x.id)));
    groups.push({
      key: s.family,
      page: `${s.family}.html`,
      title: fam.title,
      short: fam.short || fam.title,
      long: fam.long,
      jurisdiction: fam.jurisdiction || members[0]?.jurisdiction,
      blurb: fam.blurb,
      canonical_url: fam.canonical_url,
      members,
      isFamily: true,
    });
  } else {
    groups.push({
      key: s.id,
      page: `${s.id}.html`,
      title: s.title,
      short: s.short || s.id,
      jurisdiction: s.jurisdiction,
      canonical_url: s.canonical_url,
      members: [s],
      isFamily: false,
    });
  }
}

const allReqs = (g) => g.members.flatMap((s) => s.requirements || []);
const regionsOf = (g) => [...new Set(g.members.flatMap((s) => s.regions || []))];

/**
 * The group's posture. A family has one posture per member scope; they are
 * shown separately rather than averaged, because averaging a business
 * associate's Security-Rule position with its Privacy-Rule position produces a
 * number that describes nothing.
 */
const posturesOf = (g) => g.members
  .map((s) => ({ scope: s, posture: s.hds_posture }))
  .filter((x) => x.posture);

const ASSURANCE_RANK = {
  none: 0,
  'self-assessed': 1,
  'independent-readiness-review': 2,
  'third-party-attested': 3,
  certified: 4,
};
/** Weakest assurance across the group: a family is only as assured as its softest part. */
function weakestAssurance (g) {
  const levels = posturesOf(g).map((x) => x.posture.external_assurance?.level).filter(Boolean);
  if (!levels.length) return null;
  return levels.sort((a, b) => ASSURANCE_RANK[a] - ASSURANCE_RANK[b])[0];
}
/** Approved-documentation backing, summed across a family's member scopes. */
function backing (g) {
  return posturesOf(g).reduce((acc, { posture }) => {
    const b = posture.evidence_backing || {};
    acc.rows_total += b.rows_total || 0;
    acc.rows_evidenced += b.rows_evidenced || 0;
    acc.rows_approved += b.rows_approved || 0;
    return acc;
  }, { rows_total: 0, rows_evidenced: 0, rows_approved: 0 });
}

const allGaps = (g) => posturesOf(g).flatMap((x) =>
  (x.posture.known_gaps || []).map((k) => ({ ...k, scopeId: x.scope.id })));
const templates = [];
for (const f of await templateFiles()) {
  const { data } = parseFrontmatter(f);
  if (data) templates.push(data);
}

// Plan 88 / fence 9 — no client-side (browser) monitoring agent in a public site.
// The New Relic Browser snippet injection was removed: third-party monitoring code
// in a visitor's browser cannot be allow-listed, so it is removed, not configured.

const layout = (title, body, { active } = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — HDS compliance-matrix</title>
<link rel="stylesheet" href="styles.css">
</head><body>
<header class="top">
  <a class="brand" href="index.html">HDS <b>compliance-matrix</b></a>
  <nav>
    <a href="index.html"${active === 'home' ? ' class="on"' : ''}>HDS and compliance</a>
    <a href="standing.html"${active === 'standing' ? ' class="on"' : ''}>HDS standing</a>
    <a href="implementer.html"${active === 'implementer' ? ' class="on"' : ''}>For implementers</a>
    <a href="templates.html"${active === 'templates' ? ' class="on"' : ''}>Templates</a>
    <a href="https://github.com/healthdatasafe/compliance-matrix">Source</a>
  </nav>
</header>
<main>${pager(active)}${body}${pager(active)}</main>
<footer>
  <p><strong>Not legal advice.</strong> Engineering &amp; operational guidance; confirm your
  obligations with qualified counsel.</p>
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

// ---- shared bits ----
const assurancePill = (lvl) => {
  const label = {
    none: 'self-assessed, no external audit',
    'self-assessed': 'self-assessed',
    'independent-readiness-review': 'independent readiness review',
    'third-party-attested': 'third-party attested',
    certified: 'certified',
  }[lvl] || 'not stated';
  return `<span class="as as-${esc(lvl || 'unknown')}">${esc(label)}</span>`;
};

const ROLE_LABEL = {
  controller: 'Controller',
  processor: 'Processor',
  'joint-controller': 'Joint controller',
  'covered-entity': 'Covered entity',
  'business-associate': 'Business associate',
  'service-organization': 'Service organisation',
  'not-applicable': 'Does not apply',
};
const ARRANGEMENT_LABEL = {
  'partner-integration': 'Partner builds on HDS',
  'hds-operated-service': 'HDS operates the service',
};

const roleRows = (posture) => (posture.roles || []).map((r) => `
  <div class="rolerow">
    <span class="arr">${esc(ARRANGEMENT_LABEL[r.arrangement] || r.arrangement)}</span>
    <span class="rl rl-${esc(r.role)}">${esc(ROLE_LABEL[r.role] || r.role)}</span>
    <p>${esc(r.applies_to)}</p>
  </div>`).join('');

// ---- index: how HDS itself stands ----
// Editorial order is deliberate: what HDS has in place leads, the assurance
// note sits at the foot of each card, and the gaps stay one click away on the
// same page. Nothing is removed; the strongest true thing goes first.
const totals = groups.reduce((acc, g) => {
  const b = backing(g);
  acc.total += b.rows_total; acc.evidenced += b.rows_evidenced; acc.approved += b.rows_approved;
  return acc;
}, { total: 0, evidenced: 0, approved: 0 });

const postureCards = groups.map((g) => {
  const b = backing(g);
  const gaps = allGaps(g);
  const lvl = weakestAssurance(g);
  const ps = posturesOf(g);
  const pct = Math.round(b.rows_approved / (b.rows_total || 1) * 100);
  return `<article class="pcard">
    <header>
      <h3><a href="${esc(g.page)}">${esc(g.title)}</a> ${g.isFamily ? `<span class="short">${g.members.length} rules</span>` : ''}</h3>
      <p class="meta">${esc(g.jurisdiction || '')} ${regions(regionsOf(g))} · ${b.rows_total} requirements</p>
    </header>

    <div class="backing">
      <div class="bknum"><b>${b.rows_approved}</b> of ${b.rows_total}</div>
      <p class="bklab">requirements answered from approved HDS documentation
        ${b.rows_evidenced > b.rows_approved ? `· <span class="muted">${b.rows_evidenced - b.rows_approved} more evidenced, documentation still in review</span>` : ''}</p>
      <div class="bkbar"><span class="seg ok" style="width:${pct}%"></span><span class="seg mid" style="width:${Math.round((b.rows_evidenced - b.rows_approved) / (b.rows_total || 1) * 100)}%"></span></div>
    </div>

    ${(() => {
      // A family whose sub-rules all state the same role shows it once, not
      // three identical rows.
      const same = g.isFamily && new Set(ps.map(({ posture }) => JSON.stringify(posture.roles))).size === 1;
      const note = (po) => po.no_role_note
        ? `<p class="notproc"><b>HDS holds no role here, by design.</b> ${esc(po.no_role_note)}</p>`
        : '';
      return (same
        ? `<div class="pbody"><div class="roles">${roleRows(ps[0].posture)}</div>${note(ps[0].posture)}</div>`
        : '') +
        ps.map(({ scope, posture }) => `
      <div class="pbody">
        ${g.isFamily ? `<h4 class="subrule">${esc(scope.short || scope.id)}</h4>` : ''}
        ${same ? '' : `<div class="roles">${roleRows(posture)}</div>`}
        <p class="stmt">${esc(posture.statement)}</p>
        ${same ? '' : note(posture)}
      </div>`).join('');
    })()}

    <a class="more" href="${esc(g.page)}">Read the requirement rows →</a>

    <footer class="pfoot">
      ${assurancePill(lvl)}
      ${gaps.length
? `<details class="gaps"><summary>${gaps.length} open item${gaps.length > 1 ? 's' : ''} HDS is tracking</summary>
        <ul>${gaps.map((k) => `<li><span class="sev sev-${esc(k.severity)}">${esc(k.severity)}</span> ${esc(k.summary)}
          ${(k.refs || []).map((r) => `<code>${esc(r)}</code>`).join(' ')}
          ${k.internal_doc ? `<span class="lock">🔒 ${esc(k.internal_doc)}</span>` : ''}</li>`).join('')}</ul>
      </details>`
: ''}
      ${ps.some(({ posture }) => (posture.external_assurance?.inherited_provider_assurance || []).length)
        ? `<details class="inh"><summary>Certificates HDS relies on but does not hold</summary><ul>${
          ps.flatMap(({ posture }) => posture.external_assurance?.inherited_provider_assurance || [])
            .map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <p class="muted">These belong to the hosting providers and cover their infrastructure, not HDS's own practices.</p></details>`
        : ''}
    </footer>
  </article>`;
}).join('');

fs.writeFileSync(path.join(OUT, 'standing.html'), layout('HDS standing', `
<section class="hero">
  <h1>Where Health Data Safe stands</h1>
  <p class="lede">HDS runs a documented compliance programme across four frameworks. This page is
  about <strong>HDS itself</strong>: the role it holds under each one, what its position rests on,
  and what it is still working on. For what HDS carries on your behalf, see
  <a href="implementer.html">the implementer view</a>.</p>
  <p class="count"><b>${totals.approved}</b> of ${totals.total} requirements across ${groups.length} frameworks
  are answered from approved HDS documentation, released on request under NDA, signed BAA or audit engagement.</p>
</section>
<section class="postures">${postureCards}</section>
<section class="method">
  <h2>How to read this page</h2>
  <p>Each requirement is answered from HDS's own documentation, and the document behind it is named
  by code on the requirement row. A requirement counts above only when <em>every</em> document it
  cites has completed internal approval. Open items are listed on each framework rather than
  omitted, and every framework page carries the same detail at requirement level.</p>
  <p>HDS's compliance programme is <strong>self-assessed</strong>: it has not been examined by an
  external auditor, and HDS holds no certification or attestation of its own. Where certificates
  appear, they belong to the hosting providers and cover their infrastructure. HDS is a non-profit
  foundation and states this plainly so you can weigh it yourself.</p>
  <p class="muted">Not legal advice; confirm your obligations with qualified counsel.</p>
</section>
`, { active: 'standing' }));

// ---- page 1: HDS and compliance ----
// The orientation page. It carries the methodology that used to sit on top of
// the implementer page, and the framework cards that used to sit at its foot,
// where they had no legend and contradicted the colours above them.
const COVERAGE_LEGEND = `
<p class="covkey">${COVERAGES.map((c) => `<span class="ck"><span class="b ${c}">${c}</span></span>`).join('')}</p>
<p class="muted covnote">Each bar shows what the <b>HDS layer</b> does across that framework's
requirements: <b>implemented</b> and <b>configurable</b> are delivered by the platform or its
configuration, <b>facilitated</b> means HDS supplies part of the answer, <b>documented</b> means
HDS records the position without implementing it, and <b>out-of-scope</b> means the requirement
has no software role for anyone.</p>`;

const frameworkCards = groups.map((g) => {
  const reqs = allReqs(g);
  return `<a class="scopecard" href="${esc(g.page)}">
    <h3>${esc(g.short)}</h3>
    <p class="meta">${esc(g.jurisdiction || '')} ${regions(regionsOf(g))} · ${reqs.length} requirements</p>
    ${covBar(reqs)}
  </a>`;
}).join('');

const totalReqsAll = groups.reduce((n, g) => n + allReqs(g).length, 0);

fs.writeFileSync(path.join(OUT, 'index.html'), layout('HDS and compliance', `
<section class="hero">
  <h1>HDS and compliance</h1>
  <p class="lede">Health Data Safe runs a personal health data vault. Individuals hold their own
  accounts, data enters only with their explicit consent, and they decide who may see it. This
  site records how that stands up against ${groups.length} regulatory frameworks:
  ${totalReqsAll} requirements, read across three layers.</p>
</section>

<section class="method lead">
  <h2>How this works</h2>
  <div class="threelayer">
    <div class="ll pryv"><b>Pryv platform</b><span>what the open-pryv.io software does (inherited)</span></div>
    <div class="arrow">&rarr;</div>
    <div class="ll hds"><b>HDS</b><span>what HDS-as-operator and the app stack add</span></div>
    <div class="arrow">&rarr;</div>
    <div class="ll impl"><b>You</b><span>what is left on your plate, and the agreements to sign</span></div>
  </div>
  <p>Every requirement is answered at each layer, and the document behind an answer is named by
  code on the requirement row. Two questions follow from that, and they are different questions
  that this site keeps apart: <a href="standing.html">how HDS itself stands</a> against each
  framework, and <a href="implementer.html">what you have to do</a> if you build on it.</p>
</section>

<h2 class="allh">The frameworks</h2>
<section class="scopes">${frameworkCards}</section>
${COVERAGE_LEGEND}
`, { active: 'home' }));

// ---- implementer view: what HDS carries for you ----

const totalReqs = groups.reduce((n, g) => n + allReqs(g).length, 0);

// The obligation index the profile panel filters. Organisation personas only:
// end-user personas are context, not the implementer's work.
const ORG_PERSONAS = new Set(['partner', 'covered-entity', 'business-associate', 'controller',
  'processor', 'service-organization', 'user-entity', 'subservice-organization']);
const HDS_COVER = [];
const OBLIGATIONS = [];
// Recorded as placing no duty on this persona. Surfaced as a count so the reader
// can see the requirement was considered, never rendered as an action.
const NON_DUTIES = [];
for (const s of scopes) {
  for (const r of s.requirements || []) {
    HDS_COVER.push({
      scope: s.id,
      ref: r.ref,
      title: r.title,
      anchor: refAnchorId(r.ref),
      page: (s.family && FAMILIES[s.family]) ? `${s.family}.html` : `${s.id}.html`,
      coverage: r.hds?.coverage || '',
      effort: r.hds?.effort_saved || '',
      overview: (r.hds?.overview || '').trim().replace(/\s+/g, ' ').slice(0, 320),
    });
    for (const o of r.implementer || []) {
      if (!ORG_PERSONAS.has(o.persona)) continue;
      if (o.coverage === 'out-of-scope') { NON_DUTIES.push({ scope: s.id, ref: r.ref, persona: o.persona }); continue; }
      OBLIGATIONS.push({
        scope: s.id,
        scopeShort: s.short || s.id,
        page: (s.family && FAMILIES[s.family]) ? `${s.family}.html` : `${s.id}.html`,
        ref: r.ref,
        title: r.title,
        anchor: refAnchorId(r.ref),
        persona: o.persona,
        coverage: o.coverage,
        hdsCoverage: r.hds?.coverage || '',
        effort: r.hds?.effort_saved || '',
        overview: (o.overview || '').trim(),
        templates: o.templates || [],
        when: o.applies_when === undefined ? null : o.applies_when,
        nature: o.nature || 'obligation',
        basis: o.basis || '',
      });
    }
  }
}

const groupTitles = {
  population: 'Where your users are',
  'us-role': 'Your relationship to US healthcare',
  residency: 'Where the data is hosted',
  application: 'What your application does',
};

const profilePanel = !PROFILES
  ? ''
  : `
<section class="profile">
  <ol class="steps">
    <li class="step">
      <h2><span class="num">1</span> What are you building?</h2>
      <div class="cards">
        ${PROFILES.presets.map((pr) => `<button type="button" class="preset" data-features="${esc(pr.features.join(','))}" data-locked="${esc((pr.locked || pr.features).join(','))}">
          <b>${esc(pr.label)}</b><span>${esc((pr.summary || '').trim())}</span></button>`).join('')}
      </div>
    </li>
    <li class="step">
      <h2><span class="num">2</span> Where are your users?</h2>
      <div class="s2grid">
        <div class="s2card">
          ${PROFILES.step2.areas.hint ? `<p class="s2hint">${esc(PROFILES.step2.areas.hint.trim())}</p>` : ''}
          <div class="arealist">
            ${PROFILES.step2.areas.options.map((o) => `<label class="area">
              <input type="checkbox" class="s2box" value="${esc(o.feature)}">
              <span class="al">${esc(o.label)}</span>
              ${o.gives ? `<span class="gives">${esc(o.gives)}</span>` : ''}
            </label>`).join('')}
          </div>
        </div>
        ${(PROFILES.step2.followups || []).map((fu) => `<div class="s2card followup" data-when="${esc(fu.when)}" hidden>
          ${fu.title ? `<p class="futitle">${esc(fu.title)}</p>` : ''}
          <p class="fuq">${esc(fu.question.trim())}</p>
          <div class="fuopts">
            ${fu.options.map((o, k) => `<label class="fuopt">
              <input type="radio" class="s2radio" name="fu-${esc(fu.id)}" value="${esc(o.feature)}"${k === 0 ? ' checked' : ''}>
              <span>${esc(o.label)}${o.hint ? `<em>${esc(o.hint.trim())}</em>` : ''}</span>
            </label>`).join('')}
          </div>
          ${fu.note ? `<p class="funote">${esc(fu.note.trim())}</p>` : ''}
        </div>`).join('')}
      </div>
    </li>
  </ol>

  <details class="finetune">
    <summary>Fine tune <span class="ftsum" id="ftsum"></span></summary>
    <p class="hint">Everything the two steps set, and what they do not. Options an archetype
    settles are locked to it; choose a different archetype to change them.</p>
    <div class="fgrid">
      ${['population', 'us-role', 'residency', 'application'].map((grp) => {
        const fs_ = PROFILES.features.filter((f) => f.group === grp);
        if (!fs_.length) return '';
        return `<fieldset class="fgroup2" data-group="${esc(grp)}">
          <legend>${esc(groupTitles[grp] || grp)}</legend>
          ${fs_.map((f) => `<label class="fopt">
            <input type="${f.exclusive ? 'radio' : 'checkbox'}"${f.exclusive ? ` name="${esc(f.exclusive)}"` : ''} value="${esc(f.id)}">
            <span>${esc(f.label)}${f.note ? `<em class="note">${esc(f.note.trim())}</em>` : ''}</span>
          </label>`).join('')}
        </fieldset>`;
      }).join('')}
    </div>
  </details>
</section>
<section class="result" id="result"></section>`;

const profileJS = !PROFILES
  ? ''
  : `<script>
window.__P = ${JSON.stringify({
  features: PROFILES.features,
derived: PROFILES.derived || [],
  presets: PROFILES.presets,
scope_applicability: PROFILES.scope_applicability,
  uncovered: PROFILES.uncovered || [],
personas: PROFILES.personas,
  scopes: Object.fromEntries(scopes.map((s) => [s.id, {
    title: s.title,
short: s.short || s.id,
    page: (s.family && FAMILIES[s.family]) ? s.family + '.html' : s.id + '.html',
    posture: s.hds_posture
? {
      level: s.hds_posture.external_assurance?.level,
      backing: s.hds_posture.evidence_backing || null,
    }
: null,
  }])),
  obligations: OBLIGATIONS,
  nonDuties: NON_DUTIES,
  hdsCover: HDS_COVER,
})};
</script>
<script>
(function () {
  var P = window.__P, panel = document.querySelector('.profile'), out = document.getElementById('result');
  if (!P || !panel) return;

  function on() {
    var s = {};
    panel.querySelectorAll('.fopt input:checked').forEach(function (i) { s[i.value] = true; });
    P.derived.forEach(function (d) {
      if (d.all) s[d.id] = d.all.every(function (x) { return s[x]; });
      if (d.any) s[d.id] = d.any.some(function (x) { return s[x]; });
    });
    return s;
  }
  function cond(c, s) {
    if (!c) return false;
    if (c.all) return c.all.every(function (x) { return s[x]; });
    if (c.any) return c.any.some(function (x) { return s[x]; });
    return false;
  }
  // The role is DERIVED. It used to be a two-way radio with business-associate
  // pre-checked, so an implementer that receives nothing was told it held a role
  // it cannot hold: 45 CFR 160.103 needs both acting on a covered entity's
  // behalf and handling PHI. Returning null is a real answer, not a failure.
  function personaFor(sid, s) {
    var cfg = P.personas[sid];
    if (!cfg) return null;
    if (cfg.derive) {
      for (var i = 0; i < cfg.derive.length; i++) {
        if (cond(cfg.derive[i].when, s)) return cfg.derive[i].persona;
      }
      return null;
    }
    return cfg.default;
  }

  function render() {
    var s = on();
    var anyPop = P.features.some(function (f) { return f.group === 'population' && s[f.id]; });
    var scopes = P.scope_applicability.filter(function (r) { return cond(r.when, s); }).map(function (r) { return r.scope; });

    var warns = P.uncovered.filter(function (u) {
      return cond(u.when, s) && !(u.unless || []).some(function (x) { return s[x]; });
    });

    if (!anyPop) {
      out.innerHTML = '<div class="empty"><b>Start by saying where your users are.</b>' +
        '<p>Which regulations apply to you follows from that, not from the technology.</p></div>';
      return;
    }

    var html = '';
    warns.forEach(function (u) {
      html += '<div class="uncov"><b>' + esc(u.title) + '</b><p>' + esc(u.message) + '</p></div>';
    });

    if (!scopes.length) {
      html += '<div class="empty"><b>No framework in this matrix matches that selection.</b>' +
        '<p>That is a limit of the matrix, not a statement that you have no obligations.</p></div>';
      out.innerHTML = html; return;
    }

    var totActions = 0, totHidden = 0, totUnprofiled = 0, tpls = {};
    var G = { carried: 0, shared: 0, yours: 0 };
    var Y = { needs: 0, not: 0 };
    var showHidden = document.getElementById('showhidden') && document.getElementById('showhidden').checked;

    var sections = scopes.map(function (sid) {
      var meta = P.scopes[sid], persona = personaFor(sid, s);
      if (persona === null) {
        // No role under this framework. Say so, and say what does apply instead.
        return '<article class="rscope norole"><h3><a href="' + meta.page + '">' + esc(meta.title) + '</a>' +
          '<span class="pers none">no role for you</span></h3>' +
          '<p class="nothingdue"><b>You hold no role under this framework.</b> You neither are a covered ' +
          'entity nor build for one that handles data on its behalf, so its duties do not attach to you. ' +
          'The vault itself is covered: see <a href="standing.html">where HDS stands</a>, and the ' +
          '<a href="' + meta.page + '">requirement rows</a> for what HDS carries.</p></article>';
      }
      var rows = P.obligations.filter(function (o) { return o.scope === sid && o.persona === persona; });
      var actions = [], entity = [], orient = [], hidden = 0, unprofiled = 0, determined = 0;
      rows.forEach(function (o) {
        if (o.nature === 'orientation') { orient.push(o); return; }
        var vis;
        if (o.when === null) { vis = true; unprofiled++; }
        else if (o.when === 'always') { vis = true; determined++; }
        else { vis = o.when.some(function (x) { return s[x]; }); if (vis) determined++; }
        if (vis && o.basis === 'entity') determined--;
        if (vis) {
          // A duty you carry as an entity is not an action arising from HDS.
          // Three quarters of the HIPAA family is this, and presenting it as
          // integration work is what produced 49 actions for an implementer
          // who receives nothing.
          (o.basis === 'entity' ? entity : actions).push(o);
          (o.templates || []).forEach(function (t) { tpls[t] = 1; });
        } else hidden++;
      });
      var oblTotal = rows.length - orient.length;
      var nonDuty = P.nonDuties.filter(function (n) { return n.scope === sid && n.persona === persona; }).length;
      totActions += determined; totHidden += hidden; totUnprofiled += unprofiled;

      // Two different questions were being answered by one bar. Depth of HDS's
      // technical contribution (implemented / facilitated / documented) is not
      // the same as how much is left for THIS implementer, and the bar sits
      // where a reader asks the second. So the bar answers the second: when
      // nothing falls to you it is entirely green, which is what the headline
      // beside it already says. Contribution depth stays, as secondary detail.
      var cov = P.hdsCover.filter(function (x) { return x.scope === sid; });
      var d = { carried: 0, shared: 0, doc: 0, na: 0 };
      cov.forEach(function (x) {
        if (x.coverage === 'implemented' || x.coverage === 'configurable') d.carried++;
        else if (x.coverage === 'facilitated') d.shared++;
        else if (x.coverage === 'out-of-scope') d.na++;
        else d.doc++;
      });
      G.carried += d.carried; G.shared += d.shared; G.yours += d.doc;

      // The reader's bar: of everything in this framework, how much needs you?
      var needsYou = determined;
      var notYours = (rows.length - orient.length) - needsYou;
      var tot = (needsYou + notYours) || 1;
      Y.needs += needsYou; Y.not += notYours;
      var strong = cov.filter(function (x) {
        return x.coverage === 'implemented' || x.coverage === 'configurable'; });

      var bar = '<div class="hdsbar" title="' + notYours + ' handled without you, ' + needsYou + ' need your action">' +
        (notYours ? '<span class="seg carried" style="width:' + (notYours / tot * 100) + '%"></span>' : '') +
        (needsYou ? '<span class="seg needs" style="width:' + (needsYou / tot * 100) + '%"></span>' : '') + '</div>' +
        '<p class="hdskey"><span class="k carried"></span><b>' + notYours + '</b> handled without you' +
        (needsYou ? '<span class="k todo"></span><b>' + needsYou + '</b> need your action' : '') + '</p>' +
        '<p class="depth">Of the ' + (d.carried + d.shared + d.doc) + ' requirements the vault engages with, HDS ' +
        'delivers <b>' + d.carried + '</b> outright and supports <b>' + d.shared + '</b> more' +
        (d.doc ? ', documenting ' + d.doc : '') +
        (d.na ? '. ' + d.na + ' have no software role for anyone' : '') + '.</p>' +
        (strong.length ? '<details class="covlist"><summary>What HDS delivers for you here, ' +
          strong.length + ' requirement' + (strong.length === 1 ? '' : 's') + '</summary><ul>' +
          strong.map(function (x) {
            return '<li><a href="' + x.page + '#' + x.anchor + '"><code>' + esc(x.ref) + '</code> ' +
              esc(x.title) + '</a>' + (x.overview ? '<p>' + esc(x.overview) + '</p>' : '') + '</li>';
          }).join('') + '</ul></details>' : '');
      return '<article class="rscope"><h3><a href="' + meta.page + '">' + esc(meta.title) + '</a>' +
        '<span class="pers">your role: ' + esc(persona) + '</span></h3>' +
        bar +
        (actions.length ? '' : '<p class="nothingdue"><b>Nothing in this framework falls to you on this selection.</b> ' +
          'The requirements above are met by the vault itself.</p>') +
        '<p class="meta"><b>' + determined + '</b> of ' + oblTotal + ' requirements need action from you' +
        (hidden ? ' · ' + hidden + ' ruled out by your selections' : '') +
        (unprofiled ? ' · <span class="npf">' + unprofiled + ' not yet classified, shown in full</span>' : '') +
        (nonDuty ? ' · ' + nonDuty + ' place no duty on you' : '') +
        (meta.posture && meta.posture.backing ? ' · HDS: ' + meta.posture.backing.rows_approved + ' of ' +
          meta.posture.backing.rows_total + ' answered from approved HDS documentation, <a href="standing.html">see standing</a>' : '') + '</p>' +
        (orient.length ? '<details class="scopetest"><summary>Does this framework reach you at all?</summary><ul>' +
          orient.map(function (o) {
            return '<li><a class="ref" href="' + o.page + '#' + o.anchor + '"><code>' + esc(o.ref) + '</code> ' + esc(o.title) + '</a>' +
              (o.overview ? '<p>' + esc(o.overview) + '</p>' : '') + '</li>'; }).join('') +
          '</ul><p class="muted">Scope provisions, not duties. They say when the regime engages, so they are listed here rather than counted.</p></details>' : '') +
        (entity.length ? '<details class="entityblock"><summary>' + entity.length +
          ' duties you carry as a ' + esc(persona.replace(/-/g, ' ')) +
          ', independent of HDS</summary><ul>' + entity.map(function (o) {
            return '<li><a class="ref" href="' + o.page + '#' + o.anchor + '"><code>' + esc(o.ref) + '</code> ' +
              esc(o.title) + '</a>' + (o.overview ? '<p>' + esc(o.overview) + '</p>' : '') + '</li>';
          }).join('') + '</ul><p class="muted">These attach to you because of the role you hold. They would ' +
          'exist unchanged on any other platform, so they are listed here rather than counted as actions ' +
          'arising from HDS.</p></details>' : '') +
        '<ol class="acts">' + actions.map(function (o) {
          var cls = (o.hdsCoverage === 'implemented' || o.hdsCoverage === 'configurable') ? 'carried'
            : (o.hdsCoverage === 'facilitated' ? 'shared' : 'yours');
          var lbl = cls === 'carried' ? 'HDS already does this' : (cls === 'shared' ? 'HDS helps' : 'fully yours');
          return '<li class="act ' + cls + '">' +
            '<p class="do">' + esc(o.overview) + '</p>' +
            '<p class="src"><span class="tag ' + cls + '">' + lbl + '</span>' +
            '<a href="' + o.page + '#' + o.anchor + '">' + esc(o.scopeShort) + ' <code>' + esc(o.ref) + '</code></a> ' +
            esc(o.title) +
            (o.when === null ? ' <span class="npf">not yet classified</span>' : '') + '</p>' +
            (o.templates || []).map(function (t) {
              return '<a class="tpl" href="templates.html#tpl-' + t + '">📄 ' + t + '</a>'; }).join('') +
            '</li>'; }).join('') + '</ol></article>';
    }).join('');

    var gn = (G.carried + G.shared + G.yours) || 1;
    html += '<div class="rhead"><h2>' +
      (totActions
        ? totActions + ' of ' + (Y.needs + Y.not) + ' requirements need action from you'
        : ((Y.needs + Y.not)
            ? 'None of the ' + (Y.needs + Y.not) + ' requirements needs action from you'
            : 'Nothing here falls to you')) + '</h2>' +
      '<p class="lede">Across ' + scopes.length + ' framework' + (scopes.length > 1 ? 's' : '') + '. ' +
      (totActions
        ? 'What the vault already does, and what is left for you.'
        : 'On this selection your application never receives personal data of its own, so no duty ' +
          'attaches to you: the requirements are met by the vault. A starting point to confirm with ' +
          'counsel, not a clearance.') + '</p>' +
      ((Y.needs + Y.not) ? '<div class="gbar"><div class="hdsbar big">' +
        (Y.not ? '<span class="seg carried" style="width:' + (Y.not / (Y.needs + Y.not) * 100) + '%"></span>' : '') +
        (Y.needs ? '<span class="seg needs" style="width:' + (Y.needs / (Y.needs + Y.not) * 100) + '%"></span>' : '') + '</div>' +
        '<p class="hdskey"><span class="k carried"></span><b>' + Y.not + '</b> handled without you' +
        (Y.needs ? '<span class="k todo"></span><b>' + Y.needs + '</b> need your action' : '') + '</p></div>' : '') +
      (totUnprofiled ? '<p class="unclass"><b>' + totUnprofiled + ' requirements are not yet classified</b> ' +
        'against these options. They are listed in full rather than hidden, because an ' +
        'unclassified requirement is not the same as one that does not apply.</p>' : '') +
      (totHidden ? '<label class="showh"><input type="checkbox" id="showhidden"' + (showHidden ? ' checked' : '') + '> show the ' + totHidden + ' requirements your selections rule out</label>' : '') +
      '</div>';
    var tl = Object.keys(tpls);
    if (tl.length) {
      html += '<div class="agree"><b>Agreements you will need to sign</b><p>' + tl.map(function (t) {
        return '<a class="tpl" href="templates.html#tpl-' + t + '">📄 ' + t + '</a>'; }).join(' ') + '</p></div>';
    }
    out.innerHTML = html + sections;
  }

  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  // Fine-tune state must stay readable once the panel is closed.
  function summarise() {
    var el = document.getElementById('ftsum');
    if (!el) return;
    var set = {};
    var ap = panel.querySelector('.preset.on');
    if (ap) ap.dataset.features.split(',').filter(Boolean).forEach(function (x) { set[x] = 1; });
    panel.querySelectorAll('.s2box, .s2radio').forEach(function (i) {
      if (i.checked && !i.disabled) set[i.value] = 1;
    });
    var extra = [];
    panel.querySelectorAll('.fopt input:checked').forEach(function (i) {
      if (set[i.value] || i.value === 'us-role-none') return;
      var f = P.features.filter(function (x) { return x.id === i.value; })[0];
      if (f) extra.push(f.label.trim().replace(/\\s+/g, ' ').toLowerCase());
    });
    el.textContent = extra.length ? '\u00b7 also: ' + extra.join(', ') : '';
  }
  function reflectStep2() {
    panel.querySelectorAll('.s2box').forEach(function (box) {
      var el = panel.querySelector('.fopt input[value="' + box.value + '"]');
      var wrap = box.closest('.s2wrap');
      var choice = wrap.querySelector('.s2choice');
      if (choice) {
        var any = false;
        choice.querySelectorAll('input[type=radio]').forEach(function (r) {
          var f = panel.querySelector('.fopt input[value="' + r.value + '"]');
          if (f && f.checked) { any = true; r.checked = true; }
        });
        box.checked = any;
        choice.hidden = !any;
      } else if (el) box.checked = el.checked;
    });
  }
  panel.addEventListener('input', function (ev) {
    if (ev.target.matches('.fopt input')) reflectStep2();
  });
  panel.addEventListener('input', summarise);
  panel.addEventListener('input', render);
  out.addEventListener('input', render);
  // An archetype is a claim about what you are building, so the options it
  // implies are locked on: unticking "you store a copy" while archetype 4 is
  // selected would describe something that is not archetype 4.
  function applyLocks(locked) {
    panel.querySelectorAll('.fopt').forEach(function (l) {
      var i = l.querySelector('input');
      var isLocked = locked.indexOf(i.value) !== -1;
      i.disabled = isLocked;
      l.classList.toggle('locked', isLocked);
      var badge = l.querySelector('.lockb');
      if (isLocked && !badge) {
        var sp = document.createElement('span');
        sp.className = 'lockb'; sp.textContent = 'part of this type';
        sp.title = 'Implied by the implementer type you picked. Choose a different type, or start from the checkboxes, to change it.';
        l.querySelector('span').appendChild(sp);
      } else if (!isLocked && badge) badge.remove();
    });
  }
  // Step 2 writes into the fine-tune panel, which holds the state. A follow-up
  // appears only when the area that raises it is on, so a US-only question never
  // shows to a European implementer, and its options live in the SAME card as
  // the question rather than hanging off a separate one.
  function syncStep2() {
    panel.querySelectorAll('.s2box').forEach(function (box) {
      var el = panel.querySelector('.fopt input[value="' + box.value + '"]');
      if (el) el.checked = box.checked;
    });
    panel.querySelectorAll('.followup').forEach(function (card) {
      var on = panel.querySelector('.s2box[value="' + card.dataset.when + '"]');
      var show = !!(on && on.checked);
      card.hidden = !show;
      var picked = card.querySelector('.s2radio:checked');
      card.querySelectorAll('.s2radio').forEach(function (r) {
        r.disabled = !show;
        var f = panel.querySelector('.fopt input[value="' + r.value + '"]');
        if (f) f.checked = show && r === picked;
      });
    });
  }
  function reflectStep2() {
    panel.querySelectorAll('.s2box').forEach(function (box) {
      var el = panel.querySelector('.fopt input[value="' + box.value + '"]');
      if (el) box.checked = el.checked;
    });
    panel.querySelectorAll('.followup').forEach(function (card) {
      var on = panel.querySelector('.s2box[value="' + card.dataset.when + '"]');
      card.hidden = !(on && on.checked);
      card.querySelectorAll('.s2radio').forEach(function (r) {
        var f = panel.querySelector('.fopt input[value="' + r.value + '"]');
        if (f && f.checked) r.checked = true;
      });
    });
  }
  panel.addEventListener('change', function (ev) {
    if (!ev.target.matches('.s2box, .s2radio')) return;
    syncStep2(); summarise(); render();
  });

  panel.querySelectorAll('.preset').forEach(function (b) {
    b.addEventListener('click', function () {
      // A preset says what you BUILD. It must not touch who your users are,
      // where the data is hosted, or your HIPAA role: clearing those dropped the
      // page back to "start by saying where your users are".
      panel.querySelectorAll('.fgroup2[data-group="application"] input').forEach(function (i) {
        i.disabled = false; i.checked = false;
      });
      var feats = b.dataset.features ? b.dataset.features.split(',').filter(Boolean) : [];
      feats.forEach(function (id) {
        var el = panel.querySelector('.fopt input[value="' + id + '"]'); if (el) el.checked = true; });
      panel.querySelectorAll('.preset').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      applyLocks(b.dataset.locked ? b.dataset.locked.split(',').filter(Boolean) : []);
      summarise(); render();
    });
  });
  // Editing a checkbox by hand means you are no longer describing an archetype.
  panel.addEventListener('change', function (ev) {
    if (!ev.target.matches('.fopt input')) return;
    var active = panel.querySelector('.preset.on');
    if (!active) return;
    var locked = active.dataset.locked ? active.dataset.locked.split(',').filter(Boolean) : [];
    if (locked.indexOf(ev.target.value) === -1) return;
    active.classList.remove('on');
    applyLocks([]);
  });
  syncStep2();
  reflectStep2();
  summarise();
  render();
})();
</script>`;

fs.writeFileSync(path.join(OUT, 'implementer.html'), layout('For implementers', `
<section class="hero tight">
  <h1>What do I have to do?</h1>
  <p class="lede">Answer two questions. This tells you which rules reach you, what the vault
  already covers, and what is left for you. ${groups.length} frameworks, ${totalReqs} requirements.
  For HDS's own position, see <a href="standing.html">where HDS stands</a>.</p>
</section>
${profilePanel}
${profileJS}
`, { active: 'implementer' }));

// ---- per-scope pages (with client-side filter) ----
// The persona checkboxes are derived from the personas actually present in the
// scope. They used to be a hardcoded HIPAA list, which meant the GDPR, nLPD and
// SOC 2 pages filtered every row out and rendered "0 / 47": none of those
// scopes uses a HIPAA persona name.
const filterBarFor = (reqs) => {
  const personas = [...new Set(reqs.flatMap((r) => (r.implementer || []).map((o) => o.persona)))].sort();
  return `
<div class="filters">
  <input type="search" id="q" placeholder="Search requirements…" aria-label="search">
  <span class="fgroup" id="cov">
    ${COVERAGES.map((c) => `<label><input type="checkbox" value="${c}" checked> <span class="b ${c}">${c}</span></label>`).join('')}
  </span>
  <span class="fgroup" id="persona">
    ${personas.map((p) => `<label><input type="checkbox" value="${esc(p)}" checked> ${esc(p)}</label>`).join('')}
  </span>
  <label class="fgroup"><input type="checkbox" id="fplan"> <span class="pl low">⏳ planned only</span></label>
  <span class="fcount" id="fcount"></span>
</div>`;
};

const filterJS = `<script>
(function(){
  const q=document.getElementById('q'),cards=[...document.querySelectorAll('.req')],fc=document.getElementById('fcount'),fp=document.getElementById('fplan');
  const covs=()=>[...document.querySelectorAll('#cov input:checked')].map(i=>i.value);
  const pers=()=>[...document.querySelectorAll('#persona input:checked')].map(i=>i.value);
  function apply(){const t=q.value.toLowerCase(),cv=covs(),pr=pers();let n=0;
    cards.forEach(c=>{const okc=cv.includes(c.dataset.coverage||'');
      const cp=(c.dataset.personas||'').split(' ').filter(Boolean);
      const okp=cp.length===0||cp.some(p=>pr.includes(p));
      const okt=!t||(c.dataset.text||'').includes(t);
      const okpl=!fp.checked||c.dataset.planned==='1';
      const show=okc&&okp&&okt&&okpl;c.style.display=show?'':'none';if(show)n++;});
    fc.textContent=n+' / '+cards.length;}
  document.querySelector('.filters').addEventListener('input',apply);apply();
})();
</script>`;

for (const g of groups) {
  const sections = g.members.map((s) => {
    const pryv = pryvByScope.get(s.layered_on_pryv) || new Map();
    const cards = (s.requirements || []).map((r) => requirementCard(r, pryv.get(r.pryv_ref) || {})).join('');
    const head = g.isFamily
      ? `<h2 class="rulehead" id="${esc(s.id)}">${esc(s.short || s.title)}
           <span class="short">${esc(s.version)}</span></h2>
         ${covBar(s.requirements || [])}`
      : '';
    return head + `<div class="reqs">${cards}</div>`;
  }).join('');

  // A family page carries the posture of each sub-rule up top, so the standing
  // question is answerable without going back to the landing page.
  const postureBlocks = posturesOf(g).map(({ scope, posture }) => `
    <div class="pstrip">
      <div class="pshead">${g.isFamily ? `<b>${esc(scope.short || scope.id)}</b>` : ''}
        ${assurancePill(posture.external_assurance?.level)}</div>
      <div class="roles">${roleRows(posture)}</div>
      <p class="stmt">${esc(posture.statement)}</p>
      ${posture.no_role_note
? `<p class="notproc"><b>HDS holds no role here, by design.</b>
        ${esc(posture.no_role_note)}</p>`
: ''}
    </div>`).join('');

  const subnav = g.isFamily
    ? `<nav class="subnav">${g.members.map((s) =>
        `<a href="#${esc(s.id)}">${esc(s.short || s.id)} <span class="n">${(s.requirements || []).length}</span></a>`).join('')}</nav>`
    : '';

  fs.writeFileSync(path.join(OUT, g.page), layout(g.short, `
    <a class="back" href="standing.html">← HDS standing</a> ·
    <a class="back" href="implementer.html">implementer view</a>
    <h1>${esc(g.title)} ${g.isFamily ? '' : `<span class="short">${esc(g.short)}</span>`}</h1>
    <p class="meta">${esc(g.jurisdiction || '')} ${regions(regionsOf(g))}
      ${g.isFamily ? '' : `· ${esc(g.members[0].type)} · ${esc(g.members[0].version)}`}
      ${g.canonical_url ? `· <a href="${esc(g.canonical_url)}">official text</a>` : ''}</p>
    ${g.blurb ? `<p class="lede">${esc(g.blurb)}</p>` : ''}
    <details class="standing-inline" open>
      <summary>How HDS itself stands against ${esc(g.short)}</summary>
      ${postureBlocks}
    </details>
    ${subnav}
    ${g.isFamily ? '' : covBar(allReqs(g))}
    ${filterBarFor(allReqs(g))}
    ${sections}
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
  <a class="back" href="implementer.html">← Implementer view</a>
  <h1>Agreement templates</h1>
  <p class="lede">Fill-in templates implementers use to meet their obligations.
  Review with counsel before use.</p>
  <div class="reqs">${tplCards}</div>
`, { active: 'templates' }));

// ---- retired per-scope page redirects ----
// Grouping the HIPAA rules into one page retires hipaa-security.html,
// hipaa-privacy.html and hipaa-breach.html. Those URLs are published and are
// deep-linked by requirement anchor from the private document set, so each
// keeps a stub that forwards to the family page preserving the #fragment.
for (const g of groups.filter((x) => x.isFamily)) {
  for (const s of g.members) {
    fs.writeFileSync(path.join(OUT, `${s.id}.html`),
`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<link rel="canonical" href="/${g.page}#${esc(s.id)}">
<title>${esc(s.short || s.id)} — moved</title>
<script>
// Preserve the requirement anchor: /hipaa-security.html#req-164-312-a-2-iv
// becomes /hipaa.html#req-164-312-a-2-iv, and a bare visit lands on the section.
location.replace('${g.page}' + (location.hash || '#${s.id}'));
</script>
</head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1.25rem;line-height:1.6">
<p>The ${esc(s.short || s.id)} rows are now part of the combined
<a href="${g.page}#${esc(s.id)}">${esc(g.title)}</a> page.</p>
</body></html>
`);
  }
  console.log(`[OK]   wrote ${g.members.length} redirect stub(s) for retired ${g.key} scope pages`);
}

// ---- external-law redirect stubs (indirection layer) ----
// Reads official-refs.yml (repo root) and emits one stub per citation at
// /ref/<scope>/<slug>.html that forwards to the official text. Documents link
// to these stubs, so an official URL move is a one-file edit here, not a sweep.
const refSlug = (ref) =>
  ref.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const refsFile = path.join(ROOT, 'official-refs.yml');
if (fs.existsSync(refsFile)) {
  const { refs: refMap = {} } = loadYaml(refsFile) || {};
  let n = 0;
  for (const [key, entry] of Object.entries(refMap)) {
    const dot = key.indexOf('.');
    const scope = key.slice(0, dot);
    const ref = key.slice(dot + 1);
    const dir = path.join(OUT, 'ref', scope);
    fs.mkdirSync(dir, { recursive: true });
    const url = entry.url;
    const label = entry.label || key;
    const source = entry.source || 'official source';
    fs.writeFileSync(path.join(dir, `${refSlug(ref)}.html`),
`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0; url=${esc(url)}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${esc(url)}">
<title>${esc(label)} — official text</title>
</head><body style="font-family:system-ui,-apple-system,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1.25rem;line-height:1.6;color:#111827;">
<p>Redirecting to the official text of <strong>${esc(label)}</strong>…</p>
<p>If you are not redirected automatically, open it here:<br><a href="${esc(url)}">${esc(url)}</a></p>
<p style="color:#6b7280;font-size:.85rem;margin-top:2rem;">Source: ${esc(source)}. This is a stable HDS redirect: the official location can be updated centrally in <code>official-refs.yml</code> without changing any citing document.</p>
</body></html>
`);
    n++;
  }
  console.log(`[OK]   wrote ${n} external-law redirect stub(s) under ref/`);
}

// ---- styles + CNAME + robots ----
fs.writeFileSync(path.join(OUT, 'styles.css'), STYLES());
fs.writeFileSync(path.join(OUT, 'CNAME'), DOMAIN + '\n');
fs.writeFileSync(path.join(OUT, 'robots.txt'), ROBOTS());

console.log(`[OK]   site → dist/site/ (${groups.length} regulation pages + standing index + implementer + templates)`);

// robots.txt — this host is the canonical home of the HDS Compliance Matrix,
// so it must be indexable. AI assistants and answer engines are explicitly
// welcome: being read and cited by them serves the foundation's advocacy goal.
function ROBOTS () {
  const bots = [
    'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User',
    'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended',
    'Applebot-Extended', 'CCBot', 'cohere-ai', 'Bytespider', 'Amazonbot',
    'meta-externalagent',
  ];
  return [
    'User-agent: *',
    'Disallow:',
    '',
    '# AI assistants & answer engines — explicitly welcome.',
    '# Health Data Safe is a mission-driven non-profit: being read, cited, and',
    '# learned from by AI serves our advocacy goal.',
    '# This host is the canonical home of the HDS Compliance Matrix.',
    '# These crawlers may access the whole site, for both citation/search and',
    '# model training.',
    ...bots.map((b) => `User-agent: ${b}`),
    'Disallow:',
    '',
  ].join('\n');
}

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
.pl{font-size:.62rem;padding:.1rem .45rem;border-radius:999px;vertical-align:middle;text-decoration:none;display:inline-block;white-space:nowrap;cursor:default}
a.pl{cursor:pointer}
.pl.high{background:#fee2e2;color:#b91c1c}.pl.medium{background:#fef3c7;color:#b45309}.pl.low{background:#e0f2fe;color:#0369a1}
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
.covers code{margin-right:.3rem}.muted{color:var(--muted)}
/* ---- HDS standing page ---- */
.honesty{background:#fff;border:1px solid var(--line);border-left:4px solid #b45309;border-radius:.6rem;padding:.9rem 1.1rem;margin:1.2rem 0;max-width:56rem}
.honesty h2{font-size:.78rem;text-transform:uppercase;letter-spacing:.05em;color:#b45309;margin:0 0 .5rem}
.honesty ul{margin:0;padding-left:1.1rem}.honesty li{font-size:.88rem;margin:.3rem 0}
.postures{display:grid;grid-template-columns:repeat(auto-fill,minmax(27rem,1fr));gap:1rem;margin-top:1.2rem}
.pcard{background:#fff;border:1px solid var(--line);border-radius:.6rem;padding:1rem 1.1rem;display:flex;flex-direction:column}
.pcard header h3{margin:.1rem 0;font-size:1.1rem}.pcard header h3 a{text-decoration:none}
.backing{margin:.8rem 0 .2rem;padding:.7rem .8rem;background:#f8fafc;border:1px solid var(--line);border-radius:.5rem}
.bknum{font-size:1.35rem;font-weight:700;color:#15803d;line-height:1.1}
.bklab{margin:.15rem 0 .5rem;font-size:.82rem;color:#374151}
.bkbar{display:flex;height:7px;border-radius:999px;overflow:hidden;background:#e5e7eb}
.bkbar .seg.ok{background:#15803d}.bkbar .seg.mid{background:#a7c4a0}
.pfoot{margin-top:auto;padding-top:.7rem;border-top:1px solid var(--line)}
.pager{display:flex;gap:.6rem;justify-content:space-between;align-items:stretch;margin:1rem 0}
.pager .pg{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:.1rem;background:#fff;border:1px solid var(--line);border-radius:.5rem;padding:.5rem .8rem;text-decoration:none;color:inherit}
.pager .pg:hover{border-color:#1d4ed8}
.pager .pg span{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.pager .pg b{font-size:.86rem;color:#1d4ed8}
.pager .pg.next{text-align:right}
.pager .pg.prev b::before{content:'← '}
.pager .pg.next b::after{content:' →'}
.pager .pgspacer{flex:1 1 0}
main>.pager:last-child{margin-top:2rem}
.covkey{display:flex;gap:.5rem;flex-wrap:wrap;margin:.9rem 0 .3rem}
.covnote{font-size:.8rem;max-width:56rem;margin:.2rem 0 0}
.method.lead{border-top:0;padding-top:0;margin-top:1.2rem}
.method{max-width:56rem;margin:2.5rem 0 0;padding-top:1.2rem;border-top:1px solid var(--line)}
.method .threelayer{margin:.6rem 0}
.method h2{font-size:.95rem}.method p{font-size:.85rem;color:#4b5563;max-width:52rem}
/* ---- implementer profile panel ---- */
.profile{margin:1.2rem 0 1rem}
.hero.tight{margin-bottom:.5rem}
.steps{list-style:none;padding:0;margin:0;display:grid;gap:1rem}
.step h2{font-size:1rem;margin:0 0 .6rem;display:flex;align-items:center;gap:.5rem}
.step .num{display:inline-flex;align-items:center;justify-content:center;width:1.5rem;height:1.5rem;border-radius:999px;background:var(--ink);color:#fff;font-size:.8rem;flex:none}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:.6rem}
.s2grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(19rem,1fr));gap:.7rem;align-items:start}
.s2card{background:#fff;border:1px solid var(--line);border-radius:.5rem;padding:.8rem .9rem}
.s2hint{font-size:.78rem;color:var(--muted);margin:0 0 .5rem}
.arealist{display:flex;flex-direction:column}
.area{display:flex;gap:.55rem;align-items:center;padding:.45rem .2rem;border-top:1px solid var(--line);cursor:pointer}
.area:first-child{border-top:0}
.area input{flex:none;margin:0}
.area .al{font-size:.88rem;font-weight:500}
.area .gives{margin-left:auto;font-size:.68rem;color:var(--muted);background:#f1f5f9;border-radius:999px;padding:.1rem .45rem;white-space:nowrap}
.area:has(input:checked) .al{color:#1d4ed8}
.area:has(input:checked) .gives{background:#dbeafe;color:#1d4ed8}
.followup{border-color:#bfdbfe;background:#f8fbff}
.futitle{font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:#1d4ed8;margin:0 0 .2rem;font-weight:700}
.fuq{font-size:.86rem;font-weight:600;margin:0 0 .5rem}
.fuopts{display:flex;flex-direction:column;gap:.35rem}
.fuopt{display:flex;gap:.5rem;align-items:flex-start;font-size:.83rem;cursor:pointer}
.fuopt input{flex:none;margin-top:.15rem}
.fuopt em{display:block;font-style:normal;font-size:.75rem;color:var(--muted);margin-top:.1rem}
.funote{font-size:.75rem;color:var(--muted);margin:.6rem 0 0;padding-top:.5rem;border-top:1px dashed #bfdbfe}
.preset{text-align:left;background:#fff;border:1px solid var(--line);border-radius:.5rem;padding:.7rem .8rem;cursor:pointer;font:inherit;color:inherit;transition:border-color .12s,box-shadow .12s}
.preset:hover{border-color:#1d4ed8}
.preset.on{border-color:#1d4ed8;background:#eff6ff;box-shadow:0 0 0 1px #1d4ed8 inset}
.preset b{display:block;font-size:.9rem;margin-bottom:.2rem}
.preset span{font-size:.78rem;color:var(--muted);display:block;line-height:1.4}
.finetune{margin:1rem 0 0;background:#fff;border:1px solid var(--line);border-radius:.5rem;padding:.6rem .9rem}
.finetune>summary{cursor:pointer;font-size:.85rem;font-weight:600}
.ftsum{font-weight:400;color:var(--muted);font-size:.8rem}
.finetune .hint{font-size:.78rem;color:var(--muted);margin:.5rem 0 .2rem}
.fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(16rem,1fr));gap:.9rem;margin-top:.6rem}
.fgroup2{border:1px solid var(--line);border-radius:.5rem;padding:.6rem .8rem;margin:0}
.fgroup2 legend{font-size:.74rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);padding:0 .3rem}
.fgroup2 .hint{font-size:.76rem;color:var(--muted);margin:.1rem 0 .5rem}
.fopt{display:flex;gap:.45rem;align-items:flex-start;font-size:.83rem;margin:.35rem 0;cursor:pointer}
.fopt input{margin-top:.2rem;flex:none}
.fopt .note{display:block;font-style:normal;font-size:.76rem;color:var(--muted);margin-top:.15rem}
.hipaarole{margin-top:.9rem;padding-top:.7rem;border-top:1px dashed var(--line);font-size:.84rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap}
.hipaarole label{display:inline-flex;gap:.3rem;align-items:center;cursor:pointer}
.result{margin-bottom:2rem}
.rhead{margin:1.2rem 0 .6rem}.rhead h2{font-size:1.25rem;margin:0}
.scopetest{margin:.6rem 0;font-size:.84rem}
.scopetest>summary{cursor:pointer;color:var(--muted);font-size:.8rem}
.scopetest ul{margin:.5rem 0;padding-left:1.1rem}
.scopetest li{margin:.4rem 0}
.scopetest p{margin:.2rem 0;font-size:.82rem;color:#4b5563}
.unclass{font-size:.82rem;color:#4b5563;background:#f8fafc;border:1px solid var(--line);border-left:3px solid #9ca3af;border-radius:.4rem;padding:.5rem .7rem;margin:.5rem 0;max-width:52rem}
.showh{display:inline-flex;gap:.35rem;align-items:center;font-size:.8rem;color:var(--muted);margin-top:.4rem;cursor:pointer}
.empty,.uncov{background:#fff;border:1px solid var(--line);border-radius:.6rem;padding:.9rem 1.1rem;margin:1rem 0}
.uncov{border-left:4px solid #b45309}.uncov b{color:#b45309}
.empty p,.uncov p{margin:.3rem 0 0;font-size:.85rem;color:#4b5563}
.agree{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:.6rem;padding:.7rem 1rem;margin:.8rem 0}
.agree b{font-size:.86rem}.agree p{margin:.35rem 0 0}
.rscope{background:#fff;border:1px solid var(--line);border-radius:.6rem;padding:1rem 1.1rem;margin:1rem 0}
.rscope h3{margin:0 0 .2rem;font-size:1rem;display:flex;gap:.6rem;align-items:baseline;flex-wrap:wrap}
.rscope h3 a{text-decoration:none}
.pers{font-size:.72rem;font-weight:400;color:#1d4ed8;background:#eff6ff;padding:.05rem .4rem;border-radius:.25rem}
.obl{list-style:none;padding:0;margin:.7rem 0 0}
.obl li{border-top:1px solid var(--line);padding:.6rem 0}
.obl li:first-child{border-top:0}
.obl .ref{text-decoration:none;font-size:.88rem;font-weight:600;display:block}
.obl p{margin:.25rem 0 .3rem;font-size:.83rem;color:#4b5563;white-space:pre-line}
.npf{font-size:.66rem;background:#f3f4f6;color:#6b7280;padding:.05rem .35rem;border-radius:999px;white-space:nowrap}
.allh{font-size:1rem;margin:2rem 0 .3rem;padding-top:1.2rem;border-top:1px solid var(--line)}
/* ---- HDS coverage bars ---- */
.hdsbar{display:flex;height:9px;border-radius:999px;overflow:hidden;background:#e5e7eb;margin:.5rem 0 .3rem}
.hdsbar.big{height:14px;margin:.7rem 0 .4rem}
.hdsbar .seg{flex:none}
.hdsbar .seg.carried{background:#15803d}.hdsbar .seg.shared{background:#ca8a04}.hdsbar .seg.yours{background:#94a3b8}
.hdsbar .seg.needs{background:#ca8a04}
.hdskey{font-size:.78rem;color:#4b5563;margin:.2rem 0 .5rem;display:flex;gap:.35rem;align-items:center;flex-wrap:wrap}
.hdskey .k{width:.55rem;height:.55rem;border-radius:2px;display:inline-block;margin-left:.7rem}
.hdskey .k:first-child{margin-left:0}
.hdskey .k.carried{background:#15803d}.hdskey .k.shared{background:#ca8a04}.hdskey .k.yours{background:#94a3b8}
.hdskey .k.todo{background:#ca8a04}
.gbar{margin:.6rem 0 .2rem;max-width:46rem}
.depth{font-size:.8rem;color:#4b5563;margin:.1rem 0 .4rem}
.covlist{margin:.3rem 0 .6rem;font-size:.84rem}
.covlist>summary{cursor:pointer;color:#15803d;font-weight:600;font-size:.82rem}
.covlist ul{margin:.5rem 0;padding-left:1.1rem}
.covlist li{margin:.5rem 0}
.covlist li a{text-decoration:none;font-weight:600}
.covlist li p{margin:.15rem 0 0;color:#4b5563;font-size:.82rem}
.nothingdue{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:.45rem;padding:.55rem .7rem;margin:.5rem 0;font-size:.85rem;color:#374151}
.nothingdue b{color:#15803d}
.pers.none{background:#f3f4f6;color:#6b7280}
.entityblock{margin:.6rem 0;font-size:.84rem}
.entityblock>summary{cursor:pointer;color:#4b5563;font-weight:600;font-size:.82rem}
.entityblock ul{margin:.5rem 0;padding-left:1.1rem}
.entityblock li{margin:.45rem 0}
.entityblock li a{text-decoration:none;font-weight:600}
.entityblock li p{margin:.15rem 0 0;color:#4b5563}
.norole .nothingdue{background:#f8fafc;border-color:var(--line)}
.norole .nothingdue b{color:#374151}
/* ---- action list ---- */
.acts{list-style:none;counter-reset:a;padding:0;margin:.8rem 0 0}
.act{counter-increment:a;border-top:1px solid var(--line);padding:.7rem 0 .7rem 2rem;position:relative}
.act:first-child{border-top:0}
.act::before{content:counter(a);position:absolute;left:0;top:.75rem;width:1.4rem;height:1.4rem;border-radius:999px;background:#f1f5f9;color:#475569;font-size:.72rem;font-weight:700;display:flex;align-items:center;justify-content:center}
.act.carried::before{background:#dcfce7;color:#15803d}
.act.shared::before{background:#fef9c3;color:#a16207}
.act .do{margin:0 0 .3rem;font-size:.92rem;color:#111827;white-space:pre-line;font-weight:500}
.act .src{margin:0;font-size:.76rem;color:var(--muted)}
.act .src a{text-decoration:none}
.tag{display:inline-block;font-size:.64rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;padding:.05rem .35rem;border-radius:.25rem;margin-right:.4rem}
.tag.carried{background:#dcfce7;color:#15803d}.tag.shared{background:#fef9c3;color:#a16207}.tag.yours{background:#f1f5f9;color:#475569}
/* ---- locked options ---- */
.fopt.locked{opacity:.85}
.fopt.locked input{cursor:not-allowed}
.lockb{display:inline-block;font-size:.62rem;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:999px;padding:.02rem .4rem;margin-left:.4rem;white-space:nowrap;vertical-align:middle}
.as{display:inline-block;padding:.1rem .45rem;border-radius:.25rem;font-size:.68rem;font-weight:600;letter-spacing:.01em;color:#6b7280;background:#f3f4f6;border:1px solid var(--line)}
.as-independent-readiness-review{background:#e0f2fe;color:#0369a1}
.as-third-party-attested,.as-certified{background:#dcfce7;color:#15803d}
.as-unknown{background:#f3f4f6;color:#6b7280}
.pbody{margin-top:.7rem}
.subrule{font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:.8rem 0 .3rem;border-top:1px dashed var(--line);padding-top:.6rem}
.roles{margin:.4rem 0}
.rolerow{display:grid;grid-template-columns:auto auto;gap:.3rem .5rem;align-items:center;margin:.45rem 0}
.rolerow p{grid-column:1/-1;margin:.1rem 0 0;font-size:.8rem;color:#4b5563}
.arr{font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.rl{font-size:.72rem;font-weight:700;padding:.05rem .4rem;border-radius:.25rem;background:#eff6ff;color:#1d4ed8;justify-self:start}
.rl-not-applicable{background:#f3f4f6;color:#6b7280}
.rl-controller,.rl-covered-entity{background:#f0fdf4;color:#15803d}
.stmt{font-size:.86rem;color:#374151;margin:.5rem 0}
.notproc{font-size:.82rem;color:#374151;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:.45rem;padding:.55rem .7rem;margin:.5rem 0}
.notproc b{display:block;margin-bottom:.2rem;color:#15803d}
.revbar{display:flex;height:6px;border-radius:999px;overflow:hidden;background:#e5e7eb;margin:.6rem 0 .25rem}
.revbar .seg.rev{background:#15803d}
.revnum{font-size:.78rem;color:var(--muted);margin:0 0 .5rem}
.gaps,.inh{font-size:.84rem;margin-top:.45rem}
.gaps summary{cursor:pointer;color:#6b7280;font-weight:500;font-size:.8rem}
.inh summary{cursor:pointer;color:var(--muted)}
.gaps ul,.inh ul{margin:.5rem 0;padding-left:1.1rem}
.gaps li,.inh li{margin:.4rem 0;font-size:.84rem}
.sev{display:inline-block;font-size:.62rem;font-weight:700;text-transform:uppercase;padding:.05rem .35rem;border-radius:999px;margin-right:.25rem}
.sev-high{background:#fee2e2;color:#b91c1c}.sev-medium{background:#fef3c7;color:#b45309}.sev-low{background:#e0f2fe;color:#0369a1}
.more{padding-top:.7rem;font-size:.84rem;text-decoration:none;display:inline-block}
/* ---- family / scope page ---- */
.standing-inline{background:#fff;border:1px solid var(--line);border-radius:.6rem;padding:.7rem 1rem;margin:1rem 0}
.standing-inline>summary{cursor:pointer;font-weight:700;font-size:.9rem}
.pstrip{border-top:1px dashed var(--line);padding-top:.7rem;margin-top:.7rem}
.pstrip:first-of-type{border-top:0}
.pshead{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
.subnav{display:flex;gap:.5rem;flex-wrap:wrap;margin:.8rem 0}
.subnav a{background:#fff;border:1px solid var(--line);border-radius:999px;padding:.25rem .7rem;font-size:.82rem;text-decoration:none}
.subnav a:hover{border-color:#1d4ed8}
.subnav .n{color:var(--muted);font-size:.75rem}
.rulehead{font-size:1.1rem;margin:2rem 0 .3rem;padding-top:1rem;border-top:2px solid var(--line);scroll-margin-top:7rem}`;
}
