/* eslint-disable no-control-regex -- file names must be stripped of control characters */
import { createHash } from 'node:crypto';
import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError, wrap } from '../lib/errors.js';
import { logger, updateLogContext } from '../lib/observability/index.js';
import { assertValidId, findOwnedResume } from '../lib/owned.js';
import { enqueueExport } from '../lib/pdf/queue.js';
import { sanitizeFilename } from '../lib/security.js';
import { ExportJob, type IExportJob } from '../models/ExportJob.js';
import { normalizeTemplateId } from '../schema/resume.js';

/** Mounted at /api/resumes/:id/exports */
export const exportsRouter = Router({ mergeParams: true });

const JOB_LIFETIME_MS = 60 * 60 * 1000;
const param = (req: Request, key: string) => (req.params as Record<string, string>)[key];

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  keyGenerator: (req) => req.userId ?? 'anonymous',
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'You’re exporting too quickly. Please wait a moment and try again.' },
});

const meta = (j: IExportJob & { _id: unknown }) => ({
  id: String(j._id),
  status: j.status,
  pageSize: j.pageSize,
  pages: j.pages ?? null,
  bytes: j.bytes ?? null,
  error: j.error ?? '',
  filename: j.filename ?? '',
});

/** A safe file name: no path or control characters, always ending in .pdf. */
function safeName(raw: string | undefined, fallback: string) {
  return sanitizeFilename(raw, fallback);
}

function contentDisposition(name: string) {
  // Strip control characters, quotes, and CRLF (HTTP response splitting prevention)
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\r\n\\]/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name.replace(/[\r\n]/g, ''))}`;
}

/**
 * Start a PDF export. Rendering happens in a background queue, so this returns right away and the client polls.
 * Asking again for an identical resume (same content, design, template and page size) reuses the existing job
 * instead of rendering twice.
 */
exportsRouter.post(
  '/',
  limiter,
  wrap(async (req, res) => {
    const body = z
      .object({
        pageSize: z.enum(['a4', 'letter']).optional(),
        filename: z.string().max(200).optional(),
      })
      .parse(req.body ?? {});
    const resume = await findOwnedResume(req.userId, param(req, 'id'));

    const style: Record<string, unknown> = { ...(resume.style ?? {}) };
    const pageSize = body.pageSize ?? (style.pageSize as 'a4' | 'letter' | undefined) ?? 'a4';
    style.pageSize = pageSize;
    const templateId = normalizeTemplateId(resume.templateId);
    const hash = createHash('sha256')
      .update(JSON.stringify({ content: resume.content, style, templateId }))
      .digest('hex');

    const existing = await ExportJob.findOne({
      resumeId: resume._id,
      userId: req.userId,
      hash,
      status: { $in: ['queued', 'processing', 'done'] },
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
    if (existing) {
      res.json(meta(existing.toObject()));
      return;
    }

    const job = await ExportJob.create({
      userId: resume.userId,
      resumeId: resume._id,
      hash,
      status: 'queued',
      pageSize,
      filename: safeName(body.filename, resume.title),
      snapshot: { title: resume.title, templateId, style, content: resume.content },
      expiresAt: new Date(Date.now() + JOB_LIFETIME_MS),
    });
    const jobIdStr = String(job._id);
    updateLogContext({ exportJobId: jobIdStr });
    logger.info('Queued new PDF export job', { exportJobId: jobIdStr, resumeId: String(resume._id) });
    enqueueExport(jobIdStr);
    res.status(202).json(meta(job.toObject()));
  }),
);

async function findJob(req: Request, select = '') {
  const resume = await findOwnedResume(req.userId, param(req, 'id'));
  const jobId = param(req, 'jobId');
  assertValidId(jobId, 'Export');
  updateLogContext({ exportJobId: jobId });
  const job = await ExportJob.findOne({
    _id: jobId,
    resumeId: resume._id,
    userId: req.userId,
  }).select(select);
  if (!job) throw new AppError(404, 'That export has expired. Please generate it again.');
  return { resume, job };
}

exportsRouter.get(
  '/:jobId',
  wrap(async (req, res) => {
    const { job } = await findJob(req);
    res.json(meta(job.toObject()));
  }),
);

exportsRouter.get(
  '/:jobId/download',
  wrap(async (req, res) => {
    const { resume, job } = await findJob(req, '+pdf');
    if (job.status !== 'done' || !job.pdf) throw new AppError(409, 'This PDF isn’t ready yet.');
    const requested = typeof req.query.filename === 'string' ? req.query.filename : undefined;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      contentDisposition(safeName(requested, job.filename || resume.title)),
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(job.pdf);
  }),
);
