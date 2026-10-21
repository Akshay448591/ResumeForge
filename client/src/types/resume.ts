export const SCHEMA_VERSION = 1;

export type TemplateId = 'ats' | 'minimal' | 'modern' | 'professional' | 'academic';
export type FontId = 'instrument' | 'source-serif' | 'arial' | 'georgia' | 'times';
export type HeadingStyle = 'underline' | 'caps' | 'accent-bar' | 'plain' | 'band';
export type DividerStyle = 'none' | 'thin' | 'dotted' | 'thick' | 'accent';
export type LayoutMode = 'single' | 'two-column';
export type PageMode = 'multi' | 'one';
export type PageSizeId = 'a4' | 'letter';

/** Presentation settings. Stored beside the content, never inside it. */
export interface ResumeStyle {
  fontFamily: FontId;
  fontSize: number;
  lineHeight: number;
  accent: string;
  sectionSpacing: number;
  margin: number;
  headingStyle: HeadingStyle;
  dividerStyle: DividerStyle;
  layout: LayoutMode;
  pageMode: PageMode;
  pageSize: PageSizeId;
}
/** What the user changed. Anything missing falls back to the template default. */
export type StyleOverrides = Partial<ResumeStyle>;
export type ListSection =
  'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'awards' | 'languages';
export type SectionType = 'summary' | ListSection | 'custom';

export interface LinkItem {
  id: string;
  label: string;
  url: string;
  visible: boolean;
}
export interface Bullet {
  id: string;
  text: string;
}
export interface Experience {
  id: string;
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  bullets: Bullet[];
}
export interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  grade: string;
  description: string;
  achievements: Bullet[];
}
export interface Skill {
  id: string;
  name: string;
  kind: 'technical' | 'soft';
}
export interface Project {
  id: string;
  name: string;
  link: string;
  technologies: string[];
  description: string;
}
export interface Certification {
  id: string;
  name: string;
  issuer: string;
  date: string;
  link: string;
}
export interface Award {
  id: string;
  title: string;
  issuer: string;
  date: string;
  description: string;
}
export interface Language {
  id: string;
  name: string;
  level: string;
}
export interface CustomItem {
  id: string;
  heading: string;
  description: string;
}
export interface CustomSection {
  id: string;
  title: string;
  items: CustomItem[];
}
export interface SectionConfig {
  id: string;
  type: SectionType;
  visible: boolean;
  /** Optional custom heading. Blank means the default label. */
  title?: string;
}

export interface ResumeContent {
  schemaVersion: number;
  personal: {
    fullName: string;
    title: string;
    email: string;
    phone: string;
    location: string;
    links: LinkItem[];
    show: { email: boolean; phone: boolean; location: boolean };
  };
  summary: string;
  experience: Experience[];
  education: Education[];
  skills: Skill[];
  projects: Project[];
  certifications: Certification[];
  awards: Award[];
  languages: Language[];
  custom: CustomSection[];
  sections: SectionConfig[];
}

export interface ListItemMap {
  experience: Experience;
  education: Education;
  skills: Skill;
  projects: Project;
  certifications: Certification;
  awards: Award;
  languages: Language;
}

export interface Completion {
  percent: number;
  status: 'empty' | 'in-progress' | 'complete';
}
export interface ResumeSummary {
  id: string;
  title: string;
  templateId: TemplateId;
  createdAt: string;
  updatedAt: string;
  completion: Completion;
  /** Set when this resume was duplicated from another one. */
  variantOf: { id: string; title: string } | null;
}
export interface Resume extends ResumeSummary {
  content: ResumeContent;
  style: StyleOverrides;
  /** Revision counter used to detect saves from another tab. */
  rev: number;
}
export interface VersionMeta {
  id: string;
  name: string;
  kind: 'manual' | 'auto';
  note: string;
  templateId: TemplateId;
  summary: string[];
  createdAt: string;
}
export interface Change {
  area: string;
  kind: 'added' | 'removed' | 'changed' | 'moved';
  label: string;
  before?: string;
  after?: string;
}
export interface CompareResult {
  from: string;
  to: string;
  changes: Change[];
}
export interface ImportPreview {
  content: ResumeContent;
  warnings: string[];
  stats: Record<string, number>;
}
export interface User {
  id: string;
  name: string;
  email: string;
}

export const SECTION_LABELS: Record<Exclude<SectionType, 'custom'>, string> = {
  summary: 'Professional summary',
  experience: 'Work experience',
  education: 'Education',
  skills: 'Skills',
  projects: 'Projects',
  certifications: 'Certifications',
  awards: 'Awards',
  languages: 'Languages',
};

