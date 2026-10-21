import { Router, type Request } from 'express';
import { z } from 'zod';
import { AppError, wrap } from '../lib/errors.js';
import { assertValidId, conflict, findOwnedResume, revFilter } from '../lib/owned.js';
import { toFull, type ResumeDoc } from '../lib/serialize.js';
import { MAX_VERSIONS, createVersion, toVersionMeta } from '../lib/versions.js';
import { Resume } from '../models/Resume.js';
import { ResumeVersion } from '../models/ResumeVersion.js';

/** Mounted at /api/resumes/:id/versions */
export const versionsRouter = Router({ mergeParams: true });

const param = (req: Request, key: string) => (req.params as Record<string, string>)[key];
const name = z
  .string()
  .trim()
  .min(1, 'Give this version a name')
  .max(80, 'Keep the name under 80 characters');

async function findVersion(resumeId: unknown, vid: string) {
  assertValidId(vid, 'Version');
  const v = await ResumeVersion.findOne({ _id: vid, resumeId });
  if (!v) throw new AppError(404, 'Version not found.');
  return v;
}

versionsRouter.get(
  '/',
  wrap(async (req, res) => {
    const resume = await findOwnedResume(req.userId, param(req, 'id'));
    const versions = await ResumeVersion.find({ resumeId: resume._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ limit: MAX_VERSIONS, versions: versions.map((v) => toVersionMeta(v)) });
  }),
);

versionsRouter.post(
  '/',
  wrap(async (req, res) => {
    const body = z.object({ name }).parse(req.body);
    const resume = await findOwnedResume(req.userId, param(req, 'id'));
    const version = await createVersion(resume, { name: body.name, kind: 'manual' });
    res.status(201).json(toVersionMeta(version.toObject()));
  }),
);

versionsRouter.patch(
  '/:vid',
  wrap(async (req, res) => {
    const body = z.object({ name }).parse(req.body);
    const resume = await findOwnedResume(req.userId, param(req, 'id'));
    const version = await findVersion(resume._id, param(req, 'vid'));
    version.name = body.name;
    await version.save();
    res.json(toVersionMeta(version.toObject()));
  }),
);

versionsRouter.delete(
  '/:vid',
  wrap(async (req, res) => {
    const resume = await findOwnedResume(req.userId, param(req, 'id'));
    const version = await findVersion(resume._id, param(req, 'vid'));
    await version.deleteOne();
    res.status(204).end();
  }),
);

/**
 * Restore never silently overwrites newer work:
 * 1. the caller must pass the revision it last saw (`baseRev`); a mismatch means someone changed it
 * 2. the current state is saved as an automatic version first, so a restore is always undoable
 */
versionsRouter.post(
  '/:vid/restore',
  wrap(async (req, res) => {
    const body = z.object({ baseRev: z.number().int().min(0) }).parse(req.body);
    const resume = await findOwnedResume(req.userId, param(req, 'id'));
    const version = await findVersion(resume._id, param(req, 'vid'));
    if ((resume.rev ?? 0) !== body.baseRev) throw conflict(resume.rev ?? 0);

    const label = version.name || version.note || 'an earlier version';
    await createVersion(resume, {
      kind: 'auto',
      note: `Before restoring “${label}”`.slice(0, 200),
    });

    const updated = await Resume.findOneAndUpdate(
      { _id: resume._id, userId: req.userId, ...revFilter(body.baseRev) },
      {
        $set: {
          content: version.content,
          style: version.style ?? {},
          templateId: version.templateId,
        },
        $inc: { rev: 1 },
      },
      { new: true },
    );
    if (!updated) throw conflict((await findOwnedResume(req.userId, param(req, 'id'))).rev ?? 0);
    res.json(toFull(updated.toObject() as unknown as ResumeDoc));
  }),
);
