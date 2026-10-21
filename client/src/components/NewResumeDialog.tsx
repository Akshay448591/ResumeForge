import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../store';
import { TEMPLATES } from '../lib/templates';
import type { TemplateId } from '../types/resume';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Input } from './ui/Field';

interface Props {
  open: boolean;
  onClose: () => void;
  defaultTitle?: string;
  defaultTemplate?: TemplateId;
  isFirst?: boolean;
}

export function NewResumeDialog({
  open,
  onClose,
  defaultTitle = 'Untitled resume',
  defaultTemplate = 'professional',
  isFirst,
}: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [templateId, setTemplateId] = useState<TemplateId>(defaultTemplate);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setTemplateId(defaultTemplate);
      setError(null);
    }
  }, [open, defaultTitle, defaultTemplate]);

  const create = useMutation({
    mutationFn: () => api.createResume({ title: title.trim(), templateId }),
    onSuccess: (resume) => {
      void qc.invalidateQueries({ queryKey: ['resumes'] });
      onClose();
      navigate(`/resumes/${resume.id}${isFirst ? '?welcome=1' : ''}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('Give your resume a name so you can find it later.');
    create.mutate();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Create a resume">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Input
          label="Resume name"
          value={title}
          maxLength={120}
          autoFocus
          error={error}
          hint="Only you see this, for example “Product designer – Acme”."
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
        />
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Template</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <label
                key={t.id}
                className={`cursor-pointer rounded-lg border p-3 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cobalt ${
                  templateId === t.id
                    ? 'border-cobalt bg-cobalt-soft'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="template"
                  value={t.id}
                  checked={templateId === t.id}
                  onChange={() => setTemplateId(t.id)}
                  className="sr-only"
                />
                <span className="block font-semibold">{t.name}</span>
                <span className="mt-0.5 block text-xs text-slate-600">{t.blurb}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending}>
            Create resume
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
