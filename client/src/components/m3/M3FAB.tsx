import { type ButtonHTMLAttributes, type ReactNode } from 'react';

export interface M3FABProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label?: string;
}

export function M3FAB({ icon, label, className = '', ...props }: M3FABProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-white shadow-lg hover:bg-blue-700 active:bg-blue-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${className}`}
      aria-label={!label ? (props['aria-label'] ?? 'Action') : undefined}
      {...props}
    >
      <span className="text-[24px]">{icon}</span>
      {label && <span className="font-medium">{label}</span>}
    </button>
  );
}
