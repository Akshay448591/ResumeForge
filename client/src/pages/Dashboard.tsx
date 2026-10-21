import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImportDialog } from '../components/ImportDialog';
import { NewResumeDialog } from '../components/NewResumeDialog';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input, Select } from '../components/ui/Field';
import { Icon } from '../components/ui/Icon';
import { IconButton } from '../components/ui/IconButton';
import { api } from '../lib/api';
import { usePageTitle } from '../lib/auth';
import { formatRelative } from '../lib/validation';
import { useToast } from '../store';
import { TEMPLATES } from '../lib/templates';
import type { ResumeSummary } from '../types/resume';

type Sort = 'updated' | 'created' | 'title';

const STATUS = {
  empty: { label: 'Not started', cls: 'bg-slate-100 text-slate-700' },
  'in-progress': { label: 'In progress', cls: 'bg-amber-100 text-amber-900' },
  complete: { label: 'Complete', cls: 'bg-emerald-100 text-emerald-800' },
} as const;

function ResumeCard({
  r,
  onRename,
  onDuplicate,
  onDelete,
}: {
  r: ResumeSummary;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const status = STATUS[r.completion.status];
  const template = TEMPLATES.find((t) => t.id === r.templateId)?.name ?? r.templateId;

  return (
    <li className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-card transition duration-150 hover:border-slate-200 hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cobalt-soft text-cobalt-dark">
          <Icon name="file" className="h-[18px] w-[18px]" />
        </span>
        <h2 className="min-w-0 flex-1 pt-1.5 text-base font-semibold">
          <Link
            to={`/resumes/${r.id}`}
            className="block truncate rounded hover:text-cobalt hover:underline"
          >
            {r.title}
          </Link>
        </h2>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}>
          {status.label}
        </span>
      </div>
      <dl className="mt-3 space-y-1 text-sm text-slate-700">
        <div className="flex gap-2">
          <dt className="text-slate-500">Template</dt>
          <dd>{template}</dd>
        </div>
        {r.variantOf && (
          <div className="flex gap-2">
            <dt className="text-slate-500">Variant of</dt>
            <dd className="min-w-0 truncate">{r.variantOf.title}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="text-slate-500">Edited</dt>
          <dd>
            <time dateTime={r.updatedAt} title={new Date(r.updatedAt).toLocaleString()}>
              {formatRelative(r.updatedAt)}
            </time>
          </dd>
        </div>
      </dl>
      <div className="mt-3">
        <div
          role="progressbar"
          aria-label={`${r.title} completion`}
          aria-valuenow={r.completion.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 overflow-hidden rounded-full bg-slate-100"
        >
          <div className="h-full rounded-full bg-cobalt transition-all" style={{ width: `${r.completion.percent}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-600">
          {r.completion.percent}% of key sections filled
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <Link
          to={`/resumes/${r.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-cobalt hover:text-cobalt-dark"
        >
          Open editor
          <Icon name="arrowRight" />
        </Link>
        <div className="flex">
          <IconButton icon="edit" label="Rename" onClick={onRename} />
          <IconButton icon="copy" label="Duplicate or create a variant" onClick={onDuplicate} />
          <IconButton icon="trash" label="Delete" danger onClick={onDelete} />
        </div>
      </div>
    </li>
  );
}

function DuplicateDialog({
  resume,
  onClose,
}: {
  resume: ResumeSummary | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  if (resume && resume.id !== lastId) {
    setLastId(resume.id);
    setTitle(`${resume.title} (copy)`.slice(0, 120));
    setError(null);
  }
  const dup = useMutation({
    mutationFn: () => api.duplicateResume(resume!.id, title.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['resumes'] });
      toast.success('Copy created. Open it to tailor it for a role.');
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  return (
    <Dialog open={!!resume} onClose={onClose} title="Duplicate resume">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return setError('Enter a name for the copy.');
          dup.mutate();
        }}
      >
        <p className="mb-3 text-sm text-slate-700">
          The copy is independent, so you can tailor it for a job without changing “{resume?.title}
          ”.
        </p>
        <Input
          label="Name for the copy"
          value={title}
          maxLength={120}
          autoFocus
          error={error}
          hint="Tip: name it after the role, for example “Backend Engineer”."
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={dup.isPending}>
            Create copy
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RenameDialog({ resume, onClose }: { resume: ResumeSummary | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  if (resume && resume.id !== lastId) {
    setLastId(resume.id);
    setTitle(resume.title);
    setError(null);
  }
  const rename = useMutation({
    mutationFn: () => api.updateResume(resume!.id, { title: title.trim() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['resumes'] });
      toast.success('Resume renamed.');
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });
  return (
    <Dialog open={!!resume} onClose={onClose} title="Rename resume">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return setError('Enter a name for this resume.');
          rename.mutate();
        }}
      >
        <Input
          label="Resume name"
          value={title}
          maxLength={120}
          autoFocus
          error={error}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={rename.isPending}>
            Save name
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ resume, onClose }: { resume: ResumeSummary | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const del = useMutation({
    mutationFn: () => api.deleteResume(resume!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['resumes'] });
      toast.success('Resume deleted.');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog
      open={!!resume}
      onClose={onClose}
      title="Delete this resume?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" loading={del.isPending} onClick={() => del.mutate()}>
            Delete resume
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-700">
        “{resume?.title}” will be permanently deleted. This can’t be undone.
      </p>
    </Dialog>
  );
}

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['resumes'],
    queryFn: api.listResumes,
  });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('updated');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<ResumeSummary | null>(null);
  const [deleting, setDeleting] = useState<ResumeSummary | null>(null);
  const [duplicating, setDuplicating] = useState<ResumeSummary | null>(null);
  const [importing, setImporting] = useState(false);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (data ?? []).filter((r) => !q || r.title.toLowerCase().includes(q));
    return list.sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : new Date(b[sort === 'created' ? 'createdAt' : 'updatedAt']).getTime() -
          new Date(a[sort === 'created' ? 'createdAt' : 'updatedAt']).getTime(),
    );
  }, [data, search, sort]);

  const isEmpty = data?.length === 0;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-desk">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your resumes</h1>
            <p className="mt-1 text-sm text-slate-600">
              {data ? `${data.length} ${data.length === 1 ? 'resume' : 'resumes'} · ` : ''}
              Keep a tailored version for every role you apply to.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Icon name="upload" /> Import
            </Button>
            {!isEmpty && (
              <Button onClick={() => setCreating(true)}>
                <Icon name="plus" /> New resume
              </Button>
            )}
          </div>
        </div>

        {isPending && (
          <ul
            className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
            aria-label="Loading resumes"
          >
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex gap-3">
                  <div className="h-9 w-9 rounded-lg bg-slate-100" />
                  <div className="mt-1 h-4 w-2/3 rounded bg-slate-100" />
                </div>
                <div className="mt-6 h-3 w-1/2 rounded bg-slate-100" />
                <div className="mt-3 h-3 w-1/3 rounded bg-slate-100" />
                <div className="mt-8 h-1.5 w-full rounded-full bg-slate-100" />
              </li>
            ))}
          </ul>
        )}

        {isError && (
          <div role="alert" className="mt-6 rounded-xl border border-slate-200 bg-white shadow-card p-6">
            <p className="font-medium">We couldn’t load your resumes.</p>
            <p className="mt-1 text-sm text-slate-600">{(error as Error).message}</p>
            <Button className="mt-4" variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}

        {isEmpty && (
          <section className="mt-6 rounded-xl border border-slate-200 bg-white shadow-card p-8" aria-labelledby="first-title">
            <h2 id="first-title" className="text-xl font-semibold">
              Let’s build your first resume
            </h2>
            <p className="mt-1 text-slate-700">
              It takes about ten minutes. You can change anything later.
            </p>
            <ol className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                [
                  'Pick a template',
                  'Start with any template. You can switch at any time without losing content.',
                ],
                [
                  'Fill in your sections',
                  'Add your details, a short summary, work experience, education and skills.',
                ],
                [
                  'Check the preview',
                  'Watch the page update as you type and see where each page ends.',
                ],
              ].map(([t, d], i) => (
                <li key={t} className="rounded-lg border border-slate-200 p-4">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cobalt-soft text-sm font-semibold text-cobalt-dark">
                    {i + 1}
                  </span>
                  <p className="mt-3 text-sm font-semibold">{t}</p>
                  <p className="mt-1 text-sm text-slate-600">{d}</p>
                </li>
              ))}
            </ol>
            <Button className="mt-6" onClick={() => setCreating(true)}>
              <Icon name="plus" /> Create my first resume
            </Button>
            <Button className="mt-6 ml-2" variant="secondary" onClick={() => setImporting(true)}>
              Import an existing resume
            </Button>
          </section>
        )}

        {data && data.length > 0 && (
          <>
            <div className="mt-6 flex flex-wrap items-end gap-3">
              <div className="min-w-[14rem] flex-1 sm:max-w-sm">
                <Input
                  label="Search resumes"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title"
                />
              </div>
              <div className="w-48">
                <Select
                  label="Sort by"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                >
                  <option value="updated">Last modified</option>
                  <option value="created">Newest created</option>
                  <option value="title">Title (A to Z)</option>
                </Select>
              </div>
            </div>

            {shown.length === 0 ? (
              <p className="mt-8 text-center text-slate-700">
                No resumes match “{search}”.{' '}
                <button className="font-medium text-cobalt underline" onClick={() => setSearch('')}>
                  Clear search
                </button>
              </p>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((r) => (
                  <ResumeCard
                    key={r.id}
                    r={r}
                    onRename={() => setRenaming(r)}
                    onDuplicate={() => setDuplicating(r)}
                    onDelete={() => setDeleting(r)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <NewResumeDialog
        open={creating}
        onClose={() => setCreating(false)}
        isFirst={isEmpty}
        defaultTitle={isEmpty ? 'My first resume' : 'Untitled resume'}
      />
      <RenameDialog resume={renaming} onClose={() => setRenaming(null)} />
      <DuplicateDialog resume={duplicating} onClose={() => setDuplicating(null)} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <DeleteDialog resume={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
