import type { Page } from 'playwright';
import { getBrowser } from './browser.js';

/** What the print page needs to draw a resume. Must match `PrintData` in the client. */
export interface PrintData {
  title: string;
  templateId: string;
  style: Record<string, unknown>;
  content: unknown;
}

/** What the print page reports once its layout is final. Must match `PrintInfo` in the client. */
export interface PrintInfo {
  pages: number;
  pageW: number;
  pageH: number;
  overflowX: boolean;
  blocks: { text: string; page: number; kind: string }[];
}

type PrintGlobals = { __PRINT_DATA__?: unknown; __PRINT_INFO__?: PrintInfo };

/**
 * Opens the app's /print route in headless Chromium with the resume injected, waits until the layout is
 * final, then hands the page to `fn`. The print route uses the same React templates and the same page-break
 * logic as the editor preview, so the PDF matches what people see on screen.
 */
export async function withPrintPage<T>(
  data: PrintData,
  baseUrl: string,
  fn: (page: Page, info: PrintInfo) => Promise<T>,
  timeoutMs = 30_000,
): Promise<T> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 900, height: 1200 },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    await page.addInitScript((d) => {
      (globalThis as unknown as PrintGlobals).__PRINT_DATA__ = d;
    }, data);
    // Lay out exactly as the editor does, then print that layout.
    await page.emulateMedia({ media: 'screen' });
    await page.goto(`${baseUrl.replace(/\/$/, '')}/print`, {
      waitUntil: 'load',
      timeout: timeoutMs,
    });
    await page.waitForSelector('body[data-print-ready="true"]', { timeout: timeoutMs });
    const info = await page.evaluate(() => (globalThis as unknown as PrintGlobals).__PRINT_INFO__);
    if (!info) throw new Error('The print page did not report its layout.');
    return await fn(page, info);
  } finally {
    await context.close();
  }
}

/** Render a resume to a PDF with selectable text and clickable links. */
export function renderPdf(data: PrintData, baseUrl: string, timeoutMs?: number) {
  return withPrintPage(
    data,
    baseUrl,
    async (page, info) => {
      const pdf = await page.pdf({
        width: `${info.pageW}px`,
        height: `${info.pageH}px`,
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
        pageRanges: `1-${info.pages}`, // never emit a stray blank trailing page
      });
      return { pdf, pages: info.pages, info };
    },
    timeoutMs,
  );
}
