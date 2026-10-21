import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { aiConfigured, aiModel } from '../lib/ai/client.js';
import { AppError, wrap } from '../lib/errors.js';
import { findOwnedResume } from '../lib/owned.js';
import { analyzeJob } from '../lib/tailor/analyze.js';
import { improveBullet } from '../lib/tailor/bullet.js';
import { runComparison } from '../lib/tailor/compare.js';
import { CATEGORIES, IMPORTANCE } from '../lib/tailor/types.js';
import { requireAuth } from '../middleware/auth.js';
import { Resume } from '../models/Resume.js';
import { Tailoring } from '../models/Tailoring.js';
import { normalizeTemplateId } from '../schema/resume.js';
import { tailoringDto } from './tailoring.js';

/** Mounted at /api/tailor. Job analysis, comparison, creating a tailored copy, and the bullet assistant. */
export const tailorRouter = Router();
tailorRouter.use(requireAuth);

const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req) => req.userId ?? 'anonymous',
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'You’re sending requests quickly. Please wait a moment and try again.' },
});

export const keywordsSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(64),
      term: z.string().trim().min(1).max(160),
      category: z.enum(CATEGORIES),
      importance: z.enum(IMPORTANCE),
      quote: z.string().max(500).default(''),
      included: z.boolean(),
    }),
  )
  .max(150);

const jobDescription = z
  .string()
  .trim()
  .min(80, 'Paste the full job description (at least a few sentences).')
  .max(15000, 'That job description is too long. Paste up to 15,000 characters.');

tailorRouter.get('/status', (_req, res) => {
  res.json({ aiConfigured: aiConfigured(), model: aiConfigured() ? aiModel() : null });
});

tailorRouter.post(
  '/analyze',
  aiLimiter,
  wrap(async (req, res) => {
    const body = z.object({ jobDescription }).parse(req.body);
    res.json(await analyzeJob(body.jobDescription));
  }),
);

tailorRouter.post(
  '/compare',
  aiLimiter,
  wrap(async (req, res) => {
    const body = z
      .object({ resumeId: z.string().min(1), keywords: keywordsSchema })
      .parse(req.body);
    const resume = await findOwnedResume(req.userId, body.resumeId);
    res.json(await runComparison(resume.content, body.keywords));
  }),
);

/**
 * Create the tailored copy. The original resume is never changed: the copy is a variant of it, and the job,
 * reviewed keywords and comparison are saved with the copy.
 */
tailorRouter.post(
  '/start',
  wrap(async (req, res) => {
    const body = z
      .object({
        resumeId: z.string().min(1),
        jobDescription,
        jobTitle: z.string().trim().max(200).default(''),
        company: z.string().trim().max(200).default(''),
        keywords: keywordsSchema,
        comparison: z
          .object({ generatedAt: z.string(), matches: z.array(z.unknown()) })
          .passthrough()
          .nullable()
          .optional(),
        title: z.string().trim().min(1).max(120).optional(),
      })
      .parse(req.body);
    const source = await findOwnedResume(req.userId, body.resumeId);
    const fallbackTitle =
      `${source.title} – ${body.jobTitle || 'Tailored'}${body.company ? ` @ ${body.company}` : ''}`.slice(
        0,
        120,
      );

    const copy = await Resume.create({
      userId: req.userId,
      title: body.title ?? fallbackTitle,
      templateId: normalizeTemplateId(source.templateId),
      content: structuredClone(source.content),
      style: structuredClone(source.style ?? {}),
      variantOf: source._id,
    });
    const tailoring = await Tailoring.create({
      userId: req.userId,
      resumeId: copy._id,
      sourceResumeId: source._id,
      jobDescription: body.jobDescription,
      jobTitle: body.jobTitle,
      company: body.company,
      keywords: body.keywords,
      comparison: body.comparison ?? null,
    });
    res
      .status(201)
      .json({ resumeId: String(copy._id), tailoring: tailoringDto(tailoring.toObject()) });
  }),
);

tailorRouter.post(
  '/improve-bullet',
  aiLimiter,
  wrap(async (req, res) => {
    const body = z
      .object({
        text: z.string().trim().min(3, 'Write the bullet first, then improve it.').max(600),
        role: z.string().max(160).optional(),
        company: z.string().max(160).optional(),
        evidence: z
          .array(z.object({ question: z.string().max(300), answer: z.string().max(600) }))
          .max(3)
          .optional(),
        jobKeywords: z.array(z.string().max(160)).max(40).optional(),
      })
      .parse(req.body);
    if (!aiConfigured()) {
      throw new AppError(
        503,
        'AI features aren’t set up yet. Add GEMINI_API_KEY to server/.env and restart the server.',
        undefined,
        { code: 'AI_NOT_CONFIGURED' },
      );
    }
    res.json(await improveBullet(body));
  }),
);
