import type { ResumeContent } from '../../schema/resume.js';
import { unsupportedNumbers } from './guard.js';
import { norm, phraseIn, variants } from './match.js';
import { allText, resumeLines } from './text.js';
import type { ChecklistItem, Comparison, Keyword, Report, Suggestion } from './types.js';

const VERBS = new Set(
  'led built ran drove wrote grew made set won took held sold taught chose began brought bought cut dealt found gave got kept knew led met paid put read saw sent spent stood thought understood developed designed delivered created improved reduced increased managed launched owned shipped migrated optimised optimized automated implemented architected analysed analyzed mentored coordinated established streamlined negotiated trained supported maintained resolved introduced drafted refactored scaled integrated deployed monitored tested evaluated planned organised organized produced presented partnered collaborated initiated generated lead build manage design develop deliver create improve reduce increase launch own ship migrate automate implement architect analyse analyze mentor coordinate establish streamline negotiate train support maintain resolve introduce draft refactor scale integrate deploy monitor test evaluate plan organise organize produce present partner collaborate initiate generate spearheaded championed pioneered redesigned rebuilt overhauled consolidated accelerated enabled'.split(
    ' ',
  ),
);
const WEAK =
  /^(responsible for|worked on|helped( with)?|assisted( with)?|duties included|tasked with|involved in|participated in)\b/i;
const VAGUE = /\b(various|several|numerous|etc\.?|a lot of|stuff|things)\b/i;

const startsWithAction = (t: string) => {
  const w =
    t
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase()
      .replace(/[^a-z]/g, '') ?? '';
  return VERBS.has(w) || (w.length > 3 && w.endsWith('ed'));
};

function countOccurrences(term: string, text: string): number {
  const alt = variants(term)
    .map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
    .join('|');
  return (text.match(new RegExp(`(?<![a-z0-9+#.])(?:${alt})(?:s|es)?(?![a-z0-9+#])`, 'gi')) ?? [])
    .length;
}

export interface ReportInput {
  jobTitle: string;
  company: string;
  keywords: Keyword[];
  content: ResumeContent;
  /** The resume this one was tailored from. Null if it has since been deleted. */
  original: ResumeContent | null;
  comparison: Comparison;
  suggestions: Suggestion[];
}

