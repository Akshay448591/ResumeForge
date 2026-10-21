import { z } from 'zod';
import type { ResumeContent } from '../../schema/resume.js';
import { aiConfigured, callTool } from '../ai/client.js';
import { matchKeyword } from './match.js';
import { resumeLines, type Line } from './text.js';
import {
  CATEGORIES,
  IMPORTANCE,
  type Category,
  type Comparison,
  type Importance,
  type Keyword,
  type KeywordMatch,
  type Tally,
} from './types.js';

const emptyTally = (): Tally => ({ matched: 0, partial: 0, missing: 0, total: 0 });

export function tally(matches: KeywordMatch[]): Tally {
  const t = emptyTally();
  for (const m of matches) {
    t[m.status]++;
    t.total++;
  }
  return t;
}

export function summarizeMatches(
  matches: KeywordMatch[],
  aiRefined: boolean,
  warnings: string[],
): Comparison {
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, tally(matches.filter((m) => m.category === c))]),
  ) as Record<Category, Tally>;
  const byImportance = Object.fromEntries(
    IMPORTANCE.map((i) => [i, tally(matches.filter((m) => m.importance === i))]),
  ) as Record<Importance, Tally>;
  return {
    generatedAt: new Date().toISOString(),
    matches,
    byStatus: tally(matches),
    byCategory,
    byImportance,
    aiRefined,
    warnings,
  };
}

const aiSchema = z.object({
  results: z.array(
    z.object({
      keywordId: z.string(),
      status: z.enum(['matched', 'partial', 'missing']),
      lineIds: z.array(z.string()).max(4).default([]),
      reasoning: z.string().max(300).default(''),
    }),
  ),
});

const SYSTEM = `You judge whether a candidate's resume supports specific job requirements.

Rules:
- You may only cite resume lines by their ids (like L12). Never quote or paraphrase text that is not in a line.
- Be conservative. "matched" only when a line clearly shows the candidate did this or holds this qualification. "partial" when the support is related, adjacent, smaller in scope, or only listed. "missing" when no line supports it.
- Never assume experience that is not written down. Do not give credit for what a role usually involves.
- Give one plain sentence of reasoning per requirement.`;

/** Rules decide skills and tools by name. Responsibilities and role requirements need meaning, so the AI helps there. */
const needsAi = (m: KeywordMatch) =>
  m.status !== 'matched' &&
  !m.evidence.some((e) => e.lineId === 'dates') &&
  (['responsibility', 'requirement', 'qualification'].includes(m.category) ||
    (m.status === 'missing' && m.category === 'skill'));

/** Merge the AI's judgements in, but only where they cite real resume lines. */
export function applyAiResults(
  matches: KeywordMatch[],
  lines: Line[],
  results: z.infer<typeof aiSchema>['results'],
): KeywordMatch[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const answers = new Map(results.map((r) => [r.keywordId, r]));
  return matches.map((m) => {
    const r = answers.get(m.keywordId);
    if (!r || !needsAi(m)) return m;
    const cited = r.lineIds.map((id) => byId.get(id)).filter((l): l is Line => Boolean(l));
    const evidence = cited.map((l) => ({
      lineId: l.id,
      section: l.section,
      label: l.label,
      text: l.text.length > 240 ? `${l.text.slice(0, 239)}…` : l.text,
      kind: l.kind,
    }));
    let status = r.status;
    let reasoning = r.reasoning || m.reasoning;
    if (status !== 'missing' && evidence.length === 0) {
      status = 'missing';
      reasoning = 'No resume line was cited as support for this.';
    }
    if (status === 'matched' && evidence.every((e) => e.kind === 'listed')) status = 'partial';
    return {
      ...m,
      status,
      reasoning,
      evidence: status === 'missing' ? [] : evidence,
      source: 'ai' as const,
    };
  });
}

/** Compare the resume with the reviewed keywords. The result is a breakdown with supporting text, not a score. */
export async function runComparison(
  content: ResumeContent,
  keywords: Keyword[],
  now = new Date(),
): Promise<Comparison> {
  const lines = resumeLines(content);
  let matches = keywords.filter((k) => k.included).map((k) => matchKeyword(k, lines, content, now));
  const warnings: string[] = [];
  let aiRefined = false;

  const pending = matches.filter(needsAi).slice(0, 40);
  if (pending.length) {
    if (!aiConfigured()) {
      warnings.push(
        'The AI check isn’t set up, so responsibilities and requirements were matched by wording only. Add GEMINI_API_KEY for a closer reading.',
      );
    } else {
      try {
        const resumeText = lines
          .slice(0, 300)
          .map((l) => `[${l.id}] (${l.section} > ${l.label}) ${l.text.slice(0, 400)}`)
          .join('\n');
        const reqText = pending
          .map((m) => `- id: ${m.keywordId} | ${m.importance} ${m.category} | ${m.term}`)
          .join('\n');
        const out = await callTool({
          system: SYSTEM,
          user: `RESUME LINES\n${resumeText}\n\nREQUIREMENTS TO CHECK\n${reqText}`,
          name: 'report_requirement_support',
          description: 'For each requirement, say how well the resume lines support it.',
          schema: aiSchema,
          maxTokens: 3500,
        });
        matches = applyAiResults(matches, lines, out.results);
        aiRefined = true;
      } catch {
        warnings.push(
          'The AI check couldn’t run just now, so responsibilities and requirements were matched by wording only. Try again in a moment.',
        );
      }
    }
  }
  return summarizeMatches(matches, aiRefined, warnings);
}
