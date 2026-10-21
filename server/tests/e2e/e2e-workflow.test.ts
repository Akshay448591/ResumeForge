import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env.js';
import { closeBrowser } from '../../src/lib/pdf/browser.js';
import { renderPdf } from '../../src/lib/pdf/render.js';
import { emptyContent, newId } from '../../src/schema/resume.js';
import { readPdf } from '../helpers/pdf.js';
import { serveDist } from '../helpers/static-server.js';
import { createTestServer, type TestServerInstance } from '../helpers/test-app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../../client/dist');
const hasDist = existsSync(path.join(dist, 'index.html'));

describe('40. End-to-End Testing - Complete User Workflows', () => {
  let app: TestServerInstance;
  let site: { url: string; close: () => Promise<void> } | undefined;

  const userAEmail = `e2e-user-a-${randomUUID()}@example.com`;
  const userBEmail = `e2e-user-b-${randomUUID()}@example.com`;
  const password = 'Password123!Secure';

  let userAId = '';
  let userBId = '';
  let resumeId = '';
  let tailoredResumeId = '';

  beforeAll(async () => {
    app = await createTestServer();
    if (hasDist) {
      site = await serveDist(dist);
    }
  });

  afterAll(async () => {
    if (userAId) await app.cleanupUser(userAId);
    if (userBId) await app.cleanupUser(userBId);
    await site?.close();
    await closeBrowser();
    await app.close();
  });

  describe('Step 1: Register, create a resume, edit sections, and switch templates', () => {
    it('registers user and creates a new blank resume', async () => {
      // 1. Register
      const regRes = await app.client.post('/api/auth/register', {
        name: 'Jordan Alex',
        email: userAEmail,
        password,
      });
      expect(regRes.status).toBe(201);
      userAId = (regRes.body as any).id;
      expect(userAId).toBeTruthy();

      // 2. Create blank resume
      const createRes = await app.client.post('/api/resumes', {
        title: 'Jordan Alex - Software Engineer',
        templateId: 'ats',
      });
      expect(createRes.status).toBe(201);
      const data = createRes.body as any;
      resumeId = data.id;
      expect(resumeId).toBeTruthy();
      expect(data.templateId).toBe('ats');
      expect(data.rev).toBe(0);
    });

    it('edits sections: personal info, experience, skills, custom sections and switches template', async () => {
      const content = emptyContent();
      content.personal = {
        fullName: 'Jordan Alex',
        title: 'Principal Distributed Systems Engineer',
        email: userAEmail,
        phone: '+1 (555) 345-6789',
        location: 'San Francisco, CA',
        links: [{ id: newId(), label: 'GitHub', url: 'https://github.com/jordanalex', visible: true }],
        show: { email: true, phone: true, location: true },
      };
      content.summary =
        'Experienced systems engineer with 8+ years designing fault-tolerant distributed databases and real-time streaming pipelines.';
      content.experience = [
        {
          id: newId(),
          company: 'Nexus Cloud Infrastructure',
          role: 'Staff Infrastructure Engineer',
          location: 'San Francisco',
          startDate: '2021-03',
          endDate: '',
          current: true,
          bullets: [
            {
              id: newId(),
              text: 'Architected distributed consensus engine handling 2M requests/sec with 99.999% availability.',
            },
            {
              id: newId(),
              text: 'Reduced tail latency p99 by 40% across 50 Kubernetes clusters.',
            },
          ],
        },
      ];
      content.skills = [
        { id: newId(), name: 'Go', kind: 'technical' },
        { id: newId(), name: 'Rust', kind: 'technical' },
        { id: newId(), name: 'Kubernetes', kind: 'technical' },
        { id: newId(), name: 'System Architecture', kind: 'soft' },
      ];

      // Reorder sections: put skills first, then summary, then experience
      content.sections = [
        { id: 'skills', type: 'skills', visible: true },
        { id: 'summary', type: 'summary', visible: true },
        { id: 'experience', type: 'experience', visible: true },
      ];

      // Edit sections and switch template from ats to modern
      const patch1 = await app.client.patch(`/api/resumes/${resumeId}`, {
        content,
        templateId: 'modern',
        baseRev: 0,
      });

      expect(patch1.status).toBe(200);
      const updated1 = patch1.body as any;
      expect(updated1.templateId).toBe('modern');
      expect(updated1.rev).toBe(1);
      expect(updated1.content.personal.fullName).toBe('Jordan Alex');
      expect(updated1.content.experience[0].company).toBe('Nexus Cloud Infrastructure');

      // Now switch template to professional
      const patch2 = await app.client.patch(`/api/resumes/${resumeId}`, {
        templateId: 'professional',
        baseRev: 1,
      });

      expect(patch2.status).toBe(200);
      const updated2 = patch2.body as any;
      expect(updated2.templateId).toBe('professional');
    });
  });

  describe('Step 2: Refresh the page and verify that the document persists', () => {
    it('simulates page reload by fetching resume and verifies all sections and templates persist', async () => {
      // Fetch specific resume
      const getRes = await app.client.get(`/api/resumes/${resumeId}`);
      expect(getRes.status).toBe(200);
      const doc = getRes.body as any;

      expect(doc.id).toBe(resumeId);
      expect(doc.templateId).toBe('professional');
      expect(doc.content.personal.fullName).toBe('Jordan Alex');
      expect(doc.content.personal.email).toBe(userAEmail);
      expect(doc.content.experience[0].company).toBe('Nexus Cloud Infrastructure');
      expect(doc.content.experience[0].bullets[0].text).toContain('2M requests/sec');
      expect(doc.content.skills.some((s: any) => s.name === 'Rust')).toBe(true);
      expect(doc.content.sections[0].type).toBe('skills');

      // Verify resume also appears in the dashboard list
      const listRes = await app.client.get('/api/resumes');
      expect(listRes.status).toBe(200);
      const list = listRes.body as any[];
      const found = list.find((r) => r.id === resumeId);
      expect(found).toBeDefined();
      expect(found.title).toBe('Jordan Alex - Software Engineer');
      expect(found.templateId).toBe('professional');
    });
  });

  describe('Step 3: Export a PDF and verify its contents', () => {
    it('generates a PDF from the persisted resume and verifies text content', async () => {
      if (!hasDist || !site) {
        console.warn('Skipping browser PDF generation because client/dist is not built');
        return;
      }

      const getRes = await app.client.get(`/api/resumes/${resumeId}`);
      const resume = getRes.body as any;

      const printData = {
        title: resume.title,
        templateId: resume.templateId,
        style: resume.style ?? {},
        content: resume.content,
      };

      const { pdf, pages } = await renderPdf(printData, site.url);
      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(1000);
      expect(pages).toBeGreaterThanOrEqual(1);

      // Verify PDF text content using readPdf
      const parsedPages = await readPdf(pdf);
      expect(parsedPages.length).toBe(pages);

      const allText = parsedPages.map((p) => p.text).join(' ');
      expect(allText).toContain('Jordan Alex');
      expect(allText).toContain('Nexus Cloud Infrastructure');
      expect(allText).toContain('Kubernetes');
    });
  });

  describe('Step 4: Create a tailored version without modifying the original', () => {
    it('duplicates the resume into a tailored version and modifies it independently', async () => {
      // 1. Fetch original before tailoring
      const originalBefore = (await app.client.get(`/api/resumes/${resumeId}`)).body as any;
      const originalRev = originalBefore.rev;
      const originalTitle = originalBefore.title;
      const originalSummary = originalBefore.content.summary;

      // 2. Create tailored copy via duplicate endpoint
      const dupRes = await app.client.post(`/api/resumes/${resumeId}/duplicate`, {
        title: 'Jordan Alex - Tailored for Staff Systems Role',
      });
      expect(dupRes.status).toBe(201);
      const tailoredSummary = dupRes.body as any;
      tailoredResumeId = tailoredSummary.id;
      expect(tailoredResumeId).toBeTruthy();
      expect(tailoredResumeId).not.toBe(resumeId);
      expect(tailoredSummary.title).toBe('Jordan Alex - Tailored for Staff Systems Role');

      // 3. Fetch full tailored document and modify independently
      const tailoredDocRes = await app.client.get(`/api/resumes/${tailoredResumeId}`);
      expect(tailoredDocRes.status).toBe(200);
      const tailored = tailoredDocRes.body as any;
      const tailoredContent = tailored.content;
      tailoredContent.summary = 'Tailored executive summary focused on cloud infrastructure leadership.';
      tailoredContent.skills.push({ id: newId(), name: 'Kafka', kind: 'technical' });

      const patchTailored = await app.client.patch(`/api/resumes/${tailoredResumeId}`, {
        content: tailoredContent,
        templateId: 'modern',
        baseRev: tailored.rev,
      });
      expect(patchTailored.status).toBe(200);

      // 4. Verify the tailored resume has the updated content
      const tailoredAfter = (await app.client.get(`/api/resumes/${tailoredResumeId}`)).body as any;
      expect(tailoredAfter.content.summary).toContain('cloud infrastructure leadership');
      expect(tailoredAfter.templateId).toBe('modern');

      // 5. CRITICAL: Verify original resume is completely UNCHANGED
      const originalAfter = (await app.client.get(`/api/resumes/${resumeId}`)).body as any;
      expect(originalAfter.title).toBe(originalTitle);
      expect(originalAfter.content.summary).toBe(originalSummary);
      expect(originalAfter.templateId).toBe('professional');
      expect(originalAfter.rev).toBe(originalRev);
      expect(originalAfter.content.skills.some((s: any) => s.name === 'Kafka')).toBe(false);
    });
  });

  describe('Step 5: Test expired sessions, invalid input, and unauthorized resource access', () => {
    it('rejects expired session tokens with 401', async () => {
      const expiredToken = jwt.sign({ sub: userAId }, env.JWT_SECRET, { expiresIn: '-1s' });
      const expiredClient = app.createClient();
      expiredClient.setCookie('rf_token', expiredToken);

      const res = await expiredClient.get('/api/resumes');
      expect(res.status).toBe(401);
      expect(res.rawText).toContain('session has expired');
    });

    it('rejects invalid schema inputs with 400 Bad Request', async () => {
      // 1. Invalid resume title (empty string)
      const res1 = await app.client.patch(`/api/resumes/${resumeId}`, {
        title: '   ',
      });
      expect(res1.status).toBe(400);

      // 2. Invalid baseRev (negative number)
      const res2 = await app.client.patch(`/api/resumes/${resumeId}`, {
        baseRev: -5,
      });
      expect(res2.status).toBe(400);

      // 3. Invalid resume content (fullName exceeding 120 chars)
      const invalidContent = emptyContent();
      invalidContent.personal.fullName = 'X'.repeat(125);
      const res3 = await app.client.patch(`/api/resumes/${resumeId}`, {
        content: invalidContent,
      });
      expect(res3.status).toBe(400);
    });

    it('enforces unauthorized resource access across distinct accounts', async () => {
      // Register second user (User B)
      const clientB = app.createClient();
      const regB = await clientB.post('/api/auth/register', {
        name: 'Unauthorized User B',
        email: userBEmail,
        password,
      });
      expect(regB.status).toBe(201);
      userBId = (regB.body as any).id;

      // User B cannot read User A's resume
      const getRes = await clientB.get(`/api/resumes/${resumeId}`);
      expect([403, 404]).toContain(getRes.status);

      // User B cannot patch User A's resume
      const patchRes = await clientB.patch(`/api/resumes/${resumeId}`, {
        title: 'Attempted Hijack',
      });
      expect([403, 404]).toContain(patchRes.status);

      // User B cannot duplicate User A's resume
      const dupRes = await clientB.post(`/api/resumes/${resumeId}/duplicate`);
      expect([403, 404]).toContain(dupRes.status);

      // User B cannot delete User A's resume
      const deleteRes = await clientB.delete(`/api/resumes/${resumeId}`);
      expect([403, 404]).toContain(deleteRes.status);
    });
  });
});
