import mongoose from 'mongoose';
import { Resume } from '../models/Resume.js';
import { AppError } from './errors.js';

export function assertValidId(id: string, what = 'Resume') {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, `${what} not found.`);
}

export async function findOwnedResume(userId: string | undefined, id: string) {
  assertValidId(id);
  const doc = await Resume.findOne({ _id: id, userId });
  if (!doc) throw new AppError(404, 'Resume not found.');
  return doc;
}

/** Matches documents saved before `rev` existed as revision 0. */
export const revFilter = (rev: number) =>
  rev === 0 ? { $or: [{ rev: 0 }, { rev: { $exists: false } }] } : { rev };

export const conflict = (currentRev: number) =>
  new AppError(
    409,
    'This resume was changed somewhere else, such as another tab or a restore. Reload to see the latest version.',
    undefined,
    { code: 'REV_CONFLICT', currentRev },
  );
