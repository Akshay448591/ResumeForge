import { useMutation } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { formatRelative } from '../../lib/validation';
import { useToast } from '../../store';
import type { Report, Tailoring } from '../../types/tailor';
import { Highlight } from './Highlight';

const ICON = { pass: '✓', warn: '⚠', info: 'ℹ' } as const;
const TONE = { pass: 'text-emerald-700', warn: 'text-amber-700', info: 'text-slate-600' } as const;

interface Props {
  resumeId: string;
  report: Report | null;
  history: Tailoring['reportHistory'];
  ensureSaved: () => Promise<boolean>;
  onReport: (r: { report: Report; history: Tailoring['reportHistory'] }) => void;
}

/** The tailoring report. It is saved with this tailored resume each time it is updated. */
export function ReportView({ resumeId, report, history, ensureSaved, onReport }: Props) {
  const toast = useToast();
  const save = useMutation({
    mutationFn: async () => {
      if (!(await ensureSaved()))
        throw new Error('Your latest edits could not be saved first. Please try again.');
      return api.saveReport(resumeId);
    },
    onSuccess: (r) => {
      onReport({ report: r.report, history: r.reportHistory });
      toast.success('Report saved with this tailored resume.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const needsCheck = report
    ? report.addedSinceOriginal.length + report.unverifiedSuggestions.length
    : 0;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">Tailoring report</h3>
        <p className="mt-1 text-sm text-slate-600">
          A snapshot of how this resume lines up with the job, what you added, and what to
          double-check. Updating it re-reads your resume as it is now.
        </p>
        <Button className="mt-3" loading={save.isPending} onClick={() => save.mutate()}>
          {report ? 'Update and save report' : 'Generate and save report'}
        </Button>
        {report && (
          <p className="mt-2 text-xs text-slate-600">
            Last saved {formatRelative(report.generatedAt)}.
          </p>
        )}
      </section>

      {report && (
        <>
          <section className="grid grid-cols-3 gap-2 text-center" aria-label="Coverage">
            {(
              [
                ['matched', 'Matched', 'bg-emerald-100 text-emerald-800'],
                ['partial', 'Partly shown', 'bg-amber-100 text-amber-900'],
                ['missing', 'Not found', 'bg-red-100 text-red-800'],
              ] as const
            ).map(([k, label, cls]) => (
              <div key={k} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-2xl font-semibold tracking-tight">{report.counts[k]}</p>
                <p
                  className={`mx-auto mt-1 w-fit rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}
                >
                  {label}
                </p>
              </div>
            ))}
          </section>

          <section
            className={`rounded-xl border p-4 ${needsCheck ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}
          >
            <h4 className="font-semibold">
              {needsCheck ? 'Please verify before you send this' : 'Nothing new to verify'}
            </h4>
            {report.addedSinceOriginal.length > 0 && (
              <>
                <p className="mt-1 text-sm">
                  These weren’t in your original resume. Keep them only if you can back them up in
                  an interview.
                </p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {report.addedSinceOriginal.map((a) => (
                    <li key={a.term + a.where}>
                      <b>{a.term}</b> · {a.where}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {report.unverifiedSuggestions.length > 0 && (
              <>
                <p className="mt-2 text-sm">Accepted suggestions you haven’t confirmed:</p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {report.unverifiedSuggestions.map((u) => (
                    <li key={u.id}>{u.targetLabel}</li>
                  ))}
                </ul>
              </>
            )}
            {!needsCheck && (
              <p className="mt-1 text-sm">
                No new keywords or figures were added compared with your original resume.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="font-semibold">Checklist</h4>
            <ul className="mt-2 space-y-2">
              {report.checklist.map((c) => (
                <li key={c.id} className="flex gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className={`w-4 shrink-0 text-center font-bold ${TONE[c.status]}`}
                  >
                    {ICON[c.status]}
                  </span>
                  <span>
                    <span className="sr-only">
                      {c.status === 'pass'
                        ? 'Passed: '
                        : c.status === 'warn'
                          ? 'Needs attention: '
                          : 'Note: '}
                    </span>
                    <b>{c.label}.</b> <span className="text-slate-700">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {report.natural.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="font-semibold">Keywords that read naturally</h4>
              <p className="mt-1 text-xs text-slate-600">
                These appear in your experience, projects or summary, in context.
              </p>
              <ul className="mt-2 space-y-2">
                {report.natural.map((n) => (
                  <li key={n.term} className="text-sm">
                    <span className="font-medium">{n.term}</span>{' '}
                    <span className="text-xs text-slate-600">· {n.section}</span>
                    <blockquote className="mt-0.5 border-l-2 border-slate-200 pl-2 text-slate-700">
                      <Highlight text={n.snippet} term={n.term} />
                    </blockquote>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.stuffing.length > 0 && (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
              <h4 className="font-semibold">Repeated a lot</h4>
              <ul className="mt-1 list-disc pl-5">
                {report.stuffing.map((s) => (
                  <li key={s.term}>
                    “{s.term}” appears {s.count} times
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(report.partial.length > 0 || report.missing.length > 0) && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <h4 className="font-semibold">Still open</h4>
              <ul className="mt-2 space-y-1.5">
                {[...report.missing, ...report.partial].map((m) => (
                  <li key={m.keywordId}>
                    <b>{m.term}</b>{' '}
                    <span className="text-xs text-slate-600">
                      ({m.importance}, {m.status === 'missing' ? 'not found' : 'partly shown'})
                    </span>
                    <span className="block text-slate-700">{m.reasoning}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-600">
                Only add something if it’s true. A gap is better than a claim you can’t support.
              </p>
            </section>
          )}

          {history.length > 1 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <h4 className="font-semibold">Saved reports</h4>
              <ul className="mt-1 space-y-0.5 text-slate-700">
                {[...history]
                  .reverse()
                  .slice(0, 6)
                  .map((h, i) => (
                    <li key={h.savedAt + i}>
                      {formatRelative(h.savedAt)}: {h.matched} matched, {h.partial} partly,{' '}
                      {h.missing} missing
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
