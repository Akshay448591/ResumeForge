import { useMemo, useState } from 'react';
import { NewResumeDialog } from '../components/NewResumeDialog';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Field';
import { PAGE_H, PAGE_W, ResumePreview } from '../features/editor/ResumePreview';
import { usePageTitle } from '../lib/auth';
import { TEMPLATES, resolveStyle, type VisualStyle } from '../lib/templates';
import { SAMPLE_CONTENT, type TemplateId } from '../types/resume';

const SCALE = 0.34;
const USES = [...new Set(TEMPLATES.map((t) => t.bestFor))];
const STYLES: VisualStyle[] = ['Plain', 'Traditional', 'Modern', 'Minimal'];

export default function Templates() {
  usePageTitle('Templates');
  const [chosen, setChosen] = useState<TemplateId | null>(null);
  const [last, setLast] = useState<TemplateId>('professional');
  const [style, setStyle] = useState('all');
  const [use, setUse] = useState('all');

  const shown = useMemo(
    () =>
      TEMPLATES.filter(
        (t) => (style === 'all' || t.visualStyle === style) && (use === 'all' || t.bestFor === use),
      ),
    [style, use],
  );

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-desk">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
        <p className="mt-1 max-w-2xl text-slate-700">
          Every template shows the same content in a different design. Pick one to start a new
          resume, or switch templates any time from the editor without losing anything.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <div className="w-48">
            <Select label="Visual style" value={style} onChange={(e) => setStyle(e.target.value)}>
              <option value="all">All styles</option>
              {STYLES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
          <div className="w-56">
            <Select label="Best for" value={use} onChange={(e) => setUse(e.target.value)}>
              <option value="all">Any use</option>
              {USES.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="mt-8 text-slate-700">
            No templates match those filters.{' '}
            <button
              className="font-medium text-cobalt underline"
              onClick={() => {
                setStyle('all');
                setUse('all');
              }}
            >
              Clear filters
            </button>
          </p>
        ) : (
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((t) => (
              <li
                key={t.id}
                className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-card transition duration-150 hover:border-slate-200 hover:shadow-md"
              >
                <div
                  aria-hidden="true"
                  className="mx-auto overflow-hidden bg-white shadow-card ring-1 ring-slate-200"
                  style={{ width: PAGE_W * SCALE, height: PAGE_H * SCALE }}
                >
                  <div
                    style={{
                      transform: `scale(${SCALE})`,
                      transformOrigin: 'top left',
                      width: PAGE_W,
                    }}
                  >
                    <ResumePreview
                      content={SAMPLE_CONTENT}
                      templateId={t.id}
                      style={resolveStyle(t.id)}
                    />
                  </div>
                </div>
                <h2 className="mt-4 font-semibold">{t.name}</h2>
                <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-cobalt-soft px-2 py-0.5 font-medium text-cobalt-dark">
                    {t.visualStyle}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                    {t.bestFor}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                    {t.layouts.includes('two-column') ? 'Single or two columns' : 'Single column'}
                  </span>
                </p>
                <p className="mt-2 flex-1 text-sm text-slate-600">{t.blurb}</p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    setLast(t.id);
                    setChosen(t.id);
                  }}
                >
                  Use {t.name}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-slate-600">Previews use sample content.</p>
      </div>
      <NewResumeDialog
        open={chosen !== null}
        onClose={() => setChosen(null)}
        defaultTemplate={chosen ?? last}
      />
    </div>
  );
}
