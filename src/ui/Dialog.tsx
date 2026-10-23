import { Fragment, useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from './Icon';

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
  /** Large accent icon above the title (design: about.html `.welcome-logo`). */
  icon?: IconName;
  /** Term/value pairs below the body (design: about.html `.dialog-meta`). */
  meta?: DialogMetaEntry[];
}

export interface DialogMetaEntry {
  term: string;
  value: ReactNode;
  testId?: string;
}

/** Modal dialog with title, body and action row (design: unsaved-changes.html, about.html). */
export function Dialog({
  title,
  children,
  actions,
  role = 'dialog',
  onClose,
  autoFocus = true,
  className,
  testId,
  icon,
  meta,
}: DialogProps) {
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
      {icon ? <Icon name={icon} className="welcome-logo" /> : null}
      <h2 id={titleId}>{title}</h2>
      {children ? (
        <div className="dialog-body" id={bodyId}>
          {children}
        </div>
      ) : null}
      {meta && meta.length > 0 ? (
        <dl className="dialog-meta">
          {meta.map((m) => (
            <Fragment key={m.term}>
              <dt>{m.term}</dt>
              <dd data-testid={m.testId}>{m.value}</dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
      {actions ? <div className="dialog-actions">{actions}</div> : null}
    </div>
  );
}
