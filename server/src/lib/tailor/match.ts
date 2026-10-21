import type { ResumeContent } from '../../schema/resume.js';
import type { Line } from './text.js';
import type { Evidence, Keyword, KeywordMatch } from './types.js';

/** Terms people write in different ways. Matching is by whole words, never by substring. */
const GROUPS: string[][] = [
  ['javascript', 'js', 'ecmascript'],
  ['typescript', 'ts'],
  ['node.js', 'nodejs', 'node'],
  ['react', 'reactjs', 'react.js'],
  ['vue', 'vuejs', 'vue.js'],
  ['angular', 'angularjs'],
  ['next.js', 'nextjs'],
  ['kubernetes', 'k8s'],
  ['postgresql', 'postgres'],
  ['mongodb', 'mongo'],
  ['amazon web services', 'aws'],
  ['google cloud', 'gcp', 'google cloud platform'],
  ['microsoft azure', 'azure'],
  ['continuous integration', 'ci/cd', 'cicd', 'continuous delivery', 'continuous deployment'],
  ['machine learning', 'ml'],
  ['natural language processing', 'nlp'],
  ['rest', 'restful', 'rest api', 'rest apis'],
  ['golang'],
  ['c++', 'cpp'],
  ['c#', 'csharp'],
  ['.net', 'dotnet'],
  ['docker', 'containerization', 'containers'],
  ['sql', 'structured query language'],
  ['agile', 'scrum'],
  ['user experience', 'ux'],
  ['user interface', 'ui'],
  ['quality assurance', 'qa'],
  ['bachelor', "bachelor's", 'bachelors', 'b.tech', 'btech', 'b.sc', 'bsc', 'b.e', 'undergraduate'],
  ['master', "master's", 'masters', 'm.tech', 'mtech', 'm.sc', 'msc', 'mba'],
  ['phd', 'ph.d', 'doctorate', 'doctoral'],
];
const ALIAS = new Map<string, string[]>();
for (const g of GROUPS) for (const t of g) ALIAS.set(t, g);

const STOP = new Set(
  'a an and the of in on for to with at by or as is are be your you our we their this that these those from into using use used experience experienced strong proven solid excellent ability able skills skill knowledge understanding working work including such etc preferred required plus nice have has will can must should others other new within across over per'.split(
    ' ',
  ),
);

export const norm = (s: string) =>
  s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();

