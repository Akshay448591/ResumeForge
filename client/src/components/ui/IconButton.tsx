import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import { Tooltip } from './Tooltip';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: IconName;
  label: string;
  danger?: boolean;
}

export function IconButton({ icon, label, danger, className = '', ...rest }: Props) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-600 hover:bg-slate-100'
        } ${className}`}
        {...rest}
      >
        <Icon name={icon} />
      </button>
    </Tooltip>
  );
}
