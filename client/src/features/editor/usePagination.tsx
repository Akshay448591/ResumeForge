import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import type { ResumeContent, ResumeStyle, TemplateId } from '../../types/resume';
import { paginate, type PaginationResult } from './paginate';
import { pageDims } from './pageSize';
import { ResumePreview } from './ResumePreview';

const EMPTY: PaginationResult = { shifts: {}, splitEntries: [], maxGap: 0, overflowX: false };

/**
 * Works out page breaks by measuring a hidden, unpaginated copy of the resume.
 * The editor preview and the PDF print page both use this, so their pages match.
 * Render `measure` somewhere in the tree and pass `pag.shifts` to the visible copy.
 */
export function usePagination(
  content: ResumeContent,
  templateId: TemplateId,
  style: ResumeStyle,
): { pag: PaginationResult; measure: ReactElement } {
  const measureRef = useRef<HTMLDivElement>(null);
  const [pag, setPag] = useState<PaginationResult>(EMPTY);
  const { w, h } = pageDims(style.pageSize);

  const recompute = useCallback(() => {
    const root = measureRef.current?.firstElementChild as HTMLElement | null;
    if (!root) return;
    const next = paginate(root, style.margin, h);
    setPag((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [style.margin, h]);

  // Re-measure whenever anything that affects layout changes, and again once fonts finish loading.
  useLayoutEffect(recompute, [recompute, content, templateId, style]);
  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    void document.fonts?.ready.then(recompute);
    return () => ro.disconnect();
  }, [recompute]);

  const measure = (
    <div
      ref={measureRef}
      aria-hidden="true"
      data-measure
      style={{
        position: 'fixed',
        left: -10000,
        top: 0,
        width: w,
        visibility: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <ResumePreview content={content} templateId={templateId} style={style} />
    </div>
  );
  return { pag, measure };
}
