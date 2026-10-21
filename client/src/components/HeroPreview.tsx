import { PAGE_H, PAGE_W, ResumePreview } from '../features/editor/ResumePreview';
import { resolveStyle } from '../lib/templates';
import { SAMPLE_CONTENT, type TemplateId } from '../types/resume';

interface Props {
  scale?: number;
  /** Fraction of the page height that stays visible. */
  crop?: number;
  templateId?: TemplateId;
  showBreak?: boolean;
  className?: string;
}

/** A scaled, cropped, non-interactive resume page used for marketing surfaces. */
export function HeroPreview({
  scale = 0.56,
  crop = 0.62,
  templateId = 'modern',
  showBreak = false,
  className = '',
}: Props) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: PAGE_W * scale,
        height: PAGE_H * scale * crop,
        overflow: 'hidden',
        position: 'relative',
      }}
      className={`bg-white shadow-pop ring-1 ring-slate-200 ${className}`}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: PAGE_W }}>
        <ResumePreview
          content={SAMPLE_CONTENT}
          templateId={templateId}
          style={resolveStyle(templateId)}
        />
      </div>
      {showBreak && (
        <div className="absolute inset-x-0 bottom-0 border-t-2 border-dashed border-cobalt">
          <span className="absolute right-2 top-1 rounded bg-mark px-1.5 py-0.5 text-[11px] font-medium text-ink">
            Page 1 ends here
          </span>
        </div>
      )}
    </div>
  );
}
