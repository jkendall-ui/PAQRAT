import Spinner from '@atlaskit/spinner';

export interface M3CircularProgressProps {
  value?: number;
  indeterminate?: boolean;
  size?: number;
  className?: string;
}

export function M3CircularProgress({ value, indeterminate = false, size = 48, className = '' }: M3CircularProgressProps) {
  const percent = indeterminate ? undefined : Math.max(0, Math.min(100, value ?? 0));
  const spinnerSize = size <= 24 ? 'small' : size <= 48 ? 'medium' : 'large';

  return (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <Spinner size={spinnerSize} />
    </div>
  );
}
