import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sampleContent } from '../fixtures.js';
import { createTestServer, type TestServerInstance } from '../helpers/test-app.js';

describe('39. Integration Testing - Autosave, Revision Conflicts, and Recovery', () => {
  let app: TestServerInstance;
  const email = `test-autosave-${randomUUID()}@example.com`;
  const password = 'Password123!Secure';
  let userId = '';
  let resumeId = '';

  beforeAll(async () => {
    app = await createTestServer();
    const regRes = await app.client.post('/api/auth/register', {
      name: 'Autosave Tester',
      email,
      password,
    });
    userId = (regRes.body as any).id;
  });

  afterAll(async () => {
    if (userId) await app.cleanupUser(userId);
    await app.close();
  });

  it('creates an initial resume with rev = 0', async () => {
    const res = await app.client.post('/api/resumes', {
      title: 'Autosave Project Resume',
      templateId: 'modern',
    });

    expect(res.status).toBe(201);
    const data = res.body as any;
    resumeId = data.id;
    expect(data.rev).toBe(0);
  });

  it('performs clean autosave when baseRev matches current rev', async () => {
    const updatedContent = sampleContent();
    updatedContent.summary = 'Autosaved summary revision 1';

    const res = await app.client.patch(`/api/resumes/${resumeId}`, {
      content: updatedContent,
      baseRev: 0,
    });

    expect(res.status).toBe(200);
    const data = res.body as any;
    expect(data.rev).toBe(1);
    expect(data.content.summary).toBe('Autosaved summary revision 1');
  });

  it('detects concurrent edit conflict and returns 409 when baseRev is stale', async () => {
    // Client sends stale baseRev = 0 when server is already at rev = 1
    const conflictContent = sampleContent();
    conflictContent.summary = 'Conflicting edit with stale base revision 0';

    const res = await app.client.patch(`/api/resumes/${resumeId}`, {
      content: conflictContent,
      baseRev: 0,
    });

    expect(res.status).toBe(409);
    expect((res.body as any).code).toBe('REV_CONFLICT');
    expect((res.body as any).currentRev).toBe(1);
  });

  it('recovers from revision conflict by fetching latest rev and saving cleanly', async () => {
    // 1. Fetch current server state
    const fetchRes = await app.client.get(`/api/resumes/${resumeId}`);
    expect(fetchRes.status).toBe(200);
    const currentDoc = fetchRes.body as any;
    expect(currentDoc.rev).toBe(1);

    // 2. Client applies changes using the latest rev (1)
    const reconciledContent = currentDoc.content;
    reconciledContent.summary = 'Reconciled summary after conflict resolution';

    const saveRes = await app.client.patch(`/api/resumes/${resumeId}`, {
      content: reconciledContent,
      baseRev: currentDoc.rev,
    });

    expect(saveRes.status).toBe(200);
    const savedData = saveRes.body as any;
    expect(savedData.rev).toBe(2);
    expect(savedData.content.summary).toBe('Reconciled summary after conflict resolution');
  });

  it('supports partial autosave of metadata (title only)', async () => {
    const res = await app.client.patch(`/api/resumes/${resumeId}`, {
      title: 'Renamed Autosave Resume',
    });

    expect(res.status).toBe(200);
    expect((res.body as any).title).toBe('Renamed Autosave Resume');
  });
});
