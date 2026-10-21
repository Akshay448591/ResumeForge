import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Checkbox, Select } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Spinner';
import { api } from '../../lib/api';
import { useToast } from '../../store';
import { SECTION_LABELS, sectionHasContent, type Resume } from '../../types/resume';

interface Props {
  open: boolean;
  onClose: () => void;
  resumeId: string;
  ensureSaved: () => Promise<boolean>;
  getRev: () => number;
  onReplaced: (r: Resume) => void;
}

/** Copy chosen sections from another of your resumes into this one. */
export function CopySectionsDialog({
  open,
  onClose,
  resumeId,
  ensureSaved,
  getRev,
  onReplaced,
}: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [sourceId, setSourceId] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [picked, setPicked] = useState<string[]>([]);

  const resumes = useQuery({ queryKey: ['resumes'], queryFn: api.listResumes, enabled: open });
  const others = (resumes.data ?? []).filter((r) => r.id !== resumeId);
  const source = useQuery({
    queryKey: ['resume-source', sourceId],
    queryFn: () => api.getResume(sourceId),
    enabled: open && !!sourceId,
    gcTime: 0,
  });

  useEffect(() => {
    if (open) {
      setSourceId('');
      setMode('append');
      setPicked([]);
    }
  }, [open]);
  useEffect(() => setPicked([]), [sourceId]);

  const sections = source.data
    ? source.data.content.sections
        .filter((s) => sectionHasContent(source.data.content, s))
        .map((s) => ({
          id: s.id,
          label:
            s.type === 'custom'
              ? (source.data.content.custom.find((c) => c.id === s.id)?.title ?? 'Custom section')
              : s.title?.trim() || SECTION_LABELS[s.type],
        }))
    : [];

  const copy = useMutation({
    mutationFn: async () => {
      if (!(await ensureSaved()))
        throw new Error('Your latest edits could not be saved first. Please try again.');
      return api.copySections(resumeId, {
        fromResumeId: sourceId,
        sectionIds: picked,
        mode,
        baseRev: getRev(),
      });
    },
    onSuccess: ({ resume, report }) => {
      onReplaced(resume);
      void qc.invalidateQueries({ queryKey: ['versions', resumeId] });
      toast.success(report.join(' '));
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Copy sections from another resume"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!sourceId || picked.length === 0}
            loading={copy.isPending}
            onClick={() => copy.mutate()}
          >
            Copy {picked.length || ''} {picked.length === 1 ? 'section' : 'sections'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {resumes.isPending ? (
          <Spinner label="Loading your resumes" />
        ) : others.length === 0 ? (
          <p className="text-sm text-slate-700">
            You need another resume to copy from. Create or duplicate one first.
          </p>
        ) : (
          <Select label="Copy from" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">Choose a resume</option>
            {others.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </Select>
        )}

        {sourceId && source.isPending && <Spinner label="Loading sections" />}
        {sourceId && source.isError && (
          <p className="text-sm text-red-700">We couldn’t load that resume.</p>
        )}
        {source.data && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Sections to copy</legend>
            {sections.length === 0 ? (
              <p className="text-sm text-slate-700">That resume has no filled-in sections yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {sections.map((s) => (
                  <li key={s.id}>
                    <Checkbox
                      label={s.label}
                      checked={picked.includes(s.id)}
                      onChange={() =>
                        setPicked((p) =>
                          p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id],
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}

        {source.data && sections.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">
              If this resume already has that section
            </legend>
            <div className="space-y-1.5 text-sm">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="copy-mode"
                  checked={mode === 'append'}
                  onChange={() => setMode('append')}
                  className="mt-1 accent-[#2F55D4]"
                />
                <span>
                  <b>Add to it.</b> Keeps what you have and adds the copied entries after it.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="copy-mode"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                  className="mt-1 accent-[#2F55D4]"
                />
                <span>
                  <b>Replace it.</b> Your current version is saved as an automatic backup first, so
                  you can restore it.
                </span>
              </label>
            </div>
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}
