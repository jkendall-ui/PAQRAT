import { type ButtonHTMLAttributes, type ReactNode } from 'react';

export type M3ChipVariant = 'input' | 'assist';

export interface M3ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: M3ChipVariant;
  icon?: ReactNode;
  selected?: boolean;
  children: ReactNode;
}

export function M3Chip({ variant = 'input', icon, selected = false, children, className = '', ...props }: M3ChipProps) {
  const base = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors border focus:outline-none focus:ring-2 focus:ring-blue-400';
  const selectedStyle = selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50';

  return (
    <button type="button" className={`${base} ${selectedStyle} ${className}`} {...props}>
      {icon && <span className="text-[18px]">{icon}</span>}
      {children}
    </button>
  );
}
