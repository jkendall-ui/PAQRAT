import { type ReactNode, useEffect } from 'react';

export interface M3SnackbarProps {
  message: string;
  action?: ReactNode;
  open: boolean;
  onClose: () => void;
  duration?: number;
  className?: string;
}

export function M3Snackbar({ message, open, onClose, duration = 4000 }: M3SnackbarProps) {
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [open, onClose, duration]);

  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm w-full px-4"
    >
      <div className="flex items-center gap-3 rounded-lg bg-gray-900 text-white px-4 py-3 shadow-lg text-sm">
        <span className="flex-1">{message}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-blue-300 hover:text-blue-200 shrink-0"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
