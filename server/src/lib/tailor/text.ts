import type { ResumeContent } from '../../schema/resume.js';

export interface Line {
  id: string;
  section: string;
  label: string;
  text: string;
  kind: 'demonstrated' | 'listed';
  ref:
    | { type: 'summary' }
    | { type: 'header'; experienceId: string }
    | { type: 'bullet'; experienceId: string; bulletId: string }
    | { type: 'skill'; skillId: string }
    | { type: 'project'; projectId: string }
    | { type: 'other' };
}

const SECTION_NAMES: Record<string, string> = {
  summary: 'Summary',
  experience: 'Work experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  awards: 'Awards',
  languages: 'Languages',
};

/**
 * The resume as numbered lines of text. Matches, suggestions and AI answers all point at these ids,
 * so every quote shown to the user is text that really is in their resume.
 */
export function resumeLines(c: ResumeContent): Line[] {
  const lines: Line[] = [];
  const add = (l: Omit<Line, 'id'>) => {
    if (l.text.trim()) lines.push({ ...l, id: `L${lines.length + 1}` });
  };
  const visible = new Map(c.sections.map((s) => [s.id, s.visible]));
  const show = (id: string) => visible.get(id) !== false;

  if (show('summary')) {
    for (const s of c.summary.split(/(?<=[.!?])\s+/)) {
      add({
        section: 'Summary',
        label: 'Professional summary',
        text: s.trim(),
        kind: 'demonstrated',
        ref: { type: 'summary' },
      });
    }
  }
  if (show('experience')) {
    for (const e of c.experience) {
      const label = [e.role, e.company].filter(Boolean).join(' at ') || 'Position';
      add({
        section: SECTION_NAMES.experience,
        label,
        text: label,
        kind: 'demonstrated',
        ref: { type: 'header', experienceId: e.id },
      });
      for (const b of e.bullets) {
        add({
          section: SECTION_NAMES.experience,
          label,
          text: b.text.trim(),
          kind: 'demonstrated',
          ref: { type: 'bullet', experienceId: e.id, bulletId: b.id },
        });
      }
    }
  }
  if (show('education')) {
    for (const e of c.education) {
      const label =
        [e.degree, e.field].filter(Boolean).join(' in ') +
        (e.institution ? `, ${e.institution}` : '');
      add({
        section: SECTION_NAMES.education,
        label: e.institution || 'Education',
        text: label.trim(),
        kind: 'demonstrated',
        ref: { type: 'other' },
      });
      add({
        section: SECTION_NAMES.education,
        label: e.institution || 'Education',
        text: e.description,
        kind: 'demonstrated',
        ref: { type: 'other' },
      });
      for (const a of e.achievements) {
        add({
          section: SECTION_NAMES.education,
          label: e.institution || 'Education',
          text: a.text,
          kind: 'demonstrated',
          ref: { type: 'other' },
        });
      }
    }
  }
  if (show('skills')) {
    for (const s of c.skills) {
      add({
        section: SECTION_NAMES.skills,
        label: s.kind === 'soft' ? 'Soft skills' : 'Technical skills',
        text: s.name.trim(),
        kind: 'listed',
        ref: { type: 'skill', skillId: s.id },
      });
    }
  }
  if (show('projects')) {
    for (const p of c.projects) {
      const text = [p.name, p.description, p.technologies.join(', ')]
        .filter((x) => x.trim())
        .join('. ');
      add({
        section: SECTION_NAMES.projects,
        label: p.name || 'Project',
        text,
        kind: 'demonstrated',
        ref: { type: 'project', projectId: p.id },
      });
    }
  }
  if (show('certifications')) {
    for (const x of c.certifications) {
      add({
        section: SECTION_NAMES.certifications,
        label: x.name,
        text: [x.name, x.issuer].filter(Boolean).join(' — '),
        kind: 'demonstrated',
        ref: { type: 'other' },
      });
    }
  }
  if (show('awards')) {
    for (const x of c.awards) {
      add({
        section: SECTION_NAMES.awards,
        label: x.title,
        text: [x.title, x.issuer, x.description].filter(Boolean).join(' — '),
        kind: 'demonstrated',
        ref: { type: 'other' },
      });
    }
  }
  if (show('languages')) {
    for (const x of c.languages) {
      add({
        section: SECTION_NAMES.languages,
        label: 'Languages',
        text: [x.name, x.level].filter(Boolean).join(' '),
        kind: 'listed',
        ref: { type: 'other' },
      });
    }
  }
  for (const cs of c.custom) {
    if (!show(cs.id)) continue;
    for (const i of cs.items) {
      add({
        section: cs.title || 'Custom section',
        label: i.heading || cs.title,
        text: [i.heading, i.description].filter(Boolean).join(': '),
        kind: 'demonstrated',
        ref: { type: 'other' },
      });
    }
  }
  return lines;
}

export const allText = (lines: Line[]) => lines.map((l) => l.text).join('\n');
