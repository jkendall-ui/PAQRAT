import { type HTMLAttributes, type ReactNode } from 'react';

export type M3CardVariant = 'filled' | 'elevated' | 'outlined';

export interface M3CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: M3CardVariant;
  children?: ReactNode;
}

const variantClasses: Record<M3CardVariant, string> = {
  filled: 'bg-gray-50 rounded-lg p-4',
  elevated: 'bg-white rounded-lg p-4 shadow-md',
  outlined: 'bg-white rounded-lg p-4 border border-gray-200',
};

export function M3Card({ variant = 'filled', children, className = '', ...props }: M3CardProps) {
  return (
    <div className={`${variantClasses[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
}
