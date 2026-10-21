import mammoth from 'mammoth';
import { emptyContent, newId, type ResumeContent } from '../schema/resume.js';

interface Block {
  type: 'heading' | 'p' | 'li';
  text: string;
}

export interface ImportResult {
  content: ResumeContent;
  warnings: string[];
  stats: Record<string, number>;
}

/* ---------- reading the document ---------- */

function decode(s: string) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

export function blocksFromHtml(html: string): Block[] {
  const blocks: Block[] = [];
  const re = /<(h[1-6]|p|li)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    const type: Block['type'] = tag.startsWith('h') ? 'heading' : tag === 'li' ? 'li' : 'p';
    const text = decode(m[2].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''));
    for (const line of text.split(/\n+/)) {
      const t = line.replace(/\s+/g, ' ').trim();
      if (t) blocks.push({ type, text: t });
    }
  }
  return blocks;
}

/* ---------- section headings ---------- */

type Key =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'awards'
  | 'languages';

const ALIASES: [Key, RegExp][] = [
  [
    'summary',
    /^((professional|career|personal) )?(summary|profile|objective|statement)$|^about( me)?$/,
  ],
  [
    'experience',
    /^((work|professional|relevant|employment) )?(experience|history)$|^employment( history)?$|^work history$/,
  ],
  [
    'education',
    /^(education|academic background|qualifications|education and training|academic qualifications)$/,
  ],
  [
    'skills',
    /^((technical|key|core|professional) )?skills( and tools)?$|^(core )?competencies$|^technologies$/,
  ],
  ['projects', /^((personal|selected|academic|key) )?projects$/],
  ['certifications', /^(certifications?|certificates|licen[cs]es( and certifications)?|courses)$/],
  ['awards', /^(awards?|honou?rs|achievements|awards and honou?rs|honou?rs and awards)$/],
  ['languages', /^languages$/],
];
const CUSTOM =
  /^(publications|volunteer(ing)?( experience| work)?|extracurricular( activities)?|interests|hobbies|references|leadership|activities|research|research experience|conferences|patents|presentations)$/;

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[:\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const titleCase = (t: string) =>
  t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : t;

function headingOf(b: Block): { key: Key | 'custom'; title: string } | null {
  if (b.text.length > 45) return null;
  const n = norm(b.text);
  for (const [key, re] of ALIASES) if (re.test(n)) return { key, title: b.text };
  if (CUSTOM.test(n)) return { key: 'custom', title: titleCase(b.text.replace(/:\s*$/, '')) };
  if (b.type === 'heading' && b.text.split(' ').length <= 5) {
    return { key: 'custom', title: titleCase(b.text.replace(/:\s*$/, '')) };
  }
  return null;
}

/* ---------- patterns ---------- */

const EMAIL = /[^\s@|,;()<>]+@[^\s@|,;()<>]+\.[A-Za-z]{2,}/;
const URL_RE = /((?:https?:\/\/|www\.)[^\s|,;]+|(?:linkedin\.com|github\.com)\/[^\s|,;]+)/gi;
const MON =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE = `(?:${MON}\\.?\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4}-\\d{2}|\\d{4})`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|present|current|now|ongoing)`, 'i');
const SINGLE_END = new RegExp(`(?:^|[\\s|,–—(-])(${DATE})\\)?\\s*$`, 'i');
const BULLET = /^[•\-*–▪●◦·]\s+/;
const ROLE_WORDS =
  /(engineer|developer|manager|designer|analyst|intern|lead|director|consultant|specialist|officer|architect|scientist|administrator|assistant|associate|coordinator|head|president|teacher|nurse|researcher|executive|programmer|technician)/i;
const DEGREE =
  /(bachelor|master|b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|\bmba\b|ph\.?\s?d|\bb\.?\s?e\b|\bb\.?\s?a\b|\bm\.?\s?a\b|diploma|associate|high school|certificate|doctorate)/i;
const SCHOOL = /(university|college|institute|school|academy|polytechnic)/i;

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/** Month precision where the document has it, otherwise just the year. */
function toDate(raw: string): string {
  const t = raw.trim();
  let m = /^([a-z]+)\.?\s+(\d{4})$/i.exec(t);
  if (m)
    return MONTHS[m[1].slice(0, 3).toLowerCase()]
      ? `${m[2]}-${MONTHS[m[1].slice(0, 3).toLowerCase()]}`
      : m[2];
  m = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
  return /^\d{4}(-\d{2})?$/.test(t) ? t : '';
}

const isCurrent = (s: string) => /^(present|current|now|ongoing)$/i.test(s.trim());
const clean = (t: string) => t.replace(BULLET, '').trim();
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/* ---------- entry parsing (experience, education) ---------- */

interface Entry {
  headers: string[];
  start: string;
  end: string;
  current: boolean;
  bullets: string[];
}

function parseEntries(blocks: Block[]): Entry[] {
  const entries: Entry[] = [];
  let cur: Entry | null = null;
  let pending: string[] = [];
  const hasDate = (t: string | undefined) => !!t && (RANGE.test(t) || SINGLE_END.test(t));
  const isBullet = (b: Block) => b.type === 'li' || BULLET.test(b.text);

  blocks.forEach((b, i) => {
    if (isBullet(b)) {
      if (cur) cur.bullets.push(clean(b.text));
      return;
    }
    const range = RANGE.exec(b.text);
    const single = range ? null : SINGLE_END.exec(b.text);
    if (range || single) {
      const m = (range ?? single) as RegExpExecArray;
      const rest = b.text
        .replace(m[0], '')
        .replace(/[()]/g, '')
        .replace(/^[\s|,–—-]+|[\s|,–—-]+$/g, '')
        .trim();
      const next: Entry = {
        headers: [...pending.slice(-2), ...(rest ? [rest] : [])],
        start: '',
        end: '',
        current: false,
        bullets: [],
      };
      if (range) {
        next.start = toDate(range[1]);
        next.current = isCurrent(range[2]);
        next.end = next.current ? '' : toDate(range[2]);
      } else {
        next.end = toDate((single as RegExpExecArray)[1]);
      }
      pending = [];
      cur = next;
      entries.push(next);
      return;
    }
    // A date line within the next two lines (before any bullet) means this line starts the next entry.
    let dateAhead = false;
    for (let j = i + 1; j <= i + 2 && j < blocks.length; j++) {
      if (isBullet(blocks[j])) break;
      if (hasDate(blocks[j].text)) {
        dateAhead = true;
        break;
      }
    }
    if (dateAhead) {
      pending.push(b.text);
    } else if (!cur) {
      cur = { headers: [b.text], start: '', end: '', current: false, bullets: [] };
      entries.push(cur);
    } else if (cur.bullets.length === 0 && cur.headers.length < 3) {
      cur.headers.push(b.text);
    } else {
      cur = { headers: [b.text], start: '', end: '', current: false, bullets: [] };
      entries.push(cur);
    }
  });
  return entries.filter((e) => e.headers.length || e.bullets.length);
}

const splitHeader = (t: string) =>
  t
    .split(/\s+[|–—-]\s+|\s*\|\s*|,\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

function roleAndCompany(headers: string[]) {
  if (headers.length === 1) {
    const at = /^(.+?)\s+(?:at|@)\s+(.+)$/i.exec(headers[0]);
    if (at) return { role: at[1], company: at[2], location: '' };
    const [role = '', company = '', location = ''] = splitHeader(headers[0]);
    return { role, company, location };
  }
  const [a, b, c = ''] = headers;
  const roleFirst = !(ROLE_WORDS.test(b) && !ROLE_WORDS.test(a));
  return roleFirst ? { role: a, company: b, location: c } : { role: b, company: a, location: c };
}

/* ---------- section parsers ---------- */

const skillsFrom = (blocks: Block[]) => {
  const out: { id: string; name: string; kind: 'technical' | 'soft' }[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    let text = clean(b.text);
    let kind: 'technical' | 'soft' = 'technical';
    const colon = text.indexOf(':');
    if (colon > 0 && colon < 35) {
      if (/soft|interpersonal|people/i.test(text.slice(0, colon))) kind = 'soft';
      text = text.slice(colon + 1);
    }
    for (const part of text.split(/[,;|•·]|\s{2,}/)) {
      const name = part.trim();
      if (!name || name.length > 60 || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push({ id: newId(), name, kind });
    }
  }
  return out.slice(0, 100);
};

const languagesFrom = (blocks: Block[]) =>
  blocks
    .flatMap((b) => clean(b.text).split(/[,;|•·]/))
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = /^(.+?)\s*(?:\(([^)]+)\)|[-–:]\s*(.+))$/.exec(p);
      return {
        id: newId(),
        name: cut((m ? m[1] : p).trim(), 60),
        level: cut((m ? (m[2] ?? m[3]) : '').trim(), 40),
      };
    })
    .slice(0, 20);

const yearOf = (t: string) => /\b((?:19|20)\d{2})\b/.exec(t)?.[1] ?? '';

function projectsFrom(blocks: Block[]) {
  const out: {
    id: string;
    name: string;
    link: string;
    technologies: string[];
    description: string;
  }[] = [];
  let cur: (typeof out)[number] | null = null;
  const desc: string[] = [];
  const flush = () => {
    if (cur) cur.description = cut(desc.join(' ').trim(), 1000);
    desc.length = 0;
  };
  for (const b of blocks) {
    const bullet = b.type === 'li' || BULLET.test(b.text);
    const text = clean(b.text);
    if (bullet && cur) desc.push(text);
    else if (cur && desc.length === 0 && (text.length > 70 || /[.!]$/.test(text))) desc.push(text);
    else {
      flush();
      const link = (text.match(URL_RE) ?? [])[0] ?? '';
      const parts = text
        .replace(URL_RE, '')
        .split(/\s+[|–—-]\s+|\s*\|\s*/)
        .map((p) => p.trim())
        .filter(Boolean);
      cur = {
        id: newId(),
        name: cut(parts[0] ?? text, 120),
        link: cut(link, 300),
        technologies: [],
        description: '',
      };
      if (parts[1] && parts[1].length < 90)
        cur.technologies = parts[1]
          .split(/[,;/]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20);
      out.push(cur);
    }
  }
  flush();
  return out.slice(0, 20);
}

/* ---------- main ---------- */

export async function importDocx(buffer: Buffer): Promise<ImportResult> {
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value;
  const blocks = blocksFromHtml(html);
  const warnings: string[] = [];
  if (!blocks.length) throw new Error('empty');
  if (/<table/i.test(html)) {
    warnings.push(
      'This document uses tables. Their text was imported, but the order may differ from the original.',
    );
  }

  const found: { key: Key | 'custom'; title: string; blocks: Block[] }[] = [];
  const header: Block[] = [];
  let cur: (typeof found)[number] | null = null;
  for (const b of blocks) {
    const h = headingOf(b);
    if (h) {
      const existing = h.key !== 'custom' ? found.find((f) => f.key === h.key) : undefined;
      cur = existing ?? { key: h.key, title: h.title, blocks: [] };
      if (!existing) found.push(cur);
    } else if (cur) cur.blocks.push(b);
    else header.push(b);
  }

  const c = emptyContent();

  /* header: name, title, contact details */
  const headerText = header.map((b) => b.text).join(' | ');
  c.personal.email = cut(EMAIL.exec(headerText)?.[0] ?? '', 200);
  const phone = header
    .map((b) => b.text.replace(EMAIL, '').replace(URL_RE, ''))
    .map((t) => /(\+?\d[\d\s().-]{7,}\d)/.exec(t)?.[1] ?? '')
    .find((p) => p.replace(/\D/g, '').length >= 8);
  c.personal.phone = cut(phone?.trim() ?? '', 40);
  const urls = [...new Set(headerText.match(URL_RE) ?? [])].slice(0, 6);
  c.personal.links = urls.map((u) => ({
    id: newId(),
    label: /linkedin/i.test(u) ? 'LinkedIn' : /github/i.test(u) ? 'GitHub' : '',
    url: cut(u, 300),
    visible: true,
  }));
  const pieces = header
    .flatMap((b) => b.text.split(/\s*[|•·]\s*/))
    .map((p) => p.trim())
    .filter(
      (p) =>
        p &&
        !EMAIL.test(p) &&
        !(p.replace(/\D/g, '').length >= 8 && /\d/.test(p)) &&
        !new RegExp(URL_RE.source, 'i').test(p),
    );
  const name = pieces.find((p) => p.split(' ').length <= 5 && !/\d/.test(p));
  const rest = pieces.filter((p) => p !== name);
  const location = rest.find(
    (p) => /^[A-Za-z.' -]+,\s*[A-Za-z.' -]+$/.test(p) || /^remote$/i.test(p),
  );
  const jobTitle = rest.find((p) => p !== location && p.split(' ').length <= 9 && !/\d/.test(p));
  c.personal.fullName = cut(name ?? '', 120);
  c.personal.location = cut(location ?? '', 120);
  c.personal.title = cut(jobTitle ?? '', 120);

  const unplaced = header.filter(
    (b) => ![name, location, jobTitle].includes(b.text) && !EMAIL.test(b.text),
  ).length;
  const order: { id: string; type: ResumeContent['sections'][number]['type']; title?: string }[] =
    [];

  for (const f of found) {
    if (f.key === 'summary') {
      c.summary = cut(f.blocks.map((b) => clean(b.text)).join(' '), 1500);
      order.push({ id: 'summary', type: 'summary' });
    } else if (f.key === 'experience') {
      c.experience = parseEntries(f.blocks)
        .slice(0, 30)
        .map((e) => {
          const { role, company, location: loc } = roleAndCompany(e.headers);
          return {
            id: newId(),
            company: cut(company, 120),
            role: cut(role, 120),
            location: cut(loc, 120),
            startDate: e.start,
            endDate: e.end,
            current: e.current,
            bullets: e.bullets.slice(0, 15).map((t) => ({ id: newId(), text: cut(t, 500) })),
          };
        });
      order.push({ id: 'experience', type: 'experience' });
    } else if (f.key === 'education') {
      c.education = parseEntries(f.blocks)
        .slice(0, 20)
        .map((e) => {
          const parts = e.headers.flatMap(splitHeader);
          const degreePart = parts.find((p) => DEGREE.test(p)) ?? '';
          const school =
            parts.find((p) => SCHOOL.test(p) && p !== degreePart) ??
            parts.find((p) => p !== degreePart) ??
            '';
          const grade =
            [...parts, ...e.bullets].find(
              (p) =>
                /(gpa|cgpa|grade|%|first class|distinction)/i.test(p) &&
                p !== degreePart &&
                p !== school,
            ) ?? '';
          const fieldMatch = /^(.+?)\s+(?:in|of)\s+(.+)$/i.exec(degreePart);
          return {
            id: newId(),
            institution: cut(school, 120),
            degree: cut(fieldMatch ? fieldMatch[1] : degreePart, 120),
            field: cut(fieldMatch ? fieldMatch[2] : '', 120),
            startDate: e.start,
            endDate: e.end,
            grade: cut(grade, 60),
            description: '',
            achievements: e.bullets
              .filter((t) => t !== grade)
              .slice(0, 15)
              .map((t) => ({ id: newId(), text: cut(t, 500) })),
          };
        });
      order.push({ id: 'education', type: 'education' });
    } else if (f.key === 'skills') {
      c.skills = skillsFrom(f.blocks);
      order.push({ id: 'skills', type: 'skills' });
    } else if (f.key === 'projects') {
      c.projects = projectsFrom(f.blocks);
      order.push({ id: 'projects', type: 'projects' });
    } else if (f.key === 'certifications') {
      c.certifications = f.blocks.slice(0, 30).map((b) => {
        const t = clean(b.text);
        const y = yearOf(t);
        return {
          id: newId(),
          name: cut(
            t
              .replace(y, '')
              .replace(/[\s,–—(|-]+$/g, '')
              .trim() || t,
            120,
          ),
          issuer: '',
          date: y,
          link: '',
        };
      });
      order.push({ id: 'certifications', type: 'certifications' });
    } else if (f.key === 'awards') {
      c.awards = f.blocks.slice(0, 30).map((b) => {
        const t = clean(b.text);
        const y = yearOf(t);
        return {
          id: newId(),
          title: cut(
            t
              .replace(y, '')
              .replace(/[\s,–—(|-]+$/g, '')
              .trim() || t,
            120,
          ),
          issuer: '',
          date: y,
          description: '',
        };
      });
      order.push({ id: 'awards', type: 'awards' });
    } else if (f.key === 'languages') {
      c.languages = languagesFrom(f.blocks);
      order.push({ id: 'languages', type: 'languages' });
    } else if (c.custom.length < 10) {
      const id = newId();
      c.custom.push({
        id,
        title: cut(f.title, 80),
        items: f.blocks.slice(0, 30).map((b) => {
          const t = clean(b.text);
          return t.length <= 80
            ? { id: newId(), heading: t, description: '' }
            : { id: newId(), heading: '', description: cut(t, 1000) };
        }),
      });
      order.push({ id, type: 'custom' });
    }
  }

  // Sections in the order they appeared in the document, then any standard ones that weren't found.
  const seen = new Set(order.map((o) => o.id));
  c.sections = [...order, ...c.sections.filter((s) => !seen.has(s.id))].map((s) => ({
    id: s.id,
    type: s.type,
    visible: true,
  }));

  if (!c.personal.fullName)
    warnings.push('We couldn’t find your name at the top of the document. Please add it.');
  if (!c.personal.email) warnings.push('We couldn’t find an email address.');
  if (!found.length) {
    warnings.push(
      'We couldn’t find standard section headings such as Experience or Education, so only the header details were imported. You can copy the rest in by hand.',
    );
  } else if (!found.some((f) => f.key === 'experience')) {
    warnings.push('No work experience section was found.');
  }
  if (unplaced > 0)
    warnings.push(
      `${unplaced} line${unplaced === 1 ? '' : 's'} at the top of the document could not be matched to a field.`,
    );
  const yearOnly = [...c.experience, ...c.education].some(
    (e) => /^\d{4}$/.test(e.startDate) || /^\d{4}$/.test(e.endDate),
  );
  if (yearOnly) warnings.push('Some dates only had a year. Add the month if you want it shown.');

  const stats: Record<string, number> = {
    experience: c.experience.length,
    education: c.education.length,
    skills: c.skills.length,
    projects: c.projects.length,
    certifications: c.certifications.length,
    awards: c.awards.length,
    languages: c.languages.length,
    custom: c.custom.length,
  };
  return { content: c, warnings, stats };
}
