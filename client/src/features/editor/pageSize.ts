import type { PageSizeId } from '../../types/resume';

/** Page sizes in CSS pixels (96dpi). Letter is exactly 8.5 x 11 in; A4 is rounded to whole pixels. */
export const PAGE_SIZES = {
  a4: { w: 794, h: 1123, label: 'A4', detail: '210 × 297 mm' },
  letter: { w: 816, h: 1056, label: 'US Letter', detail: '8.5 × 11 in' },
} as const;

export const pageDims = (id: PageSizeId | undefined) => PAGE_SIZES[id ?? 'a4'] ?? PAGE_SIZES.a4;
