import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError, wrap } from '../lib/errors.js';
import { findOwnedResume } from '../lib/owned.js';
import { runComparison } from '../lib/tailor/compare.js';
import { buildReport } from '../lib/tailor/report.js';
import { generateSuggestions } from '../lib/tailor/suggest.js';
import type { Suggestion } from '../lib/tailor/types.js';
import { Resume } from '../models/Resume.js';
import { Tailoring, type ITailoring } from '../models/Tailoring.js';
import { keywordsSchema } from './tailor.js';

/** Mounted at /api/resumes/:id/tailoring. The job, reviewed keywords, suggestions and report for one tailored resume. */
export const tailoringRouter = Router({ mergeParams: true });

const param = (req: Request, key: string) => (req.params as Record<string, string>)[key];

export const tailoringDto = (t: ITailoring & { _id: unknown; updatedAt?: Date }) => ({
  id: String(t._id),
  resumeId: String(t.resumeId),
  sourceResumeId: t.sourceResumeId ? String(t.sourceResumeId) : null,
  jobDescription: t.jobDescription,
  jobTitle: t.jobTitle,
  company: t.company,
  keywords: t.keywords ?? [],
  comparison: t.comparison ?? null,
  suggestions: t.suggestions ?? [],
  report: t.report ?? null,
  reportHistory: t.reportHistory ?? [],
  updatedAt: t.updatedAt,
});

const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  keyGenerator: (req) => req.userId ?? 'anonymous',
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'You’re sending requests quickly. Please wait a moment and try again.' },
});

async function load(req: Request) {
  const resume = await findOwnedResume(req.userId, param(req, 'id'));
  const tailoring = await Tailoring.findOne({ resumeId: resume._id, userId: req.userId });
  return { resume, tailoring };
}
async function loadRequired(req: Request) {
  const found = await load(req);
  if (!found.tailoring) throw new AppError(404, 'This resume hasn’t been set up for a job yet.');
  return { resume: found.resume, tailoring: found.tailoring };
}

tailoringRouter.get(
  '/',
  wrap(async (req, res) => {
    const { tailoring } = await load(req);
    if (!tailoring) {
      res.json({ tailoring: null, source: null });
      return;
    }
    const source = tailoring.sourceResumeId
      ? await Resume.findOne({ _id: tailoring.sourceResumeId, userId: req.userId }).select('title')
      : null;
    res.json({
      tailoring: tailoringDto(tailoring.toObject()),
      source: source ? { id: String(source._id), title: source.title } : null,
    });
  }),
);

tailoringRouter.put(
  '/keywords',
  wrap(async (req, res) => {
    const body = z.object({ keywords: keywordsSchema }).parse(req.body);
    const { tailoring } = await loadRequired(req);
    tailoring.keywords = body.keywords;
    tailoring.markModified('keywords');
    await tailoring.save();
    res.json(tailoringDto(tailoring.toObject()));
  }),
);

tailoringRouter.post(
  '/compare',
  aiLimiter,
  wrap(async (req, res) => {
    const { resume, tailoring } = await loadRequired(req);
    const comparison = await runComparison(resume.content, tailoring.keywords);
    tailoring.comparison = comparison;
    tailoring.markModified('comparison');
    await tailoring.save();
    res.json(comparison);
  }),
);

const decided = (s: Suggestion) => s.status !== 'pending';
const sameTarget = (a: Suggestion, b: Suggestion) =>
  a.kind === b.kind &&
  (a.kind === 'bullet'
    ? a.bulletId === b.bulletId
    : a.kind === 'addition'
      ? a.experienceId === b.experienceId && a.keywords[0] === b.keywords[0]
      : true);

tailoringRouter.post(
  '/suggestions',
  aiLimiter,
  wrap(async (req, res) => {
    const { resume, tailoring } = await loadRequired(req);
    const comparison =
      tailoring.comparison ?? (await runComparison(resume.content, tailoring.keywords));
    const { suggestions, warnings } = await generateSuggestions({
      content: resume.content,
      keywords: tailoring.keywords,
      comparison,
      jobTitle: tailoring.jobTitle,
      company: tailoring.company,
    });
    const kept = (tailoring.suggestions ?? []).filter(decided);
    // don't re-offer things the user already decided on
    const fresh = suggestions.filter((s) => !kept.some((k) => sameTarget(k, s)));
    tailoring.comparison = comparison;
    tailoring.suggestions = [...kept, ...fresh];
    tailoring.markModified('suggestions');
    tailoring.markModified('comparison');
    await tailoring.save();
    res.json({ suggestions: tailoring.suggestions, warnings });
  }),
);

/** Record the user's decision. Anything that needs verification can only be accepted once they confirm it. */
tailoringRouter.patch(
  '/suggestions/:sid',
  wrap(async (req, res) => {
    const body = z
      .object({
        status: z.enum(['pending', 'accepted', 'edited', 'rejected']),
        finalText: z.string().max(1500).optional(),
        verified: z.boolean().optional(),
        undo: z
          .object({
            text: z.string().max(2000).optional(),
            order: z.array(z.string().max(64)).max(200).optional(),
            bulletId: z.string().max(64).optional(),
            toggled: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(req.body);
    const { tailoring } = await loadRequired(req);
    const list = (tailoring.suggestions ?? []) as Suggestion[];
    const s = list.find((x) => x.id === param(req, 'sid'));
    if (!s) throw new AppError(404, 'That suggestion no longer exists. Refresh and try again.');

    const accepting = body.status === 'accepted' || body.status === 'edited';
    const text = (body.finalText ?? s.finalText ?? '').trim();
    if (accepting && s.needsVerification && body.verified !== true) {
      throw new AppError(400, 'Please confirm this is accurate before accepting it.');
    }
    if (accepting && (s.kind === 'addition' || body.status === 'edited') && !text) {
      throw new AppError(400, 'Write the text in your own words before accepting.');
    }
    s.status = body.status;
    s.finalText = body.status === 'pending' ? '' : text || s.suggested;
    s.verified = body.status === 'pending' ? false : (body.verified ?? s.verified);
    s.undo = body.status === 'pending' ? undefined : (body.undo ?? s.undo);
    s.decidedAt = body.status === 'pending' ? undefined : new Date().toISOString();
    tailoring.suggestions = list;
    tailoring.markModified('suggestions');
    await tailoring.save();
    res.json(s);
  }),
);

/** Build and save the tailoring report for the resume as it is now. */
tailoringRouter.post(
  '/report',
  aiLimiter,
  wrap(async (req, res) => {
    const { resume, tailoring } = await loadRequired(req);
    const comparison = await runComparison(resume.content, tailoring.keywords);
    const original = tailoring.sourceResumeId
      ? await Resume.findOne({ _id: tailoring.sourceResumeId, userId: req.userId })
      : null;
    const report = buildReport({
      jobTitle: tailoring.jobTitle,
      company: tailoring.company,
      keywords: tailoring.keywords,
      content: resume.content,
      original: original?.content ?? null,
      comparison,
      suggestions: (tailoring.suggestions ?? []) as Suggestion[],
    });
    tailoring.comparison = comparison;
    tailoring.report = report;
    tailoring.reportHistory = [
      ...(tailoring.reportHistory ?? []),
      {
        savedAt: new Date(),
        matched: report.counts.matched,
        partial: report.counts.partial,
        missing: report.counts.missing,
      },
    ].slice(-20);
    tailoring.markModified('comparison');
    tailoring.markModified('report');
    await tailoring.save();
    res.json({
      report,
      reportHistory: tailoring.reportHistory,
      originalAvailable: Boolean(original),
    });
  }),
);
