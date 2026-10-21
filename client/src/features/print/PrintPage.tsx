import { useEffect, useMemo, useRef, useState } from 'react';
import { pageDims } from '../editor/pageSize';
import { ResumePreview } from '../editor/ResumePreview';
import { usePagination } from '../editor/usePagination';
import { resolveStyle } from '../../lib/templates';
import type { ResumeContent, StyleOverrides, TemplateId } from '../../types/resume';

/** Data handed to the print page by the server-side renderer. */
export interface PrintData {
  title: string;
  templateId: TemplateId;
  style: StyleOverrides;
  content: ResumeContent;
}

/** What the renderer (and the tests) read back once the page is ready. */
export interface PrintInfo {
  pages: number;
  pageW: number;
  pageH: number;
  overflowX: boolean;
  /** Text blocks and which page the preview layout put them on. Used to verify the PDF matches. */
  blocks: { text: string; page: number; kind: string }[];
}

declare global {
  interface Window {
    __PRINT_DATA__?: PrintData;
    __PRINT_INFO__?: PrintInfo;
  }
}

function PrintView({ data }: { data: PrintData }) {
  const style = useMemo(() => resolveStyle(data.templateId, data.style), [data]);
  const { w, h } = pageDims(style.pageSize);
  const { pag, measure } = usePagination(data.content, data.templateId, style);
  const rootRef = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [final, setFinal] = useState(false);

  useEffect(() => {
    document.title = data.title;
    void (document.fonts?.ready ?? Promise.resolve()).then(() => setFontsReady(true));
  }, [data.title]);

  // Layout is final once fonts have loaded and page breaks have stopped changing.
  useEffect(() => {
    if (!fontsReady) return;
    const t = setTimeout(() => setFinal(true), 400);
    return () => clearTimeout(t);
  }, [fontsReady, pag]);

  useEffect(() => {
    const root = rootRef.current;
    if (!final || !root) return;
    const top = root.getBoundingClientRect().top;
    const blocks = [
      ...root.querySelectorAll<HTMLElement>('[data-pg="atom"], [data-pg="head"]'),
    ].map((el) => ({
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      page: Math.floor((el.getBoundingClientRect().top - top + 1) / h),
      kind: el.dataset.pg ?? '',
    }));
    window.__PRINT_INFO__ = {
      pages: Math.max(1, Math.ceil((root.offsetHeight - 0.5) / h)),
      pageW: w,
      pageH: h,
      overflowX: root.scrollWidth > root.clientWidth + 1,
      blocks,
    };
    document.body.dataset.printReady = 'true';
  }, [final, w, h]);

  return (
    <>
      <style>{`
        @page { size: ${w}px ${h}px; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>
      <div ref={rootRef} style={{ width: w }}>
        <ResumePreview
          content={data.content}
          templateId={data.templateId}
          style={style}
          shifts={pag.shifts}
        />
      </div>
      {!final && measure}
    </>
  );
}

/**
 * Print-only route used by the PDF renderer. It draws the same resume, with the same page breaks, as the
 * editor preview, and signals `body[data-print-ready]` when layout is final.
 */
export default function PrintPage() {
  const data = window.__PRINT_DATA__;
  if (!data) return <p style={{ fontFamily: 'sans-serif', padding: 24 }}>Nothing to print.</p>;
  return <PrintView data={data} />;
}
