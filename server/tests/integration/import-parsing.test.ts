import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DOCX_MIME } from '../../src/routes/importExport.js';
import { blocksFromHtml } from '../../src/lib/docxImport.js';
import { createTestServer, type TestServerInstance } from '../helpers/test-app.js';

describe('39. Integration Testing - Import Parsing and Malformed Document Handling', () => {
  let app: TestServerInstance;
  const email = `test-import-${randomUUID()}@example.com`;
  const password = 'Password123!Secure';
  let userId = '';

  beforeAll(async () => {
    app = await createTestServer();
    const regRes = await app.client.post('/api/auth/register', {
      name: 'Import Tester',
      email,
      password,
    });
    userId = (regRes.body as any).id;
  });

  afterAll(async () => {
    if (userId) await app.cleanupUser(userId);
    await app.close();
  });

  describe('Malformed and Invalid Document Uploads', () => {
    it('rejects empty payload with 415 Unsupported Media Type', async () => {
      const res = await app.client.request('/api/import/docx', {
        method: 'POST',
        rawBody: Buffer.from([]),
        contentType: DOCX_MIME,
      });

      expect(res.status).toBe(415);
      expect(res.rawText).toContain('Word document');
    });

    it('rejects older binary .doc format files (OLE compound file header) with 415', async () => {
      // Old .doc files start with magic bytes: D0 CF 11 E0
      const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
      const res = await app.client.request('/api/import/docx', {
        method: 'POST',
        rawBody: oleHeader,
        contentType: DOCX_MIME,
      });

      expect(res.status).toBe(415);
      expect(res.rawText).toContain('older .doc file');
    });

    it('rejects non-docx files lacking the PK zip magic signature with 415', async () => {
      const textBuffer = Buffer.from('Plain text file pretending to be docx');
      const res = await app.client.request('/api/import/docx', {
        method: 'POST',
        rawBody: textBuffer,
        contentType: DOCX_MIME,
      });

      expect(res.status).toBe(415);
      expect(res.rawText).toContain('doesn’t look like a Word document');
    });

    it('rejects corrupted zip/docx files starting with PK with 422 Unprocessable Entity', async () => {
      // Starts with 'PK' but contains corrupted data that mammoth fails to parse
      const corruptZip = Buffer.from([
        0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0xff, 0xff, 0xde, 0xad, 0xbe, 0xef,
      ]);
      const res = await app.client.request('/api/import/docx', {
        method: 'POST',
        rawBody: corruptZip,
        contentType: DOCX_MIME,
      });

      expect(res.status).toBe(422);
      expect(res.rawText).toContain('couldn’t read any text');
    });

    it('requires authentication to access import endpoints', async () => {
      const unauthClient = app.createClient();
      const res = await unauthClient.request('/api/import/docx', {
        method: 'POST',
        rawBody: Buffer.from('test'),
        contentType: DOCX_MIME,
      });
      expect(res.status).toBe(401);
    });
  });

  describe('HTML and Block Parser for Document Import', () => {
    it('correctly parses headings, paragraphs, and list items from document html', () => {
      const html = `
        <h1>Jane Smith</h1>
        <p>Software Engineer &bull; jane@example.com</p>
        <h2>Experience</h2>
        <p>Senior Developer at Tech Labs</p>
        <ul>
          <li>Led development of checkout microservice</li>
          <li>Mentored 3 junior software engineers</li>
        </ul>
        <h2>Education</h2>
        <p>B.S. in Computer Science</p>
      `;

      const blocks = blocksFromHtml(html);
      expect(blocks.length).toBeGreaterThan(4);
      expect(blocks[0].type).toBe('heading');
      expect(blocks[0].text).toBe('Jane Smith');
      expect(blocks.some((b) => b.type === 'li' && b.text.includes('checkout microservice'))).toBe(true);
      expect(blocks.some((b) => b.type === 'heading' && b.text === 'Experience')).toBe(true);
    });

    it('decodes HTML entities and normalizes whitespace', () => {
      const html = '<p>Built&nbsp;apps&nbsp;using&nbsp;&amp;&nbsp;tested&nbsp;&quot;thoroughly&quot;</p>';
      const blocks = blocksFromHtml(html);
      expect(blocks[0].text).toBe('Built apps using & tested "thoroughly"');
    });
  });
});
