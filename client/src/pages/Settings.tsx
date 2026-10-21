import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { ApiError, api } from '../lib/api';
import { useMe, usePageTitle } from '../lib/auth';
import { useToast } from '../store';

function ProfileForm() {
  const { data: user } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setName(user?.name ?? ''), [user?.name]);

  const save = useMutation({
    mutationFn: () => api.updateProfile({ name: name.trim() }),
    onSuccess: (u) => {
      qc.setQueryData(['me'], u);
      toast.success('Profile saved.');
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <form
      noValidate
      className="space-y-4 rounded-xl border border-slate-200 bg-white shadow-card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError('Enter your name.');
        setError(null);
        save.mutate();
      }}
    >
      <h2 className="text-lg font-semibold">Profile</h2>
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={error}
        autoComplete="name"
        maxLength={100}
      />
      <Input
        label="Email"
        value={user?.email ?? ''}
        readOnly
        disabled
        hint="Your email is used to sign in and can’t be changed here."
      />
      <Button type="submit" loading={save.isPending}>
        Save profile
      </Button>
    </form>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});

  const change = useMutation({
    mutationFn: () => api.changePassword({ currentPassword: form.current, newPassword: form.next }),
    onSuccess: () => {
      setForm({ current: '', next: '', confirm: '' });
      toast.success('Password changed.');
    },
    onError: (e: Error) => {
      if (e instanceof ApiError && e.fieldErrors?.currentPassword)
        setErrors({ current: 'Current password is incorrect.' });
      else toast.error(e.message);
    },
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      noValidate
      className="space-y-4 rounded-xl border border-slate-200 bg-white shadow-card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const next: typeof errors = {};
        if (!form.current) next.current = 'Enter your current password.';
        if (form.next.length < 8) next.next = 'Use at least 8 characters.';
        if (form.confirm !== form.next) next.confirm = 'The passwords don’t match.';
        setErrors(next);
        if (Object.keys(next).length === 0) change.mutate();
      }}
    >
      <h2 className="text-lg font-semibold">Change password</h2>
      <Input
        label="Current password"
        type="password"
        value={form.current}
        onChange={set('current')}
        error={errors.current}
        autoComplete="current-password"
      />
      <Input
        label="New password"
        type="password"
        value={form.next}
        onChange={set('next')}
        error={errors.next}
        autoComplete="new-password"
        hint="At least 8 characters"
      />
      <Input
        label="Confirm new password"
        type="password"
        value={form.confirm}
        onChange={set('confirm')}
        error={errors.confirm}
        autoComplete="new-password"
      />
      <Button type="submit" loading={change.isPending}>
        Change password
      </Button>
    </form>
  );
}

export default function Settings() {
  usePageTitle('Account settings');
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-desk">
      <div className="mx-auto max-w-xl space-y-6 px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
        <ProfileForm />
        <PasswordForm />
      </div>
    </div>
  );
}
