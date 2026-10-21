import { ApiError, GoogleGenAI } from '@google/genai';
import { ZodError, type z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { env } from '../../config/env.js';
import { AppError } from '../errors.js';
import { logger, metrics } from '../observability/index.js';

let client: GoogleGenAI | null = null;

const getApiKey = () => env.GEMINI_API_KEY || env.ANTHROPIC_API_KEY;

export const aiConfigured = () => Boolean(getApiKey());
export const aiModel = () => env.GEMINI_MODEL;

function getClient(): GoogleGenAI {
  const apiKey = getApiKey();
  if (!apiKey) {
    metrics.recordAiFailure('AI_NOT_CONFIGURED', 0);
    throw new AppError(
      503,
      'AI features aren’t set up yet. Add GEMINI_API_KEY to server/.env and restart the server.',
      undefined,
      { code: 'AI_NOT_CONFIGURED' },
    );
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

function mapError(e: unknown): AppError {
  if (e instanceof AppError) return e;

  if (e instanceof ApiError) {
    if (e.status === 400 || e.status === 401 || e.status === 403) {
      const msg = e.message?.toLowerCase() || '';
      if (msg.includes('api key') || msg.includes('auth') || msg.includes('credential')) {
        return new AppError(
          502,
          'The AI service rejected the API key. Check GEMINI_API_KEY in server/.env.',
          undefined,
          { code: 'AI_AUTH' },
        );
      }
    }
    if (e.status === 429) {
      return new AppError(
        429,
        'The AI service is busy right now. Please try again in a minute.',
        undefined,
        { code: 'AI_BUSY' },
      );
    }
  }

  const message = e instanceof Error ? e.message : String(e);
  if (/fetch failed|econnrefused|enotfound|etimedout|network/i.test(message)) {
    return new AppError(
      504,
      'We couldn’t reach the AI service. Check the server’s internet connection and try again.',
      undefined,
      { code: 'AI_UNREACHABLE' },
    );
  }

  console.error('AI request failed:', e);
  return new AppError(502, 'The AI service had a problem. Please try again.', undefined, {
    code: 'AI_ERROR',
  });
}

/**
 * Ask the model for structured output conforming to the given zod schema.
 */
export async function callTool<S extends z.ZodTypeAny>(opts: {
  system: string;
  user: string;
  name: string;
  description: string;
  schema: S;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  metrics.recordAiStart();
  const startTime = performance.now();
  logger.info('Starting AI tool execution', { tool: opts.name });

  const gemini = getClient();
  const inputSchema = zodToJsonSchema(opts.schema, { $refStrategy: 'none' }) as Record<
    string,
    unknown
  >;
  delete inputSchema.$schema;

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await gemini.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: opts.user,
        config: {
          systemInstruction: opts.system,
          maxOutputTokens: opts.maxTokens ?? 4000,
          responseMimeType: 'application/json',
          responseJsonSchema: inputSchema,
        },
      });

      const text = res.text?.trim();
      if (!text) throw new ZodError([]);
      const raw = JSON.parse(text);
      const parsed = opts.schema.parse(raw);

      const durationMs = Math.max(1, Math.round(performance.now() - startTime));
      metrics.recordAiSuccess(durationMs);
      logger.info('AI tool execution succeeded', { tool: opts.name, durationMs, attempt });
      return parsed;
    } catch (e) {
      if ((e instanceof ZodError || e instanceof SyntaxError) && attempt < 1) {
        logger.warn('AI tool output malformed, retrying attempt', { tool: opts.name, attempt });
        continue; // malformed output: try once more
      }
      const durationMs = Math.max(1, Math.round(performance.now() - startTime));
      if (e instanceof ZodError || e instanceof SyntaxError) {
        metrics.recordAiFailure('AI_FORMAT', durationMs);
        logger.error('AI tool output format invalid', { tool: opts.name, durationMs });
        throw new AppError(
          502,
          'The AI service returned something we couldn’t read. Please try again.',
          undefined,
          { code: 'AI_FORMAT' },
        );
      }
      const mapped = mapError(e);
      const code = (mapped.extra?.code as string | undefined) || 'AI_ERROR';
      metrics.recordAiFailure(code, durationMs);
      logger.error('AI tool execution failed', {
        tool: opts.name,
        code,
        durationMs,
        error: mapped.message,
      });
      throw mapped;
    }
  }
}
