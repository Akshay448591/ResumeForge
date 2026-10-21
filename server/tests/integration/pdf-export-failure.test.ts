import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { friendlyError, recoverStaleExports } from '../../src/lib/pdf/queue.js';
import { ExportJob } from '../../src/models/ExportJob.js';
import { createTestServer, type TestServerInstance } from '../helpers/test-app.js';

describe('39. Integration Testing - PDF Generation and Export Failure Handling', () => {
  let app: TestServerInstance;
  const userAEmail = `test-export-a-${randomUUID()}@example.com`;
  const userBEmail = `test-export-b-${randomUUID()}@example.com`;
  const password = 'Password123!Secure';
  let userAId = '';
  let userBId = '';
  let resumeId = '';
  let jobId = '';

  beforeAll(async () => {
    app = await createTestServer();
    const regRes = await app.client.post('/api/auth/register', {
      name: 'PDF User A',
      email: userAEmail,
      password,
    });
    userAId = (regRes.body as any).id;

    const resumeRes = await app.client.post('/api/resumes', {
      title: 'PDF Export Test Resume',
      templateId: 'professional',
    });
    resumeId = (resumeRes.body as any).id;
  });

  afterAll(async () => {
    if (userAId) await app.cleanupUser(userAId);
    if (userBId) await app.cleanupUser(userBId);
    await app.close();
  });

  describe('friendlyError mapping', () => {
    it('maps Playwright launch failures to actionable setup advice', () => {
      const err = new Error("Executable doesn't exist at path /usr/bin/chromium");
      const msg = friendlyError(err);
      expect(msg).toContain('npm run pdf:setup');
    });

    it('maps network connection failures to base URL advice', () => {
      const err = new Error('net::ERR_CONNECTION_REFUSED');
      const msg = friendlyError(err);
      expect(msg).toContain('couldn’t reach the app');
    });

    it('maps timeout errors to resume length advice', () => {
      const err = new Error('Navigation timed out after 30000ms');
      const msg = friendlyError(err);
      expect(msg).toContain('took too long');
    });

    it('maps unknown errors to generic retry message', () => {
      const msg = friendlyError(new Error('Unknown memory panic'));
      expect(msg).toContain('couldn’t generate the PDF');
    });
  });

  describe('Export Job Lifecycle and Error Handling', () => {
    it('queues an export job and returns 202 Accepted', async () => {
      const res = await app.client.post(`/api/resumes/${resumeId}/exports`, {
        pageSize: 'a4',
      });

      expect([200, 202]).toContain(res.status);
      const data = res.body as any;
      jobId = data.id;
      expect(jobId).toBeTruthy();
      expect(['queued', 'processing', 'done']).toContain(data.status);
    });

    it('reuses existing pending/done export job for identical resume snapshot', async () => {
      const res = await app.client.post(`/api/resumes/${resumeId}/exports`, {
        pageSize: 'a4',
      });
      expect([200, 202]).toContain(res.status);
      expect((res.body as any).id).toBe(jobId);
    });

    it('prevents download while PDF is still queued or processing (409 Conflict)', async () => {
      // Create a temporary job with queued status
      const tempJob = await ExportJob.create({
        userId: userAId,
        resumeId,
        hash: 'temp-hash-queued',
        status: 'queued',
        pageSize: 'a4',
        filename: 'resume.pdf',
        expiresAt: new Date(Date.now() + 60000),
      });

      const res = await app.client.get(
        `/api/resumes/${resumeId}/exports/${tempJob._id}/download`,
      );
      expect(res.status).toBe(409);
      expect(res.rawText).toContain('ready yet');
      await tempJob.deleteOne();
    });

    it('handles export failure by recording error without crashing the server', async () => {
      // Create a job simulated as failed
      const failedJob = await ExportJob.create({
        userId: userAId,
        resumeId,
        hash: 'temp-hash-failed',
        status: 'failed',
        error: friendlyError(new Error('Timeout during rendering')),
        pageSize: 'a4',
        filename: 'resume.pdf',
        expiresAt: new Date(Date.now() + 60000),
      });

      const res = await app.client.get(`/api/resumes/${resumeId}/exports/${failedJob._id}`);
      expect(res.status).toBe(200);
      const data = res.body as any;
      expect(data.status).toBe('failed');
      expect(data.error).toContain('took too long');
      await failedJob.deleteOne();
    });

    it('recovers orphaned exports left running from previous server crash', async () => {
      const stuckJob = await ExportJob.create({
        userId: userAId,
        resumeId,
        hash: 'stuck-job-hash',
        status: 'processing',
        pageSize: 'letter',
        filename: 'stuck.pdf',
        expiresAt: new Date(Date.now() + 60000),
      });

      await recoverStaleExports();

      const updated = await ExportJob.findById(stuckJob._id);
      expect(updated?.status).toBe('failed');
      expect(updated?.error).toContain('restarted while this export was running');
      await stuckJob.deleteOne();
    });

    it('prevents another user from accessing or downloading the export job', async () => {
      const clientB = app.createClient();
      const regB = await clientB.post('/api/auth/register', {
        name: 'PDF User B',
        email: userBEmail,
        password,
      });
      userBId = (regB.body as any).id;

      // User B attempts to access User A's export job
      const res = await clientB.get(`/api/resumes/${resumeId}/exports/${jobId}`);
      expect([403, 404]).toContain(res.status);

      const downloadRes = await clientB.get(
        `/api/resumes/${resumeId}/exports/${jobId}/download`,
      );
      expect([403, 404]).toContain(downloadRes.status);
    });
  });
});
