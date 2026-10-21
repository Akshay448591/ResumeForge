import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Field';
import { Slider } from '../../components/ui/Slider';
import {
  ACCENT_SWATCHES,
  DENSITY_PRESETS,
  DIVIDER_STYLES,
  FONTS,
  HEADING_STYLES,
  LIMITS,
  getTemplate,
  resolveStyle,
} from '../../lib/templates';
import { useAppDispatch, useAppSelector } from '../../store';
import { editorActions } from '../../store/editorSlice';
import type { DividerStyle, FontId, HeadingStyle, TemplateId } from '../../types/resume';

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="mb-3 font-semibold">{title}</h2>
    <div className="space-y-4">{children}</div>
  </section>
);

export function DesignPanel({
  templateId,
  onFitOnePage,
}: {
  templateId: TemplateId;
  onFitOnePage: () => void;
}) {
  const dispatch = useAppDispatch();
  const overrides = useAppSelector((s) => s.editor.style);
  const template = getTemplate(templateId);
  const s = resolveStyle(templateId, overrides);
  const set = (patch: Parameters<typeof editorActions.setStyle>[0]) =>
    dispatch(editorActions.setStyle(patch));
  const twoColumnAllowed = template.layouts.includes('two-column');

  const activePreset =
    DENSITY_PRESETS.find((p) => {
      const keys = ['fontSize', 'lineHeight', 'sectionSpacing', 'margin'] as const;
      return keys.every((k) => overrides[k] === p.values[k]);
    })?.id ?? null;

  return (
    <div className="space-y-3">
      <Group title="Density preset">
        <div className="grid grid-cols-2 gap-2">
          {DENSITY_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={activePreset === p.id}
              onClick={() =>
                set({
                  fontSize: p.values.fontSize,
                  lineHeight: p.values.lineHeight,
                  sectionSpacing: p.values.sectionSpacing,
                  margin: p.values.margin,
                })
              }
              className={`rounded-lg border p-2.5 text-left text-sm ${
                activePreset === p.id
                  ? 'border-cobalt bg-cobalt-soft'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="block font-medium">{p.name}</span>
              <span className="block text-xs text-slate-600">{p.note}</span>
            </button>
          ))}
        </div>
      </Group>

      <Group title="Colour">
        <div role="group" aria-label="Accent colour" className="flex flex-wrap items-center gap-2">
          {ACCENT_SWATCHES.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={c.name}
              aria-pressed={s.accent.toLowerCase() === c.value.toLowerCase()}
              onClick={() => set({ accent: c.value })}
              style={{ background: c.value }}
              className="h-8 w-8 rounded-full ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-ink"
            />
          ))}
          <label className="ml-1 flex items-center gap-2 text-sm">
            <span>Custom</span>
            <input
              type="color"
              value={s.accent}
              onChange={(e) => set({ accent: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
            />
          </label>
          {overrides.accent && (
            <Button size="sm" variant="ghost" onClick={() => set({ accent: undefined })}>
              Use template colour
            </Button>
          )}
        </div>
      </Group>

      <Group title="Typography">
        <Select
          label="Font"
          value={s.fontFamily}
          onChange={(e) => set({ fontFamily: e.target.value as FontId })}
        >
          {Object.entries(FONTS).map(([id, f]) => (
            <option key={id} value={id}>
              {f.label}
            </option>
          ))}
        </Select>
        <Slider
          label="Font size"
          unit=" px"
          value={s.fontSize}
          {...LIMITS.fontSize}
          onChange={(v) => set({ fontSize: v })}
        />
        <Slider
          label="Line height"
          value={s.lineHeight}
          {...LIMITS.lineHeight}
          onChange={(v) => set({ lineHeight: Number(v.toFixed(2)) })}
        />
      </Group>

      <Group title="Spacing">
        <Slider
          label="Space between sections"
          unit=" px"
          value={s.sectionSpacing}
          {...LIMITS.sectionSpacing}
          onChange={(v) => set({ sectionSpacing: v })}
        />
        <Slider
          label="Page margins"
          unit=" px"
          value={s.margin}
          {...LIMITS.margin}
          onChange={(v) => set({ margin: v })}
        />
      </Group>

      <Group title="Headings and dividers">
        <Select
          label="Heading style"
          value={s.headingStyle}
          onChange={(e) => set({ headingStyle: e.target.value as HeadingStyle })}
        >
          {HEADING_STYLES.map((h) => (
            <option key={h.id} value={h.id}>
              {h.label}
            </option>
          ))}
        </Select>
        <Select
          label="Divider between sections"
          value={s.dividerStyle}
          onChange={(e) => set({ dividerStyle: e.target.value as DividerStyle })}
        >
          {DIVIDER_STYLES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </Select>
      </Group>

      <Group title="Layout">
        {twoColumnAllowed ? (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Columns</legend>
            <div className="flex gap-4 text-sm">
              {(['single', 'two-column'] as const).map((mode) => (
                <label key={mode} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="layout"
                    checked={s.layout === mode}
                    onChange={() => set({ layout: mode })}
                    className="accent-[#2F55D4]"
                  />
                  {mode === 'single' ? 'Single column' : 'Two columns'}
                </label>
              ))}
            </div>
            {s.layout === 'two-column' && (
              <p className="mt-2 text-xs text-slate-600">
                Skills, languages, certifications and awards move to a sidebar. Some applicant
                tracking systems read columns less reliably than a single column.
              </p>
            )}
          </fieldset>
        ) : (
          <p className="text-sm text-slate-700">
            The {template.name} template uses a single column.
          </p>
        )}

        <fieldset>
          <legend className="mb-1 text-sm font-medium">Page size</legend>
          <div className="flex gap-4 text-sm">
            {(['a4', 'letter'] as const).map((size) => (
              <label key={size} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="pageSize"
                  checked={s.pageSize === size}
                  onChange={() => set({ pageSize: size })}
                  className="accent-[#2F55D4]"
                />
                {size === 'a4' ? 'A4' : 'US Letter'}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-medium">Length</legend>
          <div className="flex gap-4 text-sm">
            {(['multi', 'one'] as const).map((mode) => (
              <label key={mode} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="pageMode"
                  checked={s.pageMode === mode}
                  onChange={() => set({ pageMode: mode })}
                  className="accent-[#2F55D4]"
                />
                {mode === 'multi' ? 'Multiple pages' : 'One page'}
              </label>
            ))}
          </div>
          {s.pageMode === 'one' && (
            <Button size="sm" variant="secondary" className="mt-2" onClick={onFitOnePage}>
              Fit to one page
            </Button>
          )}
        </fieldset>
      </Group>

      <Button variant="secondary" onClick={() => dispatch(editorActions.replaceStyle({}))}>
        Reset design to template defaults
      </Button>
      <p className="pb-6 text-xs text-slate-600">
        Design changes only affect how your resume looks. Your content stays exactly as you wrote
        it.
      </p>
    </div>
  );
}
