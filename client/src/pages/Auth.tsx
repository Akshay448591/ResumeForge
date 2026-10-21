import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { HeroPreview } from '../components/HeroPreview';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { Icon } from '../components/ui/Icon';
import { PageLoader } from '../components/ui/Spinner';
import { ApiError, api } from '../lib/api';
import { useMe, usePageTitle } from '../lib/auth';
import { emailError } from '../lib/validation';

type Errors = Partial<Record<'name' | 'email' | 'password', string>>;

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register';
  usePageTitle(isRegister ? 'Create account' : 'Sign in');
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      isRegister
        ? api.register({
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
          })
        : api.login({ email: form.email.trim(), password: form.password }),
    onSuccess: (user) => {
      qc.setQueryData(['me'], user);
      navigate('/dashboard');
    },
    onError: (e: Error) => {
      if (e instanceof ApiError && e.fieldErrors) {
        const next: Errors = {};
        for (const k of ['name', 'email', 'password'] as const) {
          if (e.fieldErrors[k]?.[0]) next[k] = e.fieldErrors[k]?.[0];
        }
        setErrors(next);
        if (Object.keys(next).length) return;
      }
      setFormError(e.message);
    },
  });

  if (me.isPending) return <PageLoader />;
  if (me.data) return <Navigate to="/dashboard" replace />;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    if (isRegister && !form.name.trim()) next.name = 'Enter your name.';
    if (!form.email.trim()) next.email = 'Enter your email address.';
    else if (emailError(form.email)) next.email = 'Enter a valid email address.';
    if (!form.password) next.password = 'Enter your password.';
    else if (isRegister && form.password.length < 8) next.password = 'Use at least 8 characters.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length === 0) submit.mutate();
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col justify-center bg-white px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" aria-label="ResumeForge home">
            <Logo />
          </Link>
          <h1 className="mt-10 text-2xl font-semibold tracking-tight">
            {isRegister ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            {isRegister
              ? 'Start building a resume that fits the page.'
              : 'Sign in to pick up where you left off.'}
          </p>
          <form onSubmit={onSubmit} noValidate className="mt-7 space-y-4">
            {formError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
              >
                <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                {formError}
              </p>
            )}
            {isRegister && (
              <Input
                label="Name"
                value={form.name}
                onChange={set('name')}
                error={errors.name}
                autoComplete="name"
              />
            )}
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={set('email')}
              error={errors.email}
              autoComplete="email"
            />
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={set('password')}
              error={errors.password}
              hint={isRegister ? 'At least 8 characters' : undefined}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              endAdornment={
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((s) => !s)}
                  className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-ink"
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} />
                </button>
              }
            />
            <Button type="submit" className="w-full" loading={submit.isPending}>
              {isRegister ? 'Create account' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-6 text-sm text-slate-600">
            {isRegister ? 'Already have an account? ' : 'New here? '}
            <Link
              className="font-medium text-cobalt hover:text-cobalt-dark hover:underline"
              to={isRegister ? '/login' : '/register'}
            >
              {isRegister ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
        </div>
      </section>

      <aside
        aria-hidden="true"
        className="hidden flex-col justify-center gap-8 bg-cobalt px-14 py-12 text-white lg:flex"
      >
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Write it once. Tailor it for every job.
          </h2>
          <ul className="mt-6 space-y-3 text-sm text-white/85">
            {[
              'Live preview with page breaks marked',
              'A separate version for each application',
              'Clean PDF export that matches the screen',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15">
                  <Icon name="check" className="h-3 w-3" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <HeroPreview scale={0.5} crop={0.6} showBreak />
      </aside>
    </main>
  );
}
