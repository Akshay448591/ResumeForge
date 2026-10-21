import { z } from 'zod';
import { callTool } from '../ai/client.js';
import { mentionFlag, newKeywordMentions, unsupportedNumbers } from './guard.js';

const outSchema = z.object({
  issues: z.array(z.string().max(300)).max(6).default([]),
  questions: z
    .array(
      z.object({
        id: z.string().max(40),
        question: z.string().max(300),
        why: z.string().max(300).default(''),
      }),
    )
    .max(3)
    .default([]),
  alternatives: z
    .array(
      z.object({
        text: z.string().min(5).max(400),
        style: z.string().max(60).default(''),
        notes: z.string().max(300).default(''),
      }),
    )
    .max(4)
    .default([]),
});

const SYSTEM = `You help people rewrite resume bullet points so they are clear, specific and credible.

Hard rules:
- Use only the original bullet and any facts the user supplied in their answers. Never invent facts, tools, scope, outcomes or numbers.
- If the bullet lacks scope, an outcome or a measurable result, do NOT guess one. Add up to 3 "questions" asking the user for it (for example "Roughly how many users or how much time did this affect?"), with a short "why".
- Give up to 3 alternative wordings that differ in emphasis (for example action-focused, outcome-focused, concise). Each starts with a strong action verb (past tense, or present tense if the role is current), avoids "responsible for" and first person, and stays under 30 words.
- Only use a number in an alternative if it appears in the original bullet or in the user's answers.
- "issues" lists specific weaknesses in the original in plain language (vague wording, no outcome, passive voice, too long).
- If a list of job keywords is given, use one only if the original bullet or the user's answers support it.`;

const WEAK =
  /^(responsible for|worked on|helped( with)?|assisted( with)?|duties included|tasked with|involved in|participated in)\b/i;
const VAGUE = /\b(various|several|many|numerous|stuff|things|etc\.?|a lot of|multiple)\b/i;

/** Quick checks that need no AI, shown straight away. */
export function bulletHints(text: string): string[] {
  const t = text.trim();
  const hints: string[] = [];
  const words = t.split(/\s+/).filter(Boolean).length;
  if (WEAK.test(t))
    hints.push('Starts with a weak phrase. Lead with what you did, using an action verb.');
  if (/\b(i|my|me)\b/i.test(t)) hints.push('Avoid first person. Start with the action instead.');
  if (VAGUE.test(t)) hints.push('Contains vague wording. Say exactly what, how many or how often.');
  if (!/\d/.test(t))
    hints.push('No numbers. Add a count, size, time or result only if you have a real one.');
  if (words > 35) hints.push('Long. Aim for one line or two, under about 30 words.');
  if (words < 6) hints.push('Very short. Add what you did and why it mattered.');
  return hints;
}

export interface BulletInput {
  text: string;
  role?: string;
  company?: string;
  evidence?: { question: string; answer: string }[];
  jobKeywords?: string[];
}

export async function improveBullet(input: BulletInput) {
  const answers = (input.evidence ?? []).filter((e) => e.answer.trim());
  const keywords = (input.jobKeywords ?? []).slice(0, 40);
  const user = [
    `ORIGINAL BULLET\n${input.text.trim()}`,
    input.role || input.company
      ? `ROLE: ${[input.role, input.company].filter(Boolean).join(' at ')}`
      : '',
    answers.length
      ? `FACTS FROM THE USER\n${answers.map((a) => `Q: ${a.question}\nA: ${a.answer.trim()}`).join('\n')}`
      : '',
    keywords.length ? `JOB KEYWORDS (use only if supported): ${keywords.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const out = await callTool({
    system: SYSTEM,
    user,
    name: 'improve_bullet',
    description: 'Return issues, questions for missing evidence, and alternative wordings.',
    schema: outSchema,
    maxTokens: 1800,
  });

  const known = [input.text, ...answers.map((a) => a.answer)];
  const warnings: string[] = [];
  const alternatives = out.alternatives.flatMap((a) => {
    const bad = unsupportedNumbers(a.text, ...known);
    if (bad.length) {
      warnings.push(`Left out an option that used figures you hadn’t given (${bad.join(', ')}).`);
      return [];
    }
    const flags = newKeywordMentions(
      a.text,
      known.join(' '),
      keywords.map((term) => ({
        id: term,
        term,
        category: 'skill' as const,
        importance: 'mentioned' as const,
        quote: '',
        included: true,
      })),
      '',
    ).map(mentionFlag);
    return [{ text: a.text.trim(), style: a.style, notes: a.notes, flags }];
  });
  return {
    hints: bulletHints(input.text),
    issues: out.issues,
    questions: out.questions,
    alternatives,
    warnings,
  };
}
