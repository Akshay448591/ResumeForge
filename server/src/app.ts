import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './lib/errors.js';
import { authRouter } from './routes/auth.js';
import { importRouter } from './routes/importExport.js';
import { tailorRouter } from './routes/tailor.js';
import { resumesRouter } from './routes/resumes.js';

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

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
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
