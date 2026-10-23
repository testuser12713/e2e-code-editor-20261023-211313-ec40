import { forwardRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface MenuProps {
  label: string;
  children: ReactNode;
  /** Placement inside the positioned parent (context menus pass top/left). */
  style?: CSSProperties;
  className?: string;
  testId?: string;
  /** Escape closes the menu when given. */
  onClose?: () => void;
}

/**
 * Popup / context menu (design: `.menu`, explorer-context-menu.html, menu bar).
 * Arrow keys move between enabled entries; Escape calls onClose.
 */
export const Menu = forwardRef<HTMLDivElement, MenuProps>(function Menu({ label, children, style, className, testId, onClose }, ref) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.menu-item:not([disabled])'));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(index + step + items.length) % items.length].focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (e.key === 'Escape' && onClose) {
      e.preventDefault();
      onClose();
    }
  };
  return (
    <div ref={ref} className={cn('menu', className)} role="menu" aria-label={label} style={style} data-testid={testId} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
});

export interface MenuItemProps {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  /** Radio-style entry; true draws the check mark. */
  checked?: boolean;
  danger?: boolean;
  /** Why the entry is unavailable, shown as tooltip when disabled. */
  disabledReason?: string;
  onSelect?: () => void;
  className?: string;
  testId?: string;
}

/** One menu entry (design: `.menu-item`, `.menu-shortcut`, `.is-danger`, `aria-checked`). */
export function MenuItem({ label, shortcut, disabled = false, checked, danger = false, disabledReason, onSelect, className, testId }: MenuItemProps) {
  return (
    <button
      type="button"
      className={cn('menu-item', danger && 'is-danger', className)}
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked === undefined ? undefined : checked}
      disabled={disabled}
      aria-disabled={disabled}
      title={disabled ? (disabledReason ?? 'Not available yet') : undefined}
      data-testid={testId}
      onClick={() => {
        if (!disabled) onSelect?.();
      }}
    >
      <span>{label}</span>
      {shortcut ? <span className="menu-shortcut">{shortcut}</span> : null}
    </button>
  );
}

/** Divider between menu groups (design: `.menu-sep`). */
export function MenuSeparator() {
  return <div className="menu-sep" role="separator" />;
}
