import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { errorHandler } from './lib/errors.js';
import { authRouter } from './routes/auth.js';
import { importRouter } from './routes/importExport.js';
import { tailorRouter } from './routes/tailor.js';
import { resumesRouter } from './routes/resumes.js';
import { observabilityMiddleware, metrics } from './lib/observability/index.js';
import { aiConfigured } from './lib/ai/client.js';
import { getPdfActiveCount, getPdfQueueLength } from './lib/pdf/queue.js';

export function createApp() {
  const app = express();

  // Hide server identification
  app.disable('x-powered-by');

  // Hardened security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          scriptSrc: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      frameguard: { action: 'deny' },
      hsts:
        env.NODE_ENV === 'production'
          ? { maxAge: 31536000, includeSubDomains: true, preload: true }
          : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Restrict unused browser features
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()',
    );
    next();
  });

  // Attach Request ID, logging context, and latency metrics early
  app.use(observabilityMiddleware);

  // Global rate limiter for API endpoints to prevent DoS flooding
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.NODE_ENV === 'test' ? 5000 : 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests from this IP. Please try again later.' },
  });
  app.use('/api', apiLimiter);

  // Enforce strict request body size limits
  app.use(express.json({ limit: '500kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());

  // Observability & Health endpoints
  app.get('/api/health', (_req, res) => {
    const dbState = mongoose.connection.readyState;
    const isDbUp = dbState === 1;
    // In production, an unready database should reflect as 503 unless in test or dev
    const isHealthy = env.NODE_ENV === 'production' ? isDbUp : true;
    const mem = process.memoryUsage();
    const alerts = metrics.getAlerts();

    const healthStatus =
      isHealthy && alerts.filter((a) => a.level === 'critical').length === 0
        ? 'healthy'
        : 'degraded';

    res.status(isHealthy ? 200 : 503).json({
      ok: true,
      status: healthStatus,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: isDbUp ? 'up' : 'down',
          readyState: dbState,
        },
        memory: {
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
          rssMB: Math.round(mem.rss / 1024 / 1024),
        },
        pdf: {
          activeRenders: getPdfActiveCount(),
          queueLength: getPdfQueueLength(),
        },
        ai: {
          configured: aiConfigured(),
        },
      },
      alerts,
    });
  });

  app.get('/api/metrics', (_req, res) => {
    res.json(metrics.getMetricsSummary());
  });

  app.use('/api/auth', authRouter);
  app.use('/api/resumes', resumesRouter);
  app.use('/api/import', importRouter);
  app.use('/api/tailor', tailorRouter);
  app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found.' }));

  // In production the API also serves the built client.
  if (env.NODE_ENV === 'production') {
    const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
