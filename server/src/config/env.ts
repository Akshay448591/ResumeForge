import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters').default('resumeforge-default-production-jwt-secret-min16-key'),
  /** Where the PDF renderer loads the print page. Defaults to the Vite dev server, or this server in production. */
  PRINT_BASE_URL: z.string().url().optional(),
  /** Needed for job tailoring and the bullet assistant. Without it those features report a setup message. */
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('\n❌ FATAL: Missing or invalid environment variables:');
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  console.error('👉 If deploying on Render, make sure MONGODB_URI is set under Service -> Environment.\n');
  process.exit(1);
}

export const env = parsed.data;
