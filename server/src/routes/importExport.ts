import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { AppError, wrap } from '../lib/errors.js';
import { importDocx } from '../lib/docxImport.js';
import { requireAuth } from '../middleware/auth.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Mounted at /api/import */
export const importRouter = Router();
importRouter.use(requireAuth);

const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'You’re uploading documents too quickly. Please wait a moment and try again.' },
});

/**
 * Parses a .docx into resume sections and returns it for review. Nothing is saved here:
 * the client shows the result and creates the resume only after the person confirms.
 */
importRouter.post(
  '/docx',
  importLimiter,
  express.raw({ type: DOCX_MIME, limit: '3mb' }),
  wrap(async (req, res) => {
    const file = req.body as unknown;
    if (!Buffer.isBuffer(file) || file.length === 0) {
      throw new AppError(415, 'Please upload a Word document (.docx).');
    }
    // .docx files are zip archives and start with "PK". Old .doc files start with a different signature.
    if (file.subarray(0, 4).toString('hex') === 'd0cf11e0') {
      throw new AppError(
        415,
        'That looks like an older .doc file. In Word, choose Save As and pick “Word Document (.docx)”, then try again.',
      );
    }
    if (file.subarray(0, 2).toString('latin1') !== 'PK') {
      throw new AppError(415, 'That file doesn’t look like a Word document (.docx).');
    }
    try {
      res.json(await importDocx(file));
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        422,
        'We couldn’t read any text from this document. It may be a scan, password-protected or damaged. Try exporting it again from Word, or start from a blank resume.',
      );
    }
  }),
);
