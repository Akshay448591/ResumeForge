import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { Logo } from './Logo';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-cobalt-soft text-cobalt-dark' : 'text-slate-600 hover:bg-slate-100 hover:text-ink'
  }`;

export function AppShell() {
  const { data: user } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      qc.clear();
      navigate('/');
    },
  });

  return (
    <div className="min-h-screen bg-white">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-white px-3 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:left-2 focus:top-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" aria-label="ResumeForge home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="flex gap-1">
            <NavLink to="/dashboard" className={linkClass}>
              <Icon name="dashboard" />
              Dashboard
            </NavLink>
            <NavLink to="/templates" className={linkClass}>
              <Icon name="templates" />
              Templates
            </NavLink>
            <NavLink to="/settings" className={linkClass}>
              <Icon name="settings" />
              Settings
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-cobalt-soft text-sm font-semibold text-cobalt-dark"
          >
            {user?.name?.trim().charAt(0).toUpperCase()}
          </span>
          <span className="hidden text-sm font-medium text-slate-700 sm:inline">{user?.name}</span>
          <Button
            size="sm"
            variant="secondary"
            loading={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <Icon name="logout" />
            Sign out
          </Button>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
    </div>
  );
}
