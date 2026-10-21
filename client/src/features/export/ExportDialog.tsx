/* eslint-disable no-control-regex -- file names must be stripped of control characters */
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { api, saveBlob } from '../../lib/api';
import { resolveStyle } from '../../lib/templates';
import { useAppDispatch, useAppSelector } from '../../store';
import { editorActions } from '../../store/editorSlice';
import type { ExportJob, TemplateId } from '../../types/resume';
import { PAGE_SIZES } from '../editor/pageSize';
import { PagedPreview } from '../editor/PagedPreview';

interface Props {
  open: boolean;
  onClose: () => void;
  resumeId: string;
  title: string;
  templateId: TemplateId;
  ensureSaved: () => Promise<boolean>;
  onFitOnePage: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const defaultName = (title: string) =>
  title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Resume';

type Phase = 'idle' | 'saving' | 'rendering' | 'done' | 'error';

/** Choose page size and filename, preview the result, then generate and download the PDF. */
export function ExportDialog({
  open,
  onClose,
  resumeId,
  title,
  templateId,
  ensureSaved,
  onFitOnePage,
}: Props) {
  const dispatch = useAppDispatch();
  const content = useAppSelector((s) => s.editor.content);
  const overrides = useAppSelector((s) => s.editor.style);
  const style = resolveStyle(templateId, overrides);

  const [filename, setFilename] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [job, setJob] = useState<ExportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (open) {
      cancelled.current = false;
      setFilename(defaultName(title));
      setPhase('idle');
      setJob(null);
      setError(null);
    } else {
      cancelled.current = true;
    }
  }, [open, title]);

  const name = () => `${filename.trim() || defaultName(title)}.pdf`.replace(/\.pdf\.pdf$/i, '.pdf');

  const download = async (j: ExportJob) => {
    saveBlob(await api.downloadExport(resumeId, j.id, name()), name());
  };

  const generate = async () => {
    setError(null);
    setJob(null);
    setPhase('saving');
    try {
      if (!(await ensureSaved()))
        throw new Error('Your latest edits could not be saved first. Please try again.');
      setPhase('rendering');
      let j = await api.createExport(resumeId, { pageSize: style.pageSize, filename: name() });
      setJob(j);
      for (let i = 0; i < 90 && (j.status === 'queued' || j.status === 'processing'); i++) {
        if (cancelled.current) return;
        await sleep(1000);
        j = await api.getExport(resumeId, j.id);
        setJob(j);
      }
      if (j.status === 'failed') throw new Error(j.error || 'The PDF could not be generated.');
      if (j.status !== 'done')
        throw new Error('The export is taking longer than expected. Please try again in a moment.');
      await download(j);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The export failed. Please try again.');
      setPhase('error');
    }
  };

  const busy = phase === 'saving' || phase === 'rendering';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Export PDF"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {phase === 'done' && job && (
            <Button variant="secondary" onClick={() => void download(job)}>
              Download again
            </Button>
          )}
          <Button loading={busy} onClick={() => void generate()}>
            {phase === 'done' ? 'Generate again' : phase === 'error' ? 'Try again' : 'Generate PDF'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="File name"
            value={filename}
            maxLength={100}
            disabled={busy}
            onChange={(e) => setFilename(e.target.value)}
            hint="“.pdf” is added automatically."
          />
          <fieldset disabled={busy}>
            <legend className="mb-1 text-sm font-medium">Page size</legend>
            <div className="flex gap-4 pt-2 text-sm">
              {(['a4', 'letter'] as const).map((size) => (
                <label key={size} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="export-page-size"
                    checked={style.pageSize === size}
                    onChange={() => dispatch(editorActions.setStyle({ pageSize: size }))}
                    className="accent-[#2F55D4]"
                  />
                  <span>
                    {PAGE_SIZES[size].label}{' '}
                    <span className="text-xs text-slate-600">{PAGE_SIZES[size].detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div role="status" aria-live="polite" className="min-h-[1.5rem] text-sm">
          {phase === 'saving' && (
            <span className="flex items-center gap-2">
              <Spinner className="h-4 w-4" label="Saving" /> Saving your latest edits…
            </span>
          )}
          {phase === 'rendering' && (
            <span className="flex items-center gap-2">
              <Spinner className="h-4 w-4" label="Generating" />
              {job?.status === 'processing'
                ? 'Generating your PDF…'
                : 'Waiting for the PDF renderer…'}
            </span>
          )}
          {phase === 'done' && job && (
            <span className="text-emerald-800">
              Done. Your {job.pages ?? ''}-page PDF
              {job.bytes ? ` (${Math.max(1, Math.round(job.bytes / 1024))} KB)` : ''} was
              downloaded.
            </span>
          )}
        </div>
        {phase === 'error' && error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div>
          <p className="mb-1 text-sm font-medium">Preview</p>
          <div className="h-[46vh] overflow-hidden rounded-lg border border-slate-200">
            {content && (
              <PagedPreview
                content={content}
                templateId={templateId}
                style={style}
                onFitOnePage={onFitOnePage}
              />
            )}
          </div>
          <p className="mt-1 text-xs text-slate-600">
            The PDF is drawn with the same layout and page breaks as this preview. Text stays
            selectable and links stay clickable.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
