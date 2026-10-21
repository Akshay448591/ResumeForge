import type { ResumeContent } from '../schema/resume.js';

export interface Snapshot {
  templateId: string;
  content: ResumeContent;
  style: Record<string, unknown>;
}

export interface Change {
  area: string;
  kind: 'added' | 'removed' | 'changed' | 'moved';
  label: string;
  before?: string;
  after?: string;
}

type Item = { id: string } & Record<string, unknown>;

export const SECTION_TITLES: Record<string, string> = {
  summary: 'Professional summary',
  experience: 'Work experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  awards: 'Awards',
  languages: 'Languages',
};

const TEMPLATE_NAMES: Record<string, string> = {
  ats: 'ATS-friendly',
  professional: 'Professional',
  modern: 'Modern',
  minimal: 'Minimal',
  academic: 'Academic',
  classic: 'Professional',
  compact: 'ATS-friendly',
};

const STYLE_NAMES: Record<string, string> = {
  fontFamily: 'font',
  fontSize: 'font size',
  lineHeight: 'line height',
  accent: 'accent colour',
  sectionSpacing: 'section spacing',
  margin: 'margins',
  headingStyle: 'heading style',
  dividerStyle: 'divider style',
  layout: 'layout',
  pageMode: 'page length',
};

const PERSONAL_FIELDS: [string, string][] = [
  ['fullName', 'Name'],
  ['title', 'Professional title'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['location', 'Location'],
];

const LIST_KEYS = [
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'awards',
  'languages',
] as const;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clip = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const words = (k: string) => k.replace(/([A-Z])/g, ' $1').toLowerCase();

const ITEM_LABEL: Record<string, (x: Item) => string> = {
  experience: (x) =>
    [str(x.role), str(x.company)].filter(Boolean).join(' at ') || 'Untitled position',
  education: (x) =>
    [str(x.degree), str(x.institution)].filter(Boolean).join(', ') || 'Untitled qualification',
  skills: (x) => str(x.name) || 'Untitled skill',
  projects: (x) => str(x.name) || 'Untitled project',
  certifications: (x) => str(x.name) || 'Untitled certification',
  awards: (x) => str(x.title) || 'Untitled award',
  languages: (x) => str(x.name) || 'Untitled language',
  links: (x) => str(x.label) || str(x.url) || 'link',
  custom: (x) => str(x.heading) || 'entry',
};

function diffList(
  area: string,
  title: string,
  before: Item[],
  after: Item[],
  labelOf: (x: Item) => string,
  out: Change[],
) {
  const b = new Map(before.map((i) => [i.id, i]));
  const a = new Map(after.map((i) => [i.id, i]));
  for (const i of after) {
    if (!b.has(i.id)) out.push({ area, kind: 'added', label: `${title}: added “${labelOf(i)}”` });
  }
  for (const i of before) {
    if (!a.has(i.id))
      out.push({ area, kind: 'removed', label: `${title}: removed “${labelOf(i)}”` });
  }
  for (const i of after) {
    const prev = b.get(i.id);
    if (!prev) continue;
    const fields = Object.keys(i).filter((k) => k !== 'id' && !eq(i[k], prev[k]));
    if (!fields.length) continue;
    const single = fields.length === 1 && typeof i[fields[0]] === 'string';
    out.push({
      area,
      kind: 'changed',
      label: `${title}: “${labelOf(i)}” — ${fields.map(words).join(', ')} changed`,
      ...(single ? { before: clip(str(prev[fields[0]])), after: clip(str(i[fields[0]])) } : {}),
    });
  }
  const orderBefore = before.filter((i) => a.has(i.id)).map((i) => i.id);
  const orderAfter = after.filter((i) => b.has(i.id)).map((i) => i.id);
  if (!eq(orderBefore, orderAfter))
    out.push({ area, kind: 'moved', label: `${title}: entries reordered` });
}

/** Everything that differs between two states of a resume, in plain language. */
export function diffSnapshots(from: Snapshot, to: Snapshot): Change[] {
  const out: Change[] = [];
  const a = from.content;
  const b = to.content;

  for (const [key, name] of PERSONAL_FIELDS) {
    const x = str((a.personal as Record<string, unknown>)[key]);
    const y = str((b.personal as Record<string, unknown>)[key]);
    if (x !== y)
      out.push({
        area: 'Personal details',
        kind: 'changed',
        label: `${name} changed`,
        before: clip(x),
        after: clip(y),
      });
  }
  for (const k of ['email', 'phone', 'location'] as const) {
    if (a.personal.show[k] !== b.personal.show[k]) {
      out.push({
        area: 'Personal details',
        kind: 'changed',
        label: `${b.personal.show[k] ? 'Now showing' : 'Now hiding'} ${k} on the resume`,
      });
    }
  }
  diffList('Personal details', 'Links', a.personal.links, b.personal.links, ITEM_LABEL.links, out);

  if (a.summary !== b.summary) {
    out.push({
      area: SECTION_TITLES.summary,
      kind: 'changed',
      label: 'Summary changed',
      before: clip(a.summary),
      after: clip(b.summary),
    });
  }
  for (const key of LIST_KEYS) {
    diffList(
      SECTION_TITLES[key],
      SECTION_TITLES[key],
      a[key] as Item[],
      b[key] as Item[],
      ITEM_LABEL[key],
      out,
    );
  }

  const customTitle = (c: ResumeContent, id: string) =>
    c.custom.find((x) => x.id === id)?.title || 'Custom section';
  const aCustom = new Map(a.custom.map((c) => [c.id, c]));
  const bCustom = new Map(b.custom.map((c) => [c.id, c]));
  for (const c of b.custom) {
    const prev = aCustom.get(c.id);
    if (!prev) {
      out.push({ area: c.title, kind: 'added', label: `Added custom section “${c.title}”` });
      continue;
    }
    if (prev.title !== c.title)
      out.push({
        area: c.title,
        kind: 'changed',
        label: 'Custom section renamed',
        before: prev.title,
        after: c.title,
      });
    diffList(c.title, c.title, prev.items as Item[], c.items as Item[], ITEM_LABEL.custom, out);
  }
  for (const c of a.custom) {
    if (!bCustom.has(c.id))
      out.push({ area: c.title, kind: 'removed', label: `Removed custom section “${c.title}”` });
  }

  const titleOf = (c: ResumeContent, s: { id: string; type: string; title?: string }) =>
    s.type === 'custom'
      ? customTitle(c, s.id)
      : s.title?.trim() || SECTION_TITLES[s.type] || s.type;
  const aSecs = new Map(a.sections.map((s) => [s.id, s]));
  const bSecs = new Map(b.sections.map((s) => [s.id, s]));
  const orderBefore = a.sections.filter((s) => bSecs.has(s.id));
  const orderAfter = b.sections.filter((s) => aSecs.has(s.id));
  if (
    !eq(
      orderBefore.map((s) => s.id),
      orderAfter.map((s) => s.id),
    )
  ) {
    out.push({
      area: 'Section order',
      kind: 'moved',
      label: 'Section order changed',
      before: orderBefore.map((s) => titleOf(a, s)).join(' → '),
      after: orderAfter.map((s) => titleOf(b, s)).join(' → '),
    });
  }
  for (const s of orderAfter) {
    const prev = aSecs.get(s.id);
    if (!prev) continue;
    if (prev.visible !== s.visible) {
      out.push({
        area: 'Section order',
        kind: 'changed',
        label: `${titleOf(b, s)} is now ${s.visible ? 'shown' : 'hidden'}`,
      });
    }
    if (s.type !== 'custom' && (prev.title ?? '').trim() !== (s.title ?? '').trim()) {
      out.push({
        area: 'Section order',
        kind: 'changed',
        label: `Heading for ${SECTION_TITLES[s.type] ?? s.type} changed`,
        before: prev.title || '(default)',
        after: s.title || '(default)',
      });
    }
  }

  if (to.templateId !== from.templateId) {
    out.push({
      area: 'Design',
      kind: 'changed',
      label: 'Template changed',
      before: TEMPLATE_NAMES[from.templateId] ?? from.templateId,
      after: TEMPLATE_NAMES[to.templateId] ?? to.templateId,
    });
  }
  const keys = [...new Set([...Object.keys(from.style), ...Object.keys(to.style)])].filter(
    (k) => !eq(from.style[k], to.style[k]),
  );
  if (keys.length) {
    out.push({
      area: 'Design',
      kind: 'changed',
      label: `Design changed: ${keys.map((k) => STYLE_NAMES[k] ?? k).join(', ')}`,
    });
  }
  return out;
}

/** A short list of change labels, for a version's history entry. */
export function summarize(prev: Snapshot | null, next: Snapshot): string[] {
  if (!prev) return ['First saved version'];
  const changes = diffSnapshots(prev, next);
  if (!changes.length) return ['No changes since the previous version'];
  const shown = changes.slice(0, 5).map((c) => clip(c.label, 140));
  if (changes.length > 5)
    shown.push(`and ${changes.length - 5} more change${changes.length - 5 === 1 ? '' : 's'}`);
  return shown;
}
