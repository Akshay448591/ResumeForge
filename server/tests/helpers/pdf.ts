import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfPage {
  /** Page size in PDF points (1 pt = 1/72 in). */
  width: number;
  height: number;
  text: string;
  /** Text items in drawing order. */
  items: string[];
  links: string[];
}

/** Read a PDF the way a downstream tool (or an applicant tracking system) would. */
export async function readPdf(data: Buffer): Promise<PdfPage[]> {
  const task = getDocument({ data: new Uint8Array(data), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const [x0, y0, x1, y1] = page.view;
    const content = await page.getTextContent();
    const items = content.items.map((it) => ('str' in it ? it.str : '')).filter((s) => s.trim());
    const annotations = await page.getAnnotations();
    pages.push({
      width: x1 - x0,
      height: y1 - y0,
      text: items.join(' '),
      items,
      links: annotations.filter((a) => a.subtype === 'Link' && a.url).map((a) => a.url as string),
    });
  }
  await task.destroy();
  return pages;
}

export const squash = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, '');
