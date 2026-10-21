import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** `lg` for content-heavy dialogs such as the import review. */
  size?: 'md' | 'lg';
}

/** Built on the native <dialog>: focus is trapped, Escape closes, focus returns to the trigger. */
export function Dialog({ open, onClose, title, children, footer, size = 'md' }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`${size === 'lg' ? 'w-[min(94vw,46rem)]' : 'w-[min(92vw,30rem)]'} max-h-[90vh] rounded-2xl border border-slate-200 p-0 shadow-pop backdrop:bg-ink/40`}
    >
      {open && (
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={onClose}
              className="-mr-2 -mt-1 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-ink"
            >
              <Icon name="x" />
            </button>
          </div>
          <div className="mt-4">{children}</div>
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
