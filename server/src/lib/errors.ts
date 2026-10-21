import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { logger, metrics } from './observability/index.js';
import { redactString } from './observability/redact.js';

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
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.id;
  const route = req.originalUrl || req.url;
  const method = req.method;

  if (err instanceof ZodError) {
    res.status(400).json({
      message: 'Please check the highlighted fields.',
      fieldErrors: err.flatten().fieldErrors,
    });
    return;
  }
  if (err instanceof AppError) {
    if (err.status >= 500) {
      metrics.recordError({
        requestId,
        route,
        method,
        statusCode: err.status,
        message: err.message,
        category: (err.extra?.code as string) || 'APP_ERROR',
      });
    }
    res
      .status(err.status)
      .json({ message: err.message, fieldErrors: err.fieldErrors, ...err.extra });
    return;
  }
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.too.large') {
    res.status(413).json({ message: 'Request payload is too large.' });
    return;
  }
  if (type === 'entity.parse.failed') {
    res.status(400).json({ message: 'The request could not be read.' });
    return;
  }

  // Unhandled internal server error
  const rawMessage = err instanceof Error ? err.stack || err.message : String(err);
  const sanitizedMessage = redactString(rawMessage);

  metrics.recordError({
    requestId,
    route,
    method,
    statusCode: 500,
    message: err instanceof Error ? err.message : String(err),
    category: 'UNHANDLED_EXCEPTION',
  });

  logger.error('Unhandled server error', {
    requestId,
    route,
    method,
    error: sanitizedMessage,
  });

  res.status(500).json({ message: 'Something went wrong on our side. Please try again.' });
};

