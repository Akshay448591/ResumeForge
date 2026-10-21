import { cloneElement, useId, type ReactElement } from 'react';

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ 'aria-describedby'?: string }>;
}) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 shadow-pop transition duration-150 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 group-hover:delay-300"
      >
        {label}
      </span>
    </span>
  );
}
