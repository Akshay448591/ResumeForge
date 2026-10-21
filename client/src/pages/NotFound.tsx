import { Link } from 'react-router-dom';
import { buttonClass } from '../components/ui/Button';
import { usePageTitle } from '../lib/auth';

export default function NotFound() {
  usePageTitle('Page not found');
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">We can’t find that page</h1>
      <p className="mt-2 text-slate-700">The link may be broken, or the page may have moved.</p>
      <Link to="/" className={`${buttonClass()} mt-6`}>
        Go to the home page
      </Link>
    </main>
  );
}
