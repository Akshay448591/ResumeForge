import { newId, type ResumeContent } from '../schema/resume.js';
import { SECTION_TITLES } from './diff.js';

function reId(v: unknown): void {
  if (Array.isArray(v)) v.forEach(reId);
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.id === 'string') o.id = newId();
    Object.values(o).forEach(reId);
  }
}

/** A deep copy where every entry gets a fresh stable ID. */
export function withNewIds<T>(value: T): T {
  const copy = structuredClone(value);
  reId(copy);
  return copy;
}

const LIST_TYPES = [
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'awards',
  'languages',
] as const;

/**
 * Copy chosen sections from one resume into another.
 * - append: adds the source's entries after the existing ones (never overwrites; the summary is only copied if empty)
 * - replace: swaps the target's entries for the source's
 */
export function copySections(
  target: ResumeContent,
  source: ResumeContent,
  sectionIds: string[],
  mode: 'append' | 'replace',
) {
  const out = structuredClone(target);
  const report: string[] = [];
  const ensureConfig = (type: ResumeContent['sections'][number]['type'], id: string) => {
    if (!out.sections.some((s) => s.id === id)) out.sections.push({ id, type, visible: true });
  };

  for (const id of sectionIds) {
    const cfg = source.sections.find((s) => s.id === id);
    if (!cfg) {
      report.push('Skipped a section that no longer exists in the source resume.');
      continue;
    }
    if (cfg.type === 'summary') {
      if (!source.summary.trim())
        report.push('The source summary is empty, so nothing was copied.');
      else if (mode === 'replace' || !out.summary.trim()) {
        out.summary = source.summary;
        ensureConfig('summary', 'summary');
        report.push(mode === 'replace' ? 'Replaced the summary.' : 'Copied the summary.');
      } else report.push('Kept your existing summary. Appending never overwrites it.');
    } else if (cfg.type === 'custom') {
      const src = source.custom.find((c) => c.id === id);
      if (!src) continue;
      const items = withNewIds(src.items);
      const existing = out.custom.find(
        (c) => c.title.trim().toLowerCase() === src.title.trim().toLowerCase(),
      );
      if (existing) {
        existing.items = mode === 'replace' ? items : [...existing.items, ...items];
        report.push(`${mode === 'replace' ? 'Replaced' : 'Added to'} “${src.title}”.`);
      } else {
        const nid = newId();
        out.custom.push({ id: nid, title: src.title, items });
        out.sections.push({ id: nid, type: 'custom', visible: true });
        report.push(`Added the section “${src.title}”.`);
      }
    } else if ((LIST_TYPES as readonly string[]).includes(cfg.type)) {
      const key = cfg.type as (typeof LIST_TYPES)[number];
      const items = withNewIds((source as unknown as Record<string, unknown[]>)[key]);
      const current = (out as unknown as Record<string, unknown[]>)[key];
      (out as unknown as Record<string, unknown[]>)[key] =
        mode === 'replace' ? items : [...current, ...items];
      ensureConfig(key, key);
      report.push(
        `${mode === 'replace' ? 'Replaced' : 'Added'} ${items.length} ${items.length === 1 ? 'entry' : 'entries'} in ${SECTION_TITLES[key]}.`,
      );
    }
  }
  return { content: out, report };
}