export const newId = () => crypto.randomUUID();

export function newItem<K extends ListSection>(section: K): ListItemMap[K] {
  const id = newId();
  const items: ListItemMap = {
    experience: {
      id,
      company: '',
      role: '',
      location: '',
      startDate: '',
      endDate: '',
      current: false,
      bullets: [{ id: newId(), text: '' }],
    },
    education: {
      id,
      institution: '',
      degree: '',
      field: '',
      startDate: '',
      endDate: '',
      grade: '',
      description: '',
      achievements: [],
    },
    skills: { id, name: '', kind: 'technical' },
    projects: { id, name: '', link: '', technologies: [], description: '' },
    certifications: { id, name: '', issuer: '', date: '', link: '' },
    awards: { id, title: '', issuer: '', date: '', description: '' },
    languages: { id, name: '', level: '' },
  };
  return items[section];
}

/** Does this section have anything worth printing? Empty sections never appear on the resume. */
export function sectionHasContent(c: ResumeContent, s: SectionConfig): boolean {
  switch (s.type) {
    case 'summary':
      return c.summary.trim() !== '';
    case 'experience':
      return c.experience.some((e) => e.company.trim() || e.role.trim());
    case 'education':
      return c.education.some((e) => e.institution.trim() || e.degree.trim());
    case 'skills':
      return c.skills.some((x) => x.name.trim());
    case 'projects':
      return c.projects.some((x) => x.name.trim());
    case 'certifications':
      return c.certifications.some((x) => x.name.trim());
    case 'awards':
      return c.awards.some((x) => x.title.trim());
    case 'languages':
      return c.languages.some((x) => x.name.trim());
    case 'custom':
      return Boolean(
        c.custom
          .find((x) => x.id === s.id)
          ?.items.some((i) => i.heading.trim() || i.description.trim()),
      );
  }
}

export const SAMPLE_CONTENT: ResumeContent = {
  schemaVersion: SCHEMA_VERSION,
  personal: {
    fullName: 'Maya Rao',
    title: 'Product Designer',
    email: 'maya.rao@example.com',
    phone: '+91 98765 43210',
    location: 'Bengaluru, India',
    links: [{ id: 'l1', label: 'mayarao.design', url: 'mayarao.design', visible: true }],
    show: { email: true, phone: true, location: true },
  },
  summary:
    'Product designer with six years of experience shipping consumer and B2B interfaces. I turn messy workflows into simple screens and work closely with engineers to get them built.',
  experience: [
    {
      id: 'e1',
      company: 'Northwind Labs',
      role: 'Senior Product Designer',
      location: 'Bengaluru',
      startDate: '2022-04',
      endDate: '',
      current: true,
      bullets: [
        {
          id: 'b1',
          text: 'Redesigned onboarding, lifting activation from 41% to 58% in two quarters.',
        },
        { id: 'b2', text: 'Built a shared component library used by five product teams.' },
      ],
    },
    {
      id: 'e2',
      company: 'Paperplane',
      role: 'Product Designer',
      location: 'Remote',
      startDate: '2019-06',
      endDate: '2022-03',
      current: false,
      bullets: [
        { id: 'b3', text: 'Led design for the invoicing product from prototype to 20k users.' },
      ],
    },
  ],
  education: [
    {
      id: 'd1',
      institution: 'National Institute of Design',
      degree: 'B.Des',
      field: 'Interaction Design',
      startDate: '2015-08',
      endDate: '2019-05',
      grade: '8.7 CGPA',
      description: '',
      achievements: [],
    },
  ],
  skills: [
    { id: 's1', name: 'Figma', kind: 'technical' },
    { id: 's2', name: 'Prototyping', kind: 'technical' },
    { id: 's3', name: 'User research', kind: 'technical' },
    { id: 's4', name: 'Facilitation', kind: 'soft' },
  ],
  projects: [],
  certifications: [],
  awards: [],
  languages: [{ id: 'g1', name: 'English', level: 'Fluent' }],
  custom: [],
  sections: [
    { id: 'summary', type: 'summary', visible: true },
    { id: 'experience', type: 'experience', visible: true },
    { id: 'education', type: 'education', visible: true },
    { id: 'skills', type: 'skills', visible: true },
    { id: 'languages', type: 'languages', visible: true },
  ],
};

export interface ExportJob {
  id: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  pageSize: PageSizeId;
  pages: number | null;
  bytes: number | null;
  error: string;
  filename: string;
}
