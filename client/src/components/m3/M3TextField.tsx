import { forwardRef, type InputHTMLAttributes } from 'react';

export type M3TextFieldVariant = 'filled' | 'outlined';

export interface M3TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: M3TextFieldVariant;
  label?: string;
  supportingText?: string;
  error?: boolean;
  errorText?: string;
}

export const M3TextField = forwardRef<HTMLInputElement, M3TextFieldProps>(
  function M3TextField(
    { variant = 'filled', label, supportingText, error = false, errorText, className = '', id, ...props },
    ref,
  ) {
    const inputId = id ?? (label ? `m3-tf-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
    const borderStyle = error
      ? 'border-red-500 focus:ring-red-400'
      : 'border-gray-300 focus:ring-blue-400 focus:border-blue-500';

    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-gray-600">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full rounded-md border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:outline-none focus:ring-2 ${borderStyle}`}
          aria-invalid={error || undefined}
          aria-describedby={
            error && errorText ? `${inputId}-error` : supportingText ? `${inputId}-support` : undefined
          }
          {...props}
        />
        {error && errorText && (
          <span id={`${inputId}-error`} className="text-xs text-red-600" role="alert" aria-live="assertive">
            {errorText}
          </span>
        )}
        {!error && supportingText && (
          <span id={`${inputId}-support`} className="text-xs text-gray-500">
            {supportingText}
          </span>
        )}
      </div>
    );
  },
);
