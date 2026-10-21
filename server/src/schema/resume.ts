import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/**
 * Resume document model.
 * - Content only: no fonts, colours or layout. Presentation lives in `templateId` on the Resume.
 * - Every repeatable entry has a stable `id`.
 * - `sections` controls order and visibility of every section.
 * - Format rules (email, URL, dates) are advisory and checked in the client so that autosave
 *   never fails while someone is mid-typing. The server enforces structure and size limits.
 */
export const SCHEMA_VERSION = 1;
export const TEMPLATE_IDS = ['ats', 'minimal', 'modern', 'professional', 'academic'] as const;
/** Template ids used by the first release. They keep working and map to a current template. */
export const LEGACY_TEMPLATES: Record<string, (typeof TEMPLATE_IDS)[number]> = {
  classic: 'professional',
  compact: 'ats',
};
export function normalizeTemplateId(id: string): (typeof TEMPLATE_IDS)[number] {
  return (TEMPLATE_IDS as readonly string[]).includes(id)
    ? (id as (typeof TEMPLATE_IDS)[number])
    : (LEGACY_TEMPLATES[id] ?? 'professional');
}
export const SECTION_TYPES = [
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'awards',
  'languages',
  'custom',
] as const;

const id = z.string().min(1).max(64);
const text = (max: number) => z.string().max(max);

export const contentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  personal: z.object({
    fullName: text(120),
    title: text(120),
    email: text(200),
    phone: text(40),
    location: text(120),
    links: z.array(z.object({ id, label: text(60), url: text(300), visible: z.boolean() })).max(10),
    show: z.object({ email: z.boolean(), phone: z.boolean(), location: z.boolean() }),
  }),
  summary: text(1500),
  experience: z
    .array(
      z.object({
        id,
        company: text(120),
        role: text(120),
        location: text(120),
        startDate: text(10),
        endDate: text(10),
        current: z.boolean(),
        bullets: z.array(z.object({ id, text: text(500) })).max(15),
      }),
    )
    .max(30),
  education: z
    .array(
      z.object({
        id,
        institution: text(120),
        degree: text(120),
        field: text(120),
        startDate: text(10),
        endDate: text(10),
        grade: text(60),
        description: text(1000),
        achievements: z.array(z.object({ id, text: text(500) })).max(15),
      }),
    )
    .max(20),
  skills: z.array(z.object({ id, name: text(80), kind: z.enum(['technical', 'soft']) })).max(100),
  projects: z
    .array(
      z.object({
        id,
        name: text(120),
        link: text(300),
        technologies: z.array(text(40)).max(20),
        description: text(1000),
      }),
    )
    .max(20),
  certifications: z
    .array(z.object({ id, name: text(120), issuer: text(120), date: text(10), link: text(300) }))
    .max(30),
  awards: z
    .array(
      z.object({ id, title: text(120), issuer: text(120), date: text(10), description: text(500) }),
    )
    .max(30),
  languages: z.array(z.object({ id, name: text(60), level: text(40) })).max(20),
  custom: z
    .array(
      z.object({
        id,
        title: text(80),
        items: z.array(z.object({ id, heading: text(120), description: text(1000) })).max(30),
      }),
    )
    .max(10),
  sections: z
    .array(
      z.object({
        id,
        type: z.enum(SECTION_TYPES),
        visible: z.boolean(),
        title: text(80).optional(),
      }),
    )
    .max(30),
});

/** Presentation settings: kept apart from content so any template can render any resume. */
export const styleSchema = z
  .object({
    fontFamily: z.enum(['instrument', 'source-serif', 'arial', 'georgia', 'times']),
    fontSize: z.number().min(8).max(16),
    lineHeight: z.number().min(1.1).max(2),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex colour'),
    sectionSpacing: z.number().min(4).max(48),
    margin: z.number().min(16).max(96),
    headingStyle: z.enum(['underline', 'caps', 'accent-bar', 'plain', 'band']),
    dividerStyle: z.enum(['none', 'thin', 'dotted', 'thick', 'accent']),
    layout: z.enum(['single', 'two-column']),
    pageMode: z.enum(['multi', 'one']),
    pageSize: z.enum(['a4', 'letter']),
  })
  .partial()
  .strict();

export type StyleOverrides = z.infer<typeof styleSchema>;

export type ResumeContent = z.infer<typeof contentSchema>;

export function emptyContent(): ResumeContent {
  const order = [
    'summary',
    'experience',
    'education',
    'skills',
    'projects',
    'certifications',
    'awards',
    'languages',
  ] as const;
  return {
    schemaVersion: SCHEMA_VERSION,
    personal: {
      fullName: '',
      title: '',
      email: '',
      phone: '',
      location: '',
      links: [],
      show: { email: true, phone: true, location: true },
    },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    awards: [],
    languages: [],
    custom: [],
    sections: order.map((type) => ({ id: type, type, visible: true })),
  };
}

/** Rough progress signal for the dashboard: six key checks. */
export function completion(c: ResumeContent) {
  const checks = [
    Boolean(c.personal.fullName.trim() && c.personal.email.trim()),
    Boolean(c.personal.title.trim()),
    c.summary.trim().length >= 50,
    c.experience.some((e) => e.company.trim() && e.role.trim()),
    c.education.some((e) => e.institution.trim()),
    c.skills.filter((s) => s.name.trim()).length >= 3,
  ];
  const done = checks.filter(Boolean).length;
  const percent = Math.round((done / checks.length) * 100);
  const status = done === 0 ? 'empty' : done === checks.length ? 'complete' : 'in-progress';
  return { percent, status } as const;
}

export function newId() {
  return randomUUID();
}
