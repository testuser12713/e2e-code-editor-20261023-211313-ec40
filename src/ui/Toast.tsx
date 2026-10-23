import { useEffect, type ReactNode } from 'react';

export const TOAST_DURATION_MS = 2200;

/**
 * Short confirmation at the bottom centre, e.g. "Saved forecast.ts"
 * (design: `.toast`, role status, removed after 2.2 s as in the mockups).
 */
export function Toast({ children, onDismiss, durationMs = TOAST_DURATION_MS }: { children: ReactNode; onDismiss?: () => void; durationMs?: number }) {
  useEffect(() => {
    if (!onDismiss) return;
    const t = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(t);
  }, [onDismiss, durationMs]);
  return (
    <div className="toast" role="status" data-testid="toast">
      {children}
    </div>
  );
}
