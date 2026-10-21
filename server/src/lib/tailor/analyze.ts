import { z } from 'zod';
import { newId } from '../../schema/resume.js';
import { callTool } from '../ai/client.js';
import { norm, termAppearsIn } from './match.js';
import { CATEGORIES, IMPORTANCE, type Keyword } from './types.js';

const outSchema = z.object({
  jobTitle: z.string().max(160).default(''),
  company: z.string().max(160).default(''),
  keywords: z
    .array(
      z.object({
        term: z.string().min(1).max(160),
        category: z.enum(CATEGORIES),
        importance: z.enum(IMPORTANCE),
        quote: z.string().max(500).default(''),
      }),
    )
    .max(120),
});

const SYSTEM = `You extract structured requirements from a job description so a candidate can compare it with their resume.

Rules:
- Include only things the job description actually states. Never add requirements that are merely typical for the role.
- Every item needs "quote": a short, verbatim excerpt (under 200 characters) copied exactly from the job description that supports it.
- category: "skill" = abilities and competencies (e.g. stakeholder management); "technology" = languages, frameworks, tools, platforms, cloud services; "qualification" = degrees, certifications, licences, years of experience; "responsibility" = what the person will do; "requirement" = role-level conditions such as seniority, domain knowledge, location or travel, clearance, team size, work arrangement.
- importance: "required" if described as required, must-have, essential, minimum, or listed under requirements; "preferred" if nice-to-have, a plus or a bonus; otherwise "mentioned".
- Keep technology and skill terms short and canonical (for example "PostgreSQL", not "experience with PostgreSQL databases"). Responsibilities and requirements are short phrases of at most 12 words.
- Merge duplicates. At most 60 items. Do not include company benefits, perks or boilerplate.
- Also return the job title and company name if the text states them; otherwise leave them empty.`;

const squash = (s: string) => norm(s).replace(/["'“”]/g, '');

export interface Analysis {
  jobTitle: string;
  company: string;
  keywords: Keyword[];
  /** Items removed because they could not be found in the job description. */
  dropped: number;
}

/**
 * Extract keywords from a job description. The AI's output is checked against the text:
 * quotes must really appear in it, and items it cannot be traced to are dropped.
 */
export async function analyzeJob(jobDescription: string): Promise<Analysis> {
  const out = await callTool({
    system: SYSTEM,
    user: `JOB DESCRIPTION\n"""\n${jobDescription}\n"""`,
    name: 'report_job_requirements',
    description: 'Report the requirements found in the job description.',
    schema: outSchema,
    maxTokens: 4500,
  });

  const jd = squash(jobDescription);
  const seen = new Set<string>();
  const keywords: Keyword[] = [];
  let dropped = 0;
  for (const k of out.keywords) {
    const term = k.term.replace(/\s+/g, ' ').trim();
    const key = norm(term);
    if (!term || seen.has(key)) continue;
    const quote = k.quote.trim();
    const quoteOk = quote.length > 0 && jd.includes(squash(quote));
    const grounded = quoteOk || termAppearsIn(term, jobDescription);
    if (!grounded) {
      dropped++;
      continue;
    }
    seen.add(key);
    keywords.push({
      id: newId(),
      term: term.slice(0, 120),
      category: k.category,
      importance: k.importance,
      quote: quoteOk ? quote : '',
      included: true,
    });
  }
  return { jobTitle: out.jobTitle.trim(), company: out.company.trim(), keywords, dropped };
}
