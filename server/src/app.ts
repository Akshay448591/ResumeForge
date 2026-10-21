import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { errorHandler } from './lib/errors.js';
import { authRouter } from './routes/auth.js';
import { importRouter } from './routes/importExport.js';
import { tailorRouter } from './routes/tailor.js';
import { resumesRouter } from './routes/resumes.js';

export function createApp() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
        },
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
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
