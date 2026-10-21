import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const base =
  'inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100';
const variants: Record<Variant, string> = {
  primary: 'bg-cobalt text-white shadow-sm hover:bg-cobalt-dark',
  secondary: 'border border-slate-200 bg-white text-ink shadow-sm hover:border-slate-200 hover:bg-slate-50',
  ghost: 'text-slate-700 hover:bg-slate-100 hover:text-ink',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
};
const sizes: Record<Size, string> = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm' };

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md') =>
  `${base} ${variants[variant]} ${sizes[size]}`;

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant,
  size,
  loading,
  disabled,
  children,
  className = '',
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={`${buttonClass(variant, size)} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" label="Working" />}
      {children}
    </button>
  );
}
