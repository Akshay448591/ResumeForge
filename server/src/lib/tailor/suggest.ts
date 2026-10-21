import { z } from 'zod';
import type { ResumeContent } from '../../schema/resume.js';
import { newId } from '../../schema/resume.js';
import { callTool } from '../ai/client.js';
import {
  mentionFlag,
  newKeywordMentions,
  normalizeForCompare,
  unsupportedNumbers,
} from './guard.js';
import { norm, phraseIn } from './match.js';
import { allText, resumeLines, type Line } from './text.js';
import type { Comparison, Keyword, Suggestion } from './types.js';

const outSchema = z.object({
  summary: z
    .object({
      suggested: z.string().max(1500),
      rationale: z.string().max(400).default(''),
      keywords: z.array(z.string().max(160)).max(12).default([]),
    })
    .nullable()
    .default(null),
  bullets: z
    .array(
      z.object({
        lineId: z.string(),
        suggested: z.string().max(600),
        rationale: z.string().max(400).default(''),
        keywords: z.array(z.string().max(160)).max(8).default([]),
        questions: z.array(z.string().max(300)).max(3).default([]),
      }),
    )
    .max(10)
    .default([]),
  additions: z
    .array(
      z.object({
        experienceLineId: z.string(),
        term: z.string().max(160),
        rationale: z.string().max(400).default(''),
        questions: z.array(z.string().max(300)).min(1).max(3),
      }),
    )
    .max(5)
    .default([]),
});

const SYSTEM = `You help a candidate tailor an EXISTING resume to a specific job without fabricating anything.

Hard rules:
1. Use only facts that are in the resume lines provided. Never invent employers, titles, dates, tools, projects, outcomes or numbers.
2. Do not add a technology, skill or keyword to a bullet unless that bullet (or its own role line) already involves it. If a job keyword is missing from the resume, do not write it into a rewrite.
3. Never add a figure (percentage, amount, count, time saved) that is not already in the original text of that bullet. If a bullet would be stronger with a measurable result, put a short question in "questions" asking the candidate for it. Do not guess.
4. Keep the meaning, tense and voice. Start with a strong action verb, be specific and concise (under 30 words), avoid "responsible for" and first person.
5. Rewrite at most 8 bullets, choosing the ones most relevant to the job where wording can be improved to speak to the requirements the resume already supports. Skip bullets that are already good.
6. For the summary, write 2 to 4 sentences using only what the resume shows, emphasising what is relevant to the job. If the resume has no summary, still write one from the resume's own content.
7. For an important requirement the resume does not show, you may propose an "addition": point at the role (by line id) where it might belong and ask 1 to 3 questions about what the candidate actually did. Never write it as a fact.`;

const priority = { required: 3, preferred: 2, mentioned: 1 } as const;

function skillSuggestion(content: ResumeContent, keywords: Keyword[]): Suggestion | null {
  const active = keywords.filter((k) => k.included);
  const scored = content.skills
    .filter((s) => s.name.trim())
    .map((s, i) => {
      const hits = active.filter((k) => phraseIn(k.term, s.name) || phraseIn(s.name, k.term));
      return { s, i, score: hits.reduce((t, k) => t + priority[k.importance], 0), hits };
    });
  const sorted = [...scored].sort((a, b) => b.score - a.score || a.i - b.i);
  if (!sorted.some((x) => x.score > 0)) return null;
  const same = sorted.every(
    (x, idx) => x.s.id === content.skills.filter((s) => s.name.trim())[idx]?.id,
  );
  if (same) return null;
  const relevant = sorted.filter((x) => x.score > 0);
  return {
    id: newId(),
    kind: 'skills',
    targetLabel: 'Skills order',
    original: content.skills
      .map((s) => s.name)
      .filter(Boolean)
      .join(', '),
    suggested: sorted.map((x) => x.s.name).join(', '),
    rationale: `Moves ${relevant.length} skill${relevant.length === 1 ? '' : 's'} that match this job to the front: ${relevant
      .slice(0, 6)
      .map((x) => x.s.name)
      .join(', ')}.`,
    keywords: [...new Set(relevant.flatMap((x) => x.hits.map((k) => k.term)))].slice(0, 8),
    flags: [],
    questions: [],
    needsVerification: false,
    order: [
      ...sorted.map((x) => x.s.id),
      ...content.skills.filter((s) => !s.name.trim()).map((s) => s.id),
    ],
    status: 'pending',
    finalText: '',
    verified: false,
  };
}

function projectSuggestion(content: ResumeContent, keywords: Keyword[]): Suggestion | null {
  const active = keywords.filter((k) => k.included);
  const scored = content.projects.map((p, i) => {
    const text = [p.name, p.description, p.technologies.join(' ')].join(' ');
    const hits = active.filter((k) => phraseIn(k.term, text));
    return { p, i, score: hits.reduce((t, k) => t + priority[k.importance], 0), hits };
  });
  const relevant = scored.filter((x) => x.score > 0);
  if (!relevant.length) return null;
  const sorted = [...scored].sort((a, b) => b.score - a.score || a.i - b.i);
  const hidden = content.sections.find((s) => s.id === 'projects')?.visible === false;
  const same = sorted.every((x, idx) => x.p.id === content.projects[idx]?.id);
  if (same && !hidden) return null;
  return {
    id: newId(),
    kind: 'projects',
    targetLabel: 'Projects',
    original: content.projects.map((p) => p.name).join(', '),
    suggested: sorted.map((x) => x.p.name).join(', '),
    rationale: `${relevant.map((x) => `“${x.p.name}” (${[...new Set(x.hits.map((k) => k.term))].slice(0, 4).join(', ')})`).join('; ')} relate${relevant.length === 1 ? 's' : ''} to this job.${hidden ? ' Your Projects section is currently hidden, so accepting this also shows it.' : ''}`,
    keywords: [...new Set(relevant.flatMap((x) => x.hits.map((k) => k.term)))].slice(0, 8),
    flags: [],
    questions: [],
    needsVerification: false,
    order: sorted.map((x) => x.p.id),
    showSection: hidden || undefined,
    status: 'pending',
    finalText: '',
    verified: false,
  };
}

