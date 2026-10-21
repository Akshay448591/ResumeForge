import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import type { ResumeContent, ResumeStyle, TemplateId } from '../../types/resume';
import { analyzeLayout } from './layoutWarnings';
import { pageDims } from './pageSize';
import { ResumePreview } from './ResumePreview';
import { usePagination } from './usePagination';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const PAD = 24;

interface Props {
  content: ResumeContent;
  templateId: TemplateId;
  style: ResumeStyle;
  onFitOnePage: () => void;
}

/**
 * Live preview with zoom, page navigation, page boundaries and layout checks.
 * A hidden, unpaginated copy is measured to decide page breaks; the visible copy gets the spacers.
 */
export function PagedPreview({ content, templateId, style, onFitOnePage }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.7);
  const [height, setHeight] = useState<number>(pageDims(style.pageSize).h);
  const [page, setPage] = useState(1);
  const { pag, measure } = usePagination(content, templateId, style);
  const { w: PAGE_W, h: PAGE_H } = pageDims(style.pageSize);

  const fit = useCallback(() => {
    const w = scrollRef.current?.clientWidth ?? 0;
    if (w) setZoom(Math.max(MIN_ZOOM, Math.min(1, (w - PAD * 2) / PAGE_W)));
  }, [PAGE_W]);
  useLayoutEffect(fit, [fit]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    setHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  const pages = Math.max(1, Math.ceil((height - 0.5) / PAGE_H));
  const sheetH = pages * PAGE_H;
  const warnings = useMemo(
    () => analyzeLayout({ style, pages, height, pagination: pag }),
    [style, pages, height, pag],
  );

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const p = Math.floor((el.scrollTop + el.clientHeight / 3 - PAD) / (PAGE_H * zoom)) + 1;
    setPage(Math.min(pages, Math.max(1, p)));
  };
  const goTo = (p: number) => {
    const next = Math.min(pages, Math.max(1, p));
    scrollRef.current?.scrollTo({ top: (next - 1) * PAGE_H * zoom, behavior: 'smooth' });
    setPage(next);
  };
  const current = Math.min(page, pages);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
          <IconButton
            icon="up"
            label="Previous page"
            disabled={current <= 1}
            onClick={() => goTo(current - 1)}
          />
          <span className="min-w-[5.5rem] text-center text-sm tabular-nums" aria-live="polite">
            Page {current} of {pages}
          </span>
          <IconButton
            icon="down"
            label="Next page"
            disabled={current >= pages}
            onClick={() => goTo(current + 1)}
          />
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <IconButton
            icon="minus"
            label="Zoom out"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.1).toFixed(2)))}
          />
          <span className="min-w-[3rem] text-center text-sm tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <IconButton
            icon="plus"
            label="Zoom in"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.1).toFixed(2)))}
          />
          <Button size="sm" variant="ghost" onClick={fit}>
            Fit width
          </Button>
        </div>
      </div>

      {warnings.length > 0 ? (
        <details className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <summary className="cursor-pointer font-medium">
            {warnings.length} layout {warnings.length === 1 ? 'suggestion' : 'suggestions'}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warnings.map((w) => (
              <li key={w.id}>{w.message}</li>
            ))}
          </ul>
          {style.pageMode === 'one' && pages > 1 && (
            <Button size="sm" variant="secondary" className="mt-2" onClick={onFitOnePage}>
              Fit to one page
            </Button>
          )}
        </details>
      ) : (
        <p className="border-b border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
          Layout checks passed.
        </p>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto bg-desk"
        tabIndex={0}
        aria-label="Resume preview"
      >
        <div style={{ padding: PAD }}>
          <div style={{ width: PAGE_W * zoom, height: sheetH * zoom, margin: '0 auto' }}>
            <div
              style={{
                width: PAGE_W,
                height: sheetH,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left',
                position: 'relative',
                background: '#fff',
                boxShadow: '0 1px 3px rgba(23,35,58,.18), 0 8px 24px rgba(23,35,58,.08)',
              }}
            >
              <div ref={contentRef}>
                <ResumePreview
                  content={content}
                  templateId={templateId}
                  style={style}
                  shifts={pag.shifts}
                />
              </div>
              {Array.from({ length: pages - 1 }, (_, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: (i + 1) * PAGE_H,
                    borderTop: '2px dashed #2F55D4',
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: 4,
                      background: '#FFE45C',
                      color: '#17233A',
                      fontSize: 11,
                      fontFamily: 'Instrument Sans, system-ui, sans-serif',
                      padding: '1px 6px',
                      borderRadius: 3,
                    }}
                  >
                    Page {i + 1} ends here
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {measure}
    </div>
  );
}
