import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[] | undefined>,
    /** Extra fields merged into the JSON error body, e.g. `{ code, currentRev }`. */
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Lets async route handlers throw without try/catch. */
export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

// Express identifies error handlers by their 4-argument signature, so `_next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      message: 'Please check the highlighted fields.',
      fieldErrors: err.flatten().fieldErrors,
    });
    return;
  }
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ message: err.message, fieldErrors: err.fieldErrors, ...err.extra });
    return;
  }
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.too.large') {
    res.status(413).json({ message: 'That file is too large. The limit is 3 MB.' });
    return;
  }
  if (type === 'entity.parse.failed') {
    res.status(400).json({ message: 'The request could not be read.' });
    return;
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on our side. Please try again.' });
};
