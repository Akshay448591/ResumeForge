import { useId } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step, unit = '', onChange }: Props) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="text-sm tabular-nums text-slate-600">
          {value}
          {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={`${value}${unit}`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[#2F55D4]"
      />
    </div>
  );
}
