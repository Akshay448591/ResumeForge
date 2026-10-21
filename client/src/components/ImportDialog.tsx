import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { TEMPLATES } from '../lib/templates';
import {
  SECTION_LABELS,
  sectionHasContent,
  type ResumeContent,
  type SectionConfig,
  type StyleOverrides,
  type TemplateId,
} from '../types/resume';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Input, Textarea } from './ui/Field';
import { Spinner } from './ui/Spinner';

interface Parsed {
  content: ResumeContent;
  warnings: string[];
  templateId: TemplateId;
  style: StyleOverrides;
  title: string;
  source: 'docx' | 'json';
}

const sectionTitle = (c: ResumeContent, s: SectionConfig) =>
  s.type === 'custom'
    ? (c.custom.find((x) => x.id === s.id)?.title ?? 'Custom section')
    : s.title?.trim() || SECTION_LABELS[s.type];

/** A few readable lines so people can check how their document was understood. */
function previewLines(c: ResumeContent, s: SectionConfig): string[] {
  switch (s.type) {
    case 'summary':
      return [c.summary.slice(0, 140) + (c.summary.length > 140 ? '…' : '')];
    case 'experience':
      return c.experience.map((e) =>
        [
          [e.role, e.company].filter(Boolean).join(' at '),
          [e.startDate, e.current ? 'Present' : e.endDate].filter(Boolean).join(' – '),
        ]
          .filter(Boolean)
          .join('  ·  '),
      );
    case 'education':
      return c.education.map((e) =>
        [[e.degree, e.field].filter(Boolean).join(' in '), e.institution]
          .filter(Boolean)
          .join(', '),
      );
    case 'skills':
      return [c.skills.map((x) => x.name).join(', ')];
    case 'projects':
      return c.projects.map((x) => x.name);
    case 'certifications':
      return c.certifications.map((x) => x.name);
    case 'awards':
      return c.awards.map((x) => x.title);
    case 'languages':
      return [c.languages.map((x) => (x.level ? `${x.name} (${x.level})` : x.name)).join(', ')];
    case 'custom':
      return (c.custom.find((x) => x.id === s.id)?.items ?? []).map(
        (i) => i.heading || i.description.slice(0, 80),
      );
  }
}

function clearSection(c: ResumeContent, s: SectionConfig): ResumeContent {
  const next = structuredClone(c);
  if (s.type === 'summary') next.summary = '';
  else if (s.type === 'custom') {
    next.custom = next.custom.filter((x) => x.id !== s.id);
    next.sections = next.sections.filter((x) => x.id !== s.id);
  } else (next[s.type] as unknown[]) = [];
  return next;
}

