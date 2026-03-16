export interface M3LinearProgressProps {
  value?: number;
  indeterminate?: boolean;
  className?: string;
  'data-testid'?: string;
}

export function M3LinearProgress({ value, indeterminate = false, className = '', ...props }: M3LinearProgressProps) {
  const percent = indeterminate ? undefined : Math.max(0, Math.min(100, value ?? 0));

  return (
    <div
      className={`h-1 w-full overflow-hidden rounded-full bg-gray-200 ${className}`}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      data-testid={props['data-testid']}
    >
      {indeterminate ? (
        <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-600" />
      ) : (
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  );
}
