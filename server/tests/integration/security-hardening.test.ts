import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestServer, type TestServerInstance } from '../helpers/test-app.js';

describe('Security Hardening - Integration Tests', () => {
  let app: TestServerInstance;
  const userAEmail = `sec-user-a-${randomUUID()}@example.com`;
  const userBEmail = `sec-user-b-${randomUUID()}@example.com`;
  const password = 'Password123!Secure';
  let userAId = '';
  let userBId = '';
  let resumeAId = '';

  beforeAll(async () => {
    app = await createTestServer();

    // Register User A
    const regRes = await app.client.post('/api/auth/register', {
      name: 'Security User A',
      email: userAEmail,
      password,
    });
    userAId = (regRes.body as any).id;

    // Create Resume A
    const resumeRes = await app.client.post('/api/resumes', {
      title: 'Confidential Resume',
      templateId: 'modern',
    });
    resumeAId = (resumeRes.body as any).id;
  });

  afterAll(async () => {
    if (userAId) await app.cleanupUser(userAId);
    if (userBId) await app.cleanupUser(userBId);
    await app.close();
  });

  describe('Secure Headers Verification', () => {
    it('sets hardened security headers and hides X-Powered-By', async () => {
      const res = await app.client.get('/api/health');
      expect(res.status).toBe(200);

      // 1. Server identity hidden
      expect(res.headers.get('x-powered-by')).toBeNull();

      // 2. MIME sniffing protection
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');

      // 3. Clickjacking protection
      expect(res.headers.get('x-frame-options')).toBe('DENY');

      // 4. Content Security Policy
      const csp = res.headers.get('content-security-policy') ?? '';
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");

      // 5. Referrer Policy
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');

      // 6. Permissions Policy
      const permPolicy = res.headers.get('permissions-policy') ?? '';
      expect(permPolicy).toContain('camera=()');
      expect(permPolicy).toContain('microphone=()');
      expect(permPolicy).toContain('geolocation=()');
    });
  });

  describe('Request-Size Limits', () => {
    it('rejects JSON payloads exceeding the 500 KB limit with 413 Payload Too Large', async () => {
      // 600 KB payload
      const hugeString = 'X'.repeat(600 * 1024);
      const res = await app.client.request(`/api/resumes/${resumeAId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: { title: hugeString },
      });

      expect(res.status).toBe(413);
    });
  });

  describe('Rate Limiting Headers', () => {
    it('returns standard RateLimit headers on API requests', async () => {
      const res = await app.client.get('/api/health');
      expect(res.status).toBe(200);
      const limitHdr = res.headers.get('ratelimit-limit');
      expect(limitHdr).toBeTruthy();
    });
  });

  describe('IDOR & Invalid Object ID Protection', () => {
    it('returns 404 for non-ObjectId id parameters without crashing Mongoose or leaking details', async () => {
      // Malformed ID strings
      const malformedIds = [
        'not-an-object-id',
        '12345',
        'undefined',
        'null',
        '..%2F..%2Fetc%2Fpasswd',
      ];

      for (const badId of malformedIds) {
        const res = await app.client.get(`/api/resumes/${badId}`);
        expect(res.status).toBe(404);
        expect(res.rawText).toContain('not found');
      }
    });

    it('rejects NoSQL operator injection attempts in request bodies', async () => {
      // Attempting to send MongoDB query operator object { "$gt": "" } where a string is expected
      const res = await app.client.post('/api/auth/login', {
        email: { $gt: '' },
        password: { $gt: '' },
      });

      expect(res.status).toBe(400);
      expect(res.rawText).toContain('check the highlighted fields');
    });

    it('strictly prevents insecure direct object references across separate user accounts', async () => {
      // Register User B
      const clientB = app.createClient();
      const regB = await clientB.post('/api/auth/register', {
        name: 'Attacker User B',
        email: userBEmail,
        password,
      });
      userBId = (regB.body as any).id;

      // User B attempts to access User A's resume
      const getRes = await clientB.get(`/api/resumes/${resumeAId}`);
      expect([403, 404]).toContain(getRes.status);

      // User B attempts to patch User A's resume
      const patchRes = await clientB.patch(`/api/resumes/${resumeAId}`, {
        title: 'Overwritten by User B',
      });
      expect([403, 404]).toContain(patchRes.status);

      // User B attempts to delete User A's resume
      const delRes = await clientB.delete(`/api/resumes/${resumeAId}`);
      expect([403, 404]).toContain(delRes.status);
    });
  });
});