/** Everything the user should check before sending a tailored resume. All findings point at real text. */
export function buildReport(i: ReportInput): Report {
  const lines = resumeLines(i.content);
  const text = allText(lines);
  const active = i.keywords.filter((k) => k.included);
  const { matches } = i.comparison;

  const natural = matches
    .filter((m) => m.status === 'matched')
    .flatMap((m) => {
      const e = m.evidence.find(
        (x) =>
          x.kind === 'demonstrated' &&
          ['Work experience', 'Summary', 'Projects'].includes(x.section),
      );
      return e ? [{ term: m.term, snippet: e.text, section: e.section }] : [];
    });

  const stuffing = active
    .map((k) => ({ term: k.term, count: countOccurrences(k.term, text) }))
    .filter((x) => x.count > 4)
    .sort((a, b) => b.count - a.count);

  const addedSinceOriginal: Report['addedSinceOriginal'] = [];
  if (i.original) {
    const originalText = allText(resumeLines(i.original));
    for (const k of active) {
      if (phraseIn(k.term, text) && !phraseIn(k.term, originalText)) {
        const where = lines.find((l) => phraseIn(k.term, l.text));
        addedSinceOriginal.push({
          term: k.term,
          where: where ? `${where.section} > ${where.label}` : 'Resume',
        });
      }
    }
    for (const n of unsupportedNumbers(text, originalText)) {
      addedSinceOriginal.push({ term: `Figure “${n}”`, where: 'Not in your original resume' });
    }
  }

  const stats = { accepted: 0, edited: 0, rejected: 0, pending: 0 };
  for (const s of i.suggestions) stats[s.status]++;
  const unverifiedSuggestions = i.suggestions
    .filter(
      (s) =>
        (s.status === 'accepted' || s.status === 'edited') && s.needsVerification && !s.verified,
    )
    .map((s) => ({ id: s.id, targetLabel: s.targetLabel, flags: s.flags }));

  const requiredMissing = matches.filter(
    (m) => m.importance === 'required' && m.status === 'missing',
  );
  const requiredPartial = matches.filter(
    (m) => m.importance === 'required' && m.status === 'partial',
  );
  const requiredTotal = matches.filter((m) => m.importance === 'required').length;
  const bullets = lines.filter((l) => l.ref.type === 'bullet');
  const summarySentences = i.content.summary.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length;
  const jobWords = i.jobTitle
    .split(/\s+/)
    .map(norm)
    .filter((w) => w.length > 3);
  const weak = bullets.filter((b) => WEAK.test(b.text) || VAGUE.test(b.text));
  const noAction = bullets.filter((b) => !startsWithAction(b.text));
  const withNumbers = bullets.filter((b) => /\d/.test(b.text)).length;
  const longEntries = i.content.experience.filter((e) => e.bullets.length > 6);

  const item = (
    id: string,
    label: string,
    ok: boolean,
    detail: string,
    warnStatus: 'warn' | 'info' = 'warn',
  ): ChecklistItem => ({ id, label, status: ok ? 'pass' : warnStatus, detail });
  const checklist: ChecklistItem[] = [
    item(
      'required',
      'Every required item is covered',
      requiredMissing.length === 0 && requiredPartial.length === 0,
      requiredTotal === 0
        ? 'No required items were marked in the job description.'
        : requiredMissing.length + requiredPartial.length === 0
          ? `All ${requiredTotal} required items are shown in your resume.`
          : `${requiredMissing.length} missing and ${requiredPartial.length} only partly shown: ${[
              ...requiredMissing,
              ...requiredPartial,
            ]
              .map((m) => m.term)
              .slice(0, 6)
              .join(', ')}. Only add what is true.`,
    ),
    item(
      'in-context',
      'Key skills are shown in your experience, not just listed',
      requiredPartial.length === 0,
      requiredPartial.length
        ? `These are named but not demonstrated: ${requiredPartial
            .map((m) => m.term)
            .slice(0, 6)
            .join(', ')}. If true, mention them in a bullet that shows how you used them.`
        : 'Required skills that appear in your resume are backed by a bullet, project or summary line.',
    ),
    item(
      'summary',
      'Summary is short and speaks to this role',
      summarySentences >= 2 &&
        summarySentences <= 4 &&
        i.content.summary.length <= 600 &&
        (jobWords.length === 0 || jobWords.some((w) => norm(i.content.summary).includes(w))),
      !i.content.summary.trim()
        ? 'There is no summary yet.'
        : `${summarySentences} sentence${summarySentences === 1 ? '' : 's'}. Aim for 2 to 4, and mention the kind of role you are targeting${i.jobTitle ? ` (${i.jobTitle})` : ''}.`,
    ),
    item(
      'verbs',
      'Bullets start with action verbs',
      bullets.length === 0 || noAction.length / bullets.length <= 0.2,
      noAction.length
        ? `${noAction.length} of ${bullets.length} bullets don’t start with an action verb, for example: “${noAction[0].text.slice(0, 60)}…”`
        : 'Every bullet starts with an action verb.',
    ),
    item(
      'weak',
      'No weak or vague phrasing',
      weak.length === 0,
      weak.length
        ? `${weak.length} bullet${weak.length === 1 ? '' : 's'} use phrases like “responsible for”, “worked on” or “various”. Try the bullet assistant.`
        : 'No weak phrases found.',
    ),
    item(
      'numbers',
      'Results are measurable where you have real numbers',
      bullets.length === 0 || withNumbers / bullets.length >= 0.3,
      `${withNumbers} of ${bullets.length} bullets include a number. Add measurable results only where you have the real figure. Never estimate to fill the gap.`,
      'info',
    ),
    item(
      'stuffing',
      'Keywords read naturally',
      stuffing.length === 0,
      stuffing.length
        ? `${stuffing.map((s) => `“${s.term}” appears ${s.count} times`).join('; ')}. Repeating a keyword can look forced.`
        : 'No keyword is repeated more than a few times.',
    ),
    item(
      'length',
      'Entries are a readable length',
      longEntries.length === 0,
      longEntries.length
        ? `${longEntries.map((e) => e.company || e.role).join(', ')} ${longEntries.length === 1 ? 'has' : 'have'} more than 6 bullets. Keep the most relevant ones.`
        : 'No role has an overly long list of bullets.',
    ),
    item(
      'verify',
      'Everything new has been checked by you',
      addedSinceOriginal.length === 0 && unverifiedSuggestions.length === 0,
      addedSinceOriginal.length + unverifiedSuggestions.length === 0
        ? 'Nothing was added that needs a second look.'
        : `${addedSinceOriginal.length} item${addedSinceOriginal.length === 1 ? '' : 's'} weren’t in your original resume and ${unverifiedSuggestions.length} accepted suggestion${unverifiedSuggestions.length === 1 ? '' : 's'} still need your confirmation.`,
    ),
    item(
      'questions',
      'Open questions answered',
      !i.suggestions.some((s) => s.status === 'pending' && s.questions.length),
      `${i.suggestions.filter((s) => s.status === 'pending' && s.questions.length).length} suggestion${i.suggestions.filter((s) => s.status === 'pending' && s.questions.length).length === 1 ? '' : 's'} are waiting on details only you can give.`,
      'info',
    ),
  ];

  return {
    generatedAt: new Date().toISOString(),
    jobTitle: i.jobTitle,
    company: i.company,
    counts: i.comparison.byStatus,
    byImportance: i.comparison.byImportance,
    matched: matches.filter((m) => m.status === 'matched'),
    partial: matches.filter((m) => m.status === 'partial'),
    missing: matches.filter((m) => m.status === 'missing'),
    natural,
    stuffing,
    addedSinceOriginal,
    unverifiedSuggestions,
    suggestionStats: stats,
    checklist,
  };
}
