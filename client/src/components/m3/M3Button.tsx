import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type M3ButtonVariant = 'filled' | 'outlined' | 'text' | 'icon';

export interface M3ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: M3ButtonVariant;
  icon?: ReactNode;
  children?: ReactNode;
}

const variantStyles: Record<M3ButtonVariant, string> = {
  filled: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm',
  outlined: 'border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100',
  text: 'text-blue-600 hover:bg-blue-50 active:bg-blue-100',
  icon: 'inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100',
};

export const M3Button = forwardRef<HTMLButtonElement, M3ButtonProps>(
  function M3Button({ variant = 'filled', icon, children, className = '', ...props }, ref) {
    const base = 'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

    if (variant === 'icon') {
      return (
        <button
          ref={ref}
          type="button"
          className={`${variantStyles.icon} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${className}`}
          {...props}
        >
          <span aria-hidden="true" className="text-[18px]">{icon ?? children}</span>
        </button>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        className={`${base} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {icon && <span className="text-[18px]">{icon}</span>}
        {children}
      </button>
    );
  },
);
