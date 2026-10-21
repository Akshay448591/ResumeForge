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

export const CATEGORY_LABELS: Record<Category, string> = {
  skill: 'Skills and competencies',
  technology: 'Technologies and tools',
  qualification: 'Qualifications and experience',
  responsibility: 'Responsibilities',
  requirement: 'Role requirements',
};

export interface Keyword {
  id: string;
  term: string;
  category: Category;
  importance: Importance;
  quote: string;
  included: boolean;
}

export interface Analysis {
  jobTitle: string;
  company: string;
  keywords: Keyword[];
  dropped: number;
}

export interface Evidence {
  lineId: string;
  section: string;
  label: string;
  text: string;
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

export interface Comparison {
  generatedAt: string;
  matches: KeywordMatch[];
  byStatus: Tally;
  byCategory: Record<Category, Tally>;
  byImportance: Record<Importance, Tally>;
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
  flags: string[];
  questions: string[];
  needsVerification: boolean;
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
  counts: Tally;
  byImportance: Record<Importance, Tally>;
  matched: KeywordMatch[];
  partial: KeywordMatch[];
  missing: KeywordMatch[];
  natural: { term: string; snippet: string; section: string }[];
  stuffing: { term: string; count: number }[];
  addedSinceOriginal: { term: string; where: string }[];
  unverifiedSuggestions: { id: string; targetLabel: string; flags: string[] }[];
  suggestionStats: { accepted: number; edited: number; rejected: number; pending: number };
  checklist: ChecklistItem[];
}

export interface Tailoring {
  id: string;
  resumeId: string;
  sourceResumeId: string | null;
  jobDescription: string;
  jobTitle: string;
  company: string;
  keywords: Keyword[];
  comparison: Comparison | null;
  suggestions: Suggestion[];
  report: Report | null;
  reportHistory: { savedAt: string; matched: number; partial: number; missing: number }[];
  updatedAt: string;
}

export interface BulletAssist {
  hints: string[];
  issues: string[];
  questions: { id: string; question: string; why: string }[];
  alternatives: { text: string; style: string; notes: string; flags: string[] }[];
  warnings: string[];
}
