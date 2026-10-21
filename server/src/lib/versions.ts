import type { Types } from 'mongoose';
import { ResumeVersion, type IResumeVersion } from '../models/ResumeVersion.js';
import { normalizeTemplateId, type ResumeContent, type StyleOverrides } from '../schema/resume.js';
import { summarize, type Snapshot } from './diff.js';
import { AppError } from './errors.js';

/** Each resume keeps at most this many saved versions. */
export const MAX_VERSIONS = 10;

interface Source {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  templateId: string;
  content: ResumeContent;
  style?: StyleOverrides;
}

export const snapshotOf = (v: {
  templateId: string;
  content: ResumeContent;
  style?: StyleOverrides;
}): Snapshot => ({
  templateId: v.templateId,
  content: v.content,
  style: (v.style ?? {}) as Record<string, unknown>,
});

export const toVersionMeta = (v: IResumeVersion & { _id: unknown; createdAt?: Date }) => ({
  id: String(v._id),
  name: v.name ?? '',
  kind: v.kind,
  note: v.note ?? '',
  templateId: normalizeTemplateId(v.templateId),
  summary: v.summary ?? [],
  createdAt: v.createdAt,
});

/**
 * Save a snapshot of the resume's current saved state.
 * History is bounded: when full, the oldest unnamed version is dropped. Named versions are never
 * dropped automatically, so if every slot is named the caller must delete one first.
 */
export async function createVersion(
  r: Source,
  opts: { name?: string; kind: 'manual' | 'auto'; note?: string },
) {
  const prev = await ResumeVersion.findOne({ resumeId: r._id }).sort({ createdAt: -1 }).lean();
  const count = await ResumeVersion.countDocuments({ resumeId: r._id });
  if (count >= MAX_VERSIONS) {
    const oldest = await ResumeVersion.findOne({
      resumeId: r._id,
      $or: [{ name: '' }, { name: { $exists: false } }],
    }).sort({ createdAt: 1 });
    if (!oldest) {
      throw new AppError(
        409,
        `You can keep up to ${MAX_VERSIONS} versions and all of them are named. Delete one to make room.`,
        undefined,
        { code: 'VERSION_LIMIT' },
      );
    }
    await oldest.deleteOne();
  }
  return ResumeVersion.create({
    resumeId: r._id,
    userId: r.userId,
    name: opts.name ?? '',
    kind: opts.kind,
    note: opts.note ?? '',
    templateId: r.templateId,
    content: structuredClone(r.content),
    style: structuredClone(r.style ?? {}),
    summary: summarize(prev ? snapshotOf(prev) : null, snapshotOf(r)),
  });
}
