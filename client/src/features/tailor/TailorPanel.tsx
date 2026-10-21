import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { useToast } from '../../store';
import type { Keyword, Suggestion, Tailoring } from '../../types/tailor';
import { ComparisonView } from './ComparisonView';
import { JobSetup } from './JobSetup';
import { KeywordReview } from './KeywordReview';
import { ReportView } from './ReportView';
import { SuggestionsView } from './SuggestionsView';

interface Props {
  resumeId: string;
  resumeTitle: string;
  ensureSaved: () => Promise<boolean>;
}

type Data = { tailoring: Tailoring | null; source: { id: string; title: string } | null };

function Workspace({
  resumeId,
  data,
  aiConfigured,
  ensureSaved,
}: {
  resumeId: string;
  data: Data & { tailoring: Tailoring };
  aiConfigured: boolean;
  ensureSaved: () => Promise<boolean>;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { tailoring, source } = data;
  const [view, setView] = useState<'requirements' | 'suggestions' | 'report'>('requirements');
  const [keywords, setKeywords] = useState<Keyword[]>(tailoring.keywords);
  useEffect(() => setKeywords(tailoring.keywords), [tailoring.keywords]);
  const dirty = JSON.stringify(keywords) !== JSON.stringify(tailoring.keywords);

  const update = (fn: (t: Tailoring) => Tailoring) =>
    qc.setQueryData<Data>(['tailoring', resumeId], (d) =>
      d?.tailoring ? { ...d, tailoring: fn(d.tailoring) } : d,
    );

  const save = useMutation({
    mutationFn: () => api.saveKeywords(resumeId, keywords),
    onSuccess: (t) => update((cur) => ({ ...cur, keywords: t.keywords })),
    onError: (e: Error) => toast.error(e.message),
  });
  const compare = useMutation({
    mutationFn: async () => {
      if (!(await ensureSaved()))
        throw new Error('Your latest edits could not be saved first. Please try again.');
      if (dirty) await save.mutateAsync();
      return api.recompare(resumeId);
    },
    onSuccess: (comparison) => update((cur) => ({ ...cur, comparison })),
    onError: (e: Error) => toast.error(e.message),
  });

  const tabs = [
    ['requirements', 'Requirements'],
    ['suggestions', 'Suggestions'],
    ['report', 'Report'],
  ] as const;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Tailored for</p>
        <h2 className="text-lg font-semibold">
          {tailoring.jobTitle || 'This job'}
          {tailoring.company ? ` @ ${tailoring.company}` : ''}
        </h2>
        {source && (
          <p className="mt-1 text-sm text-slate-700">
            Tailored from{' '}
            <Link className="font-medium text-cobalt underline" to={`/resumes/${source.id}`}>
              {source.title}
            </Link>
            , which stays unchanged.
          </p>
        )}
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-slate-700">Job description</summary>
          <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">
            {tailoring.jobDescription}
          </p>
        </details>
      </section>

      <div
        className="flex gap-1 rounded-lg bg-slate-200/70 p-1"
        role="group"
        aria-label="Tailoring sections"
      >
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => setView(id)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${view === id ? 'bg-white shadow-sm' : 'text-slate-700 hover:bg-white/60'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'requirements' && (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">Requirements from the job</h3>
            <p className="mt-1 text-sm text-slate-600">
              Adjust the list any time. The comparison below uses it.
            </p>
            <div className="mt-3">
              <KeywordReview keywords={keywords} onChange={setKeywords} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={!dirty}
                loading={save.isPending}
                onClick={() => save.mutate()}
              >
                Save keyword changes
              </Button>
              <Button loading={compare.isPending} onClick={() => compare.mutate()}>
                {tailoring.comparison ? 'Compare again' : 'Compare with my resume'}
              </Button>
            </div>
          </section>
          {tailoring.comparison && (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-semibold">How this resume lines up</h3>
              <p className="mt-1 text-xs text-slate-600">
                As of the last comparison. Press “Compare again” after you make changes.
              </p>
              <div className="mt-3">
                <ComparisonView comparison={tailoring.comparison} />
              </div>
            </section>
          )}
        </div>
      )}

      {view === 'suggestions' && (
        <SuggestionsView
          resumeId={resumeId}
          suggestions={tailoring.suggestions}
          aiConfigured={aiConfigured}
          ensureSaved={ensureSaved}
          onSuggestions={(s: Suggestion[]) => update((cur) => ({ ...cur, suggestions: s }))}
        />
      )}

      {view === 'report' && (
        <ReportView
          resumeId={resumeId}
          report={tailoring.report}
          history={tailoring.reportHistory}
          ensureSaved={ensureSaved}
          onReport={({ report, history }) =>
            update((cur) => ({ ...cur, report, reportHistory: history }))
          }
        />
      )}
    </div>
  );
}

/** The Tailor tab: set up a job for this resume, or work through suggestions and the report for a tailored copy. */
export function TailorPanel({ resumeId, resumeTitle, ensureSaved }: Props) {
  const status = useQuery({
    queryKey: ['tailor-status'],
    queryFn: api.tailorStatus,
    staleTime: 60_000,
  });
  const tailoring = useQuery({
    queryKey: ['tailoring', resumeId],
    queryFn: () => api.getTailoring(resumeId),
    refetchOnMount: 'always',
  });
  const aiConfigured = status.data?.aiConfigured ?? true;

  if (tailoring.isPending)
    return (
      <div className="text-cobalt">
        <Spinner label="Loading" />
      </div>
    );
  if (tailoring.isError) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
        We couldn’t load the tailoring details. {(tailoring.error as Error).message}
      </p>
    );
  }
  if (!tailoring.data.tailoring) {
    return (
      <JobSetup
        resumeId={resumeId}
        resumeTitle={resumeTitle}
        aiConfigured={aiConfigured}
        ensureSaved={ensureSaved}
      />
    );
  }
  return (
    <Workspace
      resumeId={resumeId}
      data={tailoring.data as Data & { tailoring: Tailoring }}
      aiConfigured={aiConfigured}
      ensureSaved={ensureSaved}
    />
  );
}
