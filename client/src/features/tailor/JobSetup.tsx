import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Field';
import { api } from '../../lib/api';
import { useToast } from '../../store';
import type { Analysis, Comparison, Keyword } from '../../types/tailor';
import { ComparisonView } from './ComparisonView';
import { KeywordReview } from './KeywordReview';

interface Props {
  resumeId: string;
  resumeTitle: string;
  aiConfigured: boolean;
  ensureSaved: () => Promise<boolean>;
}

/** Steps before tailoring: paste the job, review what was extracted, compare, then make a tailored copy. */
export function JobSetup({ resumeId, resumeTitle, aiConfigured, ensureSaved }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [jd, setJd] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [title, setTitle] = useState('');

  const analyze = useMutation({
    mutationFn: () => api.analyzeJob(jd.trim()),
    onSuccess: (a) => {
      setAnalysis(a);
      setKeywords(a.keywords);
      setJobTitle(a.jobTitle);
      setCompany(a.company);
      setComparison(null);
      setTitle(
        `${resumeTitle} – ${a.jobTitle || 'Tailored'}${a.company ? ` @ ${a.company}` : ''}`.slice(
          0,
          120,
        ),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const compare = useMutation({
    mutationFn: async () => {
      if (!(await ensureSaved()))
        throw new Error('Your latest edits could not be saved first. Please try again.');
      return api.compareJob(resumeId, keywords);
    },
    onSuccess: setComparison,
    onError: (e: Error) => toast.error(e.message),
  });

  const start = useMutation({
    mutationFn: () =>
      api.startTailoring({
        resumeId,
        jobDescription: jd.trim(),
        jobTitle,
        company,
        keywords,
        comparison,
        title: title.trim() || undefined,
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['resumes'] });
      toast.success('Created your tailored copy. The original is unchanged.');
      navigate(`/resumes/${r.resumeId}?panel=tailor`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const included = keywords.filter((k) => k.included).length;

  return (
    <div className="space-y-4">
      {!aiConfigured && (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p className="font-medium">AI features need an API key</p>
          <p className="mt-1">
            Add <code>GEMINI_API_KEY</code> to <code>server/.env</code> and restart the server.
            Job analysis, suggestions and the bullet assistant use it. Your job description is sent
            to the AI service only when you press Analyze.
          </p>
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">1. Paste the job description</h2>
        <p className="mt-1 text-sm text-slate-600">
          We’ll pull out the skills, tools, qualifications and responsibilities, then compare them
          with this resume. Your original is never changed.
        </p>
        <div className="mt-3">
          <Textarea
            label="Job description"
            rows={9}
            maxLength={15000}
            value={jd}
            disabled={analyze.isPending}
            onChange={(e) => setJd(e.target.value)}
            footer={`${jd.length.toLocaleString()} / 15,000 characters`}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            loading={analyze.isPending}
            disabled={jd.trim().length < 80 || !aiConfigured}
            onClick={() => analyze.mutate()}
          >
            {analysis ? 'Analyze again' : 'Analyze job description'}
          </Button>
        </div>
      </section>

      {analysis && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">2. Review what we found</h2>
          <p className="mt-1 text-sm text-slate-600">
            This list is a draft, not the truth. Untick anything that doesn’t matter, fix wording,
            change importance, and add what we missed.
            {analysis.dropped > 0 &&
              ` We also discarded ${analysis.dropped} item${analysis.dropped === 1 ? '' : 's'} we couldn’t find in the text.`}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              label="Job title"
              value={jobTitle}
              maxLength={200}
              onChange={(e) => setJobTitle(e.target.value)}
            />
            <Input
              label="Company"
              value={company}
              maxLength={200}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div className="mt-4">
            <KeywordReview
              keywords={keywords}
              onChange={(k) => {
                setKeywords(k);
                setComparison(null);
              }}
            />
          </div>
          <Button
            className="mt-4"
            loading={compare.isPending}
            disabled={included === 0}
            onClick={() => compare.mutate()}
          >
            Compare with my resume ({included} {included === 1 ? 'item' : 'items'})
          </Button>
        </section>
      )}

      {comparison && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">3. How your resume lines up</h2>
          <div className="mt-3">
            <ComparisonView comparison={comparison} />
          </div>
        </section>
      )}

      {comparison && (
        <section className="rounded-xl border border-cobalt bg-white p-4">
          <h2 className="font-semibold">4. Create a tailored copy</h2>
          <p className="mt-1 text-sm text-slate-600">
            We’ll make a copy of this resume for the job and keep your original untouched. In the
            copy you can review suggestions one by one, and accept, edit or reject each.
          </p>
          <div className="mt-3">
            <Input
              label="Name for the tailored copy"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <Button
            className="mt-3"
            loading={start.isPending}
            disabled={!title.trim()}
            onClick={() => start.mutate()}
          >
            Create tailored copy
          </Button>
        </section>
      )}
    </div>
  );
}
