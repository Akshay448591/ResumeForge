import { Router } from 'express';
import { z } from 'zod';
import { copySections } from '../lib/copy.js';
import { diffSnapshots } from '../lib/diff.js';
import { AppError, wrap } from '../lib/errors.js';
import { assertValidId, conflict, findOwnedResume, revFilter } from '../lib/owned.js';
import { toFull, toSummary, titlesFor, type ResumeDoc } from '../lib/serialize.js';
import { createVersion, snapshotOf } from '../lib/versions.js';
import { requireAuth } from '../middleware/auth.js';
import { Resume } from '../models/Resume.js';
import { ExportJob } from '../models/ExportJob.js';
import { Tailoring } from '../models/Tailoring.js';
import { ResumeVersion } from '../models/ResumeVersion.js';
import {
  TEMPLATE_IDS,
  contentSchema,
  emptyContent,
  normalizeTemplateId,
  styleSchema,
} from '../schema/resume.js';
import { exportsRouter } from './exports.js';
import { tailoringRouter } from './tailoring.js';
import { versionsRouter } from './versions.js';

export const resumesRouter = Router();
resumesRouter.use(requireAuth);

const title = z
  .string()
  .trim()
  .min(1, 'Enter a title')
  .max(120, 'Keep the title under 120 characters');
const templateId = z.enum(TEMPLATE_IDS);

const asDoc = (d: unknown) => d as ResumeDoc;

resumesRouter.get(
  '/',
  wrap(async (req, res) => {
    const docs = (await Resume.find({ userId: req.userId })
      .sort({ updatedAt: -1 })
      .lean()) as unknown as ResumeDoc[];
    const titles = new Map(docs.map((d) => [String(d._id), d.title]));
    res.json(docs.map((d) => toSummary(d, titles)));
  }),
);

/** Compare two states. A ref is `resumeId` (its current saved state) or `resumeId:versionId`. */
async function loadRef(userId: string | undefined, ref: string) {
  const [resumeId, versionId] = ref.split(':');
  const resume = await findOwnedResume(userId, resumeId ?? '');
  if (!versionId) {
    return { label: `Current “${resume.title}”`, snap: snapshotOf(resume) };
  }
  assertValidId(versionId, 'Version');
  const v = await ResumeVersion.findOne({ _id: versionId, resumeId: resume._id });
  if (!v) throw new AppError(404, 'Version not found.');
  return { label: `“${v.name || v.note || 'Saved version'}”`, snap: snapshotOf(v) };
}

resumesRouter.get(
  '/compare',
  wrap(async (req, res) => {
    const q = z.object({ from: z.string().min(1), to: z.string().min(1) }).parse(req.query);
    const [from, to] = await Promise.all([loadRef(req.userId, q.from), loadRef(req.userId, q.to)]);
    res.json({ from: from.label, to: to.label, changes: diffSnapshots(from.snap, to.snap) });
  }),
);

resumesRouter.post(
  '/',
  wrap(async (req, res) => {
    const body = z
      .object({
        title,
        templateId: templateId.default('professional'),
        content: z.unknown().optional(),
        style: z.unknown().optional(),
      })
      .parse(req.body);

    let content = emptyContent();
    if (body.content !== undefined) {
      const parsed = contentSchema.safeParse(body.content);
      if (!parsed.success) {
        throw new AppError(
          400,
          'The resume data is not valid, or it comes from a newer version of ResumeForge.',
        );
      }
      content = parsed.data;
    }
    let style = {};
    if (body.style !== undefined) {
      const parsed = styleSchema.safeParse(body.style);
      if (parsed.success) style = parsed.data;
    }
    const doc = await Resume.create({
      userId: req.userId,
      title: body.title,
      templateId: body.templateId,
      content,
      style,
    });
    res.status(201).json(toFull(asDoc(doc.toObject())));
  }),
);

resumesRouter.get(
  '/:id',
  wrap(async (req, res) => {
    const doc = asDoc((await findOwnedResume(req.userId, req.params.id)).toObject());
    res.json(toFull(doc, await titlesFor([doc])));
  }),
);

