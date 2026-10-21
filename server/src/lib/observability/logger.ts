import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from '../../config/env.js';
import { redactPersonalData, redactString } from './redact.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  exportJobId?: string;
  userId?: string;
  route?: string;
  method?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  exportJobId?: string;
  userId?: string;
  meta?: Record<string, unknown>;
}

const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

// In-memory circular buffer of recent logs for diagnostics and test assertions
const MAX_LOG_BUFFER = 200;
const recentLogs: LogEntry[] = [];

/**
 * Execute an async or sync callback with contextual fields automatically attached to all logs.
 */
export function withLogContext<T>(context: LogContext, fn: () => T): T {
  const current = asyncLocalStorage.getStore() ?? {};
  return asyncLocalStorage.run({ ...current, ...context }, fn);
}

/**
 * Retrieve current log context from AsyncLocalStorage.
 */
export function getLogContext(): LogContext {
  return asyncLocalStorage.getStore() ?? {};
}

/**
 * Update current log context in place.
 */
export function updateLogContext(update: Partial<LogContext>): void {
  const current = asyncLocalStorage.getStore();
  if (current) {
    Object.assign(current, update);
  }
}

/**
 * In-memory log buffer access for testing and health monitoring.
 */
export function getRecentLogs(limit = 50): LogEntry[] {
  return recentLogs.slice(-limit);
}

export function clearRecentLogs(): void {
  recentLogs.length = 0;
}

function writeLog(level: LogLevel, message: string, meta?: Record<string, unknown>, bindings?: Record<string, unknown>) {
  const context = getLogContext();
  const sanitizedMessage = redactString(message);
  const combinedMeta = {
    ...bindings,
    ...meta,
  };

  const sanitizedMeta = redactPersonalData(combinedMeta) as Record<string, unknown>;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message: sanitizedMessage,
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.exportJobId ? { exportJobId: context.exportJobId } : {}),
    ...(context.userId ? { userId: context.userId } : {}),
    ...(Object.keys(sanitizedMeta).length > 0 ? { meta: sanitizedMeta } : {}),
  };

  // Keep in circular buffer
  recentLogs.push(entry);
  if (recentLogs.length > MAX_LOG_BUFFER) {
    recentLogs.shift();
  }

  // Determine whether to output to stdout/stderr
  // In test environment, suppress noisy debug/info stdout unless explicitly enabled
  if (env.NODE_ENV === 'test' && (level === 'debug' || level === 'info')) {
    return;
  }

  const jsonOutput = JSON.stringify(entry);

  if (level === 'error') {
    console.error(jsonOutput);
  } else if (level === 'warn') {
    console.warn(jsonOutput);
  } else {
    console.log(jsonOutput);
  }
}

export class Logger {
  constructor(private bindings: Record<string, unknown> = {}) {}

  child(additionalBindings: Record<string, unknown>): Logger {
    return new Logger({ ...this.bindings, ...additionalBindings });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    writeLog('debug', message, meta, this.bindings);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    writeLog('info', message, meta, this.bindings);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    writeLog('warn', message, meta, this.bindings);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    writeLog('error', message, meta, this.bindings);
  }
}

export const logger = new Logger();
