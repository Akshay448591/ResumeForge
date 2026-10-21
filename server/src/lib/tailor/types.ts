export const CATEGORIES = [
  'skill',
  'technology',
  'qualification',
  'responsibility',
  'requirement',
] as const;
export const IMPORTANCE = ['required', 'preferred', 'mentioned'] as const;
export type Category = (typeof CATEGORIES)[number];
export type Importance = (typeof IMPORTANCE)[number];

/** One requirement taken from the job description. The user reviews and can change every field. */
export interface Keyword {
  id: string;
  term: string;
  category: Category;
  importance: Importance;
  /** Exact excerpt from the job description that supports it. Empty if none could be verified. */
  quote: string;
  included: boolean;
}

export interface Evidence {
  lineId: string;
  section: string;
  label: string;
  /** The resume text that supports the match, exactly as written. */
  text: string;
  /** demonstrated = shown in an experience, project or summary line; listed = only named in a list; related = similar wording */
  kind: 'demonstrated' | 'listed' | 'related';
}

export interface KeywordMatch {
  keywordId: string;
  term: string;
  category: Category;
  importance: Importance;
  status: 'matched' | 'partial' | 'missing';
  reasoning: string;
  evidence: Evidence[];
  source: 'rules' | 'ai';
}

export interface Tally {
  matched: number;
  partial: number;
  missing: number;
  total: number;
}

/** A transparent breakdown. There is deliberately no single score. */
export interface Comparison {
  generatedAt: string;
  matches: KeywordMatch[];
  byStatus: Tally;
  byCategory: Record<Category, Tally>;
  byImportance: Record<Importance, Tally>;
  /** False when the AI check was unavailable and only wording rules were used for responsibilities. */
  aiRefined: boolean;
  warnings: string[];
}

export type SuggestionKind = 'summary' | 'bullet' | 'addition' | 'skills' | 'projects';

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  targetLabel: string;
  experienceId?: string;
  bulletId?: string;
  original: string;
  suggested: string;
  rationale: string;
  keywords: string[];
  /** Plain-language reasons this needs the user's check before it goes on a resume. */
  flags: string[];
  /** What we need to know from the user. We never guess these. */
  questions: string[];
  needsVerification: boolean;
  /** New order of skill or project ids, for kind `skills` / `projects`. */
  order?: string[];
  showSection?: boolean;
  status: 'pending' | 'accepted' | 'edited' | 'rejected';
  finalText: string;
  verified: boolean;
  undo?: { text?: string; order?: string[]; bulletId?: string; toggled?: boolean };
  decidedAt?: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'info';
  detail: string;
}

export interface Report {
  generatedAt: string;
  jobTitle: string;
  company: string;
  counts: { matched: number; partial: number; missing: number; total: number };
  byImportance: Record<Importance, Tally>;
  matched: KeywordMatch[];
  partial: KeywordMatch[];
  missing: KeywordMatch[];
  /** Keywords that read naturally in experience or summary text. */
  natural: { term: string; snippet: string; section: string }[];
  /** Keywords repeated so often they may look forced. */
  stuffing: { term: string; count: number }[];
  /** In the tailored resume but not in the original. Needs the user's confirmation. */
  addedSinceOriginal: { term: string; where: string }[];
  /** Accepted suggestions that carried a warning and haven't been marked as verified. */
  unverifiedSuggestions: { id: string; targetLabel: string; flags: string[] }[];
  suggestionStats: { accepted: number; edited: number; rejected: number; pending: number };
  checklist: ChecklistItem[];
}
