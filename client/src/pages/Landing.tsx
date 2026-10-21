import { Link } from 'react-router-dom';
import { HeroPreview } from '../components/HeroPreview';
import { Logo } from '../components/Logo';
import { buttonClass } from '../components/ui/Button';
import { Icon, type IconName } from '../components/ui/Icon';
import { useMe, usePageTitle } from '../lib/auth';
import { TEMPLATES } from '../lib/templates';

const STEPS = [
  {
    title: 'Choose a template',
    body: 'Start from a clean, tested layout. Switch any time without losing content.',
  },
  {
    title: 'Fill in your sections',
    body: 'Add details, experience, education and skills. Drag sections to reorder them.',
  },
  {
    title: 'Tailor and export',
    body: 'Match a role’s keywords, fit it to the page and download a polished PDF.',
  },
];

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'eye',
    title: 'Live page preview',
    body: 'Zoom, page navigation and page breaks update as you type, so nothing surprises you.',
  },
  {
    icon: 'target',
    title: 'Tailor to each job',
    body: 'Compare your resume against a job description and review keyword and wording suggestions.',
  },
  {
    icon: 'copy',
    title: 'A version per application',
    body: 'Duplicate a resume and adjust it for each role, with the original left untouched.',
  },
  {
    icon: 'history',
    title: 'Version history',
    body: 'Save snapshots and restore an earlier version whenever you need it.',
  },
  {
    icon: 'maximize',
    title: 'Fit to one page',
    body: 'Tighten spacing and type automatically so the content lands exactly on the page.',
  },
  {
    icon: 'download',
    title: 'Clean PDF export',
    body: 'Export a crisp, print-ready PDF that matches the preview you see on screen.',
  },
];

export default function Landing() {
  usePageTitle('Build resumes that fit the page');
  const { data: user } = useMe();
  const primaryTo = user ? '/dashboard' : '/register';
  return (
    <div className="min-h-screen bg-white">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Logo />
          <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
            {[
              ['How it works', '#how'],
              ['Features', '#features'],
              ['Templates', '#templates'],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-ink"
              >
                {label}
              </a>
            ))}
          </nav>
          <nav aria-label="Account" className="flex items-center gap-2">
            {user ? (
              <Link to="/dashboard" className={buttonClass('primary', 'sm')}>
                Open dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className={buttonClass('ghost', 'sm')}>
                  Sign in
                </Link>
                <Link to="/register" className={buttonClass('primary', 'sm')}>
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1fr_auto]">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cobalt/20 bg-cobalt-soft px-3 py-1 text-xs font-medium text-cobalt-dark">
              <Icon name="sparkles" className="h-3.5 w-3.5" />
              Resume builder with job tailoring
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Write the resume once. Keep a version for every job.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-600">
              Fill in your details and watch the page take shape beside you, with the page break
              marked so you know exactly what lands on page two.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={primaryTo} className={buttonClass('primary')}>
                {user ? 'Open dashboard' : 'Create your first resume'}
                <Icon name="arrowRight" />
              </Link>
              {!user && (
                <Link to="/login" className={buttonClass('secondary')}>
                  I already have an account
                </Link>
              )}
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              {['Live preview', 'PDF export', 'Version history'].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Icon name="check" className="h-4 w-4 text-cobalt" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-desk p-6">
            <HeroPreview showBreak />
          </div>
        </section>

        <section id="how" aria-labelledby="how-title" className="border-t border-slate-200 bg-desk">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <p className="text-sm font-medium text-cobalt">How it works</p>
            <h2 id="how-title" className="mt-2 text-3xl font-semibold tracking-tight">
              From blank page to a tailored resume in three steps
            </h2>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-card"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cobalt text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" aria-labelledby="features-title">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <p className="text-sm font-medium text-cobalt">Features</p>
            <h2 id="features-title" className="mt-2 text-3xl font-semibold tracking-tight">
              Everything you need for each application
            </h2>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <li
                  key={f.title}
                  className="rounded-xl border border-slate-200 bg-white p-6 transition duration-150 hover:border-slate-200 hover:shadow-md"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cobalt-soft text-cobalt-dark">
                    <Icon name={f.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="templates"
          aria-labelledby="templates-title"
          className="border-t border-slate-200 bg-desk"
        >
          <div className="mx-auto max-w-6xl px-5 py-20">
            <p className="text-sm font-medium text-cobalt">Templates</p>
            <h2 id="templates-title" className="mt-2 text-3xl font-semibold tracking-tight">
              {TEMPLATES.length} templates, one set of content
            </h2>
            <p className="mt-2 max-w-2xl text-slate-600">
              Every template shows the same content in a different design. Switch at any time and
              your words never change, only the look.
            </p>
            <ul className="mt-10 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-5">
              {TEMPLATES.map((t) => (
                <li key={t.id} className="flex flex-col items-center">
                  <HeroPreview scale={0.26} crop={0.7} templateId={t.id} />
                  <p className="mt-3 text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.visualStyle}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-5 pb-20 pt-4">
          <div className="mx-auto max-w-6xl rounded-2xl bg-cobalt px-8 py-14 text-center text-white">
            <h2 className="text-3xl font-semibold tracking-tight">
              Ready to build a resume that fits the page?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/80">
              Start with a template, fill in your details and export when you’re happy with it.
            </p>
            <Link
              to={primaryTo}
              className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-cobalt-dark shadow-sm transition hover:bg-cobalt-soft active:scale-[0.98]"
            >
              {user ? 'Open dashboard' : 'Create your first resume'}
              <Icon name="arrowRight" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-slate-500">
          <Logo className="text-sm" />
          <span>Build resumes that fit the page.</span>
        </div>
      </footer>
    </div>
  );
}
