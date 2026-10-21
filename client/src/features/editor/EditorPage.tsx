import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button, buttonClass } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { PageLoader } from '../../components/ui/Spinner';
import { ApiError, api } from '../../lib/api';
import { usePageTitle } from '../../lib/auth';
import { TEMPLATES, resolveStyle } from '../../lib/templates';
import { useAppDispatch, useAppSelector, useToast } from '../../store';
import { editorActions } from '../../store/editorSlice';
import type { Resume, ResumeContent, StyleOverrides, TemplateId } from '../../types/resume';
import { DesignPanel } from './DesignPanel';
import { fitToOnePage } from './fit';
import { PagedPreview } from './PagedPreview';
import { PersonalForm, SectionList } from './forms';
import { VersionsPanel } from './VersionsPanel';
import { TailorPanel } from '../tailor/TailorPanel';
import { ExportDialog } from '../export/ExportDialog';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function EditorPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const qc = useQueryClient();
  const { content, style, dirty, revision, resumeId } = useAppSelector((s) => s.editor);

  const resumeQ = useQuery({
    queryKey: ['resume', id],
    queryFn: () => api.getResume(id),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [meta, setMeta] = useState<{ title: string; templateId: TemplateId } | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [panel, setPanel] = useState<'content' | 'design' | 'versions' | 'tailor'>(
    params.get('panel') === 'tailor' ? 'tailor' : 'content',
  );
  const [personalOpen, setPersonalOpen] = useState(true);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [conflict, setConflict] = useState<{ currentRev: number } | null>(null);
  const [tick, setTick] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);
  useEffect(() => {
    if (params.get('panel') === 'tailor') setPanel('tailor');
  }, [id, params]);
  usePageTitle(meta?.title ?? 'Editor');

  /** The server revision this editor last saw. Sent with every save so stale writes are refused. */
  const revRef = useRef(0);
  const inflight = useRef<Promise<boolean> | null>(null);
  const errorShown = useRef(false);
  const latest = useRef<{
    dirty: boolean;
    content: ResumeContent | null;
    style: StyleOverrides;
    revision: number;
  }>({
    dirty: false,
    content: null,
    style: {},
    revision: 0,
  });
  latest.current = { dirty, content, style, revision };

  /** Replace everything in the editor with a resume from the server (restore, copy, reload). */
  const applyServerResume = useCallback(
    (r: Resume) => {
      dispatch(editorActions.load({ resumeId: r.id, content: r.content, style: r.style ?? {} }));
      setMeta({ title: r.title, templateId: r.templateId });
      setTitleDraft(r.title);
      revRef.current = r.rev;
      setSaveState('saved');
      setConflict(null);
      errorShown.current = false;
    },
    [dispatch],
  );

  useEffect(() => {
    if (resumeQ.data && resumeId !== id) applyServerResume(resumeQ.data);
  }, [resumeQ.data, resumeId, id, applyServerResume]);

  /**
   * Save pending edits. Saves never overlap. Temporary failures (offline, server errors) are retried
   * with a short back-off before the editor shows "Save failed".
   */
  const persist = useCallback(async (): Promise<boolean> => {
    while (inflight.current) await inflight.current;
    const snap = latest.current;
    const doc = snap.content;
    if (!snap.dirty || !doc) return true;

    const run = async (): Promise<boolean> => {
      setSaveState('saving');
      for (let attempt = 0; ; attempt++) {
        try {
          const saved = await api.updateResume(id, {
            content: doc,
            style: snap.style,
            baseRev: revRef.current,
          });
          revRef.current = saved.rev;
          errorShown.current = false;
          dispatch(editorActions.markSaved(snap.revision));
          setSaveState('saved');
          if (latest.current.revision !== snap.revision) setTick((t) => t + 1); // edits arrived meanwhile
          void qc.invalidateQueries({ queryKey: ['resumes'] });
          return true;
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            setConflict({ currentRev: Number(e.data?.currentRev ?? 0) });
            setSaveState('error');
            return false;
          }
          const temporary = !(e instanceof ApiError) || e.status === 0 || e.status >= 500;
          if (temporary && attempt < 2) {
            await sleep(1000 * 2 ** attempt);
            continue;
          }
          setSaveState('error');
          if (!errorShown.current) {
            toast.error(
              `Your changes weren’t saved. ${e instanceof Error ? e.message : ''}`.trim(),
            );
            errorShown.current = true;
          }
          return false;
        }
      }
    };

    const p = run();
    inflight.current = p;
    try {
      return await p;
    } finally {
      inflight.current = null;
    }
  }, [id, dispatch, qc, toast]);

  // Autosave 800ms after the last edit. Content and design are saved together, not per keystroke.
  useEffect(() => {
    if (!dirty || !content || resumeId !== id || conflict) return;
    const t = setTimeout(() => void persist(), 800);
    return () => clearTimeout(t);
  }, [dirty, content, style, revision, resumeId, id, conflict, tick, persist]);

  // Flush unsaved edits and reset the store when leaving the editor.
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.dirty && l.content) {
        const content = l.content;
        void (async () => {
          while (inflight.current) await inflight.current;
          await api
            .updateResume(id, { content, style: l.style, baseRev: revRef.current })
            .catch(() => undefined);
        })();
      }
      dispatch(editorActions.unload());
    },
    [id, dispatch],
  );

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Title + template are saved immediately and separately.
  const patchMeta = useMutation({
    mutationFn: (b: { title?: string; templateId?: TemplateId }) => api.updateResume(id, b),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['resumes'] }),
    onError: (e: Error) => {
      toast.error(e.message);
      if (resumeQ.data) setMeta((m) => m && { ...m, title: resumeQ.data.title });
      setTitleDraft(meta?.title ?? '');
    },
  });

  const resolved = useMemo(
    () => (meta ? resolveStyle(meta.templateId, style) : null),
    [meta, style],
  );

  const fitOnePage = useCallback(() => {
    if (!content || !meta || !resolved) return;
    const { fitted, patch } = fitToOnePage(content, meta.templateId, resolved);
    dispatch(editorActions.setStyle({ ...patch, pageMode: 'one' }));
    if (fitted) toast.success('Adjusted spacing to fit one page.');
    else
      toast.error(
        'Even at the smallest readable settings this needs more than one page. Trim some content.',
      );
  }, [content, meta, resolved, dispatch, toast]);

  const loadLatest = async () => {
    try {
      applyServerResume(await api.getResume(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'We couldn’t load the latest version.');
    }
  };
  const keepMine = () => {
    if (!conflict) return;
    revRef.current = conflict.currentRev;
    setConflict(null);
    setTick((t) => t + 1);
    void persist();
  };

  if (resumeQ.isPending) return <PageLoader />;
  if (resumeQ.isError) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-semibold tracking-tight">We couldn’t open this resume</h1>
        <p className="mt-2 text-slate-700">{(resumeQ.error as Error).message}</p>
        <Link to="/dashboard" className={`${buttonClass()} mt-6`}>
          Back to dashboard
        </Link>
      </div>
    );
  }
  if (!content || !meta || !resolved) return <PageLoader />;

  const commitTitle = () => {
    const t = titleDraft.trim();
    if (!t) return setTitleDraft(meta.title);
    if (t !== meta.title) {
      setMeta({ ...meta, title: t });
      patchMeta.mutate({ title: t });
    }
  };

  const status =
    saveState === 'error' ? 'error' : saveState === 'saving' || dirty ? 'saving' : 'saved';

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 pb-2 text-sm font-medium text-slate-600 transition-colors hover:text-ink"
        >
          <Icon name="left" /> Dashboard
        </Link>
        <div className="min-w-[12rem] flex-1 sm:max-w-sm">
          <label htmlFor="resume-title" className="sr-only">
            Resume name
          </label>
          <input
            id="resume-title"
            value={titleDraft}
            maxLength={120}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-full rounded-lg border border-transparent px-2 py-1.5 text-lg font-semibold tracking-tight transition hover:border-slate-200 focus:border-cobalt focus:outline-none focus:ring-4 focus:ring-cobalt/15"
          />
        </div>
        <div className="w-44">
          <Select
            label="Template"
            value={meta.templateId}
            onChange={(e) => {
              const templateId = e.target.value as TemplateId;
              setMeta({ ...meta, templateId });
              patchMeta.mutate({ templateId });
            }}
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <p
          className="inline-flex items-center gap-1.5 pb-2 text-sm text-slate-600"
          role="status"
          aria-live="polite"
        >
          {status === 'saved' && (
            <>
              <Icon name="check" className="h-4 w-4 text-emerald-600" />
              Saved
            </>
          )}
          {status === 'saving' && (
            <>
              <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              Saving…
            </>
          )}
          {status === 'error' && !conflict && (
            <span className="text-red-700">
              Save failed.{' '}
              <button className="font-medium underline" onClick={() => void persist()}>
                Try again
              </button>
            </span>
          )}
          {status === 'error' && conflict && <span className="text-red-700">Save paused</span>}
        </p>
        <div className="ml-auto flex items-center gap-2 pb-1">
          <Button onClick={() => setExportOpen(true)}>
            <Icon name="download" /> Export PDF
          </Button>
          <div className="flex gap-1 lg:hidden" role="group" aria-label="Switch view">
            <Button
              size="sm"
              variant={tab === 'edit' ? 'primary' : 'secondary'}
              aria-pressed={tab === 'edit'}
              onClick={() => setTab('edit')}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant={tab === 'preview' ? 'primary' : 'secondary'}
              aria-pressed={tab === 'preview'}
              onClick={() => setTab('preview')}
            >
              Preview
            </Button>
          </div>
        </div>
      </div>

      {conflict && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900"
        >
          <p className="flex-1">
            This resume was changed somewhere else, such as another tab or a restore. Your latest
            edits are not saved yet.
          </p>
          <Button size="sm" onClick={() => void loadLatest()}>
            Load the latest version
          </Button>
          <Button size="sm" variant="secondary" onClick={keepMine}>
            Keep my edits and overwrite
          </Button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div
          className={`${tab === 'edit' ? 'block' : 'hidden'} min-h-0 overflow-y-auto bg-desk p-4 lg:block`}
        >
          <div
            className="mb-4 flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1"
            role="group"
            aria-label="Editor panels"
          >
            {(['content', 'design', 'versions', 'tailor'] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={panel === p}
                onClick={() => setPanel(p)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${panel === p ? 'bg-white text-ink shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-ink'}`}
              >
                {p === 'content'
                  ? 'Content'
                  : p === 'design'
                    ? 'Design'
                    : p === 'versions'
                      ? 'Versions'
                      : 'Tailor'}
              </button>
            ))}
          </div>

          {panel === 'design' && (
            <DesignPanel templateId={meta.templateId} onFitOnePage={fitOnePage} />
          )}
          {panel === 'tailor' && (
            <TailorPanel resumeId={id} resumeTitle={meta.title} ensureSaved={persist} />
          )}
          {panel === 'versions' && (
            <VersionsPanel
              resumeId={id}
              variantOf={resumeQ.data?.variantOf ?? null}
              ensureSaved={persist}
              getRev={() => revRef.current}
              onReplaced={applyServerResume}
            />
          )}
          {panel === 'content' && (
            <>
              {params.get('welcome') && (
                <div className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-mark/50 p-3 text-sm">
                  <p>
                    Start with your name and contact details. The preview updates as you type, and
                    you can drag sections to reorder them.
                  </p>
                  <button
                    className="font-medium underline"
                    onClick={() => setParams({}, { replace: true })}
                  >
                    Got it
                  </button>
                </div>
              )}
              <div className="space-y-3">
                <section className="rounded-xl border border-slate-200 bg-white">
                  <h2 className="px-2 py-1.5">
                    <button
                      type="button"
                      aria-expanded={personalOpen}
                      onClick={() => setPersonalOpen((o) => !o)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-semibold hover:bg-slate-50"
                    >
                      <Icon
                        name="right"
                        className={`h-4 w-4 text-slate-500 transition-transform ${personalOpen ? 'rotate-90' : ''}`}
                      />
                      Personal details
                    </button>
                  </h2>
                  {personalOpen && (
                    <div className="border-t border-slate-100 p-4">
                      <PersonalForm />
                    </div>
                  )}
                </section>
                <SectionList />
                <Button
                  variant="secondary"
                  onClick={() => dispatch(editorActions.addCustomSection())}
                  disabled={content.custom.length >= 10}
                >
                  <Icon name="plus" /> Add custom section
                </Button>
                <p className="pb-6 text-xs text-slate-600">
                  Empty sections never appear on the resume. Drag the handle (or use the arrows) to
                  reorder sections, and use the eye to hide one.
                </p>
              </div>
            </>
          )}
        </div>

        <div
          className={`${tab === 'preview' ? 'block' : 'hidden'} min-h-0 border-l border-slate-200 lg:block`}
        >
          <PagedPreview
            content={content}
            templateId={meta.templateId}
            style={resolved}
            onFitOnePage={fitOnePage}
          />
        </div>
      </div>
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        resumeId={id}
        title={meta.title}
        templateId={meta.templateId}
        ensureSaved={persist}
        onFitOnePage={fitOnePage}
      />
    </div>
  );
}
