import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Button } from './components/ui/Button';
import { PageLoader } from './components/ui/Spinner';
import { ToastHost } from './components/ui/ToastHost';
import EditorPage from './features/editor/EditorPage';
import PrintPage from './features/print/PrintPage';
import { ApiError } from './lib/api';
import { useMe } from './lib/auth';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import NotFound from './pages/NotFound';
import Settings from './pages/Settings';
import Templates from './pages/Templates';

function RequireAuth() {
  const { isPending, isError, error, refetch } = useMe();
  if (isPending) return <PageLoader />;
  if (isError) {
    if (error instanceof ApiError && error.status === 401) return <Navigate to="/login" replace />;
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="font-medium">We couldn’t reach the server.</p>
        <p className="mt-1 text-sm text-slate-600">{error.message}</p>
        <Button className="mt-4" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return <Outlet />;
}

export default function App() {
  const isPrint = useLocation().pathname === '/print';
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/print" element={<PrintPage />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/register" element={<Auth mode="register" />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/resumes/:id" element={<EditorPage />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!isPrint && <ToastHost />}
    </>
  );
}
