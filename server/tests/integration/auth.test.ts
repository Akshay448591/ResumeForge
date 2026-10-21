import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestServer, type TestServerInstance } from '../helpers/test-app.js';

describe('39. Integration Testing - Authentication and Authorization', () => {
  let app: TestServerInstance;
  const userAEmail = `test-user-a-${randomUUID()}@example.com`;
  const userBEmail = `test-user-b-${randomUUID()}@example.com`;
  const password = 'Password123!Secure';
  let userAId = '';
  let userBId = '';
  let resumeAId = '';

  beforeAll(async () => {
    app = await createTestServer();
  });

  afterAll(async () => {
    if (userAId) await app.cleanupUser(userAId);
    if (userBId) await app.cleanupUser(userBId);
    await app.close();
  });

  describe('User Registration', () => {
    it('registers a new user and sets session cookie', async () => {
      const res = await app.client.post('/api/auth/register', {
        name: 'User Alpha',
        email: userAEmail,
        password,
      });

      expect(res.status).toBe(201);
      const data = res.body as { id: string; email: string; name: string };
      expect(data.email).toBe(userAEmail);
      expect(data.name).toBe('User Alpha');
      expect(data.id).toBeTruthy();
      userAId = data.id;

      expect(app.client.cookies['rf_token']).toBeTruthy();
    });

    it('rejects registration with duplicate email with 409 Conflict', async () => {
      const res = await app.client.post('/api/auth/register', {
        name: 'Duplicate Alpha',
        email: userAEmail,
        password,
      });

      expect(res.status).toBe(409);
      expect(res.rawText).toContain('already exists');
    });

    it('rejects registration with short or invalid password', async () => {
      const res = await app.client.post('/api/auth/register', {
        name: 'Short Pass',
        email: `short-${randomUUID()}@example.com`,
        password: '123',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('User Login & Session', () => {
    it('authenticates with correct credentials and returns session', async () => {
      const client = app.createClient();
      const res = await client.post('/api/auth/login', {
        email: userAEmail,
        password,
      });

      expect(res.status).toBe(200);
      expect(client.cookies['rf_token']).toBeTruthy();

      // Verify session via /api/auth/me
      const meRes = await client.get('/api/auth/me');
      expect(meRes.status).toBe(200);
      expect((meRes.body as any).id).toBe(userAId);
    });

    it('rejects login with incorrect password with 401 Unauthorized', async () => {
      const client = app.createClient();
      const res = await client.post('/api/auth/login', {
        email: userAEmail,
        password: 'WrongPassword!',
      });
      expect(res.status).toBe(401);
    });

    it('rejects login with non-existent email with 401 Unauthorized', async () => {
      const client = app.createClient();
      const res = await client.post('/api/auth/login', {
        email: `non-existent-${randomUUID()}@example.com`,
        password,
      });
      expect(res.status).toBe(401);
    });
  });

  describe('Protected Routes and Session Enforcement', () => {
    it('rejects unauthenticated requests to protected endpoints with 401', async () => {
      const unauthClient = app.createClient();
      const res = await unauthClient.get('/api/resumes');
      expect(res.status).toBe(401);
    });

    it('rejects requests with an invalid/tampered session cookie with 401', async () => {
      const tamperedClient = app.createClient();
      tamperedClient.setCookie('rf_token', 'invalid.jwt.token.here');
      const res = await tamperedClient.get('/api/resumes');
      expect(res.status).toBe(401);
    });
  });

  describe('Authorization and Resource Isolation (Cross-User Access)', () => {
    it('creates a resume for User A', async () => {
      const res = await app.client.post('/api/resumes', {
        title: "User A's Confidential Resume",
        templateId: 'modern',
      });
      expect(res.status).toBe(201);
      resumeAId = (res.body as any).id;
      expect(resumeAId).toBeTruthy();
    });

    it('prevents User B from accessing, modifying, or deleting User A resume', async () => {
      // Register and login as User B
      const clientB = app.createClient();
      const regB = await clientB.post('/api/auth/register', {
        name: 'User Beta',
        email: userBEmail,
        password,
      });
      expect(regB.status).toBe(201);
      userBId = (regB.body as any).id;

      // User B tries to read User A's resume
      const getRes = await clientB.get(`/api/resumes/${resumeAId}`);
      expect([403, 404]).toContain(getRes.status);

      // User B tries to patch User A's resume
      const patchRes = await clientB.patch(`/api/resumes/${resumeAId}`, {
        title: 'Hacked by User B',
      });
      expect([403, 404]).toContain(patchRes.status);

      // User B tries to delete User A's resume
      const deleteRes = await clientB.delete(`/api/resumes/${resumeAId}`);
      expect([403, 404]).toContain(deleteRes.status);

      // Verify User A's resume remains untouched
      const checkRes = await app.client.get(`/api/resumes/${resumeAId}`);
      expect(checkRes.status).toBe(200);
      expect((checkRes.body as any).title).toBe("User A's Confidential Resume");
    });
  });
});
