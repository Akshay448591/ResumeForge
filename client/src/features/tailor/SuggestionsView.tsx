import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useStore } from 'react-redux';
import { Button } from '../../components/ui/Button';
import { Checkbox, Textarea } from '../../components/ui/Field';
import { api } from '../../lib/api';
import { useAppDispatch, useToast, type AppDispatch, type RootState } from '../../store';
import { editorActions } from '../../store/editorSlice';
import { newId } from '../../types/resume';
import type { Suggestion } from '../../types/tailor';

type Undo = NonNullable<Suggestion['undo']>;
type GetState = () => RootState;

const KIND_LABEL: Record<Suggestion['kind'], string> = {
  summary: 'Summary',
  bullet: 'Bullet',
  addition: 'Possible addition',
  skills: 'Skills order',
  projects: 'Projects',
};

/** Make an accepted suggestion real in the editor. Returns what is needed to undo it. */
function applyToResume(
  s: Suggestion,
  text: string,
  dispatch: AppDispatch,
  getState: GetState,
): Undo {
  const content = getState().editor.content;
  if (!content) throw new Error('The resume isn’t loaded yet.');
  if (s.kind === 'summary') {
    const prev = content.summary;
    dispatch(editorActions.setSummary(text));
    return { text: prev };
  }
  if (s.kind === 'bullet' || s.kind === 'addition') {
    const exp = content.experience.find((e) => e.id === s.experienceId);
    if (!exp) throw new Error('That position no longer exists in this resume.');
    if (s.kind === 'bullet') {
      const bullet = exp.bullets.find((b) => b.id === s.bulletId);
      if (!bullet)
        throw new Error(
          'That bullet has changed or been removed, so this suggestion can’t be applied.',
        );
      dispatch(
        editorActions.updateItem({
          section: 'experience',
          id: exp.id,
          patch: { bullets: exp.bullets.map((b) => (b.id === bullet.id ? { ...b, text } : b)) },
        }),
      );
      return { text: bullet.text };
    }
    const bulletId = newId();
    dispatch(
      editorActions.updateItem({
        section: 'experience',
        id: exp.id,
        patch: { bullets: [...exp.bullets, { id: bulletId, text }] },
      }),
    );
    return { bulletId };
  }
  const section = s.kind === 'skills' ? 'skills' : 'projects';
  const prev = content[section].map((x) => x.id);
  dispatch(editorActions.setOrder({ section, ids: s.order ?? prev }));
  let toggled = false;
  if (
    s.kind === 'projects' &&
    s.showSection &&
    content.sections.find((x) => x.id === 'projects')?.visible === false
  ) {
    dispatch(editorActions.toggleSection('projects'));
    toggled = true;
  }
  return { order: prev, toggled };
}

function undoOnResume(
  s: Suggestion,
  undo: Undo | undefined,
  dispatch: AppDispatch,
  getState: GetState,
) {
  const content = getState().editor.content;
  if (!content || !undo) return;
  if (s.kind === 'summary' && undo.text !== undefined)
    dispatch(editorActions.setSummary(undo.text));
  else if ((s.kind === 'bullet' || s.kind === 'addition') && s.experienceId) {
    const exp = content.experience.find((e) => e.id === s.experienceId);
    if (!exp) return;
    const bullets =
      s.kind === 'bullet'
        ? exp.bullets.map((b) =>
            b.id === s.bulletId && undo.text !== undefined ? { ...b, text: undo.text } : b,
          )
        : exp.bullets.filter((b) => b.id !== undo.bulletId);
    dispatch(editorActions.updateItem({ section: 'experience', id: exp.id, patch: { bullets } }));
  } else if ((s.kind === 'skills' || s.kind === 'projects') && undo.order) {
    dispatch(editorActions.setOrder({ section: s.kind, ids: undo.order }));
    if (undo.toggled) dispatch(editorActions.toggleSection('projects'));
  }
}

const figures = (t: string) =>
  (t.match(/\d[\d,.]*\s?(?:%|k\b|m\b|x\b)?/gi) ?? []).map((n) => n.trim());

