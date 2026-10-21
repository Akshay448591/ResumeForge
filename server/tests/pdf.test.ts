/**
 * PDF export verification (spec item 21).
 *
 * These tests drive the real renderer: headless Chromium opens the app's /print page (served from the built
 * client in client/dist) and prints it. They check the PDF the way a downstream reader would: text extraction,
 * page count and size, links, and that content lands on the same pages as the editor preview.
 *
 * Needs: `npm run build -w client` (the root `npm test` does this) and a Chromium (`npm run pdf:setup`).
 * Without them the suite is skipped. Visual snapshots are created on the first run in tests/__snapshots__
 * (delete a file or set UPDATE_SNAPSHOTS=1 to refresh). Snapshots depend on the OS font set, so generate
 * them on the machine that will compare them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeBrowser, getBrowser } from '../src/lib/pdf/browser.js';
import { renderPdf, withPrintPage, type PrintData } from '../src/lib/pdf/render.js';
import { emptyContent } from '../src/schema/resume.js';
import { longContent, sampleContent } from './fixtures.js';
import { readPdf, squash } from './helpers/pdf.js';
import { serveDist } from './helpers/static-server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../../client/dist');
const hasDist = existsSync(path.join(dist, 'index.html'));

let canLaunch = false;
if (hasDist) {
  try {
    await getBrowser();
    canLaunch = true;
  } catch (e) {
    console.warn(
      'PDF tests skipped: no Chromium available. Run "npm run pdf:setup".',
      (e as Error).message,
    );
  }
} else {
  console.warn('PDF tests skipped: build the client first ("npm run build -w client").');
}

const data = (over: Partial<PrintData> = {}): PrintData => ({
  title: 'Priya Nair - Resume',
  templateId: 'professional',
  style: {},
  content: sampleContent(),
  ...over,
});

describe.skipIf(!hasDist || !canLaunch)('PDF export', () => {
  let site: { url: string; close: () => Promise<void> };
  beforeAll(async () => {
    site = await serveDist(dist);
  });
  afterAll(async () => {
    await site?.close();
    await closeBrowser();
  });
  const render = (d: PrintData) => renderPdf(d, site.url);

  it('produces a real PDF', async () => {
    const { pdf } = await render(data());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('uses A4 page dimensions', async () => {
    const { pdf, pages } = await render(data({ style: { pageSize: 'a4' } }));
    const read = await readPdf(pdf);
    expect(read).toHaveLength(pages);
    expect(Math.abs(read[0].width - 595.28)).toBeLessThan(1.5);
    expect(Math.abs(read[0].height - 841.89)).toBeLessThan(1.5);
  });

  it('uses US Letter page dimensions', async () => {
    const { pdf } = await render(data({ style: { pageSize: 'letter' } }));
    const [page] = await readPdf(pdf);
    expect(Math.abs(page.width - 612)).toBeLessThan(1);
    expect(Math.abs(page.height - 792)).toBeLessThan(1);
  });

  it('keeps text selectable and complete', async () => {
    const { pdf } = await render(data());
    const [page] = await readPdf(pdf);
    const text = squash(page.text);
    for (const expected of [
      'Priya Nair',
      'Senior Backend Engineer',
      'priya.nair@example.com',
      'Acme Payments',
      'Cut checkout failures by 30%',
      'Savitribai Phule Pune University',
      'TypeScript',
    ]) {
      expect(text, `missing "${expected}"`).toContain(squash(expected));
    }
  });

  it('keeps links clickable', async () => {
    const { pdf } = await render(data());
    const links = (await readPdf(pdf)).flatMap((p) => p.links);
    expect(links).toContain('https://github.com/priyanair');
    expect(links).toContain('https://example.com/portfolio');
  });

  it('renders every template on one page with the content intact', async () => {
    for (const templateId of ['ats', 'professional', 'modern', 'minimal', 'academic']) {
      const { pdf, pages } = await render(data({ templateId }));
      const read = await readPdf(pdf);
      expect(pages, templateId).toBe(1);
      expect(read, templateId).toHaveLength(1);
      expect(squash(read[0].text), templateId).toContain('priyanair');
      expect(squash(read[0].text), templateId).toContain('acmepayments');
    }
  });

  it('supports the two-column layout', async () => {
    const { pdf } = await render(data({ templateId: 'modern', style: { layout: 'two-column' } }));
    const [page] = await readPdf(pdf);
    expect(squash(page.text)).toContain('typescript');
    expect(squash(page.text)).toContain('acmepayments');
  });

  it('handles accents, symbols and typographic punctuation', async () => {
    const content = sampleContent();
    content.personal.fullName = 'Žofie Čapková-Müller';
    content.summary =
      'Naïve café owner from Ñandú, Søren & Åsa — “quoted”, earning €50k, £40k and ¥5000 – résumé.';
    const { pdf } = await render(data({ content }));
    const text = squash((await readPdf(pdf)).map((p) => p.text).join(' '));
    for (const expected of [
      'Žofie Čapková-Müller',
      'Naïve café',
      'Ñandú',
      'Søren',
      'Åsa',
      '€50k',
      '£40k',
      '¥5000',
      'résumé',
    ]) {
      expect(text, `missing "${expected}"`).toContain(squash(expected));
    }
  });

  it('renders a resume with missing fields without failing', async () => {
    const { pdf, pages } = await render(data({ content: emptyContent() }));
    const read = await readPdf(pdf);
    expect(pages).toBe(1);
    expect(squash(read[0].text)).toContain('yourname');
  });

  it('wraps very long words and URLs instead of overflowing the page', async () => {
    const content = sampleContent();
    const longWord = 'Supercalifragilistic'.repeat(12);
    content.summary = `Spent years on ${longWord} projects.`;
    content.personal.links = [
      {
        id: 'l1',
        label: '',
        url: `https://example.com/${'a-very-long-path-segment/'.repeat(8)}end`,
        visible: true,
      },
    ];
    const { pdf, info } = await render(data({ content }));
    expect(info.overflowX).toBe(false);
    const text = squash((await readPdf(pdf)).map((p) => p.text).join(' '));
    expect(text).toContain(squash(longWord.slice(0, 40)));
    expect(text).toContain('a-very-long-path-segment/');
  });

  describe('long, multi-page resumes', () => {
    it('matches the preview page-for-page', async () => {
      const { pdf, pages, info } = await render(
        data({ content: longContent(34), templateId: 'ats' }),
      );
      const read = await readPdf(pdf);
      expect(pages).toBeGreaterThan(2);
      expect(read).toHaveLength(pages);
      // every block of text is on the page the preview layout placed it on
      let checked = 0;
      for (const block of info.blocks.filter((b) => b.text.length > 12)) {
        const key = squash(block.text.slice(0, 18));
        const onPages = read.flatMap((p, i) => (squash(p.text).includes(key) ? [i] : []));
        expect(
          onPages,
          `"${block.text.slice(0, 40)}" expected on page ${block.page + 1}`,
        ).toContain(block.page);
        checked++;
      }
      expect(checked).toBeGreaterThan(50);
    });

    it('never strands a heading at the bottom of a page', async () => {
      const { pdf } = await render(data({ content: longContent(18), templateId: 'professional' }));
      const read = await readPdf(pdf);
      const headings = new Set(
        ['summary', 'workexperience', 'education', 'skills', 'languages'].map(squash),
      );
      read.slice(0, -1).forEach((page, i) => {
        const last = squash(page.items[page.items.length - 1] ?? '');
        expect(headings.has(last), `page ${i + 1} ends with a heading`).toBe(false);
      });
    });

    it('keeps short entries whole across page breaks', async () => {
      const { info } = await render(data({ content: longContent(18), templateId: 'professional' }));
      const heads = info.blocks.filter((b) => b.kind === 'head' && /Company\d+/.test(b.text));
      expect(heads.length).toBeGreaterThan(10);
      for (const head of heads) {
        const n = /Company(\d+)/.exec(head.text)?.[1];
        const bullets = info.blocks.filter((b) => new RegExp(`^Bullet${n}[ab] `).test(b.text));
        expect(bullets.length).toBe(2);
        for (const b of bullets) expect(b.page, `entry ${n} split across pages`).toBe(head.page);
      }
    });

    it('reports nothing beyond the page count it prints', async () => {
      const { pdf, pages } = await render(data({ content: longContent(12) }));
      expect(await readPdf(pdf)).toHaveLength(pages);
    });
  });

  describe('visual regression', () => {
    const dir = path.join(here, '__snapshots__');
    for (const templateId of ['ats', 'professional', 'modern', 'minimal', 'academic']) {
      it(`${templateId} looks the same as its snapshot`, async () => {
        const png = await withPrintPage(data({ templateId }), site.url, (page) =>
          page.screenshot({ type: 'png', fullPage: true }),
        );
        const file = path.join(dir, `${templateId}.png`);
        if (!existsSync(file) || process.env.UPDATE_SNAPSHOTS) {
          mkdirSync(dir, { recursive: true });
          writeFileSync(file, png);
          console.info(`Wrote visual snapshot for ${templateId}`);
          return;
        }
        const a = PNG.sync.read(readFileSync(file));
        const b = PNG.sync.read(png);
        expect([b.width, b.height]).toEqual([a.width, a.height]);
        const diff = pixelmatch(a.data, b.data, undefined, a.width, a.height, { threshold: 0.1 });
        expect(diff / (a.width * a.height), 'more than 0.5% of pixels changed').toBeLessThan(0.005);
      });
    }
  });
});
