import { type ReactNode } from 'react';
import Button from '@atlaskit/button/new';

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export interface M3SegmentedButtonProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  'data-testid'?: string;
}

export function M3SegmentedButton<T extends string = string>({
  options,
  value,
  onChange,
  className = '',
  ...props
}: M3SegmentedButtonProps<T>) {
  return (
    <div className={`inline-flex ${className}`} role="radiogroup" data-testid={props['data-testid']}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Button
            key={opt.value}
            appearance={selected ? 'primary' : 'default'}
            isSelected={selected}
            onClick={() => onChange(opt.value)}
            aria-checked={selected}
          >
            {selected && <span aria-hidden="true">✓ </span>}
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
