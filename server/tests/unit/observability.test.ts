import { describe, it, expect, beforeEach } from 'vitest';
import {
  redactString,
  redactPersonalData,
} from '../../src/lib/observability/redact.js';
import {
  logger,
  withLogContext,
  getLogContext,
  getRecentLogs,
  clearRecentLogs,
} from '../../src/lib/observability/logger.js';
import {
  metrics,
  calculateLatencyStats,
  categorizePdfError,
} from '../../src/lib/observability/metrics.js';

describe('Observability - Unit Tests', () => {
  beforeEach(() => {
    clearRecentLogs();
    metrics.reset();
  });

  describe('1. PII and Credential Redaction', () => {
    it('redacts email addresses from arbitrary text', () => {
      const input = 'Contact user at john.doe@example.com for further info';
      const output = redactString(input);
      expect(output).not.toContain('john.doe@example.com');
      expect(output).toContain('[REDACTED_EMAIL]');
    });

    it('redacts phone numbers across multiple formats', () => {
      const formats = [
        'Call +1-555-123-4567 today',
        'Mobile: (555) 234-5678',
        'Direct: 555-345-6789',
      ];
      for (const format of formats) {
        const output = redactString(format);
        expect(output).toContain('[REDACTED_PHONE]');
      }
    });

    it('redacts Social Security Numbers and Credit Card numbers', () => {
      const input = 'SSN: 123-45-6789 and Card: 4111-2222-3333-4444';
      const output = redactString(input);
      expect(output).not.toContain('123-45-6789');
      expect(output).not.toContain('4111-2222-3333-4444');
      expect(output).toContain('[REDACTED_SSN]');
      expect(output).toContain('[REDACTED_CARD]');
    });

    it('redacts Bearer tokens, JWT tokens, and MongoDB credentials', () => {
      const input =
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c to mongodb+srv://admin:SecretPass123@cluster0.mongodb.net/resumeforge';
      const output = redactString(input);
      expect(output).not.toContain('SecretPass123');
      expect(output).not.toContain('eyJhbGciOiJIUzI1Ni');
      expect(output).toContain('Bearer [REDACTED_TOKEN]');
      expect(output).toContain('mongodb+srv://admin:***@cluster0.mongodb.net/resumeforge');
    });

    it('deep redacts sensitive fields in nested objects', () => {
      const raw = {
        name: 'Alice Developer',
        email: 'alice@resumeforge.dev',
        phone: '555-987-6543',
        auth: {
          password: 'SuperSecretPassword!',
          token: 'token-abc-123',
          nested: {
            creditCard: '1234-5678-9012-3456',
            publicInfo: 'safe content',
          },
        },
      };

      const redacted = redactPersonalData(raw) as Record<string, unknown>;
      expect(redacted.email).toBe('[REDACTED]');
      expect(redacted.phone).toBe('[REDACTED]');
      const auth = redacted.auth as Record<string, unknown>;
      expect(auth.password).toBe('[REDACTED]');
      expect(auth.token).toBe('[REDACTED]');
      const nested = auth.nested as Record<string, unknown>;
      expect(nested.creditCard).toBe('[REDACTED]');
      expect(nested.publicInfo).toBe('safe content');
    });
  });

  describe('2. Structured Logger with Request IDs and Context', () => {
    it('propagates requestId and exportJobId via AsyncLocalStorage context', () => {
      withLogContext(
        { requestId: 'req-test-uuid-1234', exportJobId: 'job-987654321', userId: 'usr-111' },
        () => {
          const current = getLogContext();
          expect(current.requestId).toBe('req-test-uuid-1234');
          expect(current.exportJobId).toBe('job-987654321');
          expect(current.userId).toBe('usr-111');

          logger.info('Test log event inside context', { metaKey: 'metaValue' });
        },
      );

      const logs = getRecentLogs();
      const last = logs[logs.length - 1];
      expect(last).toBeDefined();
      expect(last.message).toBe('Test log event inside context');
      expect(last.requestId).toBe('req-test-uuid-1234');
      expect(last.exportJobId).toBe('job-987654321');
      expect(last.userId).toBe('usr-111');
      expect(last.meta?.metaKey).toBe('metaValue');
    });

    it('automatically scrubs PII from log messages and metadata', () => {
      logger.warn('Failed login attempt for user test@example.com with password SecretPass99', {
        contact: '555-999-1234',
        email: 'secret@domain.com',
      });

      const logs = getRecentLogs();
      const last = logs[logs.length - 1];
      expect(last.message).not.toContain('test@example.com');
      expect(last.message).toContain('[REDACTED_EMAIL]');
      expect(last.meta?.email).toBe('[REDACTED]');
      expect(last.meta?.contact).toBe('[REDACTED_PHONE]');
    });
  });

  describe('3. Metrics Registry & Latency Statistics', () => {
    it('calculates accurate p50 and p95 latency percentiles', () => {
      // 100 samples from 1ms to 100ms
      const samples = Array.from({ length: 100 }, (_, i) => i + 1);
      const stats = calculateLatencyStats(samples);

      expect(stats.count).toBe(100);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(100);
      expect(stats.avg).toBe(50.5);
      expect(stats.p50).toBe(51);
      expect(stats.p95).toBe(96);
    });

    it('records API request metrics and calculates error rates', () => {
      // 8 successful requests, 1 4xx, 1 5xx
      for (let i = 0; i < 8; i++) {
        metrics.recordApiRequest('GET', '/api/resumes', 200, 25);
      }
      metrics.recordApiRequest('POST', '/api/auth/login', 401, 15);
      metrics.recordApiRequest('POST', '/api/tailor', 500, 150);

      const summary = metrics.getMetricsSummary();
      expect(summary.api.totalRequests).toBe(10);
      expect(summary.api.statusCodes['2xx']).toBe(8);
      expect(summary.api.statusCodes['4xx']).toBe(1);
      expect(summary.api.statusCodes['5xx']).toBe(1);
      expect(summary.api.errorRatePercent).toBe(20); // 2 / 10 = 20%
      expect(summary.api.serverErrorRatePercent).toBe(10); // 1 / 10 = 10%

      // Key endpoint breakdown
      const resumesEndpoint = summary.api.endpoints['GET /api/resumes'];
      expect(resumesEndpoint).toBeDefined();
      expect(resumesEndpoint.requests).toBe(8);
      expect(resumesEndpoint.latency.p50).toBe(25);
    });

    it('categorizes PDF export failures into distinct error categories', () => {
      expect(categorizePdfError(new Error("Executable doesn't exist at /path"))).toBe(
        'BROWSER_LAUNCH_ERROR',
      );
      expect(categorizePdfError(new Error('page.goto: net::ERR_CONNECTION_REFUSED'))).toBe(
        'NETWORK_UNREACHABLE',
      );
      expect(categorizePdfError(new Error('Navigation timeout of 30000ms exceeded'))).toBe(
        'TIMEOUT',
      );
      expect(categorizePdfError(new Error('Target closed / browser crash'))).toBe(
        'RENDER_CRASH',
      );
      expect(categorizePdfError(new Error('Some strange unexpected error'))).toBe(
        'UNKNOWN_ERROR',
      );
    });

    it('records PDF metrics including render times and category counts', () => {
      metrics.recordPdfStart();
      metrics.recordPdfSuccess(850);

      metrics.recordPdfStart();
      metrics.recordPdfFailure(new Error("Executable doesn't exist"), 120);

      metrics.recordPdfStart();
      metrics.recordPdfFailure(new Error('Navigation timeout of 30000ms exceeded'), 30000);

      const summary = metrics.getMetricsSummary();
      expect(summary.pdf.total).toBe(3);
      expect(summary.pdf.success).toBe(1);
      expect(summary.pdf.failure).toBe(2);
      expect(summary.pdf.failuresByCategory.BROWSER_LAUNCH_ERROR).toBe(1);
      expect(summary.pdf.failuresByCategory.TIMEOUT).toBe(1);
      expect(summary.pdf.failureRatePercent).toBe(66.7);
    });

    it('records AI metrics and failures by code', () => {
      metrics.recordAiStart();
      metrics.recordAiSuccess(600);

      metrics.recordAiStart();
      metrics.recordAiFailure('AI_BUSY', 100);

      metrics.recordAiStart();
      metrics.recordAiFailure('AI_NOT_CONFIGURED', 5);

      const summary = metrics.getMetricsSummary();
      expect(summary.ai.total).toBe(3);
      expect(summary.ai.success).toBe(1);
      expect(summary.ai.failure).toBe(2);
      expect(summary.ai.failuresByCode.AI_BUSY).toBe(1);
      expect(summary.ai.failuresByCode.AI_NOT_CONFIGURED).toBe(1);
    });

    it('triggers alerts when thresholds are breached', () => {
      // Trigger high 5xx error rate alert
      for (let i = 0; i < 9; i++) {
        metrics.recordApiRequest('GET', '/api/health', 200, 10);
      }
      // 2 failures out of 11 requests = ~18.2% > 5%
      metrics.recordApiRequest('POST', '/api/resumes', 500, 50);
      metrics.recordApiRequest('POST', '/api/resumes', 500, 50);

      const alerts = metrics.getAlerts();
      const errorRateAlert = alerts.find((a) => a.id === 'HIGH_5XX_ERROR_RATE');
      expect(errorRateAlert).toBeDefined();
      expect(errorRateAlert?.level).toBe('critical');
    });
  });
});