export interface SuggestInput {
  content: ResumeContent;
  keywords: Keyword[];
  comparison: Comparison | null;
  jobTitle: string;
  company: string;
}

/** Suggestions for the summary and bullets from the AI (checked in code), plus skill and project recommendations. */
export async function generateSuggestions(
  input: SuggestInput,
): Promise<{ suggestions: Suggestion[]; warnings: string[] }> {
  const { content, keywords, comparison } = input;
  const lines = resumeLines(content);
  const resumeText = allText(lines);
  const warnings: string[] = [];
  const status = new Map((comparison?.matches ?? []).map((m) => [m.keywordId, m.status]));

  const reqText = keywords
    .filter((k) => k.included)
    .map(
      (k) =>
        `- [${k.importance}] [${k.category}] ${k.term} — currently ${status.get(k.id) ?? 'unchecked'}`,
    )
    .join('\n');
  const linesText = lines
    .slice(0, 300)
    .map((l) => `[${l.id}] (${l.section} > ${l.label}) ${l.text.slice(0, 400)}`)
    .join('\n');

  const out = await callTool({
    system: SYSTEM,
    user: `JOB: ${input.jobTitle || 'untitled role'}${input.company ? ` at ${input.company}` : ''}\n\nREQUIREMENTS (reviewed by the candidate)\n${reqText}\n\nRESUME LINES\n${linesText}`,
    name: 'propose_tailoring',
    description: 'Propose tailoring suggestions grounded only in the resume.',
    schema: outSchema,
    maxTokens: 5000,
  });

  const suggestions: Suggestion[] = [];
  const byId = new Map<string, Line>(lines.map((l) => [l.id, l]));

  if (out.summary?.suggested.trim()) {
    const suggested = out.summary.suggested.trim();
    const bad = unsupportedNumbers(suggested, resumeText);
    if (bad.length)
      warnings.push(
        `Skipped the summary suggestion because it introduced figures (${bad.join(', ')}) that aren’t in your resume.`,
      );
    else if (normalizeForCompare(suggested) !== normalizeForCompare(content.summary)) {
      const flags = newKeywordMentions(suggested, content.summary, keywords, resumeText).map(
        mentionFlag,
      );
      suggestions.push({
        id: newId(),
        kind: 'summary',
        targetLabel: 'Professional summary',
        original: content.summary,
        suggested,
        rationale: out.summary.rationale,
        keywords: out.summary.keywords,
        flags,
        questions: [],
        needsVerification: flags.length > 0,
        status: 'pending',
        finalText: '',
        verified: false,
      });
    }
  }

  for (const b of out.bullets) {
    const line = byId.get(b.lineId);
    if (!line || line.ref.type !== 'bullet') continue;
    const suggested = b.suggested.trim();
    if (!suggested || normalizeForCompare(suggested) === normalizeForCompare(line.text)) continue;
    const bad = unsupportedNumbers(suggested, line.text);
    if (bad.length) {
      warnings.push(
        `Skipped a rewrite of a bullet in “${line.label}” because it introduced figures (${bad.join(', ')}) you haven’t provided.`,
      );
      continue;
    }
    const flags = newKeywordMentions(suggested, line.text, keywords, resumeText).map(mentionFlag);
    suggestions.push({
      id: newId(),
      kind: 'bullet',
      targetLabel: line.label,
      experienceId: line.ref.experienceId,
      bulletId: line.ref.bulletId,
      original: line.text,
      suggested,
      rationale: b.rationale,
      keywords: b.keywords,
      flags,
      questions: b.questions,
      needsVerification: flags.length > 0,
      status: 'pending',
      finalText: '',
      verified: false,
    });
  }

  const keywordByTerm = new Map(keywords.filter((k) => k.included).map((k) => [norm(k.term), k]));
  for (const a of out.additions) {
    const line = byId.get(a.experienceLineId);
    const kw = keywordByTerm.get(norm(a.term));
    if (
      !line ||
      !kw ||
      (line.ref.type !== 'bullet' && line.ref.type !== 'header') ||
      status.get(kw.id) === 'matched'
    )
      continue;
    suggestions.push({
      id: newId(),
      kind: 'addition',
      targetLabel: `Add to ${line.label}`,
      experienceId: line.ref.experienceId,
      original: '',
      suggested: '',
      rationale: a.rationale,
      keywords: [kw.term],
      flags: [
        `“${kw.term}” isn’t in your resume. Only add it if you genuinely did this work, and write it in your own words.`,
      ],
      questions: a.questions,
      needsVerification: true,
      status: 'pending',
      finalText: '',
      verified: false,
    });
  }

  const skills = skillSuggestion(content, keywords);
  if (skills) suggestions.push(skills);
  const projects = projectSuggestion(content, keywords);
  if (projects) suggestions.push(projects);
  return { suggestions, warnings };
}