export function variants(term: string): string[] {
  const t = norm(term);
  return [...new Set([t, ...(ALIAS.get(t) ?? [])])];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');

function phraseRegex(v: string) {
  const plural = /[a-z]$/.test(v) ? '(?:s|es)?' : '';
  return new RegExp(`(?<![a-z0-9+#.])${escape(v)}${plural}(?![a-z0-9+#])`, 'i');
}

/** Does the exact term (or a known alias) appear as whole words? */
export function phraseIn(term: string, text: string): boolean {
  return variants(term).some((v) => phraseRegex(v).test(text));
}

const stem = (w: string) =>
  w.length > 5 && w.endsWith('ing')
    ? w.slice(0, -3)
    : w.length > 4 && w.endsWith('es')
      ? w.slice(0, -2)
      : w.length > 4 && (w.endsWith('s') || w.endsWith('ed'))
        ? w.slice(0, w.endsWith('s') ? -1 : -2)
        : w;

export function contentTokens(s: string): string[] {
  return (norm(s).match(/[a-z0-9+#.]+/g) ?? [])
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w && !STOP.has(w) && (w.length > 2 || /[0-9+#]/.test(w)))
    .map(stem);
}

/** Share of the term's meaningful words that appear in the text. */
export function tokenOverlap(term: string, text: string): number {
  const need = [...new Set(contentTokens(term))];
  if (!need.length) return 0;
  const have = new Set(contentTokens(text));
  return need.filter((t) => have.has(t)).length / need.length;
}

/** Used to drop keywords the AI claims are in the job description when they are not. */
export function termAppearsIn(term: string, text: string): boolean {
  if (phraseIn(term, text)) return true;
  return contentTokens(term).length >= 2 && tokenOverlap(term, text) >= 0.6;
}

const clip = (s: string, n = 240) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const toEvidence = (l: Line, kind: Evidence['kind']): Evidence => ({
  lineId: l.id,
  section: l.section,
  label: l.label,
  text: clip(l.text),
  kind,
});

export function findEvidence(k: Keyword, lines: Line[]): Evidence[] {
  const out: Evidence[] = [];
  const allowRelated = k.category !== 'technology' && contentTokens(k.term).length >= 2;
  for (const l of lines) {
    if (phraseIn(k.term, l.text)) out.push(toEvidence(l, l.kind));
    else if (allowRelated && tokenOverlap(k.term, l.text) >= 0.6)
      out.push(toEvidence(l, 'related'));
  }
  const order = { demonstrated: 0, listed: 1, related: 2 } as const;
  return out.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 4);
}

/* ---------- years of experience ---------- */

const ym = (v: string, end: boolean): number | null => {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : end ? 11 : 0);
};

export function experienceYears(c: ResumeContent, now = new Date()): number {
  const nowM = now.getFullYear() * 12 + now.getMonth();
  const spans = c.experience
    .map((e) => {
      const s = ym(e.startDate, false);
      const end = e.current ? nowM : (ym(e.endDate, true) ?? s);
      return s !== null && end !== null && end >= s ? ([s, end] as [number, number]) : null;
    })
    .filter((x): x is [number, number] => x !== null)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const s of spans) {
    if (cur && s[0] <= cur[1] + 1) cur = [cur[0], Math.max(cur[1], s[1])];
    else {
      if (cur) total += cur[1] - cur[0] + 1;
      cur = s;
    }
  }
  if (cur) total += cur[1] - cur[0] + 1;
  return total / 12;
}

const YEARS = /(\d{1,2})\s*\+?\s*(?:or more\s+)?(?:years?|yrs?)/i;
const GENERIC_YEARS = new Set([
  'relevant',
  'professional',
  'work',
  'industry',
  'related',
  'minimum',
  'total',
  'field',
  'similar',
  'role',
  'roles',
  'hands-on',
  'handson',
  'overall',
  'proven',
  'track',
  'record',
]);

/* ---------- degrees ---------- */

const LEVELS: { rank: number; names: string[] }[] = [
  { rank: 1, names: GROUPS[27] },
  { rank: 2, names: GROUPS[28] },
  { rank: 3, names: GROUPS[29] },
];
const levelOf = (text: string) =>
  LEVELS.filter((l) => l.names.some((n) => phraseRegex(n).test(norm(text)))).reduce(
    (m, l) => Math.max(m, l.rank),
    0,
  );
const DEGREE_FILL = new Set([
  'degree',
  'related',
  'equivalent',
  'field',
  'discipline',
  'higher',
  'above',
  'relevant',
  'bachelor',
  'master',
  'phd',
  'bachelors',
  'masters',
  'doctorate',
  'science',
  'sciences',
]);

/** The rules-based check for one keyword. It only reads the resume; it never assumes anything. */
export function matchKeyword(
  k: Keyword,
  lines: Line[],
  content: ResumeContent,
  now = new Date(),
): KeywordMatch {
  const base = {
    keywordId: k.id,
    term: k.term,
    category: k.category,
    importance: k.importance,
    source: 'rules' as const,
  };

  // "5+ years of experience"
  const years = YEARS.exec(k.term);
  if (years) {
    const rest = contentTokens(k.term.replace(YEARS, '')).filter((t) => !GENERIC_YEARS.has(t));
    if (rest.length === 0) {
      const need = Number(years[1]);
      const have = experienceYears(content, now);
      const status = have >= need ? 'matched' : have >= need - 1 ? 'partial' : 'missing';
      return {
        ...base,
        status,
        reasoning: `Your listed work dates add up to about ${have.toFixed(1)} years; the role asks for ${need}+.`,
        evidence:
          have > 0
            ? [
                {
                  lineId: 'dates',
                  section: 'Work experience',
                  label: 'Work history dates',
                  text: `About ${have.toFixed(1)} years across ${content.experience.length} position${content.experience.length === 1 ? '' : 's'}`,
                  kind: 'related',
                },
              ]
            : [],
      };
    }
  }

  // "Bachelor's degree in computer science"
  const needLevel = levelOf(k.term);
  if (needLevel > 0 && (k.category === 'qualification' || /degree/i.test(k.term))) {
    const edu = lines.filter((l) => l.section === 'Education');
    const haveLevel = edu.reduce((m, l) => Math.max(m, levelOf(l.text)), 0);
    if (haveLevel >= needLevel) {
      const fieldTokens = contentTokens(k.term).filter((t) => !DEGREE_FILL.has(t));
      const eduText = edu.map((l) => l.text).join(' ');
      const fieldOk =
        fieldTokens.length === 0 || tokenOverlap(fieldTokens.join(' '), eduText) >= 0.6;
      const ev = edu
        .filter((l) => levelOf(l.text) >= needLevel)
        .map((l) => toEvidence(l, 'demonstrated'))
        .slice(0, 2);
      return {
        ...base,
        status: fieldOk ? 'matched' : 'partial',
        reasoning: fieldOk
          ? 'Your education section shows a degree at this level.'
          : 'A degree at this level is listed, but the field of study differs or isn’t stated.',
        evidence: ev,
      };
    }
  }

  const evidence = findEvidence(k, lines);
  const shown = evidence.filter((e) => e.kind === 'demonstrated');
  if (shown.length) {
    return {
      ...base,
      status: 'matched',
      reasoning: `Shown in ${shown.length} place${shown.length === 1 ? '' : 's'} in your resume (${[...new Set(shown.map((e) => e.section))].join(', ')}).`,
      evidence,
    };
  }
  if (evidence.some((e) => e.kind === 'listed')) {
    return {
      ...base,
      status: 'partial',
      reasoning:
        'Named in a list, but no experience, project or summary line shows how you used it.',
      evidence,
    };
  }
  if (evidence.length) {
    return {
      ...base,
      status: 'partial',
      reasoning:
        'Similar wording appears, but not this exact requirement. Check whether it really covers it.',
      evidence,
    };
  }
  return {
    ...base,
    status: 'missing',
    reasoning: 'Not found anywhere in your resume.',
    evidence: [],
  };
}