function SuggestionCard({
  s,
  resumeId,
  onUpdated,
}: {
  s: Suggestion;
  resumeId: string;
  onUpdated: (s: Suggestion) => void;
}) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const toast = useToast();
  const isText = s.kind === 'summary' || s.kind === 'bullet' || s.kind === 'addition';
  const [draft, setDraft] = useState(
    s.kind === 'addition' ? s.finalText : s.finalText || s.suggested,
  );
  const [verified, setVerified] = useState(s.verified);
  const decided = s.status !== 'pending';
  const getState = () => store.getState();

  const decide = useMutation({
    mutationFn: async (action: 'accept' | 'reject' | 'reset') => {
      if (action === 'reject') return api.decideSuggestion(resumeId, s.id, { status: 'rejected' });
      if (action === 'reset') {
        if (s.status !== 'rejected') undoOnResume(s, s.undo, dispatch, getState);
        return api.decideSuggestion(resumeId, s.id, { status: 'pending' });
      }
      const text = isText ? draft.trim() : '';
      const edited = isText && s.kind !== 'addition' && text !== s.suggested.trim();
      const undo = applyToResume(s, text, dispatch, getState);
      try {
        return await api.decideSuggestion(resumeId, s.id, {
          status: edited || s.kind === 'addition' ? 'edited' : 'accepted',
          finalText: text,
          verified,
          undo,
        });
      } catch (e) {
        undoOnResume(s, undo, dispatch, getState); // the save failed, so don't leave the change in the resume
        throw e;
      }
    },
    onSuccess: (updated) => onUpdated(updated),
    onError: (e: Error) => toast.error(e.message),
  });

  const addedFigures =
    isText && s.kind !== 'addition' && draft !== s.suggested
      ? figures(draft).filter((n) => !s.original.includes(n) && !s.suggested.includes(n))
      : [];
  const blocked = (s.needsVerification && !verified) || (isText && !draft.trim());

  return (
    <li
      className={`rounded-xl border bg-white p-4 ${decided ? 'border-slate-200' : 'border-cobalt/40'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-cobalt-soft px-1.5 py-0.5 text-xs font-medium text-cobalt-dark">
          {KIND_LABEL[s.kind]}
        </span>
        <span className="text-sm font-medium">{s.targetLabel}</span>
        {decided && (
          <span
            className={`ml-auto rounded px-1.5 py-0.5 text-xs font-medium ${s.status === 'rejected' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`}
          >
            {s.status === 'accepted'
              ? 'Accepted'
              : s.status === 'edited'
                ? 'Accepted with your edits'
                : 'Rejected'}
          </span>
        )}
      </div>

      {s.rationale && <p className="mt-2 text-sm text-slate-700">{s.rationale}</p>}
      {s.keywords.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-1 text-xs">
          {s.keywords.map((k) => (
            <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5">
              {k}
            </span>
          ))}
        </p>
      )}

      {s.kind === 'skills' || s.kind === 'projects' ? (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded bg-slate-50 p-2">
            <dt className="text-xs font-medium text-slate-600">Now</dt>
            <dd>{s.original}</dd>
          </div>
          <div className="rounded bg-emerald-50 p-2">
            <dt className="text-xs font-medium text-emerald-800">Suggested order</dt>
            <dd>{s.suggested}</dd>
          </div>
        </dl>
      ) : (
        <>
          {s.original && (
            <div className="mt-3 rounded bg-slate-50 p-2 text-sm">
              <p className="text-xs font-medium text-slate-600">Your current wording</p>
              <p>{s.original}</p>
            </div>
          )}
          <div className="mt-3">
            <Textarea
              label={
                s.kind === 'addition'
                  ? 'Your wording (required)'
                  : 'Suggested wording. You can edit it.'
              }
              rows={s.kind === 'summary' ? 4 : 3}
              maxLength={s.kind === 'summary' ? 1500 : 500}
              value={draft}
              disabled={decided}
              placeholder={
                s.kind === 'addition'
                  ? 'Describe what you actually did, in your own words.'
                  : undefined
              }
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
        </>
      )}

      {s.questions.length > 0 && !decided && (
        <div className="mt-3 rounded bg-cobalt-soft/60 p-2 text-sm">
          <p className="font-medium">Questions only you can answer</p>
          <ul className="mt-1 list-disc pl-5">
            {s.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-700">
            We won’t guess. Put your answers into the wording above if they’re true.
          </p>
        </div>
      )}
      {s.flags.length > 0 && (
        <ul className="mt-3 space-y-1 rounded bg-amber-50 p-2 text-sm text-amber-900">
          {s.flags.map((f) => (
            <li key={f}>⚠ {f}</li>
          ))}
        </ul>
      )}
      {addedFigures.length > 0 && !decided && (
        <p className="mt-2 text-xs text-amber-800">
          You’ve added figures ({addedFigures.join(', ')}). Only keep them if they’re accurate and
          you can back them up.
        </p>
      )}

      {!decided && s.needsVerification && (
        <div className="mt-3">
          <Checkbox
            label="I’ve checked this and it’s accurate"
            checked={verified}
            onChange={() => setVerified((v) => !v)}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!decided ? (
          <>
            <Button
              size="sm"
              disabled={blocked}
              loading={decide.isPending && decide.variables === 'accept'}
              onClick={() => decide.mutate('accept')}
            >
              {isText && s.kind !== 'addition' && draft.trim() !== s.suggested.trim()
                ? 'Accept my edit'
                : 'Accept'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={decide.isPending && decide.variables === 'reject'}
              onClick={() => decide.mutate('reject')}
            >
              Reject
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            loading={decide.isPending}
            onClick={() => decide.mutate('reset')}
          >
            {s.status === 'rejected' ? 'Reconsider' : 'Undo'}
          </Button>
        )}
      </div>
    </li>
  );
}

interface Props {
  resumeId: string;
  suggestions: Suggestion[];
  aiConfigured: boolean;
  ensureSaved: () => Promise<boolean>;
  onSuggestions: (s: Suggestion[]) => void;
}

/** Review one suggestion at a time. Nothing changes your resume until you accept it. */
export function SuggestionsView({
  resumeId,
  suggestions,
  aiConfigured,
  ensureSaved,
  onSuggestions,
}: Props) {
  const toast = useToast();
  const [warnings, setWarnings] = useState<string[]>([]);
  const generate = useMutation({
    mutationFn: async () => {
      if (!(await ensureSaved()))
        throw new Error('Your latest edits could not be saved first. Please try again.');
      return api.generateSuggestions(resumeId);
    },
    onSuccess: (r) => {
      onSuggestions(r.suggestions);
      setWarnings(r.warnings);
      if (r.suggestions.length === 0) toast.success('No new suggestions right now.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const count = (st: Suggestion['status']) => suggestions.filter((s) => s.status === st).length;
  const pending = suggestions.filter((s) => s.status === 'pending');
  const done = suggestions.filter((s) => s.status !== 'pending');
  const replace = (u: Suggestion) => onSuggestions(suggestions.map((s) => (s.id === u.id ? u : s)));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">Suggestions</h3>
        <p className="mt-1 text-sm text-slate-600">
          We suggest wording for your summary and bullets, and which of your existing skills and
          projects to put first. Everything is built from what’s already in your resume. Anything
          that adds a claim is flagged and needs your confirmation.
        </p>
        <Button
          className="mt-3"
          loading={generate.isPending}
          disabled={!aiConfigured}
          onClick={() => generate.mutate()}
        >
          {suggestions.length ? 'Find more suggestions' : 'Generate suggestions'}
        </Button>
        {!aiConfigured && (
          <p className="mt-2 text-xs text-amber-800">
            Add GEMINI_API_KEY to server/.env to use this.
          </p>
        )}
        {suggestions.length > 0 && (
          <p className="mt-3 text-sm text-slate-700" aria-live="polite">
            {count('accepted')} accepted · {count('edited')} edited · {count('rejected')} rejected ·{' '}
            {count('pending')} waiting
          </p>
        )}
        {warnings.map((w) => (
          <p key={w} className="mt-2 text-xs text-slate-600">
            {w}
          </p>
        ))}
      </section>

      {pending.length > 0 && (
        <ul className="space-y-3">
          {pending.map((s) => (
            <SuggestionCard key={s.id} s={s} resumeId={resumeId} onUpdated={replace} />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold">Decided</h4>
          <ul className="space-y-3">
            {done.map((s) => (
              <SuggestionCard key={s.id} s={s} resumeId={resumeId} onUpdated={replace} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
