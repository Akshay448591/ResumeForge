import type { CSSProperties } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { Toaster } from 'sonner';

export function ToastHost() {
  return (
    <Toaster
      position="bottom-right"
      closeButton
      duration={4000}
      visibleToasts={4}
      gap={10}
      icons={{
        success: <CircleCheck className="h-[18px] w-[18px] text-emerald-600" strokeWidth={2} />,
        error: <CircleAlert className="h-[18px] w-[18px] text-red-600" strokeWidth={2} />,
      }}
      toastOptions={{
        classNames: {
          toast: '!rounded-xl !shadow-pop !font-sans !gap-3 !p-4',
          title: '!text-sm !font-medium',
          description: '!text-[13px] !text-slate-600',
          closeButton: '!border-slate-200 !bg-white !text-slate-500 hover:!bg-slate-50',
        },
      }}
      style={
        {
          '--normal-bg': '#ffffff',
          '--normal-border': '#E4E7EC',
          '--normal-text': '#17233A',
          '--border-radius': '12px',
        } as CSSProperties
      }
    />
  );
}