resumesRouter.patch(
  '/:id',
  wrap(async (req, res) => {
    const body = z
      .object({
        title: title.optional(),
        templateId: templateId.optional(),
        content: contentSchema.optional(),
        style: styleSchema.optional(),
        /** The revision the client last saw. If someone else saved since, the write is refused. */
        baseRev: z.number().int().min(0).optional(),
      })
      .parse(req.body);

    const set: Record<string, unknown> = {};
    if (body.title !== undefined) set.title = body.title;
    if (body.templateId !== undefined) set.templateId = body.templateId;
    if (body.content !== undefined) set.content = body.content;
    if (body.style !== undefined) set.style = body.style;
    const touchesDocument = body.content !== undefined || body.style !== undefined;

    assertValidId(req.params.id);
    if (!Object.keys(set).length) {
      return res.json(toFull(asDoc((await findOwnedResume(req.userId, req.params.id)).toObject())));
    }

    const filter: Record<string, unknown> = { _id: req.params.id, userId: req.userId };
    if (touchesDocument && body.baseRev !== undefined)
      Object.assign(filter, revFilter(body.baseRev));

    const updated = await Resume.findOneAndUpdate(
      filter,
      touchesDocument ? { $set: set, $inc: { rev: 1 } } : { $set: set },
      { new: true, runValidators: true },
    );
    if (!updated) {
      const current = await findOwnedResume(req.userId, req.params.id); // 404 if it doesn't exist
      throw conflict(current.rev ?? 0);
    }
    res.json(toFull(asDoc(updated.toObject())));
  }),
);

/** A duplicate is a variant: an independent copy you can tailor without touching the original. */
resumesRouter.post(
  '/:id/duplicate',
  wrap(async (req, res) => {
    const body = z.object({ title: title.optional() }).parse(req.body ?? {});
    const source = await findOwnedResume(req.userId, req.params.id);
    const copy = await Resume.create({
      userId: req.userId,
      title: (body.title ?? `${source.title} (copy)`).slice(0, 120),
      templateId: normalizeTemplateId(source.templateId),
      content: structuredClone(source.content),
      style: structuredClone(source.style ?? {}),
      variantOf: source._id,
    });
    res
      .status(201)
      .json(toSummary(asDoc(copy.toObject()), new Map([[String(source._id), source.title]])));
  }),
);

resumesRouter.post(
  '/:id/copy-sections',
  wrap(async (req, res) => {
    const body = z
      .object({
        fromResumeId: z.string().min(1),
        sectionIds: z
          .array(z.string().min(1).max(64))
          .min(1, 'Choose at least one section')
          .max(20),
        mode: z.enum(['append', 'replace']),
        baseRev: z.number().int().min(0),
      })
      .parse(req.body);
    if (body.fromResumeId === req.params.id) {
      throw new AppError(400, 'Choose a different resume to copy from.');
    }
    const target = await findOwnedResume(req.userId, req.params.id);
    const source = await findOwnedResume(req.userId, body.fromResumeId);
    if ((target.rev ?? 0) !== body.baseRev) throw conflict(target.rev ?? 0);

    const { content, report } = copySections(
      target.content,
      source.content,
      body.sectionIds,
      body.mode,
    );
    const valid = contentSchema.safeParse(content);
    if (!valid.success) {
      throw new AppError(
        400,
        'The combined content would be too long for one resume. Try copying fewer sections.',
      );
    }
    if (body.mode === 'replace') {
      await createVersion(target, {
        kind: 'auto',
        note: `Before copying sections from “${source.title}”`.slice(0, 200),
      });
    }
    const updated = await Resume.findOneAndUpdate(
      { _id: target._id, userId: req.userId, ...revFilter(body.baseRev) },
      { $set: { content: valid.data }, $inc: { rev: 1 } },
      { new: true },
    );
    if (!updated) throw conflict((await findOwnedResume(req.userId, req.params.id)).rev ?? 0);
    res.json({ resume: toFull(asDoc(updated.toObject())), report });
  }),
);

/** Structured JSON backup. Can be imported again from the dashboard. */
resumesRouter.get(
  '/:id/export',
  wrap(async (req, res) => {
    const doc = asDoc((await findOwnedResume(req.userId, req.params.id)).toObject());
    const slug =
      doc.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'resume';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.resumeforge.json"`);
    res.send(
      JSON.stringify(
        {
          format: 'resumeforge.resume',
          formatVersion: 1,
          schemaVersion: doc.content.schemaVersion,
          exportedAt: new Date().toISOString(),
          title: doc.title,
          templateId: normalizeTemplateId(doc.templateId),
          style: doc.style ?? {},
          content: doc.content,
        },
        null,
        2,
      ),
    );
  }),
);

resumesRouter.use('/:id/versions', versionsRouter);
resumesRouter.use('/:id/exports', exportsRouter);
resumesRouter.use('/:id/tailoring', tailoringRouter);

resumesRouter.delete(
  '/:id',
  wrap(async (req, res) => {
    const doc = await findOwnedResume(req.userId, req.params.id);
    await ResumeVersion.deleteMany({ resumeId: doc._id });
    await ExportJob.deleteMany({ resumeId: doc._id });
    await Tailoring.deleteMany({ resumeId: doc._id });
    await doc.deleteOne();
    res.status(204).end();
  }),
);
