import { phraseIn } from './match.js';
import type { Keyword } from './types.js';

/**
 * Deterministic checks on AI output. The prompts tell the model not to invent facts, but we never rely on
 * that: anything it adds is compared with what the user actually wrote.
 */

export function numbersIn(s: string): string[] {
  return (s.match(/\d[\d,]*(?:\.\d+)?\s?(?:%|percent|k\b|m\b|b\b|x\b|\+)?/gi) ?? []).map((n) =>
    n.toLowerCase().replace(/[\s,]/g, '').replace('percent', '%'),
  );
}

const bare = (n: string) => n.replace(/[^\d.]/g, '');

/** Figures in `candidate` that appear in none of the sources (the original text, or answers the user gave). */
export function unsupportedNumbers(candidate: string, ...sources: string[]): string[] {
  const known = new Set(sources.flatMap(numbersIn));
  const knownBare = new Set([...known].map(bare));
  return [...new Set(numbersIn(candidate))].filter((n) => !known.has(n) && !knownBare.has(bare(n)));
}

export interface NewMention {
  term: string;
  /** True if the resume mentions it somewhere else, just not in the original text being rewritten. */
  elsewhere: boolean;
}

/** Job keywords that the rewrite mentions but the original text did not. */
export function newKeywordMentions(
  candidate: string,
  original: string,
  keywords: Keyword[],
  resumeText: string,
): NewMention[] {
  return keywords
    .filter((k) => k.included && phraseIn(k.term, candidate) && !phraseIn(k.term, original))
    .map((k) => ({ term: k.term, elsewhere: phraseIn(k.term, resumeText) }));
}

export const mentionFlag = (m: NewMention) =>
  m.elsewhere
    ? `“${m.term}” appears elsewhere in your resume but not in the original wording here. Confirm it applies to this work.`
    : `“${m.term}” isn’t mentioned anywhere in your resume. Only keep it if you really did this.`;

export const normalizeForCompare = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
