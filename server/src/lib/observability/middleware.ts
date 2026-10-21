import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger, withLogContext } from './logger.js';
import { metrics } from './metrics.js';

// Extend Express Request interface to include id and userId
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
      userId?: string;
    }
  }
}

/**
 * Normalizes an Express request path into a parameterized template to avoid metric cardinality explosion.
 * Example: /api/resumes/65fa2a8f81014e2d3bb9c54e/exports/65fa2a9f81014e2d3bb9c55f
 * becomes: /api/resumes/:id/exports/:jobId
 */
export function normalizePath(path: string): string {
  return path
    .replace(/\/api\/resumes\/[0-9a-fA-F]{24}\/exports\/[0-9a-fA-F]{24}\/download\b/g, '/api/resumes/:id/exports/:jobId/download')
    .replace(/\/api\/resumes\/[0-9a-fA-F]{24}\/exports\/[0-9a-fA-F]{24}\b/g, '/api/resumes/:id/exports/:jobId')
    .replace(/\/api\/resumes\/[0-9a-fA-F]{24}\/exports\b/g, '/api/resumes/:id/exports')
    .replace(/\/api\/resumes\/[0-9a-fA-F]{24}\/versions\/[0-9a-fA-F]{24}\b/g, '/api/resumes/:id/versions/:versionId')
    .replace(/\/api\/resumes\/[0-9a-fA-F]{24}\/versions\b/g, '/api/resumes/:id/versions')
    .replace(/\/api\/resumes\/[0-9a-fA-F]{24}\b/g, '/api/resumes/:id')
    .replace(/\/[0-9a-fA-F]{24}\b/g, '/:id');
}

/**
 * Middleware that assigns a Request ID, propagates it in headers,
 * sets up asynchronous structured logging context, measures latency,
 * and records API metrics upon completion.
 */
export function observabilityMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 1. Resolve or generate Request ID
  const incomingId = req.headers['x-request-id'];
  const requestId =
    typeof incomingId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingId)
      ? incomingId
      : randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  // 2. Check for optional export job ID in route or header
  const exportJobId =
    typeof req.headers['x-export-job-id'] === 'string'
      ? req.headers['x-export-job-id']
      : undefined;

  const startTime = performance.now();

  withLogContext({ requestId, ...(exportJobId ? { exportJobId } : {}) }, () => {
    // 3. Listen for response finish event to record metrics and structured logs
    res.on('finish', () => {
      const durationMs = Math.max(1, Math.round(performance.now() - startTime));
      const normalized = normalizePath(req.baseUrl ? `${req.baseUrl}${req.path}` : req.path);

      // Record API request metric
      metrics.recordApiRequest(req.method, normalized, res.statusCode, durationMs);

      // Log structured completion
      const meta: Record<string, unknown> = {
        method: req.method,
        url: req.originalUrl || req.url,
        route: normalized,
        statusCode: res.statusCode,
        durationMs,
        ...(req.userId ? { userId: req.userId } : {}),
      };

      if (res.statusCode >= 500) {
        logger.error(`HTTP ${req.method} ${normalized} ${res.statusCode} (${durationMs}ms)`, meta);
      } else if (res.statusCode >= 400) {
        logger.warn(`HTTP ${req.method} ${normalized} ${res.statusCode} (${durationMs}ms)`, meta);
      } else {
        logger.info(`HTTP ${req.method} ${normalized} ${res.statusCode} (${durationMs}ms)`, meta);
      }
    });

    next();
  });
}
