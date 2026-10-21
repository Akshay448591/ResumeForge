import {
  CATEGORIES,
  CATEGORY_LABELS,
  IMPORTANCE,
  type Comparison,
  type KeywordMatch,
  type Tally,
} from '../../types/tailor';
import { Highlight } from './Highlight';

const STATUS = {
  matched: {
    label: 'Matched',
    badge: 'bg-emerald-100 text-emerald-800',
    blurb: 'Shown in your resume',
  },
  partial: {
    label: 'Partly shown',
    badge: 'bg-amber-100 text-amber-900',
    blurb: 'Weak or indirect support',
  },
  missing: {
    label: 'Not found',
    badge: 'bg-red-100 text-red-800',
    blurb: 'No support in your resume',
  },
} as const;

const KIND = {
  demonstrated: 'Shown in your work',
  listed: 'Listed only',
  related: 'Similar wording',
} as const;

function TallyRow({ label, t }: { label: string; t: Tally }) {
  if (!t.total) return null;
  return (
    <tr className="border-t border-slate-100">
      <th scope="row" className="py-1 pr-3 text-left font-normal">
        {label}
      </th>
      <td className="px-2 text-emerald-800">{t.matched}</td>
      <td className="px-2 text-amber-800">{t.partial}</td>
      <td className="px-2 text-red-800">{t.missing}</td>
      <td className="pl-2 text-slate-600">{t.total}</td>
    </tr>
  );
}

function MatchCard({ m }: { m: KeywordMatch }) {
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{m.term}</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
          {m.importance}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
          {CATEGORY_LABELS[m.category]}
        </span>
        {m.source === 'ai' && (
          <span className="rounded bg-cobalt-soft px-1.5 py-0.5 text-xs text-cobalt-dark">
            AI read
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-700">{m.reasoning}</p>
      {m.evidence.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {m.evidence.map((e) => (
            <li key={e.lineId + e.text} className="rounded bg-slate-50 p-2 text-xs">
              <p className="text-slate-600">
                {e.section} · {e.label} · <span className="font-medium">{KIND[e.kind]}</span>
              </p>
              <blockquote className="mt-0.5 border-l-2 border-slate-200 pl-2 text-sm text-ink">
                <Highlight text={e.text} term={m.term} />
              </blockquote>
            </li>
          ))}
        </ul>
      )}
      {m.status === 'missing' && (
        <p className="mt-2 text-xs text-slate-600">
          Only add this to your resume if it’s true. Nothing is added for you.
        </p>
      )}
    </li>
  );
}

/** Matched, partly shown and missing, with the resume text behind each verdict. There is no single score on purpose. */
export function ComparisonView({ comparison }: { comparison: Comparison }) {
  const { byStatus } = comparison;
  return (
    <div className="space-y-4">
      {comparison.warnings.map((w) => (
        <p
          key={w}
          role="status"
          className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {w}
        </p>
      ))}

      <div className="grid grid-cols-3 gap-2 text-center">
        {(['matched', 'partial', 'missing'] as const).map((s) => (
          <div key={s} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-2xl font-semibold tracking-tight">{byStatus[s]}</p>
            <p
              className={`mx-auto mt-1 w-fit rounded px-1.5 py-0.5 text-xs font-medium ${STATUS[s].badge}`}
            >
              {STATUS[s].label}
            </p>
          </div>
        ))}
      </div>

      <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm" open>
        <summary className="cursor-pointer font-medium">Breakdown by importance and type</summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-600">
              <th scope="col" className="py-1 font-normal">
                Group
              </th>
              <th scope="col" className="px-2 font-normal">
                Matched
              </th>
              <th scope="col" className="px-2 font-normal">
                Partly
              </th>
              <th scope="col" className="px-2 font-normal">
                Missing
              </th>
              <th scope="col" className="pl-2 font-normal">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {IMPORTANCE.map((i) => (
              <TallyRow
                key={i}
                label={`${i[0].toUpperCase()}${i.slice(1)} items`}
                t={comparison.byImportance[i]}
              />
            ))}
            {CATEGORIES.map((c) => (
              <TallyRow key={c} label={CATEGORY_LABELS[c]} t={comparison.byCategory[c]} />
            ))}
          </tbody>
        </table>
      </details>

      {(['missing', 'partial', 'matched'] as const).map((s) => {
        const list = comparison.matches.filter((m) => m.status === s);
        if (!list.length) return null;
        return (
          <section key={s} aria-label={STATUS[s].label}>
            <h4 className="mb-1.5 text-sm font-semibold">
              {STATUS[s].label}{' '}
              <span className="font-normal text-slate-600">
                ({list.length}) · {STATUS[s].blurb}
              </span>
            </h4>
            <ul className="space-y-2">
              {list.map((m) => (
                <MatchCard key={m.keywordId} m={m} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
