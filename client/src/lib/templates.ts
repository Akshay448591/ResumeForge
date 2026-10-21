import type {
  DividerStyle,
  FontId,
  HeadingStyle,
  LayoutMode,
  ResumeStyle,
  StyleOverrides,
  TemplateId,
} from '../types/resume';

export const FONTS: Record<FontId, { label: string; stack: string }> = {
  instrument: {
    label: 'Instrument Sans',
    stack:
      "'Instrument Sans Variable', 'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  'source-serif': {
    label: 'Source Serif 4',
    stack: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, 'Times New Roman', serif",
  },
  arial: { label: 'Arial', stack: "Arial, 'Helvetica Neue', Helvetica, sans-serif" },
  georgia: { label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  times: { label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
};

export const HEADING_STYLES: { id: HeadingStyle; label: string }[] = [
  { id: 'underline', label: 'Capitals with underline' },
  { id: 'caps', label: 'Capitals' },
  { id: 'accent-bar', label: 'Accent with short bar' },
  { id: 'plain', label: 'Plain' },
  { id: 'band', label: 'Shaded band' },
];

export const DIVIDER_STYLES: { id: DividerStyle; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'thin', label: 'Thin line' },
  { id: 'dotted', label: 'Dotted line' },
  { id: 'thick', label: 'Thick accent line' },
  { id: 'accent', label: 'Thin accent line' },
];

export type VisualStyle = 'Plain' | 'Traditional' | 'Modern' | 'Minimal';

export interface TemplateDef {
  id: TemplateId;
  name: string;
  blurb: string;
  /** Category by look. */
  visualStyle: VisualStyle;
  /** Category by intended use. */
  bestFor: string;
  headerAlign: 'left' | 'center';
  nameAccent: boolean;
  layouts: LayoutMode[];
  defaults: ResumeStyle;
}

const base: Omit<ResumeStyle, 'fontFamily' | 'accent' | 'headingStyle'> = {
  fontSize: 13.5,
  lineHeight: 1.45,
  sectionSpacing: 16,
  margin: 52,
  dividerStyle: 'none',
  layout: 'single',
  pageMode: 'multi',
  pageSize: 'a4',
};

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'ats',
    name: 'ATS-friendly',
    blurb:
      'Single column, standard fonts and plain headings. Built to be read cleanly by applicant tracking systems.',
    visualStyle: 'Plain',
    bestFor: 'Online applications',
    headerAlign: 'left',
    nameAccent: false,
    layouts: ['single'],
    defaults: {
      ...base,
      fontFamily: 'arial',
      fontSize: 13,
      accent: '#111827',
      headingStyle: 'caps',
      margin: 48,
    },
  },
  {
    id: 'professional',
    name: 'Professional',
    blurb: 'Serif type, a centred header and ruled headings in navy. Formal and easy to trust.',
    visualStyle: 'Traditional',
    bestFor: 'Business and corporate roles',
    headerAlign: 'center',
    nameAccent: true,
    layouts: ['single', 'two-column'],
    defaults: {
      ...base,
      fontFamily: 'georgia',
      accent: '#1F3A5F',
      headingStyle: 'underline',
      margin: 54,
    },
  },
  {
    id: 'modern',
    name: 'Modern',
    blurb:
      'Clean sans-serif with a cobalt accent. Offers an optional sidebar for skills and extras.',
    visualStyle: 'Modern',
    bestFor: 'Tech and design roles',
    headerAlign: 'left',
    nameAccent: true,
    layouts: ['single', 'two-column'],
    defaults: {
      ...base,
      fontFamily: 'instrument',
      accent: '#2F55D4',
      headingStyle: 'accent-bar',
      sectionSpacing: 18,
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    blurb: 'Light and spacious with quiet headings. Lets the content lead.',
    visualStyle: 'Minimal',
    bestFor: 'Any industry',
    headerAlign: 'left',
    nameAccent: false,
    layouts: ['single'],
    defaults: {
      ...base,
      fontFamily: 'instrument',
      fontSize: 13,
      lineHeight: 1.5,
      accent: '#6b7280',
      headingStyle: 'plain',
      sectionSpacing: 22,
      margin: 60,
    },
  },
  {
    id: 'academic',
    name: 'Academic',
    blurb:
      'Times-style serif with thin dividers. Suits long, text-heavy CVs with publications and research.',
    visualStyle: 'Traditional',
    bestFor: 'Research and academia',
    headerAlign: 'left',
    nameAccent: false,
    layouts: ['single'],
    defaults: {
      ...base,
      fontFamily: 'times',
      fontSize: 14,
      lineHeight: 1.4,
      accent: '#111827',
      headingStyle: 'underline',
      dividerStyle: 'none',
      sectionSpacing: 14,
      margin: 56,
    },
  },
];

export const getTemplate = (id: TemplateId): TemplateDef =>
  TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[1];

/** Template defaults plus whatever the user changed. Unsupported layouts fall back to single column. */
export function resolveStyle(id: TemplateId, overrides: StyleOverrides = {}): ResumeStyle {
  const t = getTemplate(id);
  const defined = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined),
  ) as StyleOverrides;
  const merged = { ...t.defaults, ...defined };
  if (!t.layouts.includes(merged.layout)) merged.layout = 'single';
  return merged;
}

export const LIMITS = {
  fontSize: { min: 9, max: 16, step: 0.5 },
  lineHeight: { min: 1.2, max: 1.8, step: 0.05 },
  sectionSpacing: { min: 6, max: 40, step: 2 },
  margin: { min: 24, max: 80, step: 4 },
} as const;

/** A small set of consistent density presets. "Balanced" means the template's own defaults. */
export const DENSITY_PRESETS: {
  id: string;
  name: string;
  note: string;
  values: Pick<StyleOverrides, 'fontSize' | 'lineHeight' | 'sectionSpacing' | 'margin'>;
}[] = [
  { id: 'balanced', name: 'Balanced', note: 'Template default', values: {} },
  {
    id: 'compact',
    name: 'Compact',
    note: 'Fit more on a page',
    values: { fontSize: 12, lineHeight: 1.3, sectionSpacing: 10, margin: 40 },
  },
  {
    id: 'comfortable',
    name: 'Comfortable',
    note: 'Easy to read',
    values: { fontSize: 13.5, lineHeight: 1.5, sectionSpacing: 20, margin: 56 },
  },
  {
    id: 'spacious',
    name: 'Spacious',
    note: 'Lots of air',
    values: { fontSize: 14, lineHeight: 1.6, sectionSpacing: 26, margin: 64 },
  },
];

export const ACCENT_SWATCHES = [
  { name: 'Ink', value: '#111827' },
  { name: 'Navy', value: '#1F3A5F' },
  { name: 'Cobalt', value: '#2F55D4' },
  { name: 'Teal', value: '#0F6B5C' },
  { name: 'Plum', value: '#6B2D5C' },
  { name: 'Slate', value: '#475569' },
];
