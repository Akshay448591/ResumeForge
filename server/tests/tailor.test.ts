/**
 * Tailoring logic. The AI is faked here: these tests check what OUR code does with AI output, namely that it
 * only cites real resume text, rejects invented figures, and flags anything that needs the user's check.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/ai/client.js', () => ({
  callTool: vi.fn(),
  aiConfigured: () => true,
  aiModel: () => 'test-model',
}));

import { callTool } from '../src/lib/ai/client.js';
import { analyzeJob } from '../src/lib/tailor/analyze.js';
import { improveBullet, bulletHints } from '../src/lib/tailor/bullet.js';
import { runComparison } from '../src/lib/tailor/compare.js';
import { numbersIn, unsupportedNumbers } from '../src/lib/tailor/guard.js';
import { experienceYears, phraseIn } from '../src/lib/tailor/match.js';
import { buildReport } from '../src/lib/tailor/report.js';
import { generateSuggestions } from '../src/lib/tailor/suggest.js';
import { resumeLines } from '../src/lib/tailor/text.js';
import type { Keyword } from '../src/lib/tailor/types.js';
import { sampleContent } from './fixtures.js';

const ai = vi.mocked(callTool);
const kw = (
  term: string,
  category: Keyword['category'] = 'technology',
  importance: Keyword['importance'] = 'required',
): Keyword => ({
  id: `k-${term}`,
  term,
  category,
  importance,
  quote: '',
  included: true,
});
beforeEach(() => {
  ai.mockReset();
});

describe('matching', () => {
  it('matches whole words and common aliases, not substrings', () => {
    expect(phraseIn('JavaScript', 'Built apps in JS and CSS')).toBe(true);
    expect(phraseIn('Java', 'Built apps in JavaScript')).toBe(false);
    expect(phraseIn('Node.js', 'Backend in Node')).toBe(true);
    expect(phraseIn('C++', 'Wrote C++ services')).toBe(true);
    expect(phraseIn('Kubernetes', 'Ran K8s clusters')).toBe(true);
    expect(phraseIn('JavaScript', 'node.js runtime')).toBe(false);
  });

  it('adds up experience years without double counting overlaps', () => {
    const c = sampleContent();
    c.experience[0].startDate = '2020-01';
    c.experience[0].endDate = '2022-12';
    c.experience[0].current = false;
    c.experience[1].startDate = '2022-06';
    c.experience[1].endDate = '2023-12';
    expect(experienceYears(c, new Date('2024-01-01'))).toBeCloseTo(4, 0);
  });
});

describe('comparison (rules)', () => {
  it('separates matched, listed-only and missing, with the supporting text', async () => {
    ai.mockResolvedValue({ results: [] });
    const c = sampleContent();
    const cmp = await runComparison(c, [
      kw('Node.js'),
      kw('TypeScript'),
      kw('Kubernetes'),
      kw('3+ years of experience', 'qualification'),
      kw("Bachelor's degree in Computer Engineering", 'qualification'),
    ]);
    const by = Object.fromEntries(cmp.matches.map((m) => [m.term, m]));
    expect(by['Node.js'].status).toBe('matched');
    expect(by['Node.js'].evidence[0].text).toMatch(/Node\.js/);
    expect(by['TypeScript'].status).toBe('partial');
    expect(by['TypeScript'].reasoning).toMatch(/list/i);
    expect(by['Kubernetes'].status).toBe('missing');
    expect(by['Kubernetes'].evidence).toHaveLength(0);
    expect(by['3+ years of experience'].status).toBe('matched');
    expect(by["Bachelor's degree in Computer Engineering"].status).toBe('matched');
    expect(cmp.byStatus.total).toBe(5);
    expect(cmp).not.toHaveProperty('score');
  });

  it('only accepts AI support that cites real resume lines', async () => {
    const c = sampleContent();
    const lines = resumeLines(c);
    const mentor = lines.find((l) => /Mentored/.test(l.text))!;
    const k1 = kw('Mentor junior engineers', 'responsibility');
    const k2 = kw('Run incident response', 'responsibility');
    ai.mockResolvedValue({
      results: [
        {
          keywordId: k1.id,
          status: 'matched',
          lineIds: [mentor.id],
          reasoning: 'Mentored four junior developers.',
        },
        { keywordId: k2.id, status: 'matched', lineIds: ['L999'], reasoning: 'Made up' },
      ],
    });
    const cmp = await runComparison(c, [k1, k2]);
    const m1 = cmp.matches.find((m) => m.keywordId === k1.id)!;
    const m2 = cmp.matches.find((m) => m.keywordId === k2.id)!;
    expect(m1.status).toBe('matched');
    expect(m1.source).toBe('ai');
    expect(m1.evidence[0].text).toBe(mentor.text);
    expect(m2.status).toBe('missing');
    expect(cmp.aiRefined).toBe(true);
  });

  it('falls back to wording rules with a warning when the AI fails', async () => {
    ai.mockImplementation(async () => {
      throw new Error('down');
    });
    const cmp = await runComparison(sampleContent(), [
      kw('Lead cross-functional teams', 'responsibility'),
    ]);
    expect(cmp.aiRefined).toBe(false);
    expect(cmp.warnings.join(' ')).toMatch(/AI check/);
  });
});

describe('job analysis', () => {
  const jd =
    'We need a Senior Backend Engineer at Zeta. You must have 5+ years of experience with Node.js and PostgreSQL. Nice to have: Kubernetes. You will lead the payments team.';
  it('drops items that cannot be found in the job description and verifies quotes', async () => {
    ai.mockResolvedValue({
      jobTitle: 'Senior Backend Engineer',
      company: 'Zeta',
      keywords: [
        {
          term: 'Node.js',
          category: 'technology',
          importance: 'required',
          quote: 'experience with Node.js and PostgreSQL',
        },
        {
          term: 'Rust',
          category: 'technology',
          importance: 'required',
          quote: 'strong Rust skills',
        },
        {
          term: 'Kubernetes',
          category: 'technology',
          importance: 'preferred',
          quote: 'a made up sentence that is not there',
        },
        { term: 'node.js', category: 'technology', importance: 'required', quote: '' },
      ],
    });
    const out = await analyzeJob(jd);
    expect(out.keywords.map((k) => k.term)).toEqual(['Node.js', 'Kubernetes']);
    expect(out.dropped).toBe(1);
    expect(out.keywords[0].quote).toMatch(/Node\.js/);
    expect(out.keywords[1].quote).toBe('');
    expect(out.keywords.every((k) => k.included)).toBe(true);
  });
});

describe('guards', () => {
  it('finds figures the source never contained', () => {
    expect(numbersIn('Cut costs by 30% across 12 teams')).toEqual(['30%', '12']);
    expect(unsupportedNumbers('Cut costs by 30% and 40%', 'Cut costs by 30%')).toEqual(['40%']);
    expect(unsupportedNumbers('Saved 2 hours', 'Saved 2 hours a week')).toEqual([]);
  });
});

describe('suggestions', () => {
  it('skips rewrites that invent figures and flags new keywords for verification', async () => {
    const c = sampleContent();
    const lines = resumeLines(c);
    const b1 = lines.find((l) => /Cut checkout failures/.test(l.text))!;
    const b2 = lines.find((l) => /Mentored four/.test(l.text))!;
    const b3 = lines.find((l) => /invoicing service/.test(l.text))!;
    const header = lines.find((l) => l.ref.type === 'header')!;
    ai.mockResolvedValue({
      summary: {
        suggested:
          'Backend engineer who cut checkout failures by 30% and builds payment APIs in Node.js and Go.',
        rationale: 'Relevant',
        keywords: ['Node.js'],
      },
      bullets: [
        {
          lineId: b1.id,
          suggested: 'Cut checkout failures by 55% by redesigning retry logic.',
          rationale: 'x',
          keywords: [],
          questions: [],
        },
        {
          lineId: b2.id,
          suggested: 'Mentored four junior developers on Kubernetes deployment practices.',
          rationale: 'x',
          keywords: ['Kubernetes'],
          questions: [],
        },
        {
          lineId: b3.id,
          suggested: 'Built the invoicing service used by twenty thousand customers.',
          rationale: 'same',
          keywords: [],
          questions: ['How many invoices per month?'],
        },
      ],
      additions: [
        {
          experienceLineId: header.id,
          term: 'Kubernetes',
          rationale: 'Required but missing',
          questions: ['Have you deployed to Kubernetes? What did you do?'],
        },
        { experienceLineId: header.id, term: 'Not a keyword', rationale: 'x', questions: ['?'] },
      ],
    });
    const keywords = [kw('Kubernetes'), kw('Node.js'), kw('TypeScript')];
    const cmp = await runComparison(c, keywords);
    ai.mockResolvedValue((await ai.mock.results[0]?.value) ?? undefined);
    ai.mockReset();
    ai.mockResolvedValue({
      summary: {
        suggested:
          'Backend engineer who cut checkout failures by 30% and builds payment APIs in Node.js and Go.',
        rationale: 'Relevant',
        keywords: ['Node.js'],
      },
      bullets: [
        {
          lineId: b1.id,
          suggested: 'Cut checkout failures by 55% by redesigning retry logic.',
          rationale: 'x',
          keywords: [],
          questions: [],
        },
        {
          lineId: b2.id,
          suggested: 'Mentored four junior developers on Kubernetes deployment practices.',
          rationale: 'x',
          keywords: ['Kubernetes'],
          questions: [],
        },
        {
          lineId: b3.id,
          suggested: 'Built the invoicing service used by twenty thousand customers.',
          rationale: 'same',
          keywords: [],
          questions: [],
        },
      ],
      additions: [
        {
          experienceLineId: header.id,
          term: 'Kubernetes',
          rationale: 'Required but missing',
          questions: ['Have you deployed to Kubernetes? What did you do?'],
        },
        { experienceLineId: header.id, term: 'Not a keyword', rationale: 'x', questions: ['?'] },
      ],
    });
    const { suggestions, warnings } = await generateSuggestions({
      content: c,
      keywords,
      comparison: cmp,
      jobTitle: 'Backend Engineer',
      company: 'Zeta',
    });
    const kinds = suggestions.map((s) => s.kind);

    // 55% was never in the resume, so that rewrite is dropped
    expect(suggestions.find((s) => s.bulletId === b1.ref && s.kind === 'bullet')).toBeUndefined();
    expect(warnings.join(' ')).toMatch(/55%/);
    // Kubernetes appears nowhere in the resume: allowed, but flagged and needs verification
    const k8s = suggestions.find((s) => s.kind === 'bullet' && /Kubernetes/.test(s.suggested))!;
    expect(k8s.needsVerification).toBe(true);
    expect(k8s.flags.join(' ')).toMatch(/isn’t mentioned anywhere/);
    // unchanged bullet is not suggested
    expect(
      suggestions.some((s) => s.kind === 'bullet' && /twenty thousand/.test(s.suggested)),
    ).toBe(false);
    // the summary's 30% is in the resume, so it is allowed
    expect(kinds).toContain('summary');
    // additions never contain claim text and always need verification; unknown terms are dropped
    const adds = suggestions.filter((s) => s.kind === 'addition');
    expect(adds).toHaveLength(1);
    expect(adds[0].suggested).toBe('');
    expect(adds[0].needsVerification).toBe(true);
    expect(adds[0].questions.length).toBeGreaterThan(0);
    // all start undecided
    expect(suggestions.every((s) => s.status === 'pending')).toBe(true);
  });

  it('recommends existing skills and projects without any AI claims', async () => {
    const c = sampleContent();
    c.skills = [
      { id: 's1', name: 'Mentoring', kind: 'soft' },
      { id: 's2', name: 'TypeScript', kind: 'technical' },
      { id: 's3', name: 'PostgreSQL', kind: 'technical' },
    ];
    c.projects = [
      {
        id: 'p1',
        name: 'Garden app',
        link: '',
        technologies: ['Swift'],
        description: 'A hobby app.',
      },
      {
        id: 'p2',
        name: 'Ledger',
        link: '',
        technologies: ['PostgreSQL', 'TypeScript'],
        description: 'Double-entry ledger.',
      },
    ];
    ai.mockResolvedValue({ summary: null, bullets: [], additions: [] });
    const keywords = [kw('PostgreSQL'), kw('TypeScript', 'technology', 'preferred')];
    const { suggestions } = await generateSuggestions({
      content: c,
      keywords,
      comparison: null,
      jobTitle: '',
      company: '',
    });
    const skills = suggestions.find((s) => s.kind === 'skills')!;
    expect(skills.order).toEqual(['s3', 's2', 's1']);
    expect(skills.needsVerification).toBe(false);
    const projects = suggestions.find((s) => s.kind === 'projects')!;
    expect(projects.order).toEqual(['p2', 'p1']);
  });
});

describe('bullet assistant', () => {
  it('shows local hints without the AI', () => {
    const hints = bulletHints('Responsible for various reporting tasks').join(' ');
    expect(hints).toMatch(/weak phrase/i);
    expect(hints).toMatch(/vague/i);
    expect(hints).toMatch(/No numbers/);
  });

  it('drops alternatives with invented numbers, keeps ones using the user’s own facts, and asks questions', async () => {
    ai.mockResolvedValue({
      issues: ['No outcome'],
      questions: [{ id: 'q1', question: 'How many users were affected?', why: 'Shows scale' }],
      alternatives: [
        {
          text: 'Reduced report generation time by 40% for the finance team.',
          style: 'outcome',
          notes: '',
        },
        {
          text: 'Automated monthly reporting for 12 finance users, saving two hours per run.',
          style: 'specific',
          notes: '',
        },
        { text: 'Automated monthly finance reporting.', style: 'concise', notes: '' },
      ],
    });
    const out = await improveBullet({
      text: 'Responsible for reporting',
      evidence: [
        { question: 'How many users?', answer: '12 finance users, it saved 2 hours a run' },
      ],
    });
    const texts = out.alternatives.map((a) => a.text);
    expect(texts.some((t) => /40%/.test(t))).toBe(false);
    expect(texts.some((t) => /12 finance users/.test(t))).toBe(true);
    expect(out.warnings.join(' ')).toMatch(/40%/);
    expect(out.questions[0].question).toMatch(/How many/);
  });
});

describe('report', () => {
  it('flags what was added since the original, repeated keywords and unverified suggestions', async () => {
    const original = sampleContent();
    const tailored = structuredClone(original);
    tailored.experience[0].bullets[0].text =
      'Cut checkout failures by 30% using Kubernetes and Kubernetes operators on Kubernetes clusters and Kubernetes jobs and Kubernetes upgrades.';
    tailored.experience[0].bullets[1].text = 'Mentored 9 junior developers.';
    const keywords = [kw('Kubernetes'), kw('Node.js')];
    ai.mockResolvedValue({ results: [] });
    const comparison = await runComparison(tailored, keywords);
    const report = buildReport({
      jobTitle: 'Backend Engineer',
      company: 'Zeta',
      keywords,
      content: tailored,
      original,
      comparison,
      suggestions: [
        {
          id: 's1',
          kind: 'bullet',
          targetLabel: 'Acme',
          original: '',
          suggested: '',
          rationale: '',
          keywords: [],
          flags: ['x'],
          questions: [],
          needsVerification: true,
          status: 'accepted',
          finalText: 'x',
          verified: false,
        },
        {
          id: 's2',
          kind: 'bullet',
          targetLabel: 'Beta',
          original: '',
          suggested: '',
          rationale: '',
          keywords: [],
          flags: [],
          questions: ['q?'],
          needsVerification: false,
          status: 'pending',
          finalText: '',
          verified: false,
        },
      ],
    });
    expect(report.addedSinceOriginal.map((a) => a.term)).toEqual(
      expect.arrayContaining(['Kubernetes', 'Figure “9”']),
    );
    expect(report.stuffing[0]).toMatchObject({ term: 'Kubernetes' });
    expect(report.unverifiedSuggestions).toHaveLength(1);
    expect(report.suggestionStats).toEqual({ accepted: 1, edited: 0, rejected: 0, pending: 1 });
    expect(report.checklist.find((c) => c.id === 'verify')?.status).toBe('warn');
    expect(report.checklist.find((c) => c.id === 'stuffing')?.status).toBe('warn');
    expect(report.natural.some((n) => n.term === 'Node.js')).toBe(true);
    expect(report.counts.total).toBe(2);
  });
});
