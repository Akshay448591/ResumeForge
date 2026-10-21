import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Input, Select } from '../../components/ui/Field';
import { IconButton } from '../../components/ui/IconButton';
import { Spinner } from '../../components/ui/Spinner';
import { api, saveBlob } from '../../lib/api';
import { formatRelative } from '../../lib/validation';
import { useToast } from '../../store';
import type { Change, CompareResult, Resume, VersionMeta } from '../../types/resume';
import { CopySectionsDialog } from './CopySectionsDialog';

interface Props {
  resumeId: string;
  variantOf: { id: string; title: string } | null;
  /** Saves any pending edits. Resolves false if that failed. */
  ensureSaved: () => Promise<boolean>;
  getRev: () => number;
  onReplaced: (r: Resume) => void;
}

const BADGE: Record<Change['kind'], string> = {
  added: 'bg-emerald-100 text-emerald-800',
  removed: 'bg-red-100 text-red-800',
  changed: 'bg-amber-100 text-amber-900',
  moved: 'bg-cobalt-soft text-cobalt-dark',
};

function CompareView({ result, onClose }: { result: CompareResult; onClose: () => void }) {
  const areas = [...new Set(result.changes.map((c) => c.area))];
  return (
    <section className="rounded-xl border border-cobalt bg-white p-4" aria-label="Comparison">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">
          {result.from} <span className="font-normal text-slate-600">compared with</span>{' '}
          {result.to}
        </h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      {result.changes.length === 0 ? (
        <p className="mt-3 text-sm text-slate-700">
          No differences in content, section order or design.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-slate-600">
            {result.changes.length} {result.changes.length === 1 ? 'difference' : 'differences'}.
            “Before” is the first item, “after” is the second.
          </p>
          {areas.map((area) => (
            <div key={area}>
              <h4 className="text-sm font-semibold">{area}</h4>
              <ul className="mt-1 space-y-2">
                {result.changes
                  .filter((c) => c.area === area)
                  .map((c, i) => (
                    <li key={i} className="text-sm">
                      <span
                        className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${BADGE[c.kind]}`}
                      >
                        {c.kind[0].toUpperCase() + c.kind.slice(1)}
                      </span>
                      {c.label}
                      {(c.before !== undefined || c.after !== undefined) && (
                        <dl className="mt-1 grid gap-1 text-xs sm:grid-cols-2">
                          <div className="rounded bg-red-50 p-2">
                            <dt className="font-medium text-red-800">Before</dt>
                            <dd className="whitespace-pre-wrap break-words">
                              {c.before || '(empty)'}
                            </dd>
                          </div>
                          <div className="rounded bg-emerald-50 p-2">
                            <dt className="font-medium text-emerald-800">After</dt>
                            <dd className="whitespace-pre-wrap break-words">
                              {c.after || '(empty)'}
                            </dd>
                          </div>
                        </dl>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function VersionsPanel({ resumeId, variantOf, ensureSaved, getRev, onReplaced }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [action, setAction] = useState<{
    type: 'restore' | 'rename' | 'delete';
    v: VersionMeta;
  } | null>(null);
  const [renameTo, setRenameTo] = useState('');
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [otherId, setOtherId] = useState('');
  const [copyOpen, setCopyOpen] = useState(false);

  const versions = useQuery({
    queryKey: ['versions', resumeId],
    queryFn: () => api.listVersions(resumeId),
  });
  const resumes = useQuery({ queryKey: ['resumes'], queryFn: api.listResumes });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['versions', resumeId] });
  const fail = (e: Error) => toast.error(e.message);

  const save = useMutation({
    mutationFn: async () => {
      if (!(await ensureSaved()))
        throw new Error('Your latest edits could not be saved first. Please try again.');
      return api.createVersion(resumeId, name.trim());
    },
    onSuccess: (v) => {
      setName('');
      refresh();
      toast.success(`Saved version “${v.name}”.`);
    },
    onError: fail,
  });

  const restore = useMutation({
    mutationFn: async (v: VersionMeta) => {
      if (!(await ensureSaved()))
        throw new Error('Your latest edits could not be saved first. Please try again.');
      return api.restoreVersion(resumeId, v.id, getRev());
    },
    onSuccess: (r) => {
      onReplaced(r);
      refresh();
      setAction(null);
      setCompare(null);
      toast.success('Version restored. Your previous state was saved as an automatic version.');
    },
    onError: (e: Error) => {
      setAction(null);
      fail(e);
    },
  });

  const rename = useMutation({
    mutationFn: (v: VersionMeta) => api.renameVersion(resumeId, v.id, renameTo.trim()),
    onSuccess: () => {
      refresh();
      setAction(null);
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (v: VersionMeta) => api.deleteVersion(resumeId, v.id),
    onSuccess: () => {
      refresh();
      setAction(null);
      toast.success('Version deleted.');
    },
    onError: fail,
  });

  const runCompare = useMutation({
    mutationFn: async (v: { from: string; to: string }) => {
      if (!(await ensureSaved()))
        throw new Error('Your latest edits could not be saved first. Please try again.');
      return api.compare(v.from, v.to);
    },
    onSuccess: setCompare,
    onError: fail,
  });

  const exportJson = useMutation({
    mutationFn: async () => {
      if (!(await ensureSaved()))
        throw new Error('Your latest edits could not be saved first. Please try again.');
      return api.exportResume(resumeId);
    },
    onSuccess: ({ blob, filename }) => saveBlob(blob, filename),
    onError: fail,
  });

  const list = versions.data?.versions ?? [];
  const limit = versions.data?.limit ?? 10;
  const others = (resumes.data ?? []).filter((r) => r.id !== resumeId);

  return (
    <div className="space-y-4">
      {compare && <CompareView result={compare} onClose={() => setCompare(null)} />}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Save a version</h2>
        <p className="mt-1 text-sm text-slate-600">
          Keep a snapshot you can come back to, such as “Backend Engineer” or “Before the layout
          change”.
        </p>
        <form
          noValidate
          className="mt-3 flex items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return setNameError('Give this version a name.');
            setNameError(null);
            save.mutate();
          }}
        >
          <div className="flex-1">
            <Input
              label="Version name"
              value={name}
              maxLength={80}
              error={nameError}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
            />
          </div>
          <Button type="submit" className="mt-6" loading={save.isPending}>
            Save version
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Version history</h2>
          <span className="text-xs text-slate-600">
            {list.length} of {limit} kept
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          When the limit is reached, the oldest unnamed version is removed. Named versions are never
          removed automatically.
        </p>
        {versions.isPending && (
          <div className="mt-3 text-cobalt">
            <Spinner label="Loading versions" />
          </div>
        )}
        {versions.isError && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            We couldn’t load your versions.
          </p>
        )}
        {versions.data && list.length === 0 && (
          <p className="mt-3 text-sm text-slate-700">
            No versions yet. Save one above, or one is created automatically before a restore.
          </p>
        )}
        <ul className="mt-3 space-y-3">
          {list.map((v) => (
            <li key={v.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{v.name || v.note || 'Automatic backup'}</p>
                  <p className="text-xs text-slate-600">
                    <time dateTime={v.createdAt} title={new Date(v.createdAt).toLocaleString()}>
                      {formatRelative(v.createdAt)}
                    </time>
                    {' · '}
                    {v.name ? 'Named' : 'Automatic'}
                  </p>
                </div>
                <div className="flex shrink-0">
                  <IconButton
                    icon="edit"
                    label="Rename"
                    onClick={() => {
                      setRenameTo(v.name);
                      setAction({ type: 'rename', v });
                    }}
                  />
                  <IconButton
                    icon="trash"
                    label="Delete"
                    danger
                    onClick={() => setAction({ type: 'delete', v })}
                  />
                </div>
              </div>
              {v.summary.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-700">
                  {v.summary.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={runCompare.isPending}
                  onClick={() => runCompare.mutate({ from: `${resumeId}:${v.id}`, to: resumeId })}
                >
                  Compare with current
                </Button>
                <Button size="sm" onClick={() => setAction({ type: 'restore', v })}>
                  Restore
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Variants and other resumes</h2>
        <p className="mt-1 text-sm text-slate-600">
          Duplicate a resume from the dashboard to tailor it for a role without changing the
          original.
        </p>
        {variantOf && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span>Variant of “{variantOf.title}”.</span>
            <Button
              size="sm"
              variant="secondary"
              loading={runCompare.isPending}
              onClick={() => runCompare.mutate({ from: variantOf.id, to: resumeId })}
            >
              Compare with original
            </Button>
          </div>
        )}
        {others.length > 0 && (
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <Select
                label="Compare with another resume"
                value={otherId}
                onChange={(e) => setOtherId(e.target.value)}
              >
                <option value="">Choose a resume</option>
                {others.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              disabled={!otherId}
              loading={runCompare.isPending}
              onClick={() => runCompare.mutate({ from: otherId, to: resumeId })}
            >
              Compare
            </Button>
          </div>
        )}
        <Button className="mt-4" variant="secondary" onClick={() => setCopyOpen(true)}>
          Copy sections from another resume
        </Button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Backup and portability</h2>
        <p className="mt-1 text-sm text-slate-600">
          Download this resume as a structured JSON file. You can import it again from the
          dashboard.
        </p>
        <Button
          className="mt-3"
          variant="secondary"
          loading={exportJson.isPending}
          onClick={() => exportJson.mutate()}
        >
          Export as JSON
        </Button>
      </section>

      <Dialog
        open={action?.type === 'restore'}
        onClose={() => setAction(null)}
        title="Restore this version?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button loading={restore.isPending} onClick={() => action && restore.mutate(action.v)}>
              Restore version
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          “{action?.v.name || action?.v.note || 'This version'}” will replace your current content
          and design. Your current resume is saved as an automatic version first, so you can always
          restore it.
        </p>
      </Dialog>

      <Dialog
        open={action?.type === 'rename'}
        onClose={() => setAction(null)}
        title="Rename version"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button
              disabled={!renameTo.trim()}
              loading={rename.isPending}
              onClick={() => action && rename.mutate(action.v)}
            >
              Save name
            </Button>
          </>
        }
      >
        <Input
          label="Version name"
          value={renameTo}
          maxLength={80}
          autoFocus
          onChange={(e) => setRenameTo(e.target.value)}
          hint="Named versions are protected from automatic clean-up."
        />
      </Dialog>

      <Dialog
        open={action?.type === 'delete'}
        onClose={() => setAction(null)}
        title="Delete this version?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => action && remove.mutate(action.v)}
            >
              Delete version
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          “{action?.v.name || action?.v.note || 'This version'}” will be permanently deleted.
        </p>
      </Dialog>

      <CopySectionsDialog
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        resumeId={resumeId}
        ensureSaved={ensureSaved}
        getRev={getRev}
        onReplaced={onReplaced}
      />
    </div>
  );
}