/** Import a Word document (.docx) or a ResumeForge JSON backup, with a review step before anything is saved. */
export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [personal, setPersonal] = useState({
    fullName: '',
    title: '',
    email: '',
    phone: '',
    location: '',
  });
  const [summary, setSummary] = useState('');
  const [excluded, setExcluded] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setParsed(null);
      setError(null);
      setBusy(false);
      setExcluded([]);
    }
  }, [open]);

  const load = (p: Parsed) => {
    setParsed(p);
    setTitle(p.title);
    setPersonal({
      fullName: p.content.personal.fullName,
      title: p.content.personal.title,
      email: p.content.personal.email,
      phone: p.content.personal.phone,
      location: p.content.personal.location,
    });
    setSummary(p.content.summary);
    setExcluded([]);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const lower = file.name.toLowerCase();
      const base = file.name.replace(/\.[^.]+$/, '') || 'Imported resume';
      if (lower.endsWith('.docx')) {
        const r = await api.importDocx(file);
        load({
          content: r.content,
          warnings: r.warnings,
          templateId: 'ats',
          style: {},
          title: base,
          source: 'docx',
        });
      } else if (lower.endsWith('.json')) {
        let data: unknown;
        try {
          data = JSON.parse(await file.text());
        } catch {
          throw new Error('That file isn’t valid JSON.');
        }
        const d = data as {
          format?: string;
          content?: ResumeContent;
          templateId?: TemplateId;
          style?: StyleOverrides;
          title?: string;
        };
        if (d?.format !== 'resumeforge.resume' || !d.content) {
          throw new Error('That JSON file isn’t a ResumeForge export.');
        }
        load({
          content: d.content,
          warnings: [],
          templateId: TEMPLATES.some((t) => t.id === d.templateId)
            ? (d.templateId as TemplateId)
            : 'professional',
          style: d.style ?? {},
          title: d.title || base,
          source: 'json',
        });
      } else {
        throw new Error('Choose a Word document (.docx) or a ResumeForge JSON export (.json).');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We couldn’t import that file.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const create = useMutation({
    mutationFn: () => {
      if (!parsed) throw new Error('Nothing to import.');
      let content = structuredClone(parsed.content);
      for (const s of parsed.content.sections.filter((x) => excluded.includes(x.id)))
        content = clearSection(content, s);
      content.personal = { ...content.personal, ...personal };
      if (!excluded.includes('summary')) content.summary = summary;
      return api.createResume({
        title: title.trim(),
        templateId: parsed.templateId,
        content,
        style: parsed.style,
      });
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['resumes'] });
      onClose();
      navigate(`/resumes/${r.id}`);
    },
    onError: (e: Error) =>
      setError(
        e instanceof ApiError ? e.message : 'We couldn’t create the resume. Please try again.',
      ),
  });

  const sections = parsed
    ? parsed.content.sections.filter((s) => sectionHasContent(parsed.content, s))
    : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={parsed ? 'Review before importing' : 'Import a resume'}
      footer={
        parsed ? (
          <>
            <Button variant="secondary" onClick={() => setParsed(null)}>
              Choose a different file
            </Button>
            <Button
              loading={create.isPending}
              disabled={!title.trim()}
              onClick={() => create.mutate()}
            >
              Create resume
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        )
      }
    >
      {!parsed ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Upload a Word document (.docx) and we’ll read the text and sort it into sections. You’ll
            review everything before it’s saved. You can also import a JSON backup exported from
            ResumeForge.
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">File</span>
            <input
              ref={fileRef}
              type="file"
              accept=".docx,.json,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={busy}
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-cobalt file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-cobalt-dark"
            />
          </label>
          {busy && (
            <p className="flex items-center gap-2 text-sm text-slate-700" role="status">
              <Spinner className="h-4 w-4" label="Reading your file" /> Reading your file…
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <p className="text-xs text-slate-600">
            Best results come from a simple, text-based Word file. Scanned documents, images and
            heavily designed layouts may not import well.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          {parsed.warnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">
              <p className="font-medium">Please check</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {parsed.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <Input
            label="Resume name"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold">Personal details</legend>
            <Input
              label="Full name"
              value={personal.fullName}
              onChange={(e) => setPersonal({ ...personal, fullName: e.target.value })}
            />
            <Input
              label="Professional title"
              value={personal.title}
              onChange={(e) => setPersonal({ ...personal, title: e.target.value })}
            />
            <Input
              label="Email"
              value={personal.email}
              onChange={(e) => setPersonal({ ...personal, email: e.target.value })}
            />
            <Input
              label="Phone"
              value={personal.phone}
              onChange={(e) => setPersonal({ ...personal, phone: e.target.value })}
            />
            <Input
              label="Location"
              value={personal.location}
              onChange={(e) => setPersonal({ ...personal, location: e.target.value })}
            />
          </fieldset>
          <Textarea
            label="Summary"
            rows={3}
            value={summary}
            maxLength={1500}
            onChange={(e) => setSummary(e.target.value)}
          />

          <fieldset>
            <legend className="mb-1 text-sm font-semibold">What we found</legend>
            {sections.length === 0 ? (
              <p className="text-sm text-slate-700">
                No sections were detected. You can still create the resume and fill it in.
              </p>
            ) : (
              <ul className="space-y-2">
                {sections.map((s) => {
                  const lines = previewLines(parsed.content, s).filter(Boolean);
                  return (
                    <li key={s.id} className="rounded-lg border border-slate-200 p-3">
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#2F55D4]"
                          checked={!excluded.includes(s.id)}
                          onChange={() =>
                            setExcluded((x) =>
                              x.includes(s.id) ? x.filter((i) => i !== s.id) : [...x, s.id],
                            )
                          }
                        />
                        {sectionTitle(parsed.content, s)}
                        <span className="font-normal text-slate-600">
                          ({lines.length} {lines.length === 1 ? 'item' : 'items'})
                        </span>
                      </label>
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-9 text-xs text-slate-700">
                        {lines.slice(0, 5).map((l, i) => (
                          <li key={i} className="break-words">
                            {l}
                          </li>
                        ))}
                        {lines.length > 5 && <li>and {lines.length - 5} more</li>}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-600">
              Untick anything you don’t want to bring in. You can refine every entry in the editor
              afterwards.
            </p>
          </fieldset>
        </div>
      )}
    </Dialog>
  );
}
