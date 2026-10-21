import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestServer, type TestServerInstance } from '../helpers/test-app.js';
import { metrics } from '../../src/lib/observability/metrics.js';
import { clearRecentLogs } from '../../src/lib/observability/logger.js';

describe('Observability - Integration Tests', () => {
  let app: TestServerInstance;

  beforeAll(async () => {
    app = await createTestServer();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    clearRecentLogs();
    metrics.reset();
  });

  describe('1. Request ID Generation and Propagation', () => {
    it('generates a unique X-Request-Id when none is provided by client', async () => {
      const res = await app.client.get('/api/health');
      expect(res.status).toBe(200);

      const requestId = res.headers.get('x-request-id');
      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
      expect(requestId!.length).toBeGreaterThanOrEqual(16);
    });

    it('propagates client-supplied X-Request-Id header in response', async () => {
      const customId = 'client-trace-id-99887766';
      const res = await app.client.get('/api/health', {
        'x-request-id': customId,
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-request-id')).toBe(customId);
    });
  });

  describe('2. Health Checks with Subsystem Diagnostics and Alerts', () => {
    it('returns 200 with status, uptime, system checks and alerts array', async () => {
      const res = await app.client.get<{
        ok: boolean;
        status: string;
        uptime: number;
        timestamp: string;
        checks: {
          database: { status: string; readyState: number };
          memory: { heapUsedMB: number; heapTotalMB: number };
          pdf: { activeRenders: number; queueLength: number };
          ai: { configured: boolean };
        };
        alerts: unknown[];
      }>('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.status).toBe('healthy');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.timestamp).toBeDefined();

      // Database check
      expect(res.body.checks.database.status).toBe('up');
      expect(res.body.checks.database.readyState).toBe(1);

      // Memory check
      expect(res.body.checks.memory.heapUsedMB).toBeGreaterThan(0);
      expect(res.body.checks.memory.heapTotalMB).toBeGreaterThan(0);

      // PDF subsystem check
      expect(typeof res.body.checks.pdf.activeRenders).toBe('number');
      expect(typeof res.body.checks.pdf.queueLength).toBe('number');

      // AI check
      expect(typeof res.body.checks.ai.configured).toBe('boolean');

      // Alerts
      expect(Array.isArray(res.body.alerts)).toBe(true);
    });
  });

  describe('3. Metrics Endpoint (/api/metrics)', () => {
    it('returns API request metrics, latency percentiles, and endpoint stats', async () => {
      // Make a couple of requests
      await app.client.get('/api/health');
      await app.client.get('/api/health');
      await app.client.get('/api/does-not-exist'); // 404

      const res = await app.client.get<{
        api: {
          totalRequests: number;
          statusCodes: { '2xx': number; '4xx': number };
          latencyMs: { count: number; p50: number; p95: number };
          endpoints: Record<string, { requests: number; latency: { p50: number } }>;
        };
        pdf: { total: number };
        ai: { total: number };
      }>('/api/metrics');

      expect(res.status).toBe(200);
      expect(res.body.api.totalRequests).toBeGreaterThanOrEqual(3);
      expect(res.body.api.statusCodes['2xx']).toBeGreaterThanOrEqual(2);
      expect(res.body.api.statusCodes['4xx']).toBeGreaterThanOrEqual(1);

      // Percentiles
      expect(res.body.api.latencyMs.count).toBeGreaterThanOrEqual(3);
      expect(typeof res.body.api.latencyMs.p50).toBe('number');
      expect(typeof res.body.api.latencyMs.p95).toBe('number');

      // Endpoint breakdown
      expect(res.body.api.endpoints['GET /api/health']).toBeDefined();
      expect(res.body.api.endpoints['GET /api/health'].requests).toBeGreaterThanOrEqual(2);
    });
  });
});
