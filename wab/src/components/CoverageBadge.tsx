import type { Coverage, EffortSaved, FacilitationMode, PlannedChange, PlannedKind } from '../db';

const COVERAGE_LABELS: Record<Coverage, string> = {
  implemented: 'Implemented',
  configurable: 'Configurable',
  facilitated: 'Facilitated',
  documented: 'Documented',
  'out-of-scope': 'Out of scope'
};

/** Verb form used by the per-requirement Coverage column. */
const COVERAGE_VERBS: Record<Coverage, string> = {
  implemented: 'Implements',
  configurable: 'Configurable',
  facilitated: 'Facilitates',
  documented: 'Documents',
  'out-of-scope': 'Out of scope'
};

const EFFORT_DOTS: Record<EffortSaved, number> = {
  high: 3,
  medium: 2,
  low: 1
};

const EFFORT_LABELS_FULL: Record<EffortSaved, string> = {
  high: 'Engineering + operational effort: HDS carries most (legal / editorial / process work not counted)',
  medium: 'Engineering + operational effort: roughly shared between HDS and implementer',
  low: 'Engineering + operational effort: implementer carries most; HDS contributes a small technical substrate'
};

const MODE_LABELS: Record<FacilitationMode, string> = {
  primitive: 'Primitive',
  evidence: 'Evidence',
  storage: 'Storage',
  infrastructure: 'Infrastructure',
  awareness: 'Awareness',
  operations: 'Operations'
};

const MODE_LABELS_FULL: Record<FacilitationMode, string> = {
  primitive: 'The platform\'s access/permissions enforce the obligation',
  evidence: 'The audit log / platform artefacts feed the implementer\'s evidence',
  storage: 'HDS stores text/records the implementer creates',
  infrastructure: 'HDS runs the technical layer (TLS, HA, encryption)',
  awareness: 'Framing row; HDS contributes minimally',
  operations: 'HDS-as-operator runs the process (monitoring, backups, deploys)'
};

/**
 * Per-requirement Coverage cell. Verb-first reading: how HDS addresses
 * the obligation + a 3-dot meter for HDS's effort share.
 *
 *   Implements             ●●●
 *   Configurable           ●●○
 *   Facilitates · Storage  ●●○
 *   Documents              ●○○
 *   Out of scope               (no meter — definitional)
 */
export function RequirementBadge ({
  coverage,
  mode,
  effort
}: {
  coverage: Coverage;
  mode: FacilitationMode | null;
  effort: EffortSaved | null;
}) {
  const verb = COVERAGE_VERBS[coverage];
  const modeSuffix = (coverage === 'facilitated' && mode) ? MODE_LABELS[mode] : null;

  const titleParts: string[] = [COVERAGE_LABELS[coverage]];
  if (mode) titleParts.push(`${MODE_LABELS[mode]} — ${MODE_LABELS_FULL[mode]}`);
  if (effort) titleParts.push(EFFORT_LABELS_FULL[effort]);
  const title = titleParts.join(' · ');

  const isOOS = coverage === 'out-of-scope';
  const verbClass = isOOS ? 'text-slate-400 italic' : 'text-slate-700 font-medium';

  return (
    <span className='inline-flex items-center gap-2 text-xs whitespace-nowrap' title={title}>
      <span className={verbClass}>
        {verb}
        {modeSuffix && <span className='text-slate-500 font-normal'> · {modeSuffix}</span>}
      </span>
      {effort && <DotMeter level={EFFORT_DOTS[effort]} />}
    </span>
  );
}

/** 3-dot meter: filled dots = HDS's share of effort (3=high, 2=med, 1=low). */
function DotMeter ({ level }: { level: number }) {
  return (
    <span className='inline-flex items-center gap-0.5' aria-label={`HDS effort: ${level}/3`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`inline-block w-1.5 h-1.5 rounded-full ${i <= level ? 'bg-teal-600' : 'bg-slate-300'}`}
        />
      ))}
    </span>
  );
}

/** Coverage-only badge (used by the scope-page histogram). */
export function CoverageBadge ({ coverage }: { coverage: Coverage }) {
  return (
    <span className={`cov-${coverage} inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap`}>
      {COVERAGE_LABELS[coverage]}
    </span>
  );
}

export function DraftBadge () {
  return <span className='draft-badge ml-2'>draft</span>;
}

const PLANNED_KIND_LABELS: Record<PlannedKind, string> = {
  feature: 'PLANNED',
  doc: 'DOC PENDING',
  procedure: 'PROC PENDING',
  platform: 'PLATFORM'
};

/**
 * Compact chip that flags a row as depending on queued HDS-side work,
 * each entry backed by evidence of pending delivery:
 *   - feature   → indigo  (capability queued for delivery)
 *   - doc       → amber   (internal document drafted, moving through review/approval)
 *   - procedure → amber   (operational procedure being stood up)
 *
 * `impact` controls intensity (high = filled bold, low = outlined). Tooltip
 * surfaces the summary + impact + the delivery evidence (internal doc code
 * and/or public tracker).
 */
export function PlannedBadge ({ change }: { change: PlannedChange }) {
  const labelKind = PLANNED_KIND_LABELS[change.kind];
  const impact = change.impact ?? 'medium';
  const titleParts = [
    `${labelKind} (${impact} impact): ${change.summary}`
  ];
  if (change.internal_doc) titleParts.push(`Internal doc: 🔒 ${change.internal_doc} (on request)`);
  if (change.upstream_proposal) titleParts.push(`Upstream: ${change.upstream_proposal}`);
  if (change.eta) titleParts.push(`ETA: ${change.eta}`);
  if (change.tracking_url) titleParts.push(`Tracker: ${change.tracking_url}`);

  const className = `planned-${change.kind} planned-impact-${impact} inline-block px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap`;
  const content = (
    <>
      ⏳ {labelKind}
      {change.impact && <span className='ml-1 opacity-80'>· {change.impact}</span>}
    </>
  );

  // When `tracking_url` is populated (public GitHub issue / project link),
  // render as a clickable anchor so the operator can jump to the tracker.
  if (change.tracking_url) {
    return (
      <a
        href={change.tracking_url}
        target='_blank'
        rel='noopener noreferrer'
        className={`${className} hover:opacity-90 hover:underline`}
        title={titleParts.join('\n')}
      >
        {content}
      </a>
    );
  }

  return (
    <span
      className={className}
      title={titleParts.join('\n')}
    >
      {content}
    </span>
  );
}
