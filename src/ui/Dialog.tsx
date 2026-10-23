import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from './cn';

/** Dims the window behind a dialog or picker (design: `.scrim`). */
export function Scrim({ onPress }: { onPress?: () => void }) {
  return <div className="scrim" aria-hidden="true" data-testid="scrim" onPointerDown={onPress} />;
}

export interface DialogProps {
  title: ReactNode;
  children?: ReactNode;
  /** Buttons of the action row, right-aligned, primary last (design: `.dialog-actions`). */
  actions?: ReactNode;
  /** `alertdialog` for questions that block the user (unsaved changes). */
  role?: 'dialog' | 'alertdialog';
  /** Escape closes the dialog when given. */
  onClose?: () => void;
  /** Focus moves into the dialog when it opens (default true). */
  autoFocus?: boolean;
  className?: string;
  testId?: string;
}

/** Modal dialog with title, body and action row (design: unsaved-changes.html, about.html). */
export function Dialog({ title, children, actions, role = 'dialog', onClose, autoFocus = true, className, testId }: DialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const root = ref.current;
    const target =
      root?.querySelector<HTMLElement>('.dialog-actions .btn-primary:not([disabled])') ??
      root?.querySelector<HTMLElement>('button:not([disabled]), [href], input, select');
    target?.focus();
  }, [autoFocus]);

  return (
    <div
      ref={ref}
      className={cn('dialog', className)}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={children ? bodyId : undefined}
      data-testid={testId}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onClose) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children ? (
        <div className="dialog-body" id={bodyId}>
          {children}
        </div>
      ) : null}
      {actions ? <div className="dialog-actions">{actions}</div> : null}
    </div>
  );
}
