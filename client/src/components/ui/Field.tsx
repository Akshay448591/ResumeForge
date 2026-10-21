import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

interface FieldProps {
  label: string;
  /** Message under the field. `tone` decides whether it reads as an error or a gentle warning. */
  error?: string | null;
  tone?: 'error' | 'warning';
  hint?: string;
  footer?: ReactNode;
}

const control =
  'block w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink shadow-sm transition placeholder:text-slate-400 focus:outline-none focus:ring-4 disabled:bg-slate-50 disabled:text-slate-500';

function Wrapper({
  id,
  label,
  error,
  tone = 'error',
  hint,
  footer,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-msg`} className="mt-1.5 text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-msg`}
          className={`mt-1.5 text-xs ${tone === 'error' ? 'text-red-700' : 'text-amber-700'}`}
        >
          {error}
        </p>
      )}
      {footer && <div className="mt-1.5 text-xs text-slate-600">{footer}</div>}
    </div>
  );
}

const borderFor = (error?: string | null, tone: 'error' | 'warning' = 'error') =>
  error
    ? tone === 'error'
      ? 'border-red-500 focus:ring-red-500/15'
      : 'border-amber-500 focus:ring-amber-500/20'
    : 'border-slate-300 hover:border-slate-400 focus:border-cobalt focus:ring-cobalt/15';

export const Input = forwardRef<
  HTMLInputElement,
  FieldProps &
    Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { id?: string; endAdornment?: ReactNode }
>(function Input(
  { label, error, tone, hint, footer, id, className = '', endAdornment, ...rest },
  ref,
) {
  const uid = useId();
  const fid = id ?? uid;
  const input = (
    <input
      ref={ref}
      id={fid}
      aria-invalid={error && tone !== 'warning' ? true : undefined}
      aria-describedby={error || hint ? `${fid}-msg` : undefined}
      className={`${control} ${borderFor(error, tone)} ${endAdornment ? 'pr-10' : ''} ${className}`}
      {...rest}
    />
  );
  return (
    <Wrapper id={fid} {...{ label, error, tone, hint, footer }}>
      {endAdornment ? (
        <div className="relative">
          {input}
          <div className="absolute inset-y-0 right-1 flex items-center">{endAdornment}</div>
        </div>
      ) : (
        input
      )}
    </Wrapper>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & { id?: string }
>(function Textarea({ label, error, tone, hint, footer, id, className = '', ...rest }, ref) {
  const uid = useId();
  const fid = id ?? uid;
  return (
    <Wrapper id={fid} {...{ label, error, tone, hint, footer }}>
      <textarea
        ref={ref}
        id={fid}
        aria-invalid={error && tone !== 'warning' ? true : undefined}
        aria-describedby={error || hint ? `${fid}-msg` : undefined}
        className={`${control} ${borderFor(error, tone)} ${className}`}
        {...rest}
      />
    </Wrapper>
  );
});

export function Select({
  label,
  error,
  hint,
  id,
  className = '',
  children,
  ...rest
}: FieldProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & { id?: string }) {
  const uid = useId();
  const fid = id ?? uid;
  return (
    <Wrapper id={fid} label={label} error={error} hint={hint}>
      <select id={fid} className={`${control} ${borderFor(error)} ${className}`} {...rest}>
        {children}
      </select>
    </Wrapper>
  );
}

export function Checkbox({
  label,
  className = '',
  ...rest
}: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 text-sm text-ink ${className}`}
    >
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 accent-[#2F55D4]"
        {...rest}
      />
      {label}
    </label>
  );
}
