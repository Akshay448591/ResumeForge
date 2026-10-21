import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Input, Textarea } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { useAppSelector } from '../../store';
import type { BulletAssist, Tailoring } from '../../types/tailor';

interface Props {
  open: boolean;
  onClose: () => void;
  text: string;
  role: string;
  company: string;
  onApply: (text: string) => void;
}

/** Turn a vague bullet into a clear achievement. Asks for evidence instead of inventing it, and every option is editable. */
export function BulletAssistantDialog({ open, onClose, text, role, company, onApply }: Props) {
  const qc = useQueryClient();
  const resumeId = useAppSelector((s) => s.editor.resumeId);
  const [result, setResult] = useState<BulletAssist | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const jobKeywords = () => {
    const t = resumeId
      ? qc.getQueryData<{ tailoring: Tailoring | null }>(['tailoring', resumeId])?.tailoring
      : null;
    return t?.keywords.filter((k) => k.included).map((k) => k.term) ?? [];
  };

  const run = useMutation({
    mutationFn: (withAnswers: boolean) =>
      api.improveBullet({
        text,
        role,
        company,
        jobKeywords: jobKeywords(),
        evidence: withAnswers
          ? (result?.questions ?? [])
              .filter((q) => answers[q.id]?.trim())
              .map((q) => ({ question: q.question, answer: answers[q.id].trim() }))
          : [],
      }),
    onSuccess: (r) => {
      setResult(r);
      setDrafts(r.alternatives.map((a) => a.text));
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  useEffect(() => {
    if (open) {
      setResult(null);
      setAnswers({});
      setDrafts([]);
      setError(null);
      run.mutate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text]);

  const answered = Object.values(answers).some((a) => a.trim());

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Improve this bullet"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium">Your bullet</p>
          <p className="mt-1 rounded-lg bg-slate-50 p-2 text-sm">{text}</p>
        </div>

        {run.isPending && (
          <p className="flex items-center gap-2 text-sm text-slate-700" role="status">
            <Spinner className="h-4 w-4" label="Working" /> Reading your bullet…
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {result && (
          <>
            {(result.hints.length > 0 || result.issues.length > 0) && (
              <section aria-label="What to improve">
                <h3 className="text-sm font-semibold">What could be stronger</h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                  {[...new Set([...result.issues, ...result.hints])].map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </section>
            )}

            {result.questions.length > 0 && (
              <section aria-label="Questions" className="rounded-lg border border-slate-200 p-3">
                <h3 className="text-sm font-semibold">Tell us what’s missing</h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  We won’t guess numbers or outcomes. Answer what you know, in your own words, then
                  regenerate. Skip anything you can’t answer.
                </p>
                <div className="mt-3 space-y-3">
                  {result.questions.map((q) => (
                    <Input
                      key={q.id}
                      label={q.question}
                      hint={q.why}
                      value={answers[q.id] ?? ''}
                      maxLength={600}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    />
                  ))}
                </div>
                <Button
                  className="mt-3"
                  variant="secondary"
                  disabled={!answered}
                  loading={run.isPending}
                  onClick={() => run.mutate(true)}
                >
                  Regenerate with my answers
                </Button>
              </section>
            )}

            <section aria-label="Alternative wordings">
              <h3 className="text-sm font-semibold">Alternative wordings</h3>
              {result.alternatives.length === 0 ? (
                <p className="mt-1 text-sm text-slate-700">
                  No safe alternatives yet. Answer the questions above and try again.
                </p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {result.alternatives.map((a, i) => (
                    <li key={i} className="rounded-lg border border-slate-200 p-3">
                      <Textarea
                        label={`Option ${i + 1}${a.style ? ` · ${a.style}` : ''}`}
                        rows={2}
                        maxLength={500}
                        value={drafts[i] ?? ''}
                        onChange={(e) =>
                          setDrafts(drafts.map((d, j) => (j === i ? e.target.value : d)))
                        }
                        hint={a.notes || undefined}
                      />
                      {a.flags.map((f) => (
                        <p key={f} className="mt-1 text-xs text-amber-800">
                          ⚠ {f}
                        </p>
                      ))}
                      <Button
                        size="sm"
                        className="mt-2"
                        disabled={!drafts[i]?.trim()}
                        onClick={() => {
                          onApply(drafts[i].trim());
                          onClose();
                        }}
                      >
                        Use this wording
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {result.warnings.map((w) => (
                <p key={w} className="mt-2 text-xs text-slate-600">
                  {w}
                </p>
              ))}
              <p className="mt-2 text-xs text-slate-600">
                These are suggestions. Edit any of them, and only keep wording that’s true.
              </p>
            </section>
          </>
        )}
      </div>
    </Dialog>
  );
}
