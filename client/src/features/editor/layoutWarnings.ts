import type { ResumeStyle } from '../../types/resume';
import type { PaginationResult } from './paginate';
import { pageDims } from './pageSize';

export interface LayoutWarning {
  id: string;
  message: string;
}

interface Input {
  style: ResumeStyle;
  pages: number;
  height: number;
  pagination: PaginationResult;
}

/** Plain-language layout checks shown beside the preview. */
export function analyzeLayout({ style, pages, height, pagination }: Input): LayoutWarning[] {
  const out: LayoutWarning[] = [];
  const PAGE_H = pageDims(style.pageSize).h;

  if (style.pageMode === 'one' && pages > 1) {
    out.push({
      id: 'one-page',
      message: `This resume runs onto page ${pages} but is set to one page. Trim content or use “Fit to one page”.`,
    });
  }
  if (style.fontSize < 10) {
    out.push({
      id: 'small-text',
      message: `Body text is ${style.fontSize}px, which is hard to read when printed. Aim for 10px or larger.`,
    });
  }
  if (style.margin < 28) {
    out.push({
      id: 'margins',
      message: 'Margins are very narrow. Some printers may cut off text near the edge.',
    });
  }
  if (style.lineHeight < 1.25) {
    out.push({
      id: 'line-height',
      message: 'Line spacing is tight, which can make text harder to scan.',
    });
  }
  if (pages > 1) {
    const lastFill = (height - (pages - 1) * PAGE_H) / PAGE_H;
    if (lastFill < 0.2) {
      out.push({
        id: 'last-page',
        message: `Page ${pages} is mostly empty (about ${Math.max(1, Math.round(lastFill * 100))}% full). Trim a little to fit on ${pages - 1} page${pages - 1 > 1 ? 's' : ''}, or add more content.`,
      });
    }
  } else if (height < PAGE_H * 0.5) {
    out.push({
      id: 'whitespace',
      message:
        'The resume fills less than half the page. Larger text or more spacing can balance it.',
    });
  }
  if (pagination.maxGap > 120) {
    out.push({
      id: 'gap',
      message: `About ${pagination.maxGap}px is left empty at the bottom of a page because the next entry moved to the following page.`,
    });
  }
  pagination.splitEntries.slice(0, 3).forEach((label, i) => {
    out.push({ id: `split-${i}`, message: `“${label}” continues across a page break.` });
  });
  if (pagination.overflowX) {
    out.push({
      id: 'overflow',
      message:
        'Some content is wider than the page and could be clipped. Check very long words or links.',
    });
  }
  return out;
}
