import { Resume } from '../models/Resume.js';
import {
  completion,
  normalizeTemplateId,
  type ResumeContent,
  type StyleOverrides,
} from '../schema/resume.js';

export type ResumeDoc = {
  _id: unknown;
  title: string;
  templateId: string;
  content: ResumeContent;
  style?: StyleOverrides;
  rev?: number;
  variantOf?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

/** Titles of resumes by id, used to show "Variant of …". */
export type Titles = Map<string, string>;

export const toSummary = (r: ResumeDoc, titles?: Titles) => {
  const source = r.variantOf ? String(r.variantOf) : null;
  const sourceTitle = source ? titles?.get(source) : undefined;
  return {
    id: String(r._id),
    title: r.title,
    templateId: normalizeTemplateId(r.templateId),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    completion: completion(r.content),
    variantOf: source && sourceTitle ? { id: source, title: sourceTitle } : null,
  };
};

export const toFull = (r: ResumeDoc, titles?: Titles) => ({
  ...toSummary(r, titles),
  content: r.content,
  style: r.style ?? {},
  rev: r.rev ?? 0,
});

export async function titlesFor(docs: ResumeDoc[]): Promise<Titles> {
  const ids = [
    ...new Set(docs.map((d) => (d.variantOf ? String(d.variantOf) : '')).filter(Boolean)),
  ];
  if (!ids.length) return new Map();
  const found = await Resume.find({ _id: { $in: ids } })
    .select('title')
    .lean();
  return new Map(found.map((f) => [String(f._id), f.title]));
}
